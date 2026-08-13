/**
 * Mint a browser upload credential for a match video.
 *
 * Replaces the `upload-video-r2` Supabase Edge Function. That function existed
 * because the Next runtime held no storage credentials — under Azure it must,
 * since the same account key signs the vendor's read SAS. Moving it here
 * collapses two credential stores into one and lets auth go through the normal
 * `createClient()` session instead of a hand-parsed bearer header.
 *
 * The returned URL is a write credential for exactly one blob name: `cw`, no
 * read, no delete, no list. Whoever holds it can put bytes at that one name and
 * can do nothing else with the container. It is still a credential — the
 * caller must not log it (see the note in useUploadMatchWizard).
 */

import { NextResponse, type NextRequest } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { videoObjectKey } from '@/lib/services/splitstep/object-keys';
import { mintUploadSas } from '@/lib/services/splitstep/video-url';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LOG = '[splitstep-upload-url]';

interface UploadUrlBody {
  matchId?: string;
  fileName?: string;
}

export async function POST(request: NextRequest) {
  // Strictly sequential, deliberately. Auth first means an unauthenticated
  // caller never reaches the service-role lookup below, and the two things that
  // could overlap are not worth it: parsing a two-field body is sub-millisecond,
  // and this route runs once per upload against a transfer measured in tens of
  // minutes.
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }

  let body: UploadUrlBody;
  try {
    body = (await request.json()) as UploadUrlBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { matchId, fileName } = body;
  if (!matchId || !fileName) {
    return NextResponse.json(
      { error: 'matchId and fileName are required' },
      { status: 400 }
    );
  }

  // Ownership, via the service-role client. RLS would answer this too, but a
  // policy miss reads as "no such match" and this needs to distinguish a match
  // that is not yours from one that does not exist — they are different bugs.
  const admin = createAdminClient();
  const { data: match, error: matchError } = await admin
    .from('matches')
    .select('id, created_by')
    .eq('id', matchId)
    .maybeSingle();

  if (matchError) {
    console.error(`${LOG} could not load match`, {
      matchId,
      error: matchError.message,
    });
    return NextResponse.json({ error: 'Could not load match' }, { status: 500 });
  }

  // Same 404 for missing and not-yours: telling an unauthorized caller that a
  // match id exists is itself a disclosure.
  if (!match || match.created_by !== user.id) {
    return NextResponse.json({ error: 'No such match' }, { status: 404 });
  }

  // Throws on any container outside ACCEPTED_VIDEO_EXTENSIONS. The old edge
  // function silently defaulted an unrecognised name to `.mp4`, which produced
  // a blob whose extension disagreed with its bytes.
  let blobName: string;
  try {
    blobName = videoObjectKey({ userId: user.id, matchId, fileName });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unsupported video file' },
      { status: 400 }
    );
  }

  let minted: { uploadUrl: string; expiresAt: Date };
  try {
    minted = mintUploadSas({ blobName });
  } catch (err) {
    // Missing storage config. 503, not 500: the deployment is misconfigured,
    // the request was fine.
    console.error(`${LOG} storage is not configured`, {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: 'Video upload is not configured on this deployment.' },
      { status: 503 }
    );
  }

  // Record where the bytes are ABOUT to go, before handing out the credential.
  //
  // This used to be written by the browser after the upload succeeded, which
  // meant an upload that failed or was abandoned left committed blocks at a name
  // the database never learned. Deleting that match could not find them — only
  // the orphan sweeper could, by listing the whole container. Writing it here
  // costs one round trip on a path that is about to move gigabytes, and makes
  // every video reachable from its job row regardless of how the upload ends.
  //
  // Keyed on match_id to match the wizard's other writes: the insert never
  // selects the row id back. Deliberately does not touch `status` — the browser
  // owns that transition.
  const { error: recordError } = await admin
    .from('processing_jobs')
    .update({ video_object_key: blobName })
    .eq('match_id', matchId);

  if (recordError) {
    // Not fatal. A blob we cannot name is recoverable via the sweeper; refusing
    // the upload is not recoverable for the user. Loud, because this is the only
    // moment the name is known for free.
    console.error(`${LOG} could not record the blob name — video may strand`, {
      matchId,
      blobName,
      error: recordError.message,
    });
  }

  console.log(`${LOG} issued`, {
    matchId,
    blobName,
    expiresAt: minted.expiresAt.toISOString(),
    // Never the URL. It carries `sig=`, and server logs are read by more people
    // and kept far longer than the six hours this credential lives.
  });

  return NextResponse.json({
    uploadUrl: minted.uploadUrl,
    videoObjectKey: blobName,
    expiresAt: minted.expiresAt.toISOString(),
  });
}
