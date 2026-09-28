/**
 * The match page's analysis card as a vertical stepper — the view model.
 *
 * Every state the card can be in, mapped from one `MatchAnalysis` to a list of
 * steps in the upload wizard's own vocabulary (`UploadMatchSuccess.tsx`'s
 * `successView()`): saved, the video, the analysis — plus a fourth, the stats,
 * because on this page the work continues past where the wizard stops. The
 * list is the same four steps in every state, so the card never changes length
 * as a job moves; only the marks and the one body move down it.
 *
 * A failure is the step that stopped, in `fail` state, carrying its class's
 * headline (`note ?? title` — never the raw `failNote`), its body and its
 * action, exactly as the wizard shows a failed transfer or hand-off.
 *
 * Pure — no React — so the mapping reads as a table and a spec can pin it.
 */

import {
  ANALYSIS_LABEL,
  formatEta,
  isSubmitStalled,
  uploadEtaSeconds,
  type MatchAnalysis,
  type RecoveryClass,
} from "@/lib/data/match-analysis";
import { UPLOADING_COPY } from "../upload-progress-copy";
import {
  WAIT_OR_ASK_VARIANTS,
  byClass,
  waitOrAskVariant,
} from "../analysis-failure-copy";
import type { StepState } from "@/components/dashboard/shared/vertical-steps";

// ── Stage copy ──────────────────────────────────────────────────────────────
// The one declaration, so no second surface keeps its own copy of these
// lines and drifts from this stepper.

const STORED_NOTE = "Your video is stored. Nothing else is needed from you.";

/** Reassurance per stage. Every line has to be true of the pipeline as built. */
export const STAGE_NOTE = {
  // No `uploading` line: that state renders the wizard's stepper and notes.
  // Same line for both: from the player's side there is no difference between
  // "stored, not yet submitted" and "submitted, waiting" — neither needs them.
  uploaded: STORED_NOTE,
  queued: STORED_NOTE,
  processing:
    "Nothing needs to stay open — this page fills in as soon as the analysis lands.",
  deriving: "Turning detected strokes into points and shots. Almost there.",
  // Deliberately not "almost there". This state waits on work that is gated, so
  // the honest version says what is done and does not promise when the rest is.
  processed:
    "Your video came back analyzed and is saved. Turning it into your match stats is still in progress.",
} as const;

/**
 * A stalled submit that is simply retryable. Kept apart from `byClass.retry`,
 * whose copy is about a vendor job that failed ("if it keeps failing, trim…"):
 * here the hand-off never
 * happened, so nothing has failed yet.
 */
export const STALLED_RETRY_COPY = {
  title: "This hasn't been sent for analysis yet",
  cardBody:
    "Your video is stored safely — the hand-off didn't go through. Trying again costs nothing but the wait; nothing needs uploading a second time.",
};

// ── New wording, only where neither the wizard nor the card had any ─────────

export const STEPPER_COPY = {
  titles: {
    // The wizard's own titles for the states it shares with this card.
    uploaded: "Sending for analysis",
    stalled: "Couldn't send for analysis",
    queued: "Sent for analysis",
    processing: "Analyzing your video",
    deriving: "Adding your stats",
    failed: "Analysis didn't finish",
    statsFailed: "Stats couldn't be added",
  },
  steps: {
    videoDone: "Video uploaded",
    videoFailed: "Upload stopped",
    handOff: "Handing off to Advantage Intelligence",
    inLine: "Analysis in line",
    analyzing: "Analyzing video",
    analysisDone: "Video analyzed",
    stats: "Stats",
    statsNow: "Adding your stats",
  },
} as const;

// ── Shape ───────────────────────────────────────────────────────────────────

export type AnalysisStepKey = "saved" | "video" | "analysis" | "stats";

/** What sits under a step's label. At most one step in a view has a body. */
export type AnalysisStepBody =
  /** The transfer: a measured bar, an estimate once one exists, the notes. */
  | { kind: "upload"; percent: number; eta?: string }
  /** One quiet line of reassurance. */
  | { kind: "note"; text: string }
  /** The step that stopped: why, what it means, and the one fix. */
  | {
      kind: "failure";
      headline: string;
      body: string;
      recovery: RecoveryClass;
      /** A hand-off that never happened, rather than a job that failed. */
      stalled: boolean;
    };

