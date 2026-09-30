/**
 * Analysis state for a match, rendered inline in the matches list.
 *
 * There is no separate analysis page: a job cannot exist without a match
 * (`processing_jobs.match_id` is NOT NULL with a FK to `matches`), so the match
 * row is the job's identity and the list is the queue.
 *
 * This file holds the SHAPE and the presentation rules — statuses, labels,
 * colours, stage arithmetic. The data comes from `match-analysis-server.ts`,
 * which reads real `processing_jobs` rows. It used to come from a fixture array
 * hash-cycled per match id, which meant every status and percentage on screen
 * was invented; that is gone.
 */

import { addVideoHref } from "@/lib/matches/add-video-href";
import type { ProviderId } from "@/lib/services/upload";

export type AnalysisStatus =
  /* --- mirrors processing_jobs_status_check --- */
  | "uploading"
  | "queued"
  | "processing"
  /**
   * Our derivation engine turning vendor strokes into points and shots.
   * Added to processing_jobs_status_check in 20260805005321, and to
   * splitstep_status_rank() in 20260805010934 — it ranks ABOVE anything a
   * webhook can carry, so a late vendor delivery cannot drag a mid-derivation
   * job backwards.
   */
  | "deriving"
  | "completed"
  | "failed"
  | "derivation_failed"
  /**
   * Bytes have landed; nobody has handed the job to the vendor yet.
   *
   * Distinct from `uploading` because the transfer really is finished, and
   * distinct from `queued` because the vendor does not have it — submission is
   * still a hand-run script. Collapsing it into either one tells the player
   * something untrue about where their match is.
   */
  | "uploaded"
  /**
   * The vendor is finished and our derivation engine has not run.
   *
   * Not a `processing_jobs.status` — the row says `completed`, which is true of
   * the vendor's half and only that. Derivation is gated (Phase 2, on Q8/Q9/Q13),
   * so no points, shots or match_stats exist yet, and treating `completed` as
   * "Analyzed" sent the player to a stats page rendering `[]` for every section.
   * An empty serve chart reads as "you hit no serves", not "we're still working".
   *
   * Resolved from `derivation_version` being null — see resolveAnalysisStatus().
   * It retires itself: the moment the engine stamps that column this state stops
   * being reachable, with no code change.
   */
  | "processed"
  /**
   * A verified point-by-point transcript exists; aggregate statistics do not.
   *
   * The state between "still working" and "here are your numbers", and the
   * reason it has to exist: derivation produces two very different things from
   * one payload. The point timeline is checkable — it is folded from the
   * vendor's score stream and refused outright unless it reproduces the score
   * the player entered — so a point on it is a claim we can defend. The
   * aggregates are not: several families are contaminated by the vendor
   * recording points that ended on the serve as multi-stroke rallies, and aces
   * cannot be separated from service winners at all.
   *
   * Without this state the page is all-or-nothing, and both ends are wrong. Held
   * at `processed` it shows nothing for a match we have fully transcribed;
   * promoted to `completed` it shows stat cards reading zero, which a coach
   * reads as "you hit no aces".
   *
   * Not a `processing_jobs.status`. Resolved by withStatsPublished() from
   * whether `match_stats` rows actually exist.
   */
  | "timeline"
  /**
   * The athlete stopped the analysis before the vendor began it. Terminal:
   * set only by the cancel route (`cancel_processing_job`) after the vendor
   * removed the queued job, and its reservation was released in the same
   * write. The video is still stored — "Send for analysis again" resubmits
   * from it (resubmitJob() accepts a cancelled parent).
   *
   * Settled but neither failed nor ready: nothing went wrong and nothing was
   * analysed, so it is in none of IN_FLIGHT, FAILED or READY and the matches
   * list groups it with `manual`.
   */
  | "cancelled"
  /* --- derived, not job statuses --- */
  /** Arrived complete from a file import. Never had a processing job. */
  | "imported"
  /** Scored by hand. No video was ever submitted. */
  | "manual";

