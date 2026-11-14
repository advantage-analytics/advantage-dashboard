/**
 * Admin › Matches — the progress steps a match row's side panel draws
 * (README "Matches" row, docs/superpowers/specs/2026-11-12-admin-strip):
 * Uploaded, Sent for analysis, Results landed, Being labelled, Published,
 * Checked. Pure, no I/O, safe in the client graph: the loader
 * (`admin-matches-server.ts`) reads every fact these steps need in its batched
 * reads and puts them on the row.
 *
 * "Published" and "Checked" are two moments on the match's own label session:
 * a labeller's submit publishes it, then an admin checks it or sends it back.
 * A sent-back session is being labelled again and stays published, unchecked.
 * A verified match with no label session (verified by hand, before labelling
 * existed) has only `matches.verified_at`, so it takes that moment for both.
 */

import type { AnalysisStatus } from "@/lib/data/match-analysis";
import { PROVIDER_ID } from "@/lib/services/splitstep/config";

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
  /** When that session was published (`AdminMatchRow.labelPublishedAt`). */
  labelPublishedAt: string | null;
  /** That session's `checked_at`. */
  labelCheckedAt: string | null;
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

  // A sent-back session is labelling again, verified or not.
  let labelling: MatchProgressStepState = "todo";
  if (results === "done") {
    if (row.labelState === "labelling") labelling = "current";
    else if (verified || row.labelState) labelling = "done";
  }

  // No label session: a verified match keeps `verified_at` for both steps.
  const noSession = row.labelState === null;
  const publishedAt = noSession ? row.verifiedAt : row.labelPublishedAt;
  const checkedAt = noSession ? row.verifiedAt : row.labelCheckedAt;

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
    {
      name: "Published",
      state: publishedAt ? "done" : "todo",
      at: publishedAt,
    },
    { name: "Checked", state: checkedAt ? "done" : "todo", at: checkedAt },
  ];
}

/** The `processing_jobs` columns `labelJobIdFor` reads. */
export interface LabelJobCandidate {
  id: string;
  provider: string | null;
  status: string | null;
  results_object_key: string | null;
  completed_at: string | null;
}

/**
 * The job "Label this match" seeds a session on: the match's newest
 * completed Advantage Intelligence job with a results file, else null. The
 * same three filters the Labels list and the queue read jobs by — but
 * deliberately not the queue's cut-off (`LABEL_QUEUE_FROM`): this is the way
 * into labelling for a match the queue leaves out, older ones included.
 * Newest by `completed_at` (a job without one ranks last), ties by id.
 */
export function labelJobIdFor(
  jobs: readonly LabelJobCandidate[],
): string | null {
  let best: LabelJobCandidate | null = null;
  let bestAt = -Infinity;
  for (const job of jobs) {
    if (
      job.provider !== PROVIDER_ID ||
      job.status !== "completed" ||
      !job.results_object_key
    ) {
      continue;
    }
    const parsed = job.completed_at ? Date.parse(job.completed_at) : NaN;
    const at = Number.isFinite(parsed) ? parsed : -Infinity;
    if (!best || at > bestAt || (at === bestAt && job.id > best.id)) {
      best = job;
      bestAt = at;
    }
  }
  return best?.id ?? null;
}