export interface AnalysisStepView {
  key: AnalysisStepKey;
  label: string;
  state: StepState;
  /** Right-aligned reading on the label row — only a measured percentage. */
  value?: string;
  body?: AnalysisStepBody;
}

export interface AnalysisStepsView {
  title: string;
  steps: AnalysisStepView[];
  /** The recovery class the failing step carries, if any step failed. */
  failure?: { step: AnalysisStepKey; recovery: RecoveryClass };
}

// ── Mapping ─────────────────────────────────────────────────────────────────

/** The card's headline + body for a recovery class. */
function recoveryCopy(
  recovery: RecoveryClass,
  analysis: MatchAnalysis,
): { title: string; cardBody: string } {
  // byClass.wait_or_ask is only the allowance default; the row's error code
  // picks the variant that actually applies.
  if (recovery === "wait_or_ask") {
    return WAIT_OR_ASK_VARIANTS[
      waitOrAskVariant(analysis.errorCode, analysis.attemptsUsed ?? 1)
    ];
  }
  return byClass[recovery];
}

function failureBody(
  recovery: RecoveryClass,
  analysis: MatchAnalysis,
  stalled: boolean,
): AnalysisStepBody {
  const copy =
    stalled && recovery === "retry"
      ? STALLED_RETRY_COPY
      : recoveryCopy(recovery, analysis);
  return {
    kind: "failure",
    // The stored note only ever arrives filtered through showsStoredNote();
    // `failNote` is the unfiltered error_message and is never read here.
    headline: analysis.note ?? copy.title,
    body: copy.cardBody,
    recovery,
    stalled,
  };
}

const SAVED: AnalysisStepView = {
  key: "saved",
  label: UPLOADING_COPY.steps.saved,
  state: "done",
};
const VIDEO_DONE: AnalysisStepView = {
  key: "video",
  label: STEPPER_COPY.steps.videoDone,
  state: "done",
};
const ANALYSIS_LATER: AnalysisStepView = {
  key: "analysis",
  label: UPLOADING_COPY.steps.analysis,
  state: "later",
};
const ANALYSIS_DONE: AnalysisStepView = {
  key: "analysis",
  label: STEPPER_COPY.steps.analysisDone,
  state: "done",
};
const STATS_LATER: AnalysisStepView = {
  key: "stats",
  label: STEPPER_COPY.steps.stats,
  state: "later",
};

/**
 * Every card state, decided in one place from the analysis row.
 *
 * `now` is the clock `isSubmitStalled()` and the upload estimate read; pass the
 * same value the caller renders with so the two cannot disagree. `null` is a
 * clock not yet started — the component's first render, before its interval
 * has ticked (the server has no "now" the client would agree with) — and reads
 * as "not stalled yet, no estimate yet": both are claims only a clock can make.
 */