export interface MatchAnalysis {
  status: AnalysisStatus;
  /**
   * Position along the whole pipeline, 0-100, matching PIPELINE_STAGES.
   *
   * Derived from status, with the upload's byte progress scaled into the
   * "Uploaded" segment. This is NOT the upload percentage: feeding raw upload
   * bytes onto this axis is what used to light the "Analyzing" bar nearly full
   * while a file was still transferring, because 40-100 of this scale belongs to
   * analysis.
   *
   * The vendor sends queue/analysis transitions with no percentage attached, so
   * within a stage this sits at that stage's start rather than inventing motion.
   */
  progressPercent?: number;
  /**
   * Bytes moved, 0-100, only while the transfer is running.
   *
   * The number a player actually wants during an upload, and the only one in
   * here measured rather than inferred. Read it directly — do NOT fall back to
   * `progressPercent` when it is absent. That fallback existed once and meant
   * the headline changed meaning the instant a transfer finished, so the number
   * DROPPED from 99% to 26% exactly when the user had succeeded. After the
   * upload there is no measured percentage, and the stage bars say where the
   * job is on their own.
   */
  uploadPercent?: number;
  /**
   * When the job row was created, ISO. Stands in for "when the transfer
   * started" — the row is inserted immediately before the upload begins, so the
   * gap is a couple of seconds against a transfer measured in minutes.
   *
   * Carried so any device can estimate time remaining, not just the tab doing
   * the uploading.
   */
  startedAt?: string;
  /** Drives the popover's logo and heading. */
  providerId: ProviderId | null;
  fileName?: string;
  /** Trimmed length, pre-formatted. This is also what the job is billed on. */
  window?: string;
  /** `processing_jobs.id`, so a stalled submission has something to retry. */
  jobId?: string;
  /**
   * `processing_jobs.created_by` — the login that submitted this job. The
   * cancel and resubmit routes act only for this user (anyone else gets "Job
   * not found"), so the match page offers "Cancel analysis" / "Send for
   * analysis again" only when the viewer is this id.
   */
  createdBy?: string;
  /** When the row last moved, ISO. The staleness input for `isSubmitStalled`. */
  updatedAt?: string;
  jobReference?: string;
  /** What the engine is doing right now. Never a frame count we don't receive. */
  stageNote?: string;
  failNote?: string;
  /**
   * What the player can do about a job that did not finish, from
   * `classifyFailure()`. Undefined for a healthy or in-flight row. A vendor
   * refusal of the video itself (`processing_jobs.error_category` is
   * `invalid_input` — a frame rate too low, say) classifies as
   * `fix_recording`, so resubmitting the same file cannot succeed and Retry
   * should not be offered (see `isInputRejected()`, consumed inside
   * `classifyFailure()`). Set through `jobRecoveryFacts()` +
   * `classifyFailure()` in BOTH the server loader and the realtime merge
   * (`withLiveAnalysis`) — a field one path sets and the other does not is
   * how the match page and the matches list start disagreeing about the same
   * row.
   */
  recovery?: RecoveryClass;
  /**
   * The stored `error_message`, only when `showsStoredNote()` allows it — a
   * vendor or submit-path explanation, never one of our raw writer strings
   * ("Failed to fetch", Azure XML). Unlike `failNote`, which is unfiltered.
   */
  note?: string;
  /**
   * The row's raw `processing_jobs.error_code`, set beside `recovery` and
   * `note` by `recoveryFields()` so the loader and the live patch both carry
   * it. Input to `waitOrAskVariant()` only — never rendered.
   */
  errorCode?: string;
  /**
   * Rows in the newest job's resubmission chain, the original included —
   * `chainAttempts()`. The ceiling input to `classifyFailure()`.
   */
  attemptsUsed?: number;
  /**
   * When the vendor took the job into its queue, ISO —
   * `queued_ack_at ?? submitted_at`. The acknowledgement is the truer mark;
   * `submitted_at` stands in when the `job_queued` webhook never arrived. The
   * "Waiting N min" clock.
   */
  queuedAt?: string;
  /**
   * When the vendor reported it had begun processing, ISO
   * (`vendor_started_at`). The "Started N min ago" clock; null-and-cancelled
   * means the job never cost vendor compute.
   */
  vendorStartedAt?: string;
  /**
   * Seconds of the month's analysis time this job reserved
   * (`billable_seconds`) — the "1h 29m goes back" figure on cancel. Raw
   * seconds, unlike `window`, which is the same number pre-formatted.
   */
  reservedSeconds?: number;
  verified?: boolean;
}

/**
 * The job-row timing columns → `queuedAt`, `vendorStartedAt`,
 * `reservedSeconds`. The ONE projection the server loader and the realtime
 * patch share, so the two cannot read the clocks differently. Every key is
 * always present so a live patch spread over the server render clears a
 * field the row no longer carries.
 */
export function jobTimingFields(row: {
  queued_ack_at?: string | null;
  submitted_at?: string | null;
  vendor_started_at?: string | null;
  billable_seconds?: number | null;
}): Pick<MatchAnalysis, "queuedAt" | "vendorStartedAt" | "reservedSeconds"> {
  const reserved = row.billable_seconds;
  return {
    queuedAt: row.queued_ack_at ?? row.submitted_at ?? undefined,
    vendorStartedAt: row.vendor_started_at ?? undefined,
    reservedSeconds: reserved != null && reserved > 0 ? reserved : undefined,
  };
}

/**
 * `processing_jobs.status` → what the UI calls it.
 *
 * Lives here, not beside the loader, because BOTH the server loader and the
 * realtime hook project job rows and so both need it. It was briefly duplicated
 * on the grounds that match-analysis-server.ts is server-only — it is not: its
 * Supabase import is `import type`, erased at build, and the client arrives as a
 * parameter. The cost of that mistake was writing `uploaded` and its rationale
 * twice, detectable only by a runtime console.warn.
 */
export const STATUS_MAP: Record<string, AnalysisStatus> = {
  pending: "uploading",
  uploading: "uploading",
  // NOT 'uploading'. The bytes have landed; collapsing it left a finished
  // transfer reading "Uploading 99%" indefinitely, because nothing auto-submits
  // and so nothing ever moved it on.
  uploaded: "uploaded",
  submitting: "queued",
  queued: "queued",
  processing: "processing",
  deriving: "deriving",
  completed: "completed",
  failed: "failed",
  derivation_failed: "derivation_failed",
  cancelled: "cancelled",
};

/**
 * A job row's two status columns → what the UI calls it.
 *
 * `status` alone is not enough. The vendor's `completed` means their half is
 * done, and says nothing about whether we have turned the stroke stream into
 * points and shots — so a job sat at "Analyzed" with a stats page full of empty
 * charts. `derivation_version` is the column that distinguishes them: written
 * only by the derivation engine, null until it runs.
 *
 * CONTRACT: derivation must stamp `derivation_version` in the same transaction
 * that writes stats. Nothing enforces it, and if it is ever skipped every
 * analysed match reads "Stats pending" forever.
 *
 * Both the server loader and the realtime hook go through here. STATUS_MAP was
 * consolidated into this module for exactly that reason once already; adding a
 * second column to one caller and not the other would put the matches list and
 * the match page back to disagreeing about the same row.
 *
 * Returns undefined for a status the UI has no word for — callers warn and skip
 * rather than rendering a job in a state nobody designed.
 */
