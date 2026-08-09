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
  /* --- derived, not job statuses --- */
  /** Arrived complete from a file import. Never had a processing job. */
  | "imported"
  /** Scored by hand. No video was ever submitted. */
  | "manual";

export interface MatchAnalysis {
  status: AnalysisStatus;
  /**
   * Progress 0-100, shown beside the status word.
   *
   * Set ONLY while uploading, from real bytes the browser has moved. The vendor
   * sends queue/analysis transitions with no percentage attached, so a bar for
   * those stages would be invented — `loadMatchAnalysis` leaves this undefined
   * there, and a bare status word is the honest render. Giving them a number
   * needs either a progress field from the vendor or a stage-weighted estimate.
   */
  progressPercent?: number;
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

export const ANALYSIS_LABEL: Record<AnalysisStatus, string> = {
  uploading: "Uploading",
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
 * Which milestone a status currently sits in. Failures report the stage they
 * died in rather than collapsing to the start, so the pipeline shows how far
 * the job actually got.
 */
export function stageIndexFor(status: AnalysisStatus): number {
  switch (status) {
    case "uploading":
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

const IN_FLIGHT = new Set<AnalysisStatus>(["uploading", "queued", "processing", "deriving"]);
const FAILED = new Set<AnalysisStatus>(["failed", "derivation_failed"]);
const READY = new Set<AnalysisStatus>(["completed", "imported"]);

export function isInFlight(status: AnalysisStatus): boolean {
  return IN_FLIGHT.has(status);
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
