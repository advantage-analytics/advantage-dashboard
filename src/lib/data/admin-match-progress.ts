/**
 * Admin › Matches — the progress steps a match row's side panel draws
 * (README "Matches" row, docs/superpowers/specs/2026-11-12-admin-strip):
 * Uploaded, Sent for analysis, Results landed, Being labelled, Published,
 * Checked. Pure, no I/O, safe in the client graph: the loader
 * (`admin-matches-server.ts`) reads every fact these steps need in its batched
 * reads and puts them on the row.
 *
 * "Published" and "Checked" are piece 3 vocabulary with one fact behind them
 * today: an admin's Mark complete both publishes and checks, setting
 * `matches.verified`. Until piece 3 splits them, both turn done together on a
 * verified match.
 */

import type { AnalysisStatus } from "@/lib/data/match-analysis";

/** `label_sessions.status` of the match's own session (never a practice copy). */
export type AdminLabelState = "labelling" | "submitted" | "complete";

export const MATCH_PROGRESS_STEP_NAMES = [
  "Uploaded",
  "Sent for analysis",
  "Results landed",
  "Being labelled",
  "Published",
  "Checked",
] as const;

export type MatchProgressStepName = (typeof MATCH_PROGRESS_STEP_NAMES)[number];

/**
 * - `done` — happened (`at` says when, if anything recorded it)
 * - `current` — the step the match is in or waiting on now
 * - `failed` — the step the analysis failed at
 * - `todo` — not reached
 */
export type MatchProgressStepState = "done" | "current" | "failed" | "todo";

export interface MatchProgressStep {
  name: MatchProgressStepName;
  state: MatchProgressStepState;
  /** ISO moment the step happened, or null when unknown or not yet. */
  at: string | null;
}

/** The row facts the steps read — a subset of `AdminMatchRow`. */
export interface MatchProgressFacts {
  analysis: { status: AnalysisStatus; jobId?: string };
  uploadedAt: string | null;
  /** The analysis job's `processing_jobs.submitted_at`. */
  sentForAnalysisAt: string | null;
  /** The analysis job's `processing_jobs.completed_at`. */
  resultsLandedAt: string | null;
  labelState: AdminLabelState | null;
  /** `matches.verified_at` while `matches.verified` is set, else null. */
  verifiedAt: string | null;
}

const NOT_SENT = new Set<AnalysisStatus>(["uploading", "uploaded"]);
const AWAITING_RESULTS = new Set<AnalysisStatus>([
  "queued",
  "processing",
  "deriving",
]);
const RESULTS_IN = new Set<AnalysisStatus>([
  "processed",
  "completed",
  "timeline",
]);

/**
 * The steps in their fixed order, each with a state. A match with no
 * processing job (an import, or one scored by hand) went through none of
 * the analysis, so it yields Uploaded alone.
 */
export function matchProgressSteps(
  row: MatchProgressFacts,
): MatchProgressStep[] {
  const { status } = row.analysis;
  const uploaded: MatchProgressStep = {
    name: "Uploaded",
    state: status === "uploading" ? "current" : "done",
    at: row.uploadedAt,
  };
  if (!row.analysis.jobId) return [{ ...uploaded, state: "done" }];

  const verified = row.verifiedAt !== null;

  let sent: MatchProgressStepState;
  let results: MatchProgressStepState;
  if (verified || RESULTS_IN.has(status)) {
    sent = "done";
    results = "done";
  } else if (status === "uploading") {
    sent = "todo";
    results = "todo";
  } else if (NOT_SENT.has(status)) {
    sent = "current";
    results = "todo";
  } else if (AWAITING_RESULTS.has(status)) {
    sent = "done";
    results = "current";
  } else if (status === "failed" || status === "derivation_failed") {
    // Failed before the vendor took it: the send is what failed.
    const reachedVendor =
      status === "derivation_failed" || row.sentForAnalysisAt !== null;
    sent = reachedVendor ? "done" : "failed";
    results = reachedVendor ? "failed" : "todo";
  } else {
    // `cancelled` — stopped before the vendor began it.
    sent = row.sentForAnalysisAt ? "done" : "todo";
    results = "todo";
  }

  let labelling: MatchProgressStepState = "todo";
  if (verified) labelling = "done";
  else if (results === "done") {
    if (row.labelState === "labelling") labelling = "current";
    else if (row.labelState) labelling = "done";
  }

  const published: MatchProgressStepState = verified ? "done" : "todo";

  return [
    uploaded,
    {
      name: "Sent for analysis",
      state: sent,
      at: sent === "done" ? row.sentForAnalysisAt : null,
    },
    {
      name: "Results landed",
      state: results,
      at: results === "done" ? row.resultsLandedAt : null,
    },
    { name: "Being labelled", state: labelling, at: null },
    { name: "Published", state: published, at: row.verifiedAt },
    { name: "Checked", state: published, at: row.verifiedAt },
  ];
}
