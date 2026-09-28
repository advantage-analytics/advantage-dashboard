import type { RecoveryClass } from "@/lib/data/match-analysis";

/** Shape every `byClass` entry (and each `WAIT_OR_ASK_VARIANTS` entry) follows. */
interface RecoveryCopy {
  title: string;
  cardBody: string;
  drawerBody: string;
  action: string | null;
}

/**
 * The three ways a `wait_or_ask` row can read, chosen by `waitOrAskVariant()`:
 *
 * - `allowance` — the monthly analysis budget ran out. `note` (from the
 *   job/workspace) already says what's left and when it resets, so callers
 *   show that stored note as the headline/body when one is present; this
 *   entry is the fallback copy.
 * - `permission` — the signed-in account can't submit for this workspace
 *   (role or billing setup). Directs the player to their team's owner.
 * - `ceiling` — the job has used every resubmission `resubmitJob()` allows
 *   (see `MAX_TOTAL_ATTEMPTS`). Nothing left to press; only a human can help.
 */
export const WAIT_OR_ASK_VARIANTS: Record<
  "allowance" | "permission" | "ceiling",
  RecoveryCopy
> = {
  allowance: {
    title: "Not enough analysis time left this month",
    cardBody: "Your stored note explains what's left and when it resets.",
    drawerBody: "Your stored note explains what's left and when it resets.",
    action: null,
  },
  permission: {
    title: "This match can't be sent for analysis yet",
    cardBody:
      "Your account can't send this match for analysis. Ask your team's owner to check your role.",
    drawerBody:
      "Your account can't send this match for analysis. Ask your team's owner to check your role.",
    action: null,
  },
  ceiling: {
    title: "This analysis has been tried three times",
    cardBody: "Contact us and we'll look at it.",
    drawerBody: "Contact us and we'll look at it.",
    action: null,
  },
};

/**
 * Which `WAIT_OR_ASK_VARIANTS` entry a `wait_or_ask` row should show.
 *
 * `attemptsUsed` is accepted for callers that want to double-check the
 * ceiling case themselves; the error code alone already disambiguates
 * allowance and permission refusals, and anything else — including a job
 * that simply ran out of resubmissions — falls to `ceiling`.
 */
export function waitOrAskVariant(
  errorCode: string | null | undefined,
  _attemptsUsed: number,
): "allowance" | "permission" | "ceiling" {
  if (errorCode === "QUOTA_EXCEEDED") return "allowance";
  if (errorCode === "NOT_ELIGIBLE" || errorCode === "NO_BILLING_WORKSPACE") {
    return "permission";
  }
  return "ceiling";
}

/**
 * The failed-row drawer's body when the viewer has no action to take
 * (`canAct` is false) — a fixed line pointing them at the match page rather
 * than repeating the class's own drawer copy. Named apart from `byClass` so
 * `drawer-sections.tsx` can reach it without depending on any one class.
 */
export const DRAWER_NO_ACTION_BODY = "The match page has the details.";

/**
 * Per-`RecoveryClass` copy for the retry/recovery surfaces (T4, design §2,
 * plan step 3).
 *
 * The two failed-job classes below are different failures and must not
 * share copy:
 *
 * - `retry` — the video provider could not analyze the video. A retry
 *   resubmits the same upload, and a new recording is a real way out.
 * - `stats_unavailable` — the video was analyzed fine, but the rallies it
 *   found could not be reconciled with the final score the player entered.
 *   Retrying the video or re-shooting it would not help, so this copy offers
 *   neither.
 *
 * Customer-facing strings only: never name the vendor here (guardrails §2).
 */
export const byClass: Record<RecoveryClass, RecoveryCopy> = {
  retry: {
    title: "Analysis stopped",
    cardBody:
      "Retrying uses the video you already uploaded — nothing needs uploading again. If it keeps failing, trim to a window where the camera stays fixed, or upload a new recording.",
    drawerBody:
      "Retrying uses the video you already uploaded. Nothing needs uploading again.",
    action: "Retry analysis",
  },
  // `failed` jobs where the video itself didn't meet a recording requirement
  // (bad fps, resolution, etc). Retrying would resubmit the same unusable
  // video and fail the same way, so this offers no retry — only a new
  // recording.
  fix_recording: {
    title: "Analysis stopped",
    cardBody:
      "This video didn't meet one of the recording requirements, so analyzing it again would stop the same way. Upload a new recording that meets them.",
    drawerBody:
      "This video didn't meet one of the recording requirements. Upload a new recording that meets them.",
    action: "Upload a new recording",
  },
  stats_unavailable: {
    title: "Analyzed, but the score couldn't be read cleanly",
    cardBody:
      "The rallies found in your video couldn't be matched point by point to the final score you entered, so no statistics were saved for this match.",
    drawerBody:
      "The rallies found in your video couldn't be matched point by point to the final score you entered, so no statistics were saved for this match.",
    action: null,
  },
  upload_again: {
    title: "The video didn't finish uploading",
    cardBody:
      "There's nothing to retry from. Upload the video again — your match details are kept.",
    drawerBody:
      "The video didn't finish uploading. Upload it again from the match page.",
    action: "Upload the video again",
  },
  rederive: {
    title: "Statistics didn't finish building",
    cardBody:
      "The video was analyzed. Rebuilding the statistics doesn't use any of your allowance.",
    drawerBody:
      "The video was analyzed. Rebuilding the statistics doesn't use any of your allowance.",
    action: "Rebuild statistics",
  },
  // Default variant; callers pick a different WAIT_OR_ASK_VARIANTS entry via
  // waitOrAskVariant() when the row's error code says allowance/permission
  // don't apply.
  wait_or_ask: WAIT_OR_ASK_VARIANTS.allowance,
} satisfies Record<RecoveryClass, RecoveryCopy>;
