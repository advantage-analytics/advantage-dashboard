"use client";

/**
 * The match page's analysis card, drawn as the upload wizard's stepper in
 * every state — presentational only. `analysisStepsView()` decides the steps;
 * this draws them with the shared `VerticalStep`, the way
 * `UploadMatchSuccess` draws its final screen, and hands every action to
 * `RecoveryAction` so the retry-vs-link-vs-nothing decision stays in one place.
 *
 * Not yet mounted on the match page: previewed on `/design` first.
 */

import { cn } from "@/lib/utils";
import type { MatchAnalysis } from "@/lib/data/match-analysis";
import { VerticalStep } from "@/components/dashboard/shared/vertical-steps";
import { AnalysisProgressTrack } from "../analysis-progress-track";
import { UPLOADING_COPY } from "../upload-progress-copy";
import { RecoveryAction } from "./recovery-action";
import { analysisStepsView, type AnalysisStepBody } from "./analysis-steps";

const CARD =
  "rounded-[var(--radius-card)] border border-[var(--border-card)] bg-[var(--surface-card)] shadow-[var(--shadow-card)]";

const NOTE = "text-[12px] leading-[1.55] text-[var(--ink-600)]";

export function AnalysisSteps({
  analysis,
  matchId,
  now,
}: {
  analysis: MatchAnalysis;
  matchId: string;
  /** The clock the view reads — stalled-submit threshold and upload estimate. */
  now: number;
}): React.JSX.Element {
  const view = analysisStepsView(analysis, now);

  const facts: { label: string; value: string }[] = [];
  if (analysis.fileName)
    facts.push({ label: "Video", value: analysis.fileName });
  if (analysis.window) facts.push({ label: "Window", value: analysis.window });
  if (analysis.jobReference)
    facts.push({ label: "Job", value: analysis.jobReference });
  if (analysis.stageNote)
    facts.push({ label: "Stage", value: analysis.stageNote });

  return (
    <section aria-label="Analysis progress">
      <h2 className="mb-4 text-[10px] font-medium tracking-[2.5px] text-[var(--ink-400)] uppercase">
        Analysis
      </h2>

      <div className={cn(CARD, "p-6")}>
        <p
          className="text-[16px] font-normal tracking-[-0.4px] text-[var(--ink-900)]"
          style={{ textWrap: "balance" }}
        >
          {view.title}
        </p>

        <ol className="mt-5 flex flex-col" aria-label="Progress">
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
                  analysis={analysis}
                  matchId={matchId}
                />
              )}
            </VerticalStep>
          ))}
        </ol>

        {/* Job record. Label over value rather than a justified pair: at this
            page's width a justified row leaves a canyon between the two. */}
        {facts.length > 0 && (
          <dl className="mt-6 grid grid-cols-2 gap-x-8 gap-y-4 border-t border-[var(--border-hairline)] pt-5 sm:grid-cols-4">
            {facts.map((fact) => (
              <div key={fact.label} className="flex min-w-0 flex-col gap-1">
                <dt className="text-[10px] font-medium tracking-[1.6px] text-[var(--ink-400)] uppercase">
                  {fact.label}
                </dt>
                <dd className="min-w-0 truncate text-[12px] text-[var(--ink-900)] tabular-nums">
                  {fact.value}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </section>
  );
}

function StepBody({
  body,
  analysis,
  matchId,
}: {
  body: AnalysisStepBody;
  analysis: MatchAnalysis;
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
              jobId={analysis.jobId}
              matchId={matchId}
              variant="card"
              stalled={body.stalled}
            />
          </div>
        </div>
      );
  }
}
