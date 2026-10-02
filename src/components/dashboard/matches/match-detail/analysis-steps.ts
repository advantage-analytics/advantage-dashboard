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

import { formatDuration } from "@/lib/format/duration";
import {
  ANALYSIS_LABEL,
  formatEta,
  isAnalysisFailed,
  isInFlight,
  isSubmitStalled,
  uploadEtaSeconds,
  type MatchAnalysis,
  type RecoveryClass,
} from "@/lib/data/match-analysis";
import { UPLOADING_COPY } from "../upload-progress-copy";
import {
  DRAWER_NO_ACTION_BODY,
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
  // Cancel is only offered while the job waits in the vendor's queue, so no
  // vendor compute ran and the reserved time went back (T1's RPC).
  cancelled: "Your video is still stored. Nothing was charged.",
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
  /** The peek drawers' shorter line (`Drawer-StalledRetry`). */
  drawerBody: "Trying again costs nothing; nothing needs uploading again.",
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
    cancelled: "Analysis cancelled",
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
    cancelled: "Analysis cancelled",
  },
  /**
   * How long the vendor's analysis runs once it starts. Basis: the 6 completed
   * jobs to date took 45–80 min for 86–124 min of video. Phrased loosely on
   * purpose — a precise figure would be an invented ETA (banned); revisit if
   * the spread moves.
   */
  aboutAnHour: "about an hour",
  /** The queued step's quiet escape: the action, then what it gives back. */
  cancel: {
    action: "Cancel analysis",
    consequence: (duration: string) =>
      `${duration} goes back to this month's analysis time`,
  },
  /** The cancelled step's way back: the action, then what it costs. */
  resend: {
    action: "Send for analysis again",
    consequence: (duration: string) =>
      `Uses about ${duration} of this month's analysis time`,
  },
} as const;

// ── Shape ───────────────────────────────────────────────────────────────────

export type AnalysisStepKey = "saved" | "video" | "analysis" | "stats";

/**
 * A quiet text action under a step's note, and the time it moves. The seconds
 * are `reservedSeconds`; absent, the action still draws without its
 * consequence line — a guessed duration would be an invented figure.
 */
export interface StepAction {
  reservedSeconds?: number;
}

/** What sits under a step's label. At most one step in a view has a body. */
export type AnalysisStepBody =
  /** The transfer: a measured bar, an estimate once one exists, the notes. */
  | { kind: "upload"; percent: number; eta?: string }
  /**
   * One quiet line of reassurance; then, on the match page only, the timing
   * line (`meta`) and at most one action — Cancel while queued, resend once
   * cancelled. `drawerAnalysisStepsView` drops all three.
   */
  | {
      kind: "note";
      text: string;
      meta?: string;
      cancel?: StepAction;
      resend?: StepAction;
    }
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

// ── Timing line ─────────────────────────────────────────────────────────────

/** Seconds since `iso` on the view's clock; undefined before it ticks. */
function secondsSince(
  iso: string | undefined,
  now: number | null,
): number | undefined {
  if (!iso || now === null) return undefined;
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return undefined;
  return Math.max(0, (now - at) / 1000);
}

/** "12 min ago", or "just now" inside the first minute. */
function ago(seconds: number): string {
  return seconds < 60 ? "just now" : `${formatDuration(seconds)} ago`;
}

/**
 * Segments joined with " · ", each already sentence case (a capital after
 * every dot). A segment that needs the clock is simply absent until it ticks.
 */
function metaLine(...segments: (string | undefined)[]): string | undefined {
  const kept = segments.filter((s): s is string => Boolean(s));
  return kept.length > 0 ? kept.join(" · ") : undefined;
}

function queuedMeta(analysis: MatchAnalysis, now: number | null) {
  const waited = secondsSince(analysis.queuedAt, now);
  return metaLine(
    waited === undefined
      ? undefined
      : waited < 60
        ? "Waiting under a minute"
        : `Waiting ${formatDuration(waited)}`,
    `Takes ${STEPPER_COPY.aboutAnHour} once it starts`,
  );
}

