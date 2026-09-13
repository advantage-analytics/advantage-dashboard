/**
 * The decision half of `/api/splitstep/upload-url` — everything between the
 * request and the credential, with its I/O handed in.
 *
 * Split from `route.ts` so `tests/upload-url-authorization.spec.ts` can run
 * the whole refusal ladder — sign-in, ownership, workspace, approval, role,
 * athlete, then the video question — against fixtures, with `mintUploadSas`
 * replaced by a stub that signs nothing. Next reserves a route file's exports
 * for the handler names, so this is a sibling module rather than an extra
 * export; `route.ts` supplies the real Supabase, workspace and Azure seams and
 * nothing else. No storage credential is read here: `deps.mintUploadSas` is
 * the only thing that can produce a SAS, and the tests never pass the real
 * one.
 *
 * ORDER. Sign-in → body → match (ownership) → the match's workspace →
 * `uploadEligibility()` (T11: may a match be recorded here at all, and is the
 * row's athlete a real one) → `explainVideoRefusal()` (may this workspace's
 * allowance be spent) → mint. The two questions stack in that order by the
 * contract's own header, and both are asked BEFORE the credential exists
 * because the step after it is the expensive one: the browser takes the URL
 * and pushes gigabytes for tens of minutes. A refusal here spends nothing.
 */

import { NextResponse } from "next/server";

import { athleteOnRow } from "@/lib/services/splitstep/match-athlete";
import { videoObjectKey } from "@/lib/services/splitstep/object-keys";
import {
  uploadEligibility,
  type RosterIdentity,
} from "@/lib/workspace/upload-eligibility";
import {
  billingWorkspaceFor,
  explainVideoRefusal,
  NO_BILLING_WORKSPACE_REFUSAL,
  type Workspace,
} from "@/lib/workspace/types";

const LOG = "[splitstep-upload-url]";

/** The columns of `matches` this decision reads. */
export interface UploadUrlMatch {
  id: string;
  created_by: string | null;
  /** NULL is a personal upload; a program id is whose budget this bills. */
  program_id: string | null;
  /**
   * The athlete on the row — a `program_players.id`, or on an older row a
   * login id; the uploader's own login on a personal match. NULL is nobody.
   */
  player1_id: string | null;
  /** Set when the row is a scheduled line's match. */
  event_entry_id: string | null;
}

export interface UploadUrlDeps {
  /** The signed-in login, or null. */
  currentUserId(): Promise<string | null>;
  /**
   * The match by id, through a client that can see every row — the handler
   * distinguishes "not yours" from "does not exist" itself (both answer 404,
   * but they are different bugs to log).
   */
  loadMatch(
    matchId: string,
  ): Promise<{ match: UploadUrlMatch | null; error: string | null }>;
  /** Every workspace the caller holds — `getWorkspaceContext().available`. */
  availableWorkspaces(): Promise<Workspace[]>;
  /**
   * The program's ELIGIBLE roster as `uploadEligibility()` wants it: live
   * players of this program, plus the caller's own live profile when they are
   * staff (the RPC's player arm drops that one). `null` when the read failed,
   * which refuses with a retry rather than passing on a list nobody has.
   */
  loadRoster(programId: string): Promise<readonly RosterIdentity[] | null>;
  /** The one seam that signs. Tests stub it; nothing else here can sign. */
  mintUploadSas(params: { blobName: string }): {
    uploadUrl: string;
    expiresAt: Date;
  };
  /** `processing_jobs.video_object_key` for the match, before the bytes move. */
  recordBlobName(
    matchId: string,
    blobName: string,
  ): Promise<{ error: string | null }>;
}

interface UploadUrlBody {
  matchId?: string;
  fileName?: string;
}

/**
 * `athleteOnRow` moved to `lib/services/splitstep/match-athlete.ts` (T16) so
 * `/api/splitstep/jobs` maps the row the same way before it spends quota.
 * Re-exported so this module's existing importers — the T15 spec among them —
 * keep reading it from here; the mapping itself is unchanged.
 */
export { athleteOnRow };

