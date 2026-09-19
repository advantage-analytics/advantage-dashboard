/**
 * Plan step 7 — finalize a SwingVision video attachment attempt.
 *
 *   POST /api/matches/[matchId]/video/uploads/[attachmentId]/complete
 *
 * The browser has finished writing the staged object and is asking for it to
 * become the match's video. Between that request and the answer, five
 * different systems each get a veto, and the order they are asked in is the
 * whole design:
 *
 *   1. same-origin, sign-in, id shape, body   the edge (`http.ts`), stateless
 *   2. access                                  `access.ts`: RLS visibility,
 *                                              creator, provenance, exact
 *                                              workspace — asked AGAIN on
 *                                              every poll, so a membership or
 *                                              workspace change between polls
 *                                              stops the completion
 *   3. begin_finalization (T4)                 acquires the row under a
 *                                              per-REQUEST lease, freezes the
 *                                              confirmed time and the
 *                                              expected-active belief, and
 *                                              rechecks that belief
 *   4. storage (T6 / T7)                       verify the staged bytes, start
 *                                              or resume the immutable copy,
 *                                              verify the published bytes
 *   5. activate_attachment (T4)                retire the old, publish the
 *                                              new, coverage recomputed from
 *                                              the source rows, in ONE
 *                                              transaction
 *
 * THE LEASE IS PER REQUEST, NOT PER ATTEMPT. The client contract says "reuse
 * the same request when polling" and carries no token, so a token cannot
 * outlive the request that minted it. Each request mints one, does its
 * bounded slice of work under it, and RELEASES it before answering — on a
 * 202 as much as on a refusal. The copy continues inside Azure with no lease
 * held, which is what lets a person cancel a publication in progress (T3's
 * cancel refuses only a LIVE lease) and what keeps a crashed request from
 * blocking cancellation for longer than {@link FINALIZATION_LEASE_SECONDS}.
 * Activation clears the lease itself; every other exit releases it, and the
 * `finally` covers the exits nobody planned.
 *
 * WHAT MAKES TWO REQUESTS SAFE. The lease serialises requests for one attempt;
 * beyond that, nothing here depends on it for correctness. The copy is
 * conditioned on the destination not existing and carries ownership metadata,
 * so a second Start Copy finds the first (T7); a persisted copy id is what a
 * later poll resumes; and activation is a CAS on the lease token plus a
 * recheck of the expected-active belief inside the transaction (T4). A lost
 * 200 is replayed: `begin_finalization` returns the now-active row untouched
 * and `activate_attachment` answers `reused = true` for the same confirmed
 * time — only while that row is still the active one.
 *
 * THE PREVIOUS ACTIVE VIDEO SURVIVES EVERY FAILURE. Not by this module being
 * careful, but by construction: the only statement that retires an active row
 * is inside `match_video_activate_attachment`, in the same transaction that
 * activates the new one, after every check has passed. No storage step
 * writes the database and no database step here writes a blob, so a failure
 * anywhere before activation leaves the attempt `pending`, its keys intact
 * for the cleanup worker, and the match's video exactly as it was.
 *
 * THE UPLOAD ATTEMPT STAYS `pending` THROUGHOUT. The copy's substate is the
 * `copy_*` columns (T7's `publicationColumns`), written only by the lease
 * holder; there is no intermediate state and none is invented here.
 *
 * NOT HERE: alignment correction (T11), playback (T12), the cleanup worker
 * (T14), vendor jobs, billing, and any write to `points`, `shots`, `matches`
 * or `match_stats`. Source rows are read by T4, inside the transaction.
 *
 * Injected (`CompleteUploadDeps`) so the spec can run every refusal and every
 * failure path with no session, no database and no Azure — and prove, from a
 * recorded event log, that the previous active row was never touched.
 */

import { randomUUID } from "node:crypto";

