"use client";

import Link from "next/link";

import { byClass } from "@/components/dashboard/matches/analysis-failure-copy";
import type { RecoveryClass } from "@/lib/data/match-analysis";
import { addVideoHref } from "@/lib/matches/add-video-href";
import { advButton } from "@/lib/ui/adv-button";
import { RetryActionButton } from "./retry-action-button";
import { RetryAnalysis } from "./retry-analysis";
import { RetrySubmission } from "./retry-submission";

/**
 * The one action a recovery row offers, chosen from `classifyFailure()`'s
 * `RecoveryClass` (T2) rather than a status string, so a caller never
 * re-derives the retry-vs-link-vs-nothing decision `analysis-failure-copy.ts`
 * already made for its labels (T4).
 *
 * `retry` covers two different requests depending on which row it is:
 * a `stalled` row's hand-off never happened, so it goes through
 * `RetrySubmission` (`POST /api/splitstep/jobs`, same job id, no re-upload);
 * a failed vendor job goes through `RetryAnalysis`
 * (`POST /api/splitstep/jobs/:id/resubmit`). `rederive` is a third request
 * (`POST /api/splitstep/jobs/:id/rederive`) with no dedicated wrapper yet, so
 * it drives `RetryActionButton` directly — same shared scaffold, same
 * verbatim-refusal behaviour.
 *
 * `upload_again` and `fix_recording` have nothing to retry: the copy in
 * `byClass` already says so, and this renders the wizard link the copy names,
 * styled with `advButton()` rather than the muted inline text link the match
 * page currently hand-rolls for the same destination.
 *
 * `wait_or_ask`, `stats_unavailable` and a null/undefined class render
 * nothing — there is no action to offer (see `byClass`'s `action: null`).
 */
export function RecoveryAction({
  recovery,
  jobId,
  matchId,
  variant,
  stalled,
}: {
  recovery: RecoveryClass | null | undefined;
  /** Null for a row that has no job to retry yet — `upload_again`'s case. */
  jobId: string | null | undefined;
  matchId: string;
  /** Card = the match page's progress panel; drawer = a peek drawer footer. */
  variant: "card" | "drawer";
  /** Only meaningful for `retry`: an `uploaded` row stuck past the submit
   * threshold takes the free resubmit; a `failed` vendor job takes the paid
   * one. */
  stalled: boolean;
}) {
  if (recovery === "retry") {
    if (!jobId) return null;
    return stalled ? (
      <RetrySubmission jobId={jobId} />
    ) : (
      <RetryAnalysis jobId={jobId} />
    );
  }

  if (recovery === "rederive") {
    if (!jobId) return null;
    return (
      <RetryActionButton
        label={byClass.rederive.action ?? "Rebuild statistics"}
        pendingLabel="Rebuilding…"
        request={() =>
          fetch(`/api/splitstep/jobs/${jobId}/rederive`, { method: "POST" })
        }
      />
    );
  }

  if (recovery === "upload_again" || recovery === "fix_recording") {
    const label = byClass[recovery].action ?? "Upload a new recording";
    return (
      <Link
        href={addVideoHref(matchId)}
        className={advButton(
          variant === "drawer" ? "outline" : "primary",
          variant === "drawer" ? "md" : "sm",
        )}
      >
        {label}
      </Link>
    );
  }

  // wait_or_ask, stats_unavailable, and no class at all: byClass's `action`
  // is null for both, and there is nothing to press.
  return null;
}