export async function handleUploadUrl(
  request: Request,
  deps: UploadUrlDeps,
): Promise<NextResponse> {
  // Strictly sequential, deliberately. Auth first means an unauthenticated
  // caller never reaches the service-role lookup below, and the two things that
  // could overlap are not worth it: parsing a two-field body is sub-millisecond,
  // and this route runs once per upload against a transfer measured in tens of
  // minutes.
  const userId = await deps.currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let body: UploadUrlBody;
  try {
    body = (await request.json()) as UploadUrlBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { matchId, fileName } = body;
  if (!matchId || !fileName) {
    return NextResponse.json(
      { error: "matchId and fileName are required" },
      { status: 400 },
    );
  }

  // Ownership, via the service-role client. RLS would answer this too, but a
  // policy miss reads as "no such match" and this needs to distinguish a match
  // that is not yours from one that does not exist — they are different bugs.
  const { match, error: matchError } = await deps.loadMatch(matchId);

  if (matchError) {
    console.error(`${LOG} could not load match`, {
      matchId,
      error: matchError,
    });
    return NextResponse.json(
      { error: "Could not load match" },
      { status: 500 },
    );
  }

  // Same 404 for missing and not-yours: telling an unauthorized caller that a
  // match id exists is itself a disclosure.
  if (!match || match.created_by !== userId) {
    return NextResponse.json({ error: "No such match" }, { status: 404 });
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
  const billingWorkspace = billingWorkspaceFor(
    await deps.availableWorkspaces(),
    match.program_id, // NULL = personal upload
  );

  if (!billingWorkspace) {
    return NextResponse.json(
      { error: NO_BILLING_WORKSPACE_REFUSAL },
      { status: 403 },
    );
  }

  // T15: the upload contract, asked about the ROW — approval, role, line, and
  // whose match this is. Every other entry point that files a match asks it
  // (the wizard before it writes, the trigger T14 adds once applied); this is
  // the entry point for an EXISTING row, including one written before those
  // gates existed, and it was the one seam that never read `player1_id`. The
  // live `matches_block_client_regraft` accepts any member of the program as
  // the athlete, staff included, and never reads `programs.status` — so a
  // coach's own login on the row, an id from a different program's roster, or
  // a program still waiting on its claim all reached the credential. The
  // roster is read only for a team match; a personal one has none to read.
  //
  // This is not defence in depth over the database. The harm here is minting
  // an Azure SAS, which is not a database write, so no trigger can prevent it
  // even in principle — the two layers hold disjoint jurisdictions, and this
  // one owns the credential. See the same note in `jobs/handler.ts`.
  const roster =
    billingWorkspace.kind === "team"
      ? await deps.loadRoster(billingWorkspace.id)
      : undefined;

  const eligibility = uploadEligibility({
    workspace: billingWorkspace,
    viewerId: userId,
    athlete: athleteOnRow(match, userId),
    roster,
    attachesToLine: match.event_entry_id !== null,
  });

  if (!eligibility.ok) {
    console.log(`${LOG} refused — ${eligibility.reason}`, {
      matchId,
      workspaceId: billingWorkspace.id,
      role: billingWorkspace.role,
    });
    // A reading that could not be obtained (`retryable`) is the roster RPC
    // failing, not a decision about the person: 503 says "try again" where
    // 403 would say "no". Either way the sentence goes back as `error`, the
    // field the caller already reads — see the note on the refusal below.
    return NextResponse.json(
      { error: eligibility.message },
      { status: eligibility.retryable ? 503 : 403 },
    );
  }

  // Then the video question — may this workspace's allowance be spent. All
  // three of its answers in one call: `explainVideoRefusal()` asks
  // `canSubmitVideo` before the switches, in the order `reserveQuota()` asks
  // them. Mostly answered already by the contract above (a `claim_pending`
  // program and the role ladder stop there first), and kept because this is
  // the seam that says it in `reserveQuota()`'s own words, so what refuses
  // here is exactly what would refuse at the spend.
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
    blobName = videoObjectKey({ userId, matchId, fileName });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unsupported video file" },
      { status: 400 },
    );
  }

  let minted: { uploadUrl: string; expiresAt: Date };
  try {
    minted = deps.mintUploadSas({ blobName });
  } catch (err) {
    // Missing storage config. 503, not 500: the deployment is misconfigured,
    // the request was fine.
    console.error(`${LOG} storage is not configured`, {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Video upload is not configured on this deployment." },
      { status: 503 },
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
  const { error: recordError } = await deps.recordBlobName(matchId, blobName);

  if (recordError) {
    // Not fatal. A blob we cannot name is recoverable via the sweeper; refusing
    // the upload is not recoverable for the user. Loud, because this is the only
    // moment the name is known for free.
    console.error(`${LOG} could not record the blob name — video may strand`, {
      matchId,
      blobName,
      error: recordError,
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
