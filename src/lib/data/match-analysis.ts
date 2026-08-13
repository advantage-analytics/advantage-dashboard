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

export const ANALYSIS_LABEL: Record<AnalysisStatus, string> = {
  uploading: "Uploading",
  uploaded: "Uploaded",
  queued: "Queued",
  processing: "Processing",
  deriving: "Analyzing",
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

/** Win/loss/unknown ink for the result marker under the score. */
export function resultInk(won: boolean | null): string {
  if (won === null) return "#D9D9D9";
  return won ? "#5DB955" : "#E51837";
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
  analysis: MatchAnalysis,
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
    case "failed":
      return 2;
    case "derivation_failed":
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
]);
const FAILED = new Set<AnalysisStatus>(["failed", "derivation_failed"]);
const READY = new Set<AnalysisStatus>(["completed", "imported"]);

/** Not terminal. Drives grouping and filtering — "is this still going to change?" */
export function isInFlight(status: AnalysisStatus): boolean {
  return IN_FLIGHT.has(status);
}

/**
 * Something is happening RIGHT NOW. Narrower than isInFlight.
 *
 * `uploaded` is the first status where the two diverge: the transfer is done and
 * nothing moves again until a human runs the submit script, possibly days later.
 * Conflating them made a finished upload animate forever on the match page while
 * the matches list, which special-cased it separately, did not — one state, two
 * answers, on the two screens the shared track was meant to reconcile.
 *
 * Drives the progress track's `live` flag. If it animates, bytes are moving.
 */
export function isWorking(status: AnalysisStatus): boolean {
  return IN_FLIGHT.has(status) && status !== "uploaded";
}

export function isAnalysisFailed(status: AnalysisStatus): boolean {
  return FAILED.has(status);
}

export function isAnalysisReady(status: AnalysisStatus): boolean {
  return READY.has(status);
}

export interface AnalysisAction {
  label: string;
  /** Absent for Cancel — there is no cancel endpoint yet, so it does not navigate. */
  href?: string;
  ink: string;
  hoverInk: string;
}

/** Row action. Every state carries one, styled as a text link rather than a button. */
export function analysisAction(
  analysis: MatchAnalysis,
  matchId: string
): AnalysisAction {
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