function processingMeta(analysis: MatchAnalysis, now: number | null) {
  const ran = secondsSince(analysis.vendorStartedAt, now);
  return metaLine(
    ran === undefined ? undefined : `Started ${ago(ran)}`,
    `Usually done in ${STEPPER_COPY.aboutAnHour}`,
  );
}

function cancelledMeta(analysis: MatchAnalysis, now: number | null) {
  // The cancel is the row's last write, so `updated_at` is when it happened.
  const since = secondsSince(analysis.updatedAt, now);
  return metaLine(
    since === undefined ? undefined : `Cancelled ${ago(since)}`,
    analysis.reservedSeconds === undefined
      ? undefined
      : `${formatDuration(analysis.reservedSeconds)} returned`,
  );
}

// ── Mapping ─────────────────────────────────────────────────────────────────

/** The card's headline + body for a recovery class. */
function recoveryCopy(
  recovery: RecoveryClass,
  analysis: MatchAnalysis,
): { title: string; cardBody: string; drawerBody: string } {
  // byClass.wait_or_ask is only the allowance default; the row's error code
  // picks the variant that actually applies.
  if (recovery === "wait_or_ask") {
    return WAIT_OR_ASK_VARIANTS[waitOrAskVariant(analysis.errorCode)];
  }
  return byClass[recovery];
}

/**
 * The card/drawer copy for a stopped step: the stalled-retry copy when the
 * hand-off itself never happened, otherwise the recovery class's own copy.
 * Shared by `failureBody` (card) and `drawerStoppedCopy` (drawer) so the two
 * surfaces cannot pick different copy for the same stopped step.
 */
function stoppedCopy(
  recovery: RecoveryClass,
  stalled: boolean,
  analysis: MatchAnalysis,
): { title: string; cardBody: string; drawerBody: string } {
  return stalled && recovery === "retry"
    ? STALLED_RETRY_COPY
    : recoveryCopy(recovery, analysis);
}

