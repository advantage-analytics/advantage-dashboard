"use client";

/**
 * The match page's analysis state, drawn as the upload wizard's final screen:
 * the same card-free column, `<h1>`, match line and vertical stepper
 * `UploadMatchSuccess` draws, so a player who taps "View match" mid-upload
 * lands on the screen they just left. `analysisStepsView()` decides the steps;
 * this draws them with the shared `VerticalStep` and hands every action to
 * `RecoveryAction`, so the retry-vs-link-vs-nothing decision stays in one place.
 *
 * Live: it follows the job row over Realtime and keeps its own clock for the
 * stalled-submit threshold, the upload estimate and the queued / processing /
 * cancelled timing lines.
 *
 * Cancel (queued) and resend (cancelled) are quiet text actions whose handlers
 * the caller supplies; the peek drawers never draw either.
 *
 * Mounted by the match page's awaiting-analysis short-circuit (guardrails
 * §3.3), and previewed on `/design`.
 */

import { useEffect, useId, useState } from "react";
import { cn } from "@/lib/utils";
import {
  formatDuration,
  isLiveUpdating,
  type MatchAnalysis,
} from "@/lib/data/match-analysis";
import {
  useLiveMatchAnalysis,
  withLiveAnalysis,
} from "@/hooks/use-live-match-analysis";
import { VerticalStep } from "@/components/dashboard/shared/vertical-steps";
import {
  MatchLine,
  PAGE_STEPPER_TITLE,
  type MatchLineProps,
} from "../match-line";
import { AnalysisProgressTrack } from "../analysis-progress-track";
import { UPLOADING_COPY } from "../upload-progress-copy";
import { RecoveryAction } from "./recovery-action";
import {
  STEPPER_COPY,
  analysisStepsView,
  type AnalysisStepBody,
  type StepAction,
} from "./analysis-steps";

const NOTE = "text-[12px] leading-[1.55] text-[var(--ink-600)]";

/** The clock's period: an estimate and a stall threshold, not a stopwatch. */
const TICK_MS = 10_000;

/** Every status whose view reads the clock. */
const CLOCKED = new Set<MatchAnalysis["status"]>([
  "uploading",
  "uploaded",
  "queued",
  "processing",
  "cancelled",
]);