export function resolveAnalysisStatus(
  dbStatus: string,
  derivationVersion: string | null | undefined,
): AnalysisStatus | undefined {
  const status = STATUS_MAP[dbStatus];
  if (!status) return undefined;

  return status === "completed" && !derivationVersion ? "processed" : status;
}

/**
 * Downgrade a finished analysis to `timeline` when no statistics were published.
 *
 * Deliberately NOT folded into resolveAnalysisStatus(). That function projects a
 * `processing_jobs` row and nothing else, and both the server loader and the
 * realtime hook call it — the hook receives job rows over a websocket and has no
 * access to `match_stats`. Giving it a parameter only one caller could supply is
 * how the two screens started disagreeing about the same row last time.
 *
 * So this is a second, explicit step for callers that have actually loaded the
 * statistics and can answer the question honestly. A caller that cannot should
 * not guess: leaving a match at `completed` overstates it, but only by the width
 * of a label, whereas a hook inventing `timeline` from a job row would put two
 * different words on the same match on two different screens.
 */
export function withStatsPublished(
  status: AnalysisStatus,
  statsPublished: boolean,
): AnalysisStatus {
  return status === "completed" && !statsPublished ? "timeline" : status;
}

/**
 * `processing_jobs.error_category` for a vendor refusal of the input itself.
 * The one copy of the literal in `src` — compare through isInputRejected().
 */
export const INPUT_REJECTED_CATEGORY = "invalid_input";

/**
 * Did the vendor reject the video itself, rather than fail while analysing it?
 *
 * Takes the raw `processing_jobs.status`, not the resolved AnalysisStatus, so
 * both projections call it on the row they already hold. True only for a
 * `failed` job: `derivation_failed` is our reconciler, not the vendor, and a
 * category left behind on a later successful row means nothing.
 */
export function isInputRejected(
  dbStatus: string,
  errorCategory: string | null | undefined,
): boolean {
  return dbStatus === "failed" && errorCategory === INPUT_REJECTED_CATEGORY;
}

/**
 * Is a video-provider failure eligible for the Retry action?
 *
 * The one rule three surfaces (the match page's progress card, the matches
 * drawer, the schedule line drawer) each re-derived: a job can be retried only
 * if it is a `failed` vendor job (not `derivation_failed` — resubmitJob()
 * refuses anything else) that still has a job to resubmit, and whose failure
 * was not the vendor rejecting the input itself (that would fail the same way
 * again). This is the shared part; each caller layers its own access-control
 * clause (`canManage`, `canEdit && !doubles`) on top.
 */
export function canRetryAnalysis(analysis: {
  status?: AnalysisStatus;
  jobId?: string | null;
  recovery?: RecoveryClass | null;
}): boolean {
  return (
    analysis.status === "failed" &&
    Boolean(analysis.jobId) &&
    analysis.recovery !== "fix_recording"
  );
}

// `isDownloadFailure` and `MAX_TOTAL_ATTEMPTS` live here rather than in
// `resubmit-job.ts` because classifyFailure() needs them and this file is
// imported by client components — resubmit-job.ts pulls in
// `@azure/storage-blob`. It re-exports both, so its importers are unchanged.

/** 1 original + 2 resubmissions. Enforced here and nowhere else. */
export const MAX_TOTAL_ATTEMPTS = 3;

/**
 * The ONE failure class the system retries on its own.
 *
 * A download failure with a valid SAS means the file, submission and metadata
 * are all good — retrying is nearly free and nearly always works. Step
 * outranks code because the one real failure arrived as INTERNAL_ERROR at
 * step 'downloading_video'; a bare INTERNAL_ERROR elsewhere says "contact
 * support", video-quality rejections can never succeed on retry, and unknown
 * codes surface without retrying. Exported so the webhook route and the
 * reconciler classify with the same rule — this is the load-bearing line,
 * and two copies of it is how one site silently widens the retry class.
 */
export function isDownloadFailure(
  errorCode: string | null,
  errorStep: string | null,
): boolean {
  return errorStep === "downloading_video" || errorCode === "VIDEO_UNREACHABLE";
}

/**
 * What a player can do about a job that did not finish. One class per row,
 * decided by classifyFailure(); the copy and the action for each live in
 * `analysis-failure-copy.ts`.
 *
 *   retry             Retry analysis (failed row) / Try again (stalled submit)
 *   upload_again      the video never landed — send it again
 *   fix_recording     the vendor rejected the file itself — a new recording
 *   wait_or_ask       nothing to press now: allowance, eligibility, or the
 *                     attempt ceiling
 *   rederive          our statistics build crashed — rebuild, no vendor call
 *   stats_unavailable our statistics build refused the data — the match renders
 */
export type RecoveryClass =
  | "retry"
  | "upload_again"
  | "fix_recording"
  | "wait_or_ask"
  | "rederive"
  | "stats_unavailable";

/** The row facts classifyFailure() reads — plain values, no DB types. */
export interface RecoveryInput {
  /** Raw `processing_jobs.status`, not the resolved AnalysisStatus. */
  dbStatus: string;
  errorCode: string | null | undefined;
  errorCategory: string | null | undefined;
  errorStep: string | null | undefined;
  /** Does the source video exist to resend? */
  hasVideo: boolean;
  /** Did the vendor deliver results? */
  hasResults: boolean;
  /** Rows in this job's resubmission chain, the original included. */
  attemptsUsed: number;
  /** An `uploaded` row past the submit threshold — the caller's isSubmitStalled(). */
  stalledSubmit: boolean;
}