function failureBody(
  recovery: RecoveryClass,
  analysis: MatchAnalysis,
  stalled: boolean,
): AnalysisStepBody {
  const copy = stoppedCopy(recovery, stalled, analysis);
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
      // An `uploaded` row only carries a `recovery` when the server (or a live
      // patch) already classified it as a stalled hand-off, with its own clock.
      // Trust that before the client clock's first tick, so a page opened on a
      // stalled job never opens on "Sending" and flips ten seconds later.
      if (
        analysis.recovery != null ||
        (now !== null && isSubmitStalled(analysis, now))
      ) {
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
            // Current, but nothing is running until the vendor picks it up —
            // `processing` below is where the spinner starts.
            state: "wait",
            body: {
              kind: "note",
              text: STAGE_NOTE.queued,
              meta: queuedMeta(analysis, now),
              cancel: { reservedSeconds: analysis.reservedSeconds },
            },
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
            // No Cancel: the vendor has started, and its DELETE refuses a
            // running job (T2's `already_started`).
            body: {
              kind: "note",
              text: STAGE_NOTE.processing,
              meta: processingMeta(analysis, now),
            },
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

    case "cancelled":
      // Stopped by the player while it waited in line: grey, not failed —
      // nothing went wrong — and the way back is one quiet action.
      return {
        title: STEPPER_COPY.titles.cancelled,
        steps: [
          SAVED,
          VIDEO_DONE,
          {
            key: "analysis",
            label: STEPPER_COPY.steps.cancelled,
            state: "stopped",
            body: {
              kind: "note",
              text: STAGE_NOTE.cancelled,
              meta: cancelledMeta(analysis, now),
              resend: { reservedSeconds: analysis.reservedSeconds },
            },
          },
          STATS_LATER,
        ],
      };

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

// ── The peek drawers' compact projection ────────────────────────────────────

/**
 * The drawers' processing line (`Drawer-Processing`). The page's own line says
 * "this page fills in", which is not true of a drawer.
 */
export const DRAWER_PROCESSING_NOTE =
  "This fills in as soon as the analysis lands.";

/**
 * What a viewer who cannot act on the row reads at the stopped step — with
 * `DRAWER_NO_ACTION_BODY` under it. One headline for every class: no stored
 * note, and no class title that promises a retry the footer does not offer.
 */
export const DRAWER_NO_ACTION_TITLE = "Analysis stopped";

/** A drawer step's text: one quiet line, or the step that stopped. */
export type DrawerAnalysisStepBody = Exclude<
  AnalysisStepBody,
  { kind: "upload" }
>;

export interface DrawerAnalysisStepView {
  key: AnalysisStepKey;
  label: string;
  state: StepState;
  /** The floored transfer percent — the uploading step's only reading. */
  value?: string;
  body?: DrawerAnalysisStepBody;
}

export interface DrawerAnalysisStepsView {
  steps: DrawerAnalysisStepView[];
  /** The stopped step's class — the footer's `DrawerRecoveryAction` input. */
  failure?: {
    step: AnalysisStepKey;
    recovery: RecoveryClass;
    stalled: boolean;
  };
}

/**
 * The match page's steps, cut down for a 340px peek drawer.
 *
 * The same four keys, labels and states as `analysisStepsView()` — it is read
 * from it, so the two cannot disagree — with less said at each step:
 *
 * - uploading: the floored percent as the step's value, and no body (no bar,
 *   no estimate, no notes — the match page has those);
 * - a running step: `STAGE_NOTE`'s line, except processing, which reads
 *   `DRAWER_PROCESSING_NOTE` — and never the page's timing line or its
 *   Cancel/resend action: those are the match page's alone;
 * - the stopped step, a stalled hand-off included: with `canAct`, headline
 *   `note ?? title` and the class's drawer body (a stalled retry reads
 *   `STALLED_RETRY_COPY`); without it, `DRAWER_NO_ACTION_TITLE` and
 *   `DRAWER_NO_ACTION_BODY`, never the note.
 *
 * `now` is `analysisStepsView()`'s clock: `null` reads as not stalled yet.
 * Null for a status that is neither in flight nor failed — a settled match has
 * no analysis section in a drawer.
 */
export function drawerAnalysisStepsView(
  analysis: MatchAnalysis,
  now: number | null,
  canAct: boolean,
): DrawerAnalysisStepsView | null {
  if (!isInFlight(analysis.status) && !isAnalysisFailed(analysis.status)) {
    return null;
  }
  const page = analysisStepsView(analysis, now);

  const steps = page.steps.map((step): DrawerAnalysisStepView => {
    const { key, label, state, value } = step;
    const body = step.body;
    if (!body || body.kind === "upload") {
      return value === undefined
        ? { key, label, state }
        : { key, label, state, value };
    }
    if (body.kind === "note") {
      const text =
        analysis.status === "processing" ? DRAWER_PROCESSING_NOTE : body.text;
      return { key, label, state, body: { kind: "note", text } };
    }
    return {
      key,
      label,
      state,
      body: {
        kind: "failure",
        ...drawerStoppedCopy(body.recovery, body.stalled, analysis, canAct),
        recovery: body.recovery,
        stalled: body.stalled,
      },
    };
  });

  const stopped = steps.find((s) => s.body?.kind === "failure");
  return {
    steps,
    ...(stopped?.body?.kind === "failure" && {
      failure: {
        step: stopped.key,
        recovery: stopped.body.recovery,
        stalled: stopped.body.stalled,
      },
    }),
  };
}

function drawerStoppedCopy(
  recovery: RecoveryClass,
  stalled: boolean,
  analysis: MatchAnalysis,
  canAct: boolean,
): { headline: string; body: string } {
  if (!canAct) {
    return { headline: DRAWER_NO_ACTION_TITLE, body: DRAWER_NO_ACTION_BODY };
  }
  const copy = stoppedCopy(recovery, stalled, analysis);
  // `note` only ever arrives filtered through showsStoredNote(); the raw
  // `failNote` is never read here.
  return { headline: analysis.note ?? copy.title, body: copy.drawerBody };
}
