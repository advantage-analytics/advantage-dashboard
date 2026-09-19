/**
 * Shared contracts for SwingVision video attachment.
 *
 * A SwingVision match is imported from a spreadsheet, so its points and shots
 * carry timestamps from a recording the platform never received. Attaching a
 * video later means storing ONE offset between that source clock and the
 * uploaded file — the imported data is never rewritten.
 *
 * This module is deliberately dependency-free: no Azure, no Supabase, no
 * Next.js. Route handlers, RPC wrappers, the wizard and the tests all speak
 * these same shapes, and a pure module is the only way that stays true.
 */

/* -------------------------------------------------------------------------
 * Modes
 * ---------------------------------------------------------------------- */

/**
 * What the attachment wizard is being opened to do.
 *
 * Carried as `/dashboard/matches/new?videoFor=<matchId>&mode=<mode>`:
 *
 *   add      no active attachment yet; two steps (file, then alignment)
 *   replace  an active attachment exists and is being swapped; two steps
 *   align    an active attachment exists and only its offset changes; one step
 *
 * `align` never uploads bytes. `add` requires that no attachment is active and
 * `replace`/`align` require that one is — a mismatch is a mode conflict, not a
 * silent fallback to the other mode.
 */
export const MATCH_VIDEO_MODES = ["add", "replace", "align"] as const;

export type MatchVideoMode = (typeof MATCH_VIDEO_MODES)[number];

export function isMatchVideoMode(value: unknown): value is MatchVideoMode {
  return (
    typeof value === "string" &&
    (MATCH_VIDEO_MODES as readonly string[]).includes(value)
  );
}

/** Whether a mode transfers a new file, or only edits the saved offset. */
export function modeUploadsFile(mode: MatchVideoMode): boolean {
  return mode !== "align";
}

/** Whether a mode requires an attachment to already be active. */
export function modeRequiresActiveAttachment(mode: MatchVideoMode): boolean {
  return mode !== "add";
}

/* -------------------------------------------------------------------------
 * Lifecycle
 * ---------------------------------------------------------------------- */

/**
 * Attachment lifecycle.
 *
 *   pending  reserved, credentials may be issued, bytes may be arriving
 *   active   published and serving playback; at most one per match
 *   retired  superseded or cancelled; keys are kept until storage deletion
 *
 * The transitions are one-way. A retired row is never reactivated, because its
 * blobs are already eligible for the cleanup worker.
 */
export const MATCH_VIDEO_STATES = ["pending", "active", "retired"] as const;

export type MatchVideoState = (typeof MATCH_VIDEO_STATES)[number];

/**
 * The attachment a caller believes is active, used for optimistic concurrency.
 *
 * `null` means "I believe this match has no attachment" and is what a first
 * add must send — an omitted field and an explicit null are NOT the same, so
 * that a client which simply forgot the field cannot clobber a replacement
 * another tab just committed.
 */
export interface ExpectedActiveAttachment {
  id: string;
  version: number;
}

/* -------------------------------------------------------------------------
 * Errors
 * ---------------------------------------------------------------------- */

/**
 * Stable machine-readable failure codes.
 *
 * Clients branch on `code`; humans read `message`. `detail` is a short slug for
 * logs and tests and is never shown to a user.
 */
export type MatchVideoErrorCode =
  | "unauthenticated"
  | "match_not_found"
  | "forbidden"
  | "workspace_mismatch"
  | "stale_attachment"
  | "pending_attempt_conflict"
  | "mode_conflict"
  | "file_too_large"
  | "empty_file"
  | "unsupported_media"
  | "media_probe_budget"
  | "invalid_alignment"
  | "missing_source_timing"
  | "insufficient_coverage"
  | "storage_unavailable";

export interface MatchVideoError {
  code: MatchVideoErrorCode;
  /** HTTP status this code maps to. */
  status: number;
  /** User-facing copy. */
  message: string;
  /** Machine slug naming the specific cause. Never rendered. */
  detail: string;
}

/**
 * The unsupported-media guidance, shared by a file that cannot be decoded and
 * by one whose structure exceeds the bounded inspection budget. Both end the
 * same way for the user: export an MP4.
 */
const UNSUPPORTED_MEDIA_MESSAGE =
  "This video cannot be played. Export it as an MP4 with H.264 video and try again.";

/**
 * The replacement-race message. Anything that makes the caller's view of the
 * active attachment stale says this.
 */
const STALE_MESSAGE = "The video changed. Reload and try again.";

/**
 * Status and copy per code.
 *
 * `insufficient_coverage` is the ONLY code that says "This video is not long
 * enough." — a missing final timestamp is a data problem, not a short file, and
 * telling the user to find a longer recording would send them hunting for a
 * file that does not exist.
 */
const ERROR_SPECS: Record<
  MatchVideoErrorCode,
  { status: number; message: string }