/**
 * Codes a submit is refused with that clear on their own (allowance resets,
 * eligibility is granted) rather than on a retry.
 */
const SUBMIT_WAIT_CODES = new Set([
  "QUOTA_EXCEEDED",
  "NOT_ELIGIBLE",
  "NO_BILLING_WORKSPACE",
]);

/**
 * Sort a job that did not finish into what the player can do about it.
 *
 * First matching rule wins, and the order is the design:
 *   1. stalled `uploaded` → wait_or_ask for a refusal that clears on its own,
 *      else retry (a free resubmit — nothing was spent)
 *   2. `failed` with no video → upload_again, before any code rule: there is
 *      nothing to resend
 *   3. `failed` download failure → retry (the auto-retry class stays a subset)
 *   4. `failed` input rejection → fix_recording
 *   5. `failed` otherwise → retry
 *   6. `derivation_failed` → rederive for a crash, stats_unavailable for a
 *      refusal or no code
 *
 * Both `failed` retries (3 and 5) become wait_or_ask once the chain has used
 * MAX_TOTAL_ATTEMPTS, since resubmitJob() refuses past the ceiling and no
 * button should offer what the route will refuse.
 *
 * Returns null for any other row — healthy, in flight, or `uploaded` but not
 * yet stalled.
 */
export function classifyFailure(input: RecoveryInput): RecoveryClass | null {
  const errorCode = input.errorCode ?? null;

  if (input.dbStatus === "uploaded") {
    if (!input.stalledSubmit) return null;
    return errorCode && SUBMIT_WAIT_CODES.has(errorCode)
      ? "wait_or_ask"
      : "retry";
  }

  if (input.dbStatus === "failed") {
    if (!input.hasVideo) return "upload_again";
    const retry: RecoveryClass =
      input.attemptsUsed >= MAX_TOTAL_ATTEMPTS ? "wait_or_ask" : "retry";
    if (isDownloadFailure(errorCode, input.errorStep ?? null)) return retry;
    if (isInputRejected(input.dbStatus, input.errorCategory)) {
      return "fix_recording";
    }
    return retry;
  }

  if (input.dbStatus === "derivation_failed") {
    return errorCode === "DERIVATION_ERROR" ? "rederive" : "stats_unavailable";
  }

  return null;
}

/**
 * Is the row's stored `error_code` note worth showing the player?
 *
 * `DERIVATION_*` notes are our reconciler talking to itself ("5 point(s)
 * resolved no winner"); every other code carries a message from the vendor or
 * the submit path that explains the state.
 */
export function showsStoredNote(errorCode: string | null | undefined): boolean {
  return errorCode != null && !errorCode.startsWith("DERIVATION_");
}

/**
 * The `processing_jobs` columns recovery is decided from, as both projections
 * hold them. The storage keys arrive as `hasVideo` / `hasResults` — the caller
 * maps them, so a key never lands on anything bound for the client.
 */
export interface RecoveryRow {
  status: string;
  derivation_version?: string | null;
  error_code?: string | null;
  error_category?: string | null;
  error_step?: string | null;
  error_message?: string | null;
  external_job_id?: string | null;
  updated_at?: string | null;
  hasVideo: boolean;
  hasResults: boolean;
}

/** `RecoveryInput` less the chain count, which only the caller can supply. */
export type RecoveryFacts = Omit<RecoveryInput, "attemptsUsed">;

/**
 * One job row → the classifier's inputs, with `stalledSubmit` from the same
 * `isSubmitStalled()` the surfaces use. The ONE projection the server loader
 * and the realtime hook share; neither builds a RecoveryInput by hand.
 */
export function jobRecoveryFacts(
  row: RecoveryRow,
  nowMs: number = Date.now(),
): RecoveryFacts {
  const status = resolveAnalysisStatus(row.status, row.derivation_version);
  return {
    dbStatus: row.status,
    errorCode: row.error_code ?? null,
    errorCategory: row.error_category ?? null,
    errorStep: row.error_step ?? null,
    hasVideo: row.hasVideo,
    hasResults: row.hasResults,
    stalledSubmit:
      status !== undefined &&
      isSubmitStalled(
        {
          status,
          updatedAt: row.updated_at ?? undefined,
          jobReference: row.external_job_id ?? undefined,
        },
        nowMs,
      ),
  };
}

/**
 * `recovery`, `note` and `errorCode` for one row. All keys are always present
 * so a patch spread over an earlier failure clears them.
 */
export function recoveryFields(
  facts: RecoveryFacts,
  attemptsUsed: number,
  errorMessage: string | null | undefined,
): {
  recovery: RecoveryClass | undefined;
  note: string | undefined;
  errorCode: string | undefined;
} {
  return {
    recovery: classifyFailure({ ...facts, attemptsUsed }) ?? undefined,
    note:
      showsStoredNote(facts.errorCode) && errorMessage
        ? errorMessage
        : undefined,
    errorCode: facts.errorCode ?? undefined,
  };
}

/**
 * How many rows the newest job's resubmission chain holds, the original
 * included: its root (walked up `resubmitted_from_job_id`) plus every row
 * descending from that root. Counted among `rows` only — the rows a loader
 * already fetched for one match — so it costs no query.
 *
 * An earlier upload for the same match that no link connects is a separate
 * chain and is not counted: it did not spend this chain's attempts. Returns 1
 * when `newestId` is not among `rows`. Cycle-safe.
 */
