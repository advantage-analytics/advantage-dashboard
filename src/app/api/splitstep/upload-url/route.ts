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
import { getWorkspaceContext } from '@/lib/workspace/active-workspace-server';
import {
  billingWorkspaceFor,
  explainVideoRefusal,
  NO_BILLING_WORKSPACE_REFUSAL,
} from '@/lib/workspace/types';

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
    // `program_id` for the permission check below: NULL is a personal upload,
    // and a program id is whose budget this video will eventually be charged to.
    .select('id, created_by, program_id')
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

  // May this person send video for the workspace this match belongs to?
  //
  // NOT the authoritative answer — `reserveQuota()` is, because that is where a
  // minute is actually spent, and it refuses there no matter what happens here.
  // This asks the identical question at the only earlier moment a server sees
  // the upload, and the step between the two is the expensive one: the browser
  // takes this credential and pushes gigabytes straight to Blob Storage for
  // tens of minutes. A player refused only at submit would watch that whole
  // transfer finish before being told they were never allowed to send it, and
  // leave a blob behind for the orphan sweeper. Refusing before the credential
  // is minted costs one workspace resolve and spends nothing. Not a cached one:
  // `getWorkspaceContext()` is React-`cache()`d per request, and a route handler
  // is its own request, so nothing here was warmed by the page that called it.
  // Cheap against a transfer measured in tens of minutes, but not free.
  //
  // Asked about the MATCH's workspace, via the same `billingWorkspaceFor()`
  // that `/api/splitstep/jobs` bills through — see the note there. Ownership
  // above proves the caller created this match; it does not prove the budget it
  // bills is open to them, which is a different question with three answers:
  // the program's claim state and the two upload switches.
  //
  // All three in one call. `explainVideoRefusal()` asks `canSubmitVideo` before
  // the switches, in the order `reserveQuota()` asks them, so a coach of a
  // program still in `pending_review` is stopped here too. Asking only about
  // the switches would have left that caller minting the credential, moving
  // gigabytes for tens of minutes, and being refused at submit on a blob nobody
  // wanted — the exact cost this seam exists to avoid.
  const workspaceContext = await getWorkspaceContext();
  const billingWorkspace = billingWorkspaceFor(
    workspaceContext?.available ?? [],
    (match.program_id as string | null) ?? null // NULL = personal upload
  );

  if (!billingWorkspace) {
    return NextResponse.json(
      { error: NO_BILLING_WORKSPACE_REFUSAL },
      { status: 403 }
    );
  }

  const refusal = explainVideoRefusal(billingWorkspace);
  if (refusal) {
    console.log(`${LOG} refused — not permitted`, {
      matchId,
      workspaceId: billingWorkspace.id,
      role: billingWorkspace.role,
    });
    // The sentence goes back as `error`, the field the caller already reads:
    // `uploadAndSubmitVideo()` throws `payload.error` verbatim. That throw
    // happens BEFORE its `"started"` event, so what carries the words to the
    // person is `onTransferFailed` → the `match-upload-failed` window event →
    // `UploadFailureListener`, mounted in the dashboard layout, which raises a
    // toast headed "That upload didn't finish" with this sentence as its body —
    // and it says so wherever the person has navigated to by then. The wizard's
    // own success card shows it as well, but only because `handleVideoUpload`
    // in `UploadMatchFlow` adopts a failure that arrives before `"started"`;
    // without that branch the card has no entry to update and reads as if the
    // video had been sent. Either way: words, and no bytes moved.
    return NextResponse.json({ error: refusal }, { status: 403 });
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