> = {
  unauthenticated: {
    status: 401,
    message: "Sign in to continue.",
  },
  match_not_found: {
    status: 404,
    message: "This match is not available.",
  },
  forbidden: {
    status: 403,
    message: "Only the person who added this match can change its video.",
  },
  workspace_mismatch: {
    status: 403,
    message: "Switch to this match's workspace to change its video.",
  },
  stale_attachment: { status: 409, message: STALE_MESSAGE },
  pending_attempt_conflict: {
    status: 409,
    message: "Another video upload for this match is already in progress.",
  },
  mode_conflict: { status: 409, message: STALE_MESSAGE },
  file_too_large: {
    status: 413,
    message: "This video is too large. Choose a file under 8 GB.",
  },
  empty_file: {
    status: 413,
    message: "This file is empty. Choose a video file.",
  },
  unsupported_media: { status: 422, message: UNSUPPORTED_MEDIA_MESSAGE },
  media_probe_budget: { status: 422, message: UNSUPPORTED_MEDIA_MESSAGE },
  invalid_alignment: {
    status: 422,
    message: "Enter a time inside this video, as hh:mm:ss.sss.",
  },
  missing_source_timing: {
    status: 422,
    message: "This match is missing the timing data needed to align a video.",
  },
  insufficient_coverage: {
    status: 422,
    message: "This video is not long enough.",
  },
  storage_unavailable: {
    status: 503,
    message: "Video storage is unavailable right now. Try again in a moment.",
  },
};

/**
 * Whether a string is one of the stable codes — the guard the RPC wrappers
 * use, because the SQL functions raise the code AS the exception message.
 */
export function isMatchVideoErrorCode(
  value: unknown,
): value is MatchVideoErrorCode {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(ERROR_SPECS, value)
  );
}

export function matchVideoError(
  code: MatchVideoErrorCode,
  detail: string,
): MatchVideoError {
  const spec = ERROR_SPECS[code];
  return { code, status: spec.status, message: spec.message, detail };
}

/** The HTTP status a code maps to, for route handlers. */
export function matchVideoErrorStatus(code: MatchVideoErrorCode): number {
  return ERROR_SPECS[code].status;
}

/* -------------------------------------------------------------------------
 * Result union
 * ---------------------------------------------------------------------- */

export type MatchVideoResult<T> =
  { ok: true; value: T } | { ok: false; error: MatchVideoError };

export function ok<T>(value: T): MatchVideoResult<T> {
  return { ok: true, value };
}

export function fail<T>(
  code: MatchVideoErrorCode,
  detail: string,
): MatchVideoResult<T> {
  return { ok: false, error: matchVideoError(code, detail) };
}

/* -------------------------------------------------------------------------
 * Request / result shapes
 * ---------------------------------------------------------------------- */

/**
 * `POST /api/matches/[matchId]/video/uploads`
 *
 * Everything authoritative is server-derived. The client may not name a storage
 * key, a user, a workspace, an offset, or a duration; it declares only what it
 * can see about the file it picked, and the server verifies each of those again
 * after the bytes land.
 */
export interface ReserveUploadRequest {
  filename: string;
  /** Declared size. Advisory — the stored blob is measured server-side. */
  sizeBytes: number;
  contentType: string;
  /** Client-generated UUID making the reservation retry-safe. */
  clientRequestId: string;
  expectedActive: ExpectedActiveAttachment | null;
}

export interface ReserveUploadResult {
  attachmentId: string;
  /** Write-only SAS for the staged key. Never names the final object. */
  uploadUrl: string;
  /** ISO 8601. Persisted before the URL is returned. */
  uploadExpiresAt: string;
}

/** `POST .../uploads/[attachmentId]/renew` — no metadata may change. */
export interface RenewUploadRequest {
  attachmentId: string;
}

export interface RenewUploadResult {
  attachmentId: string;
  uploadUrl: string;
  uploadExpiresAt: string;
}

/** `POST .../uploads/[attachmentId]/complete` */
export interface CompleteUploadRequest {
  attachmentId: string;
  /** Video-clock seconds where the first point's serve contact happens. */
  confirmedVideoTimeSeconds: number;
  expectedActive: ExpectedActiveAttachment | null;
}

/**
 * Completion is asynchronous because publication is an Azure server-side copy.
 * A pending result is not a failure: the same request is replayed until it
 * commits, which is also what makes a lost response recoverable.
 */
export type CompleteUploadResult =
  | { status: "pending"; attachmentId: string; retryAfterSeconds: number }
  | { status: "committed"; attachment: ActiveAttachment };

/** `DELETE .../uploads/[attachmentId]` — idempotent, pending attempts only. */
export interface CancelUploadRequest {
  attachmentId: string;
}

export interface CancelUploadResult {
  attachmentId: string;
  state: Extract<MatchVideoState, "retired">;
}

/** `PATCH .../alignment` — offset correction with no upload. */
export interface UpdateAlignmentRequest {
  attachmentId: string;
  expectedVersion: number;
  confirmedVideoTimeSeconds: number;
}

export interface UpdateAlignmentResult {
  attachment: ActiveAttachment;
}

/**
 * The active attachment as every caller sees it.
 *
 * `offsetSeconds` is the saved source-to-video shift; `version` increments on
 * every alignment change so a second tab can notice its own view went stale.
 */
export interface ActiveAttachment {
  id: string;
  version: number;
  offsetSeconds: number;
  confirmedVideoTimeSeconds: number;
  /** Server-verified duration of the published file. */
  durationSeconds: number;
  contentType: string;
  filename: string;
}

/**
 * `GET /api/matches/[matchId]/video` — playback metadata for anyone who can
 * see the match. Read-only: permission to watch is never permission to write,
 * and no upload credential appears here.
 */
export interface PlaybackMetadata extends ActiveAttachment {
  /** Short-lived read-only URL. Not a durable reference — refresh it. */
  playbackUrl: string;
  /** ISO 8601 expiry of `playbackUrl`. */
  playbackExpiresAt: string;
}