export function chainAttempts(
  rows: readonly { id: string; resubmitted_from_job_id?: string | null }[],
  newestId: string,
): number {
  // A chain is a tree, so "root plus descendants" is exactly the rows linked
  // to the newest one in either direction. Walking links both ways rather than
  // up-then-down keeps a data cycle from picking two different roots.
  const ids = new Set(rows.map((row) => row.id));
  if (!ids.has(newestId)) return 1;

  const linked = new Map<string, string[]>();
  const link = (a: string, b: string) => {
    const list = linked.get(a);
    if (list) list.push(b);
    else linked.set(a, [b]);
  };
  for (const row of rows) {
    const parent = row.resubmitted_from_job_id;
    if (parent && ids.has(parent)) {
      link(row.id, parent);
      link(parent, row.id);
    }
  }

  const seen = new Set<string>([newestId]);
  const frontier = [newestId];
  while (frontier.length > 0) {
    for (const next of linked.get(frontier.pop()!) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      frontier.push(next);
    }
  }
  return seen.size;
}

export const ANALYSIS_LABEL: Record<AnalysisStatus, string> = {
  uploading: "Uploading",
  uploaded: "Uploaded",
  queued: "Queued",
  processing: "Processing",
  deriving: "Analyzing",
  // Same family as "Stats failed" and "Stats unavailable", and deliberately not
  // a variant of "Processing" — the two would be one letter apart on screen
  // while meaning opposite things about whether anything is still running.
  processed: "Stats pending",
  // Says what IS there rather than what is missing. "Partial" or "Stats
  // unavailable" would describe the same row by its gap, and the timeline is
  // the more useful half of the analysis, not a consolation for the other.
  timeline: "Timeline ready",
  completed: "Analyzed",
  failed: "Failed",
  derivation_failed: "Stats failed",
  imported: "Imported",
  manual: "Stats unavailable",
  cancelled: "Cancelled",
};

/**
 * Ink for a settled row. Work we ran reads as a positive outcome; an import
 * arrived already finished, so it stays neutral.
 */
export function outcomeInk(status: AnalysisStatus): string {
  return status === "imported" ? "#525252" : "#5DB955";
}

/**
 * Milestones a video passes on its way to being analyzed, each owning a slice of
 * the overall 0-100.
 *
 * The slices are uneven because the work is: analysis dominates, the queue is
 * usually brief. Rendering them as equal-width segments means the bar reads as
 * one continuous track whose total always equals the headline percentage,
 * rather than four bars each showing a different number.
 */
export const PIPELINE_STAGES: { label: string; start: number; end: number }[] =
  [
    { label: "Uploaded", start: 0, end: 26 },
    { label: "Queued", start: 26, end: 40 },
    { label: "Analyzing", start: 40, end: 100 },
    { label: "Ready", start: 100, end: 100 },
  ];

/** How full segment `index` should be, given overall progress. */
export function stageFillPercent(
  index: number,
  overallPercent: number,
): number {
  const stage = PIPELINE_STAGES[index];
  // Ready is a terminal marker, not a span — it lights only on completion.
  if (stage.end === stage.start) return overallPercent >= 100 ? 100 : 0;
  const ratio = (overallPercent - stage.start) / (stage.end - stage.start);
  return Math.max(0, Math.min(1, ratio)) * 100;
}

/**
 * Where a job sits on the PIPELINE_STAGES axis.
 *
 * Only the upload is measured; everything after it is a position, not a
 * quantity, because the vendor sends transitions with no percentage attached.
 * Each unmeasured state therefore sits at the START of its stage, which renders
 * as "we are here, this stage has not progressed" — the stages behind it still
 * fill, because the component drives those off stageIndexFor, not off this
 * number.
 *
 * The upload is scaled into the "Uploaded" segment rather than passed through
 * raw. Passing it raw is what used to make a 99%-transferred file light the
 * "Analyzing" bar nearly full, since 40-100 of this axis belongs to analysis.
 */
export function pipelinePercent(
  status: AnalysisStatus,
  uploadPercent?: number,
): number | undefined {
  const [uploaded] = PIPELINE_STAGES;

  // The only measured case: scale real bytes into the first segment.
  if (status === "uploading") {
    return uploadPercent === undefined
      ? undefined
      : (uploadPercent / 100) * uploaded.end;
  }

  // A failure carries no percentage — the component fills the stage it died in
  // from `failedHere` — and a hand-scored match never had a pipeline. A
  // cancelled job stopped where it stood; a bar would claim progress.
  if (
    isAnalysisFailed(status) ||
    status === "manual" ||
    status === "cancelled"
  ) {
    return undefined;
  }

  if (status === "completed" || status === "imported") return 100;

  // Everything else sits at the start of the stage it is in. stageIndexFor is
  // already the one table mapping status to stage; enumerating them again here
  // is how the two drift.
  return PIPELINE_STAGES[stageIndexFor(status)].start;
}

/**
 * Below this, an estimate is arithmetic on noise.
 *
 * The percentage is written at most every 2 points, so at 1-2% the elapsed-time
 * divisor is tiny and the projection swings by tens of minutes between updates.
 */
const MIN_PERCENT_FOR_ETA = 5;