export function analysisStepsView(
  analysis: MatchAnalysis,
  now: number | null,
): AnalysisStepsView {
  switch (analysis.status) {
    case "uploading": {
      // Floored, like the wizard: a rounded 99.6 would read "100%" on a
      // transfer that has not finished.
      const measured = analysis.uploadPercent;
      const pct = measured === undefined ? undefined : Math.floor(measured);
      const etaSeconds =
        now === null ? undefined : uploadEtaSeconds(analysis, now);
      return {
        title: UPLOADING_COPY.title,
        steps: [
          SAVED,
          {
            key: "video",
            label: UPLOADING_COPY.steps.video,
            state: "now",
            value: pct === undefined ? undefined : `${pct}%`,
            body: {
              kind: "upload",
              percent: measured ?? 0,
              eta: etaSeconds === undefined ? undefined : formatEta(etaSeconds),
            },
          },
          ANALYSIS_LATER,
          STATS_LATER,
        ],
      };
    }

    case "uploaded": {
      if (now !== null && isSubmitStalled(analysis, now)) {
        const recovery: RecoveryClass = analysis.recovery ?? "retry";
        return {
          title: STEPPER_COPY.titles.stalled,
          steps: [
            SAVED,
            VIDEO_DONE,
            {
              key: "analysis",
              label: UPLOADING_COPY.steps.analysis,
              state: "fail",
              body: failureBody(recovery, analysis, true),
            },
            STATS_LATER,
          ],
          failure: { step: "analysis", recovery },
        };
      }
      return {
        title: STEPPER_COPY.titles.uploaded,
        steps: [
          SAVED,
          VIDEO_DONE,
          {
            key: "analysis",
            label: STEPPER_COPY.steps.handOff,
            state: "now",
            body: { kind: "note", text: STAGE_NOTE.uploaded },
          },
          STATS_LATER,
        ],
      };
    }

    case "queued":
      return {
        title: STEPPER_COPY.titles.queued,
        steps: [
          SAVED,
          VIDEO_DONE,
          {
            key: "analysis",
            label: STEPPER_COPY.steps.inLine,
            state: "now",
            body: { kind: "note", text: STAGE_NOTE.queued },
          },
          STATS_LATER,
        ],
      };

    case "processing":
      return {
        title: STEPPER_COPY.titles.processing,
        steps: [
          SAVED,
          VIDEO_DONE,
          {
            key: "analysis",
            label: STEPPER_COPY.steps.analyzing,
            state: "now",
            body: { kind: "note", text: STAGE_NOTE.processing },
          },
          STATS_LATER,
        ],
      };

    case "deriving":
      return {
        title: STEPPER_COPY.titles.deriving,
        steps: [
          SAVED,
          VIDEO_DONE,
          ANALYSIS_DONE,
          {
            key: "stats",
            label: STEPPER_COPY.steps.statsNow,
            state: "now",
            body: { kind: "note", text: STAGE_NOTE.deriving },
          },
        ],
      };

    case "processed":
      // Not `now`: nothing is running (isWorking is false) — the rest waits on
      // gated work, which is what the dashed `later` mark means.
      return {
        title: ANALYSIS_LABEL.processed,
        steps: [
          SAVED,
          VIDEO_DONE,
          ANALYSIS_DONE,
          {
            key: "stats",
            label: ANALYSIS_LABEL.processed,
            state: "later",
            body: { kind: "note", text: STAGE_NOTE.processed },
          },
        ],
      };

    case "failed": {
      const recovery: RecoveryClass = analysis.recovery ?? "retry";
      // No video to resend: the transfer is the step that stopped.
      if (recovery === "upload_again") {
        return {
          title: STEPPER_COPY.titles.failed,
          steps: [
            SAVED,
            {
              key: "video",
              label: STEPPER_COPY.steps.videoFailed,
              state: "fail",
              body: failureBody(recovery, analysis, false),
            },
            ANALYSIS_LATER,
            STATS_LATER,
          ],
          failure: { step: "video", recovery },
        };
      }
      return {
        title: STEPPER_COPY.titles.failed,
        steps: [
          SAVED,
          VIDEO_DONE,
          {
            key: "analysis",
            label: UPLOADING_COPY.steps.analysis,
            state: "fail",
            body: failureBody(recovery, analysis, false),
          },
          STATS_LATER,
        ],
        failure: { step: "analysis", recovery },
      };
    }

    case "derivation_failed": {
      // `stats_unavailable` renders the page, not this card; handled anyway so
      // a row that reaches here still reads as the stats step failing.
      const recovery: RecoveryClass = analysis.recovery ?? "stats_unavailable";
      return {
        title: STEPPER_COPY.titles.statsFailed,
        steps: [
          SAVED,
          VIDEO_DONE,
          ANALYSIS_DONE,
          {
            key: "stats",
            label: STEPPER_COPY.steps.stats,
            state: "fail",
            body: failureBody(recovery, analysis, false),
          },
        ],
        failure: { step: "stats", recovery },
      };
    }

    // Terminal states never reach this card (the page renders instead); if
    // one does, every step is simply done.
    default:
      return {
        title: ANALYSIS_LABEL[analysis.status],
        steps: [
          SAVED,
          VIDEO_DONE,
          ANALYSIS_DONE,
          { key: "stats", label: STEPPER_COPY.steps.stats, state: "done" },
        ],
      };
  }
}