export function AnalysisSteps({
  analysis: serverAnalysis,
  matchId,
  match,
  snapshotAt,
  onCancel,
  onResend,
}: {
  analysis: MatchAnalysis;
  /** Subscribed to so this page and the matches list cannot disagree. */
  matchId: string;
  /** Who played whom, and the score — the line under the title. */
  match: MatchLineProps;
  /**
   * Render one fixed instant instead of following the row: the clock reads
   * this value and no Realtime channel opens. For `/design` and specs, which
   * need a stalled submit and an upload estimate to render the same on every
   * load — a live clock starts null, so neither would appear at all.
   * Omit it everywhere real.
   */
  snapshotAt?: number;
  /** The queued step's "Cancel analysis". Wired by the caller (T7). */
  onCancel?: () => void;
  /** The cancelled step's "Send for analysis again" — fires with no confirm. */
  onResend?: () => void;
}): React.JSX.Element {
  const snapshot = snapshotAt !== undefined;

  // Gated on isLiveUpdating so a match parked at `processed` does not hold a
  // socket open for a row that cannot change until Phase 2 ships. Keyed off the
  // SERVER status deliberately: reading the merged one would make the hook's
  // input depend on its own output, and the socket closes on navigation anyway.
  const livePatches = useLiveMatchAnalysis({
    by: "match",
    matchId:
      !snapshot && isLiveUpdating(serverAnalysis.status) ? matchId : undefined,
  });
  const analysis = withLiveAnalysis(serverAnalysis, livePatches.get(matchId));

  // A clock, so the estimate keeps counting down between progress writes and a
  // hand-off that never happened turns into the stalled step without a reload.
  //
  // Starts null and is only ever set by the interval, never during render: the
  // server has no "now" the client would agree with, so reading one here is a
  // hydration mismatch. Until the first tick the view reads null as "not
  // stalled, no estimate" — an estimate from a transfer's first seconds is
  // noise anyway.
  const [clock, setClock] = useState<number | null>(null);
  // Only the statuses the view reads the clock for: the upload estimate and
  // stall threshold, and the queued / processing / cancelled timing lines. No
  // reset on the way out: the view ignores the clock for every other status.
  const readsClock = !snapshot && CLOCKED.has(analysis.status);

  useEffect(() => {
    if (!readsClock) return;
    const id = setInterval(() => setClock(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [readsClock]);

  const view = analysisStepsView(analysis, snapshotAt ?? clock);

  return (
    <section
      aria-label="Analysis progress"
      className="mx-auto w-full max-w-[488px] px-6 pt-[clamp(64px,18vh,176px)] pb-24"
    >
      <div className="animate-fadeIn flex flex-col">
        <div className="flex flex-col gap-2">
          <h1 className={PAGE_STEPPER_TITLE} style={{ textWrap: "balance" }}>
            {view.title}
          </h1>
          <MatchLine {...match} />
        </div>

        <ol className="mt-9 flex flex-col" aria-label="Progress">
          {view.steps.map((step, index) => (
            <VerticalStep
              key={step.key}
              label={step.label}
              state={step.state}
              value={step.value}
              last={index === view.steps.length - 1}
            >
              {step.body && (
                <StepBody
                  body={step.body}
                  jobId={analysis.jobId}
                  matchId={matchId}
                  onCancel={onCancel}
                  onResend={onResend}
                />
              )}
            </VerticalStep>
          ))}
        </ol>
      </div>
    </section>
  );
}

function StepBody({
  body,
  jobId,
  matchId,
  onCancel,
  onResend,
}: {
  body: AnalysisStepBody;
  jobId: string | undefined;
  matchId: string;
  onCancel?: () => void;
  onResend?: () => void;
}): React.JSX.Element {
  switch (body.kind) {
    case "upload":
      return (
        <>
          <AnalysisProgressTrack
            percent={body.percent}
            live
            label={UPLOADING_COPY.trackLabel}
          />
          {/* Derived from elapsed time against percent moved — absent until
              there is enough of the transfer to project from. */}
          {body.eta && (
            <p className="-mt-1 text-[11px] text-[var(--ink-400)] tabular-nums">
              {body.eta}
            </p>
          )}
          <div className="mt-1 flex flex-col gap-0.5">
            <p className={cn(NOTE, "text-[var(--ink-700)]")}>
              {UPLOADING_COPY.notes.keepTabOpen}
            </p>
            <p className={NOTE}>{UPLOADING_COPY.notes.keepUsing}</p>
          </div>
        </>
      );

    case "note":
      if (!body.meta && !body.cancel && !body.resend) {
        return <p className={NOTE}>{body.text}</p>;
      }
      return (
        <div className="flex flex-col">
          {/* The note and its timing, grouped tight. */}
          <div className="flex flex-col gap-2">
            <p className={NOTE}>{body.text}</p>
            {body.meta && (
              <p className="text-[11px] leading-4 text-[var(--ink-400)] tabular-nums">
                {body.meta}
              </p>
            )}
          </div>
          {body.cancel && (
            <QuietAction
              label={STEPPER_COPY.cancel.action}
              consequence={consequence(body.cancel, STEPPER_COPY.cancel)}
              tone="danger"
              onClick={onCancel}
            />
          )}
          {body.resend && (
            <QuietAction
              label={STEPPER_COPY.resend.action}
              consequence={consequence(body.resend, STEPPER_COPY.resend)}
              tone="blue"
              onClick={onResend}
            />
          )}
        </div>
      );

    case "failure":
      return (
        <div
          className="flex flex-col gap-1"
          role={body.stalled ? "status" : "alert"}
        >
          <p className="text-[13px] leading-5 font-medium text-[var(--ink-900)]">
            {body.headline}
          </p>
          <p className={NOTE}>{body.body}</p>
          {/* RecoveryAction owns retry-vs-link-vs-nothing. Its retry button
              brings its own top margin; the step body's rhythm replaces it. */}
          <div className="[&>a]:mt-2 [&>div]:mt-2">
            <RecoveryAction
              recovery={body.recovery}
              jobId={jobId}
              matchId={matchId}
              variant="card"
              stalled={body.stalled}
            />
          </div>
        </div>
      );
  }
}

function consequence(
  action: StepAction,
  copy: { consequence: (duration: string) => string },
): string | undefined {
  return action.reservedSeconds === undefined
    ? undefined
    : copy.consequence(formatDuration(action.reservedSeconds));
}

/**
 * A step's secondary action as quiet text, never a button's chrome or a tinted
 * box (memory: stepper quiet actions): 20px below the note group, the action
 * at 12/500 ink-700, and what it moves 8px under it, tied to it by
 * `aria-describedby`. Hover takes the action's tone — danger red for Cancel,
 * blue for resend. Focus is the global ring (`focus.css`), so none is written.
 */
function QuietAction({
  label,
  consequence,
  tone,
  onClick,
}: {
  label: string;
  consequence: string | undefined;
  tone: "danger" | "blue";
  onClick: (() => void) | undefined;
}): React.JSX.Element {
  const id = useId();
  return (
    <div className="mt-5 flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={onClick}
        aria-describedby={consequence ? id : undefined}
        className={cn(
          "cursor-pointer rounded-[4px] text-[12px] leading-4 font-medium text-[var(--ink-700)] transition-colors duration-150",
          tone === "danger"
            ? "hover:text-[var(--danger)]"
            : "hover:text-[var(--blue-hover)]",
        )}
      >
        {label}
      </button>
      {consequence && (
        <p
          id={id}
          className="text-[11px] leading-4 text-[var(--ink-400)] tabular-nums"
        >
          {consequence}
        </p>
      )}
    </div>
  );
}
