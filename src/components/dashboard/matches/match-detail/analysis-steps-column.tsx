"use client";

/**
 * The match page's analysis state, drawn as the upload wizard's final screen:
 * the same card-free column, `<h1>`, match line and vertical stepper
 * `UploadMatchSuccess` draws, so a player who taps "View match" mid-upload
 * lands on the screen they just left. `analysisStepsView()` decides the steps;
 * this draws them with the shared `VerticalStep` and hands every action to
 * `RecoveryAction`, so the retry-vs-link-vs-nothing decision stays in one place.
 *
 * Live like `MatchAnalysisProgress`: it follows the job row over Realtime and
 * keeps its own clock for the stalled-submit threshold and the upload estimate.
 *
 * Not yet mounted on the match page: previewed on `/design` first.
 */

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { isLiveUpdating, type MatchAnalysis } from "@/lib/data/match-analysis";
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
import { analysisStepsView, type AnalysisStepBody } from "./analysis-steps";

const NOTE = "text-[12px] leading-[1.55] text-[var(--ink-600)]";

/** The clock's period — the same 10 s `MatchAnalysisProgress` ticks at. */
const TICK_MS = 10_000;

export function AnalysisSteps({
  analysis: serverAnalysis,
  matchId,
  match,
  snapshotAt,
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
  // Only the two statuses the view reads the clock for. No reset on the way
  // out: the view ignores the clock for every other status.
  const readsClock =
    !snapshot &&
    (analysis.status === "uploading" || analysis.status === "uploaded");

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
}: {
  body: AnalysisStepBody;
  jobId: string | undefined;
  matchId: string;
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
      return <p className={NOTE}>{body.text}</p>;

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