/**
 * Rough seconds left on a transfer, from elapsed time and percent moved.
 *
 * Deliberately derived rather than stored. The uploading tab knows real bytes
 * and real throughput, but it is the only thing that does — open the match on a
 * phone and there is nothing to read. Elapsed-versus-percent is available to
 * every viewer from two columns we already load.
 *
 * It is a cumulative average, so it is smooth and slow to react: a transfer
 * that stalls sees its estimate grow rather than freeze, which is the more
 * useful failure to watch.
 */
export function uploadEtaSeconds(
  // Only the three fields it reads, so a caller holding a narrower projection
  // does not have to carry eight unused ones to ask this question.
  analysis: Pick<MatchAnalysis, "status" | "uploadPercent" | "startedAt">,
  nowMs: number,
): number | undefined {
  if (analysis.status !== "uploading") return undefined;

  const percent = analysis.uploadPercent;
  if (percent === undefined || percent < MIN_PERCENT_FOR_ETA) return undefined;
  if (!analysis.startedAt) return undefined;

  const elapsedSeconds = (nowMs - Date.parse(analysis.startedAt)) / 1000;
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) return undefined;

  return (elapsedSeconds / percent) * (100 - percent);
}

/**
 * Time remaining, at the precision the input actually supports.
 *
 * Rounded to whole minutes on purpose. The source percentage moves in 2-point
 * steps, so "11m 43s" would be false precision dressed up as care. Used by both
 * surfaces that show a remaining time, so they cannot phrase it differently.
 */
export function formatEta(seconds: number): string {
  if (seconds < 90) return "under a minute left";
  return `about ${formatDuration(seconds)} left`;
}

/**
 * A length of time in whole minutes — "12 min", "1h", "1h 29m". `formatEta`'s
 * own arithmetic, shared so an estimate, an elapsed clock and a reserved
 * allowance ("1h 29m goes back…") cannot phrase the same span two ways.
 * Floors at one minute: a zero reads as nothing having happened.
 */