import type { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { parseConfirmedVideoTime } from "@/lib/match-video/alignment";
import { COMPLETION_RETRY_SECONDS } from "@/lib/match-video/limits";
import {
  matchVideoError,
  ok,
  type ActiveAttachment,
  type CompleteUploadResult,
  type ExpectedActiveAttachment,
  type MatchVideoResult,
} from "@/lib/match-video/types";

import {
  authorizeMatchVideoMutation,
  isUuid,
  type MatchVideoAccessDeps,
  type MatchVideoMutationAccess,
} from "./access";
import {
  checkSameOrigin,
  errorResponse,
  invalidRequest as invalid,
  isPlainObject,
  jsonResponse,
  MUTATION_BODY_MAX_BYTES,
  parseExpectedActive,
  readBoundedJson,
  transportError,
  type HttpResult,
  type MatchVideoHttpError,
} from "./http";
import {
  probeStoredVideo,
  publishedBlobOf,
  stagedBlobOf,
  type ProbedStoredVideo,
} from "./probe";
import { matchVideoRpcError, type RpcErrorLike } from "./rpc-errors";
import {
  beginPublication,
  checkPublishedMetadata,
  discardFailedPublication,
  inspectAttachmentBlob,
  inspectPublication,
  publicationColumns,
  type AttachmentBlobMetadata,
  type AttachmentStorageRow,
  type CopyStatus,
  type PublicationInput,
  type PublicationState,
} from "./storage";

const LOG = "[match-video-complete]";

/* -------------------------------------------------------------------------
 * Constants
 * ---------------------------------------------------------------------- */

/**
 * How long one completion request may hold the row.
 *
 * It must outlast the request's own worst case, or a slow request could
 * watch its lease lapse and a second request start duplicate work (safe, per
 * the module notes, but wasteful): two bounded probes at T5's 15-second
 * deadline each, one Start Copy, one poll, a handful of RPC round trips —
 * comfortably under a minute. And it must be SHORT, because T3's lease check
 * is time-based only: a request that dies holding the lease blocks
 * cancellation and renewal for exactly this long. Ninety seconds is the
 * smallest number that clears the first bound with margin.
 */
export const FINALIZATION_LEASE_SECONDS = 90;

/* -------------------------------------------------------------------------
 * Body
 * ---------------------------------------------------------------------- */

/** The validated body. The attachment id is the path's, never the body's. */
export interface CompleteUploadBody {
  /** Millisecond-rounded, non-negative. */
  confirmedVideoTimeSeconds: number;
  expectedActive: ExpectedActiveAttachment | null;
}

const BODY_FIELDS = new Set<keyof CompleteUploadBody>([
  "confirmedVideoTimeSeconds",
  "expectedActive",
]);

/**
 * Two fields, strictly, and nothing else.
 *
 * Everything a completion could be lied to about — the verified size, the
 * duration, the content type, the ETag, the copy id, the offset, the storage
 * keys, the attachment id itself — is refused BY NAME with a 400 rather than
 * ignored, for the reason `parseReserveUploadBody` gives: a client that
 * starts sending `durationSeconds` should learn on the first request that
 * the server measures it, not wonder why the field had no effect. The
 * confirmed time goes through T1's strict parser (number or `hh:mm:ss.sss`),
 * and `expectedActive` must be PRESENT — null and omitted are different
 * claims.
 */
export function parseCompleteUploadBody(
  body: unknown,
): HttpResult<CompleteUploadBody> {
  if (!isPlainObject(body)) return invalid("body_not_object");

  for (const key of Object.keys(body)) {
    if (!BODY_FIELDS.has(key as keyof CompleteUploadBody)) {
      return invalid(`unexpected_field:${key}`);
    }
  }

  if (!("confirmedVideoTimeSeconds" in body)) {
    return invalid("confirmed_time_missing");
  }
  const confirmed = parseConfirmedVideoTime(body.confirmedVideoTimeSeconds);
  if (!confirmed.ok) return confirmed;

  if (!("expectedActive" in body)) return invalid("expected_active_missing");
  const expectedActive = parseExpectedActive(body.expectedActive);
  if (!expectedActive.ok) return expectedActive;

  return ok({
    confirmedVideoTimeSeconds: confirmed.value,
    expectedActive: expectedActive.value,
  });
}

/* -------------------------------------------------------------------------
 * Database seams — T4's four functions plus the copy bookkeeping
 * ---------------------------------------------------------------------- */

export interface BeginFinalizationInput {
  readonly access: MatchVideoMutationAccess;
  /** From the path. T4 rechecks ownership and match membership in SQL. */
  readonly attachmentId: string;
  /** Minted by this request; never from a client. */
  readonly leaseToken: string;
  readonly leaseSeconds: number;
  readonly confirmedVideoTimeSeconds: number;
  readonly expectedActive: ExpectedActiveAttachment | null;
}

/**
 * T4's `match_video_begin_finalization` row. `state` is `pending` (the lease
 * is now ours) or `active` (nothing to lease — the caller replays
 * activation, which decides whether this is an idempotent success).
 */
export interface FinalizationRow extends AttachmentStorageRow {
  state: string;
  copy_id: string | null;
  copy_status: CopyStatus | null;
  confirmed_video_time_seconds: number;
  finalize_lease_until: string | null;
}

export interface ReleaseFinalizationInput {
  readonly access: MatchVideoMutationAccess;
  readonly attachmentId: string;
  readonly leaseToken: string;
}

/** What the completion service measured from the PUBLISHED bytes. */
export interface VerifiedMedia {
  sizeBytes: number;
  contentType: string;
  durationSeconds: number;
}

export interface ActivateAttachmentInput {
  readonly access: MatchVideoMutationAccess;
  readonly attachmentId: string;
  readonly leaseToken: string;
  readonly confirmedVideoTimeSeconds: number;
  /**
   * Null only on the idempotent replay of an already-active row, where T4
   * returns before it reads these. A pending row with null here is refused
   * by SQL as `empty_file`, which is the right answer for a bug.
   */
  readonly verified: VerifiedMedia | null;
}

/** T4's `match_video_activate_attachment` row. */
export interface ActivatedAttachment {
  attachment_id: string;
  version: number;
  offset_seconds: number;
  confirmed_video_time_seconds: number;
  duration_seconds: number;
  content_type: string;
  filename: string;
  previous_active_id: string | null;
  /** True for the replay of a completion whose 200 was lost. */
  reused: boolean;
}

export interface PersistPublicationInput {
  readonly access: MatchVideoMutationAccess;
  readonly attachmentId: string;
  /** The write is conditioned on this token still holding the row. */
  readonly leaseToken: string;
  readonly columns: ReturnType<typeof publicationColumns>;
}

/* -------------------------------------------------------------------------
 * Storage seam — T6 and T7 behind one interface
 * ---------------------------------------------------------------------- */

/**
 * The six storage questions completion asks, each answered by T6 or T7 with
 * a row-derived, server-selected blob. No method takes a key or a URL.
 */
export interface CompletionStorage {
  /** One HEAD of the staged object, checked against the row's ETag. */
  headStaged(
    row: AttachmentStorageRow,
  ): Promise<MatchVideoResult<AttachmentBlobMetadata | null>>;
  /** T6's bounded parse of the staged object. */
  probeStaged(
    row: AttachmentStorageRow,
  ): Promise<MatchVideoResult<ProbedStoredVideo>>;
  beginPublication(
    input: PublicationInput,
  ): Promise<MatchVideoResult<PublicationState>>;
  inspectPublication(
    input: PublicationInput,
  ): Promise<MatchVideoResult<PublicationState>>;
  discardFailedPublication(
    input: PublicationInput,
  ): Promise<MatchVideoResult<{ discarded: boolean }>>;
  /** T6's bounded parse of the PUBLISHED object — what gets activated. */
  probePublished(
    row: AttachmentStorageRow,
  ): Promise<MatchVideoResult<ProbedStoredVideo>>;
}

/** The production storage: T6 and T7 with their default Azure clients. */
export function azureCompletionStorage(): CompletionStorage {
  return {
    async headStaged(row) {
      const staged = stagedBlobOf(row);
      if (!staged.ok) return staged;
      return inspectAttachmentBlob(staged.value);
    },
    async probeStaged(row) {
      const staged = stagedBlobOf(row);
      if (!staged.ok) return staged;
      return probeStoredVideo({ blob: staged.value });
    },
    beginPublication: (input) => beginPublication(input),
    inspectPublication: (input) => inspectPublication(input),
    discardFailedPublication: (input) => discardFailedPublication(input),
    async probePublished(row) {
      const published = publishedBlobOf(row);
      if (!published.ok) return published;
      return probeStoredVideo({ blob: published.value });
    },
  };
}

/* -------------------------------------------------------------------------
 * Deps
 * ---------------------------------------------------------------------- */

export interface CompleteUploadDeps extends MatchVideoAccessDeps {
  allowedOrigins?: readonly string[];
  now?: () => Date;
  /** Test seam; production mints a random UUID per request. */
  mintLeaseToken?: () => string;
  storage: CompletionStorage;
  beginFinalization(
    input: BeginFinalizationInput,
  ): Promise<HttpResult<FinalizationRow>>;
  releaseFinalization(
    input: ReleaseFinalizationInput,
  ): Promise<HttpResult<{ released: boolean }>>;
  activate(
    input: ActivateAttachmentInput,
  ): Promise<HttpResult<ActivatedAttachment>>;
  /** Write the copy columns; refused when the lease is no longer this one's. */
  persistPublication(input: PersistPublicationInput): Promise<HttpResult<null>>;
  /**
   * When the row's last upload credential stops being able to write the
   * staged key. Read only when the staged object is missing — see
   * {@link stagedNotLanded}.
   */
  uploadWindowEndsAt(
    access: MatchVideoMutationAccess,
    attachmentId: string,
  ): Promise<HttpResult<Date | null>>;
}

/* -------------------------------------------------------------------------
 * Handler
 * ---------------------------------------------------------------------- */

function parseAttachmentId(attachmentId: string): HttpResult<string> {
  if (!isUuid(attachmentId)) {
    return {
      ok: false,
      error: matchVideoError("match_not_found", "malformed_attachment_id"),
    };
  }
  return ok(attachmentId.toLowerCase());
}

export async function handleCompleteUpload(
  request: Request,
  matchId: string,
  attachmentId: string,
  deps: CompleteUploadDeps,
): Promise<NextResponse> {
  const origin = checkSameOrigin(request, deps.allowedOrigins);
  if (origin) return errorResponse(origin);

  if (!(await deps.currentUserId())) {
    return errorResponse(matchVideoError("unauthenticated", "no_session"));
  }

  const id = parseAttachmentId(attachmentId);
  if (!id.ok) return errorResponse(id.error);

  const raw = await readBoundedJson(request, MUTATION_BODY_MAX_BYTES);
  if (!raw.ok) return errorResponse(raw.error);
  const parsed = parseCompleteUploadBody(raw.value);
  if (!parsed.ok) return errorResponse(parsed.error);
  const body = parsed.value;

  // Asked again on every poll, on purpose. A completion that started while
  // the caller was a member of the program must not finish after they left.
  const access = await authorizeMatchVideoMutation(matchId, deps);
  if (!access.ok) {
    console.log(`${LOG} refused — ${access.error.detail}`, { matchId });
    return errorResponse(access.error);
  }

  const context = { matchId, attachmentId: id.value };
  try {
    return await finalize(access.value, id.value, body, deps, context);
  } catch (cause) {
    // A seam threw instead of answering. The lease, if one was taken, was
    // released by `finalize`'s own `finally`; the row is still pending with
    // its keys, and the previous active video was never touched — no write
    // outside `activate_attachment` can retire it.
    console.error(`${LOG} unhandled failure`, { ...context, cause });
    return errorResponse(transportError("internal_error", "unhandled"));
  }
}

async function finalize(
  access: MatchVideoMutationAccess,
  attachmentId: string,
  body: CompleteUploadBody,
  deps: CompleteUploadDeps,
  context: { matchId: string; attachmentId: string },
): Promise<NextResponse> {
  const leaseToken = deps.mintLeaseToken?.() ?? randomUUID();
  const begun = await deps.beginFinalization({
    access,
    attachmentId,
    leaseToken,
    leaseSeconds: FINALIZATION_LEASE_SECONDS,
    confirmedVideoTimeSeconds: body.confirmedVideoTimeSeconds,
    expectedActive: body.expectedActive,
  });
  if (!begun.ok) {
    console.log(`${LOG} finalization refused — ${begun.error.detail}`, context);
    return errorResponse(begun.error);
  }
  const row = begun.value;

  // Already published: this is a replay of a completion whose 200 was lost.
  // No lease was taken and none is released; T4 decides whether the replay
  // is a success (same row still active, same time) or a conflict.
  if (row.state === "active") {
    return respondToActivation(
      await deps.activate({
        access,
        attachmentId,
        leaseToken,
        confirmedVideoTimeSeconds: body.confirmedVideoTimeSeconds,
        verified: null,
      }),
      context,
    );
  }
  if (row.state !== "pending") {
    console.error(`${LOG} begin_finalization returned an unexpected state`, {
      ...context,
      state: row.state,
    });
    return errorResponse(transportError("internal_error", "rpc_state"));
  }

  // From here the lease is ours. `committed` is the ONE exit that keeps it
  // (activation cleared it inside the transaction); every other exit —
  // planned or thrown — releases it so the attempt can be retried or
  // cancelled at once rather than after the lease lapses.
  let committed = false;
  try {
    const outcome = await finalizeUnderLease(
      { access, row, leaseToken, body },
      deps,
    );
    committed = outcome.committed;
    return outcome.response;
  } finally {
    if (!committed) {
      await releaseLease(deps, access, attachmentId, leaseToken, context);
    }
  }
}

/* -------------------------------------------------------------------------
 * Under the lease
 * ---------------------------------------------------------------------- */

interface LeasedAttempt {
  access: MatchVideoMutationAccess;
  row: FinalizationRow;
  leaseToken: string;
  body: CompleteUploadBody;
}

interface Outcome {
  response: NextResponse;
  committed: boolean;
}

function refused(error: MatchVideoHttpError): Outcome {
  return { response: errorResponse(error), committed: false };
}

/**
 * Verify, publish (or resume), verify again, activate.
 *
 * Two branches into the copy, chosen by what the row already records:
 *
 *   RESUME  `source_etag` and `copy_id` are set: an earlier request measured
 *           the staged bytes and started the copy. One HEAD confirms the
 *           staged object is still the measured one (the row's ETag is the
 *           expected one, so a change is `stale_attachment`), then the
 *           destination is polled. The staged bytes are NOT re-parsed on
 *           every poll — they were parsed under a lease before the copy
 *           started, the copy is conditioned on that ETag, and the FINAL
 *           bytes are parsed before activation.
 *   START   nothing recorded: T6's bounded parse of the staged object, then
 *           one Start Copy conditioned on the ETag it measured. A copy that
 *           already exists (a lost persist) is found by T7 and resumed.
 *
 * The copy columns are persisted BEFORE the lease is released, under a write
 * conditioned on the token, so the state the next poll resumes from is the
 * state this request saw.
 */
async function finalizeUnderLease(
  attempt: LeasedAttempt,
  deps: CompleteUploadDeps,
): Promise<Outcome> {
  const { access, row, leaseToken, body } = attempt;
  const context = { matchId: access.match.id, attachmentId: row.id };
  const now = deps.now?.() ?? new Date();

  let sourceEtag: string;
  let expectedSizeBytes: number;
  let state: MatchVideoResult<PublicationState>;

  if (row.source_etag && row.copy_id) {
    const head = await deps.storage.headStaged(row);
    if (!head.ok) return refused(head.error);
    if (head.value === null) {
      // A copy was started from an object that is now gone. Nothing this
      // module does deletes a pending row's staged key, so this is not
      // "not landed yet"; the attempt cannot be trusted to resume.
      return refused(matchVideoError("stale_attachment", "staged_missing"));
    }
    sourceEtag = row.source_etag;
    expectedSizeBytes = head.value.contentLength;
    state = await deps.storage.inspectPublication({ row, sourceEtag });
  } else {
    const probe = await deps.storage.probeStaged(row);
    if (!probe.ok) {
      if (probe.error.detail === "blob_not_found") {
        return refused(await stagedNotLanded(deps, access, row.id, now));
      }
      return refused(probe.error);
    }
    if (probe.value.declaredMismatches.length > 0) {
      console.log(`${LOG} declared metadata disagrees with stored bytes`, {
        ...context,
        mismatches: probe.value.declaredMismatches,
      });
    }
    sourceEtag = probe.value.etag;
    expectedSizeBytes = probe.value.sizeBytes;
    state = await deps.storage.beginPublication({ row, sourceEtag });
  }

  if (!state.ok) return refused(state.error);

  // Record what storage says before anyone else can act on it.
  const persisted = await persistIfChanged(
    deps,
    attempt,
    state.value,
    sourceEtag,
  );
  if (!persisted.ok) return refused(persisted.error);

  switch (state.value.status) {
    case "pending": {
      console.log(`${LOG} copy pending`, {
        ...context,
        copyId: state.value.copyId,
        bytesCopied: state.value.bytesCopied,
        bytesTotal: state.value.bytesTotal,
      });
      const pending: CompleteUploadResult = {
        status: "pending",
        attachmentId: row.id,
        retryAfterSeconds: COMPLETION_RETRY_SECONDS,
      };
      const response = jsonResponse(pending, 202);
      response.headers.set("Retry-After", String(COMPLETION_RETRY_SECONDS));
      return { response, committed: false };
    }

    case "absent": {
      // Only reachable on resume: the recorded copy's destination is gone.
      // The columns were just cleared, so the next request starts afresh.
      console.error(`${LOG} recorded copy has no destination`, context);
      return refused(
        matchVideoError("storage_unavailable", "destination_absent"),
      );
    }

    case "failed":
    case "aborted": {
      // Clear the wreckage (T7 refuses anything that is not our own dead
      // copy) and record that there is no copy, so the next request starts
      // a new one. One copy start per request keeps each request bounded.
      console.error(`${LOG} copy ${state.value.status}`, {
        ...context,
        copyId: state.value.copyId,
        description: state.value.description,
      });
      const discarded = await deps.storage.discardFailedPublication({
        row,
        sourceEtag,
      });
      if (!discarded.ok) return refused(discarded.error);
      const cleared = await deps.persistPublication({
        access,
        attachmentId: row.id,
        leaseToken,
        columns: publicationColumns({ status: "absent" }, sourceEtag),
      });
      if (!cleared.ok) return refused(cleared.error);
      return refused(
        matchVideoError("storage_unavailable", `copy_${state.value.status}`),
      );
    }

    case "success":
      break;
  }

  // The copy's length must be the staged length it was conditioned on.
  const published = checkPublishedMetadata(state.value, {
    sizeBytes: expectedSizeBytes,
  });
  if (!published.ok) return refused(published.error);

  // What gets activated is what the PUBLISHED bytes measure as — never the
  // staged probe's numbers, never the client's.
  const final = await deps.storage.probePublished(row);
  if (!final.ok) return refused(final.error);
  if (final.value.sizeBytes !== published.value.contentLength) {
    return refused(
      matchVideoError("stale_attachment", "published_length_mismatch"),
    );
  }

  const activated = await deps.activate({
    access,
    attachmentId: row.id,
    leaseToken,
    confirmedVideoTimeSeconds: body.confirmedVideoTimeSeconds,
    verified: {
      sizeBytes: final.value.sizeBytes,
      contentType: final.value.contentType,
      durationSeconds: final.value.durationSeconds,
    },
  });
  const response = respondToActivation(activated, context);
  return { response, committed: activated.ok };
}

/**
 * Persist the copy columns when they say something the row does not yet.
 *
 * A poll that finds the copy where it left it writes nothing; a poll that
 * sees a new status, a new copy id (a lost persist found by T7), or a fresh
 * start (which carries `copy_started_at`) writes before the lease is let go.
 */
async function persistIfChanged(
  deps: CompleteUploadDeps,
  attempt: LeasedAttempt,
  state: PublicationState,
  sourceEtag: string,
): Promise<HttpResult<null>> {
  const columns = publicationColumns(state, sourceEtag);
  const { row } = attempt;
  const unchanged =
    columns.source_etag === row.source_etag &&
    columns.copy_id === row.copy_id &&
    columns.copy_status === row.copy_status &&
    columns.copy_started_at === undefined;
  if (unchanged) return ok(null);
  return deps.persistPublication({
    access: attempt.access,
    attachmentId: row.id,
    leaseToken: attempt.leaseToken,
    columns,
  });
}

/**
 * The staged object is not there. Retryable, or not?
 *
 * T6 classifies a 404 as retryable `storage_unavailable`, which is right while
 * bytes may still be landing. The bound on "may still be landing" is the one
 * the database already holds: `upload_sas_expires_at`, the expiry of the last
 * write credential issued for this key. Until it passes, something could
 * still put the object there and the answer is a 503 the client retries.
 * Once it has passed, nothing can ever write the key — the row's expiry is
 * never behind a live credential (T8 persists before minting) — so the
 * object will never arrive and the answer is terminal: `empty_file`, whose
 * copy ("This file is empty. Choose a video file.") is what `limits.ts`
 * reserves for "the transfer never started". The attempt stays pending with
 * its keys; cancel it, or let the cleanup worker.
 */
async function stagedNotLanded(
  deps: CompleteUploadDeps,
  access: MatchVideoMutationAccess,
  attachmentId: string,
  now: Date,
): Promise<MatchVideoHttpError> {
  const window = await deps.uploadWindowEndsAt(access, attachmentId);
  if (!window.ok) return window.error;
  if (window.value && window.value.getTime() > now.getTime()) {
    return matchVideoError("storage_unavailable", "staged_not_landed");
  }
  return matchVideoError("empty_file", "staged_never_landed");
}

function respondToActivation(
  activated: HttpResult<ActivatedAttachment>,
  context: { matchId: string; attachmentId: string },
): NextResponse {
  if (!activated.ok) {
    console.log(
      `${LOG} activation refused — ${activated.error.detail}`,
      context,
    );
    return errorResponse(activated.error);
  }
  const row = activated.value;
  console.log(`${LOG} ${row.reused ? "replayed" : "activated"}`, {
    ...context,
    version: row.version,
    previousActiveId: row.previous_active_id,
  });
  const attachment: ActiveAttachment = {
    id: row.attachment_id,
    version: row.version,
    offsetSeconds: row.offset_seconds,
    confirmedVideoTimeSeconds: row.confirmed_video_time_seconds,
    durationSeconds: row.duration_seconds,
    contentType: row.content_type,
    filename: row.filename,
  };
  const result: CompleteUploadResult = { status: "committed", attachment };
  return jsonResponse(result, 200);
}

async function releaseLease(
  deps: CompleteUploadDeps,
  access: MatchVideoMutationAccess,
  attachmentId: string,
  leaseToken: string,
  context: { matchId: string; attachmentId: string },
): Promise<void> {
  try {
    const released = await deps.releaseFinalization({
      access,
      attachmentId,
      leaseToken,
    });
    if (!released.ok) {
      // The response already carries the real outcome. The lease lapses on
      // its own in FINALIZATION_LEASE_SECONDS; log so the delay is explained.
      console.error(`${LOG} could not release finalization lease`, {
        ...context,
        detail: released.error.detail,
      });
    }
  } catch (cause) {
    console.error(`${LOG} could not release finalization lease`, {
      ...context,
      cause,
    });
  }
}

/* -------------------------------------------------------------------------
 * Production database seams
 * ---------------------------------------------------------------------- */

const ATTACHMENTS_TABLE = "match_video_attachments";

/**
 * One RPC call, one mapping: T4 raises the `MatchVideoErrorCode` as the
 * message, `matchVideoRpcError` turns it into the status the code names, and
 * anything it does not recognise is this side's failure (500, logged).
 */
async function callRpc<Row>(
  admin: SupabaseClient,
  fn: string,
  args: Record<string, unknown>,
  context: Record<string, unknown>,
): Promise<HttpResult<Row>> {
  const { data, error } = await admin.rpc(fn, args);
  if (error) {
    const mapped = matchVideoRpcError(error as RpcErrorLike);
    if (mapped) return { ok: false, error: mapped };
    console.error(`${LOG} ${fn} failed`, {
      ...context,
      sqlstate: error.code,
      message: error.message,
    });
    return {
      ok: false,
      error: transportError("internal_error", `rpc_${error.code || "unknown"}`),
    };
  }
  const row = (Array.isArray(data) ? data[0] : data) as Row | undefined;
  if (!row) {
    console.error(`${LOG} ${fn} returned no row`, context);
    return { ok: false, error: transportError("internal_error", "rpc_empty") };
  }
  return ok(row);
}

interface BeginRpcRow {
  attachment_id: string;
  state: string;
  staged_blob_key: string;
  final_blob_key: string;
  source_etag: string | null;
  copy_id: string | null;
  copy_status: CopyStatus | null;
  confirmed_video_time_seconds: number | string;
  finalize_lease_until: string | null;
}

interface ActivateRpcRow extends Omit<
  ActivatedAttachment,
  "confirmed_video_time_seconds"
> {
  confirmed_video_time_seconds: number | string;
}

/**
 * The four database seams over the real RPCs and one guarded table write,
 * through the service-role client. The actor and workspace every call sends
 * come off the branded access value — the only place they can come from —
 * and every function rechecks them in SQL.
 */
export function rpcCompletionDeps(
  admin: SupabaseClient,
): Pick<
  CompleteUploadDeps,
  | "beginFinalization"
  | "releaseFinalization"
  | "activate"
  | "persistPublication"
  | "uploadWindowEndsAt"
> {
  return {
    async beginFinalization(input) {
      const { access } = input;
      const context = {
        matchId: access.match.id,
        attachmentId: input.attachmentId,
      };
      const row = await callRpc<BeginRpcRow>(
        admin,
        "match_video_begin_finalization",
        {
          p_actor_id: access.actor.id,
          p_workspace_kind: access.workspace.kind,
          p_workspace_id: access.workspace.id,
          p_match_id: access.match.id,
          p_attachment_id: input.attachmentId,
          p_lease_token: input.leaseToken,
          p_lease_seconds: input.leaseSeconds,
          p_confirmed_video_time_seconds: input.confirmedVideoTimeSeconds,
          p_expected_active_id: input.expectedActive?.id ?? null,
          p_expected_active_version: input.expectedActive?.version ?? null,
        },
        context,
      );
      if (!row.ok) return row;
      return ok<FinalizationRow>({
        id: row.value.attachment_id,
        state: row.value.state,
        staged_blob_key: row.value.staged_blob_key,
        final_blob_key: row.value.final_blob_key,
        source_etag: row.value.source_etag,
        copy_id: row.value.copy_id,
        copy_status: row.value.copy_status,
        confirmed_video_time_seconds: Number(
          row.value.confirmed_video_time_seconds,
        ),
        finalize_lease_until: row.value.finalize_lease_until,
      });
    },

    async releaseFinalization(input) {
      const { access } = input;
      const row = await callRpc<{ attachment_id: string; released: boolean }>(
        admin,
        "match_video_release_finalization",
        {
          p_actor_id: access.actor.id,
          p_workspace_kind: access.workspace.kind,
          p_workspace_id: access.workspace.id,
          p_match_id: access.match.id,
          p_attachment_id: input.attachmentId,
          p_lease_token: input.leaseToken,
        },
        { matchId: access.match.id, attachmentId: input.attachmentId },
      );
      if (!row.ok) return row;
      return ok({ released: row.value.released });
    },

    async activate(input) {
      const { access } = input;
      const row = await callRpc<ActivateRpcRow>(
        admin,
        "match_video_activate_attachment",
        {
          p_actor_id: access.actor.id,
          p_workspace_kind: access.workspace.kind,
          p_workspace_id: access.workspace.id,
          p_match_id: access.match.id,
          p_attachment_id: input.attachmentId,
          p_lease_token: input.leaseToken,
          p_confirmed_video_time_seconds: input.confirmedVideoTimeSeconds,
          p_verified_size_bytes: input.verified?.sizeBytes ?? null,
          p_verified_content_type: input.verified?.contentType ?? null,
          p_verified_duration_seconds: input.verified?.durationSeconds ?? null,
        },
        { matchId: access.match.id, attachmentId: input.attachmentId },
      );
      if (!row.ok) return row;
      return ok<ActivatedAttachment>({
        ...row.value,
        confirmed_video_time_seconds: Number(
          row.value.confirmed_video_time_seconds,
        ),
      });
    },

    async persistPublication(input) {
      // Conditioned on the lease: a write from a request whose lease lapsed
      // and was taken by another must not overwrite what that one recorded.
      // `state = pending` is belt and braces — activation clears the token.
      const { data, error } = await admin
        .from(ATTACHMENTS_TABLE)
        .update(input.columns)
        .eq("id", input.attachmentId)
        .eq("match_id", input.access.match.id)
        .eq("state", "pending")
        .eq("finalize_lease_token", input.leaseToken)
        .select("id");
      if (error) {
        console.error(`${LOG} could not persist publication state`, {
          matchId: input.access.match.id,
          attachmentId: input.attachmentId,
          code: error.code,
          message: error.message,
        });
        return {
          ok: false,
          error: matchVideoError("storage_unavailable", "persist_failed"),
        };
      }
      if (!data || data.length === 0) {
        return {
          ok: false,
          error: matchVideoError("pending_attempt_conflict", "lease_not_held"),
        };
      }
      return ok(null);
    },

    async uploadWindowEndsAt(access, attachmentId) {
      const { data, error } = await admin
        .from(ATTACHMENTS_TABLE)
        .select("upload_sas_expires_at")
        .eq("id", attachmentId)
        .eq("match_id", access.match.id)
        .maybeSingle();
      if (error) {
        console.error(`${LOG} could not read upload window`, {
          matchId: access.match.id,
          attachmentId,
          code: error.code,
          message: error.message,
        });
        return {
          ok: false,
          error: matchVideoError("storage_unavailable", "window_read_failed"),
        };
      }
      const value = (data as { upload_sas_expires_at: string | null } | null)
        ?.upload_sas_expires_at;
      return ok(value ? new Date(value) : null);
    },
  };
}
