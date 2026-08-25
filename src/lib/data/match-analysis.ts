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
  /** When the row last moved, ISO. The staleness input for `isSubmitStalled`. */
  updatedAt?: string;
  jobReference?: string;
  /** What the engine is doing right now. Never a frame count we don't receive. */
  stageNote?: string;
  failNote?: string;
  verified?: boolean;
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
  derivationVersion: string | null | undefined
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
  statsPublished: boolean
): AnalysisStatus {
  return status === "completed" && !statsPublished ? "timeline" : status;
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
export const PIPELINE_STAGES: { label: string; start: number; end: number }[] = [
  { label: "Uploaded", start: 0, end: 26 },
  { label: "Queued", start: 26, end: 40 },
  { label: "Analyzing", start: 40, end: 100 },
  { label: "Ready", start: 100, end: 100 },
];

/** How full segment `index` should be, given overall progress. */
export function stageFillPercent(index: number, overallPercent: number): number {
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
  uploadPercent?: number
): number | undefined {
  const [uploaded] = PIPELINE_STAGES;

  // The only measured case: scale real bytes into the first segment.
  if (status === "uploading") {
    return uploadPercent === undefined
      ? undefined
      : (uploadPercent / 100) * uploaded.end;
  }

  // A failure carries no percentage — the component fills the stage it died in
  // from `failedHere` — and a hand-scored match never had a pipeline.
  if (isAnalysisFailed(status) || status === "manual") return undefined;

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
  analysis: Pick<MatchAnalysis, 'status' | 'uploadPercent' | 'startedAt'>,
  nowMs: number
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

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `about ${minutes} min left`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `about ${hours}h left` : `about ${hours}h ${rest}m left`;
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

export function isAnalysisFailed(status: AnalysisStatus): boolean {
  return FAILED.has(status);
}

export function isAnalysisReady(status: AnalysisStatus): boolean {
  return READY.has(status);
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
  analysis: Pick<MatchAnalysis, 'status' | 'updatedAt' | 'jobReference'>,
  nowMs: number = Date.now()
): boolean {
  if (analysis.status !== 'uploaded') return false;
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
  /** Absent for Cancel — there is no cancel endpoint yet, so it does not navigate. */
  href?: string;
  ink: string;
  hoverInk: string;
}

/**
 * Row action, styled as a text link rather than a button.
 *
 * Null when there is genuinely nothing to offer. `processed` is the case: the
 * vendor has finished, so "Cancel" would be offering to stop work that is over,
 * and "View stats" would lead to the empty page this state exists to prevent.
 */
export function analysisAction(
  analysis: MatchAnalysis,
  matchId: string
): AnalysisAction | null {
  if (analysis.status === "processed") return null;

  if (isAnalysisReady(analysis.status)) {
    return {
      label: "View stats",
      href: `/dashboard/matches/${matchId}`,
      ink: "#3B82F6",
      hoverInk: "#2563EB",
    };
  }
  if (isAnalysisFailed(analysis.status)) {
    return {
      label: "Start over",
      href: "/dashboard/matches/new",
      ink: "#E51837",
      hoverInk: "#B91230",
    };
  }
  if (analysis.status === "manual") {
    return {
      label: "Add video",
      href: "/dashboard/matches/new",
      ink: "#888888",
      hoverInk: "#525252",
    };
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
  verified: boolean
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