export function formatDuration(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/**
 * Which milestone a status currently sits in. Failures report the stage they
 * died in rather than collapsing to the start, so the pipeline shows how far
 * the job actually got.
 */
export function stageIndexFor(status: AnalysisStatus): number {
  switch (status) {
    case "uploading":
    case "uploaded":
    case "manual":
      return 0;
    case "queued":
    // Cancel is offered only while the job waits in the vendor's queue, so a
    // cancelled job stopped there.
    case "cancelled":
      return 1;
    case "processing":
    case "deriving":
    // The Analyzing stage covers both halves of the work — their detection and
    // our derivation — so a job between them sits in it, having cleared the
    // first half. There is no percentage to show either way: the vendor sends
    // transitions without one.
    case "processed":
    case "failed":
      return 2;
    case "derivation_failed":
    case "timeline":
    case "completed":
    case "imported":
      return 3;
  }
}

const IN_FLIGHT = new Set<AnalysisStatus>([
  "uploading",
  "uploaded",
  "queued",
  "processing",
  "deriving",
  "processed",
]);
/**
 * In flight, but nothing is moving right now.
 *
 * Both are waiting on something outside the pipeline: `uploaded` on submission,
 * `processed` on a derivation engine that is gated. They belong in IN_FLIGHT —
 * the state will change — but animating them would claim work is happening.
 */
const IDLE = new Set<AnalysisStatus>(["uploaded", "processed"]);
/**
 * In flight, but only a DEPLOY will move it — no running process will.
 *
 * `processed` waits on the derivation engine, which is gated on Q8/Q9/Q13. Until
 * that ships, the row never changes, so no realtime event is ever coming.
 *
 * Distinct from IDLE, and the difference is the whole point: `uploaded` is also
 * idle, but submission fires automatically within seconds, so it is very much
 * worth watching. Empty this set when Phase 2 lands and delete it.
 */
const STALLED = new Set<AnalysisStatus>(["processed"]);
const FAILED = new Set<AnalysisStatus>(["failed", "derivation_failed"]);
// `timeline` is terminal in the sense that matters here: nothing is running and
// no event is coming. It is deliberately NOT in IN_FLIGHT — holding it there
// would keep the match page on the progress card, hiding a transcript we have
// already verified.
const READY = new Set<AnalysisStatus>(["completed", "imported", "timeline"]);

/** Not terminal. Drives grouping and filtering — "is this still going to change?" */
export function isInFlight(status: AnalysisStatus): boolean {
  return IN_FLIGHT.has(status);
}

/**
 * Something is happening RIGHT NOW. Narrower than isInFlight.
 *
 * `uploaded` was the first status where the two diverged: the transfer is done
 * and nothing moves again until submission. Conflating them made a finished
 * upload animate forever on the match page while the matches list, which
 * special-cased it separately, did not — one state, two answers, on the two
 * screens the shared track was meant to reconcile. `processed` is the same shape
 * of thing, which is why the exception is a set rather than a second `&&`.
 *
 * Drives the progress track's `live` flag. If it animates, work is happening.
 */
export function isWorking(status: AnalysisStatus): boolean {
  return IN_FLIGHT.has(status) && !IDLE.has(status);
}

/** The step mark for an in-flight row: a spinner only while work runs, else a waiting dot. */
export function inFlightMark(status: AnalysisStatus): "now" | "wait" {
  return isWorking(status) ? "now" : "wait";
}

/**
 * Is a database update actually coming for this row?
 *
 * The question a Realtime subscription should ask, and it is NOT isInFlight.
 * `processed` is in flight — it will change eventually — but only when Phase 2
 * ships, which is a deploy rather than a running process. Subscribing on it
 * meant every user holding one analysed match kept a WebSocket and a 25-second
 * heartbeat open on every page visit, indefinitely, against a per-project
 * connection cap. That is the exact cost the subscription guards exist to avoid,
 * and isInFlight quietly stopped preventing it the moment `processed` was added.
 *
 * Not isWorking() either: `uploaded` does nothing right now, so it must not
 * animate, but auto-submit moves it within seconds — so it absolutely should be
 * watched. Three questions, three predicates.
 */
export function isLiveUpdating(status: AnalysisStatus): boolean {
  return IN_FLIGHT.has(status) && !STALLED.has(status);
}

/**
 * In flight, and only a DEPLOY will move it. The fourth question.
 *
 * `isLiveUpdating`'s complement within IN_FLIGHT, named because surfaces need
 * to say it rather than derive it. A card that reads `!isLiveUpdating(status)`
 * is right only while something upstream has already established the status is
 * in flight at all — true of `completed`, `imported`, `timeline`, `failed` and
 * `manual` otherwise — so the negation carries an invariant the reader has to
 * go and check. This carries none.
 *
 * Retires itself with STALLED: empty that set when Phase 2 lands and every
 * caller correctly stops distinguishing.
 */
export function isStalled(status: AnalysisStatus): boolean {
  return STALLED.has(status);
}

export function isAnalysisFailed(status: AnalysisStatus): boolean {
  return FAILED.has(status);
}

export function isAnalysisReady(status: AnalysisStatus): boolean {
  return READY.has(status);
}

/**
 * The one failure that does NOT stop the match page (product decision
 * 2026-09-27, guardrails §3.3): our derivation deterministically refused the
 * vendor's data (`derivation_failed` classified `stats_unavailable`, e.g.
 * points that resolved no winner). Nothing changes on a retry, and the match
 * itself — score, details, any playable video — is fine, so it renders like
 * any other match and the Statistics view says, once, that no statistics were
 * saved. Scoped to a failed status so a stale class can never wave an
 * in-flight job past the gate.
 */
export function isStatsUnavailable({
  status,
  recovery,
}: Pick<MatchAnalysis, "status" | "recovery">): boolean {
  return isAnalysisFailed(status) && recovery === "stats_unavailable";
}

/** What the match page draws: the Analysis steps column, or the report. */
export type MatchPageKind = "steps" | "report";

/**
 * The match page's layout decision (guardrails §3.3), as a pure function so
 * the page and its route skeleton answer from one predicate (§3.2's lesson —
 * two surfaces that each re-derived a row's state disagreed once).
 *
 * `"steps"` for every in-flight or failed status — every stat section would
 * draw zeroes, and the reason it stopped is more use than a page of them —
 * except the one `isStatsUnavailable` exemption, and for `cancelled`: a job
 * cancelled in the queue was never analysed, so the report would be empty
 * sections, and the stepper's cancelled view is where "Send for analysis
 * again" lives. Everything else is the report.
 */
export function matchPageKind({
  status,
  recovery,
}: Pick<MatchAnalysis, "status" | "recovery">): MatchPageKind {
  if (status === "cancelled") return "steps";
  return (isInFlight(status) || isAnalysisFailed(status)) &&
    !isStatsUnavailable({ status, recovery })
    ? "steps"
    : "report";
}

/**
 * The matches list's own lifecycle grouping — "In progress" / "Ready" /
 * "Failed" / "Not analyzed" — kept as a named export so the list's decision is a
 * pure function a spec can pin, not inline logic in the list component.
 *
 * Deliberately NOT `isAnalysisFailed(status)` alone. Product decision
 * 2026-09-27: a `derivation_failed` row classified `stats_unavailable` (our
 * derivation refused the data — see `classifyFailure`) must not read as a
 * failed match. The match page still renders; the stats section is what's
 * missing, and only that section says so. Every other failed row — including
 * `derivation_failed` classified `rederive`, a real crash — still groups
 * under Failed.
 */
export function matchListGroup(
  analysis: Pick<MatchAnalysis, "status" | "recovery"> | null | undefined,
): string | null {
  const status = analysis?.status;
  if (!status) return null;
  if (analysis?.recovery === "stats_unavailable") return "Ready";
  if (isInFlight(status)) return "In progress";
  if (isAnalysisFailed(status)) return "Failed";
  // A cancelled job was never analysed — the same group as a hand-scored
  // match, and never "Ready".
  if (status === "manual" || status === "cancelled") return "Not analyzed";
  return "Ready";
}

/**
 * The matches list's own status word for a row — `ANALYSIS_LABEL` with one
 * override, mirroring `matchListGroup`'s decision: a `stats_unavailable` row
 * reads "Stats unavailable" (the same word `manual` already uses), never
 * `ANALYSIS_LABEL.derivation_failed`'s "Stats failed".
 */
export function matchListStatusLabel(
  analysis: Pick<MatchAnalysis, "status" | "recovery">,
): string {
  if (analysis.recovery === "stats_unavailable") return "Stats unavailable";
  return ANALYSIS_LABEL[analysis.status];
}

/**
 * How long an `uploaded` job may sit before we stop calling it healthy.
 *
 * Auto-submit fires within seconds of the terminal `status: 'uploaded'` write,
 * so three minutes is many times any normal gap while still being far too
 * short to accuse a working job. It only has to beat "seconds".
 */
const SUBMIT_STALL_MS = 3 * 60 * 1000;

/**
 * Did the submission never happen?
 *
 * `uploaded` is the one in-flight state with no engine behind it. The bytes are
 * in Azure and the wizard is meant to submit immediately — but a submit failure
 * deliberately does NOT mark the job failed, because `uploaded` is the single
 * state a retry needs nothing re-uploaded from. The cost of that good decision
 * is this: a job whose submit failed looks exactly like a job whose submit is
 * about to succeed, and the progress panel reassures the player that "your
 * video is stored, nothing else is needed from you" — which is true of the
 * bytes and false about the analysis, forever.
 *
 * Nothing reaps it either. `reap_stalled_uploads()` deliberately leaves
 * `uploaded` alone, precisely because the bytes are safe. So without a clock
 * this state is invisible.
 *
 * Time is the only signal available: no error was recorded, because from the
 * job's point of view nothing went wrong. Hence a threshold rather than a flag.
 */
export function isSubmitStalled(
  analysis: Pick<MatchAnalysis, "status" | "updatedAt" | "jobReference">,
  nowMs: number = Date.now(),
): boolean {
  if (analysis.status !== "uploaded") return false;
  // A job the vendor has already accepted is not stalled, whatever its status
  // says — belt and braces, since `uploaded` should never carry a reference.
  if (analysis.jobReference) return false;
  if (!analysis.updatedAt) return false;

  const movedAt = Date.parse(analysis.updatedAt);
  if (!Number.isFinite(movedAt)) return false;

  return nowMs - movedAt > SUBMIT_STALL_MS;
}

export interface AnalysisAction {
  label: string;
  /**
   * Absent for Cancel — it does not navigate. Cancelling is a POST to
   * `/api/splitstep/jobs/[jobId]/cancel`, which calls the vendor's
   * `DELETE {SPLITSTEP_API_URL}/{id}`; that only succeeds while the job is
   * still queued (409 JOB_NOT_REMOVABLE once processing has started).
   */
  href?: string;
  ink: string;
  hoverInk: string;
}

/**
 * The "Add video" shape — also used for a failed row whose only move is to
 * resend a file. When `matchId` is given, the href opens the wizard on this
 * match (`addVideoHref`) rather than a new one.
 */
function addVideoAction(matchId?: string): AnalysisAction {
  return {
    label: "Add video",
    href: addVideoHref(matchId ?? null),
    ink: "#888888",
    hoverInk: "#525252",
  };
}

/** The "View stats" / "View match" shape — a blue link into the match page. */
function viewMatchAction(label: string, matchId: string): AnalysisAction {
  return {
    label,
    href: `/dashboard/matches/${matchId}`,
    ink: "#3B82F6",
    hoverInk: "#2563EB",
  };
}

/**
 * Row action, styled as a text link rather than a button.
 *
 * Null when there is genuinely nothing to offer. `processed` is the case: the
 * vendor has finished, so "Cancel" would be offering to stop work that is over,
 * and "View stats" would lead to the empty page this state exists to prevent.
 *
 * A failed row's action follows its `recovery` class (`classifyFailure()`)
 * rather than a blanket "Start over": that copy sends every failure through
 * the upload wizard as if no video had ever landed, which is only true for
 * `upload_again`. A row with a video that simply needs retrying or rebuilding
 * should not re-spend a video upload.
 *
 *   upload_again / fix_recording → Add video, opening the wizard on this
 *                                   match (`addVideoHref`), not a new match —
 *                                   the file itself needs resending
 *   retry / rederive             → View match (nothing to resend; the retry
 *                                   control and any stored note live there)
 *   stats_unavailable            → View stats (the match renders; a chart may not)
 *   wait_or_ask                  → View match — there is no action to offer
 *                                   (an allowance or ceiling clears on its
 *                                   own), so this points at the page that
 *                                   explains why rather than a dead button
 *
 * `recovery` absent on a failed row means the loader could not classify it
 * (see its own doc comment) — falls back to today's "Start over" rather than
 * guessing.
 */
export function analysisAction(
  analysis: MatchAnalysis,
  matchId: string,
): AnalysisAction | null {
  if (analysis.status === "processed") return null;

  if (isAnalysisReady(analysis.status)) {
    return viewMatchAction("View stats", matchId);
  }
  if (isAnalysisFailed(analysis.status)) {
    switch (analysis.recovery) {
      case "upload_again":
      case "fix_recording":
        return addVideoAction(matchId);
      case "retry":
      case "rederive":
      case "wait_or_ask":
        return viewMatchAction("View match", matchId);
      case "stats_unavailable":
        return viewMatchAction("View stats", matchId);
      default:
        return {
          label: "Start over",
          href: "/dashboard/matches/new",
          ink: "#E51837",
          hoverInk: "#C41530",
        };
    }
  }
  if (analysis.status === "manual") {
    return addVideoAction();
  }
  // The video is still stored; "Send for analysis again" lives on the match
  // page. Without this a cancelled row fell through to "Cancel" below.
  if (analysis.status === "cancelled") {
    return viewMatchAction("View match", matchId);
  }
  return { label: "Cancel", ink: "#888888", hoverInk: "#525252" };
}

/**
 * A match that arrived complete from a file import and never had a job.
 *
 * No `window` or `jobReference`: the mock invented both ("1:31:47",
 * "sv_import") and they read as real facts about the match. An import has no
 * billed window and no vendor job to reference — showing nothing is honest,
 * showing a fixture is not.
 */
export function importedAnalysis(
  sourceProvider: string,
  verified: boolean,
): MatchAnalysis {
  return {
    status: "imported",
    providerId: (sourceProvider as ProviderId) ?? null,
    verified,
  };
}

/** Scored by hand. No video was ever submitted. */
export function manualAnalysis(): MatchAnalysis {
  return { status: "manual", providerId: null };
}
