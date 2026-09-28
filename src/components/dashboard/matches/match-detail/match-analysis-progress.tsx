"use client";

/**
 * What a match's own page shows while its video is still being analyzed.
 *
 * The stat sections below this would all render zeroes until the job lands, so
 * they are skipped entirely — an empty serve chart reads as "you hit no serves"
 * rather than "we're still working". This panel carries the same vocabulary as
 * the Analysis column in the matches list, so a player who clicked through from
 * there sees the words they just read.
 *
 * While the video is still uploading it reads as the wizard's "Uploading your
 * video" screen instead — same title, same three steps, same notes, from the
 * one copy module both import — because a player who taps "View match"
 * mid-upload arrives here straight from that screen.
 */

import { useEffect, useState } from "react";
import { TriangleAlert, Info } from "lucide-react";
import {
  ANALYSIS_LABEL,
  PIPELINE_STAGES,
  formatEta,
  isAnalysisFailed,
  isLiveUpdating,
  isSubmitStalled,
  isWorking,
  uploadEtaSeconds,
  stageFillPercent,
  stageIndexFor,
  type MatchAnalysis,
  type RecoveryClass,
} from "@/lib/data/match-analysis";
import { AnalysisProgressTrack } from "../analysis-progress-track";
import { UPLOADING_COPY } from "../upload-progress-copy";
import {
  WAIT_OR_ASK_VARIANTS,
  byClass,
  waitOrAskVariant,
} from "../analysis-failure-copy";
import { VerticalStep } from "@/components/dashboard/shared/vertical-steps";
import { RecoveryAction } from "./recovery-action";
import { STAGE_NOTE, STALLED_RETRY_COPY } from "./analysis-steps";
import {
  useLiveMatchAnalysis,
  withLiveAnalysis,
} from "@/hooks/use-live-match-analysis";

const CARD =
  "rounded-[14px] border border-[#F3F3F3] bg-white shadow-[0px_2px_8px_0px_rgba(0,0,0,0.06)]";

/** Keyed by any status; only the stages `STAGE_NOTE` names carry a line. */
const stageNote = (status: MatchAnalysis["status"]): string | undefined =>
  (STAGE_NOTE as Partial<Record<MatchAnalysis["status"], string>>)[status];

/** The card's title + body for a recovery class. */
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

interface MatchAnalysisProgressProps {
  analysis: MatchAnalysis;
  /** Subscribed to so this page and the matches list cannot disagree. */
  matchId: string;
}

export function MatchAnalysisProgress({
  analysis: serverAnalysis,
  matchId,
}: MatchAnalysisProgressProps): React.JSX.Element {
  // Without this the matches list climbed live while this page sat frozen at
  // whatever the server rendered — same row, same query, two different numbers
  // on screen at once.
  //
  // Gated on isLiveUpdating so a match parked at `processed` does not hold a
  // socket open for a row that cannot change until Phase 2 ships. Keyed off the
  // SERVER status deliberately: reading the merged one would make the hook's
  // input depend on its own output, and the socket closes on navigation anyway.
  const livePatches = useLiveMatchAnalysis({
    by: "match",
    matchId: isLiveUpdating(serverAnalysis.status) ? matchId : undefined,
  });
  const analysis = withLiveAnalysis(serverAnalysis, livePatches.get(matchId));
  const currentIndex = stageIndexFor(analysis.status);
  const failed = isAnalysisFailed(analysis.status);
  // An `uploaded` job that never got submitted. Computed from the merged
  // analysis, so a live patch moving it on clears the state without a reload.
  const stalled = isSubmitStalled(analysis);
  // Every failed row the loader or live patch projects carries a class; the
  // fallbacks only cover a projection that predates it.
  const failedClass: RecoveryClass =
    analysis.recovery ??
    (analysis.status === "derivation_failed" ? "stats_unavailable" : "retry");
  const failedCopy = recoveryCopy(failedClass, analysis);
  const stalledClass: RecoveryClass = analysis.recovery ?? "retry";
  const stalledCopy =
    stalledClass === "retry"
      ? STALLED_RETRY_COPY
      : recoveryCopy(stalledClass, analysis);
  // Two different numbers. The stage bars are positions on the pipeline axis;
  // the headline is what the person is actually watching, which during a
  // transfer is their own bytes rather than a quarter-weighted pipeline figure.
  const percent = Math.round(analysis.progressPercent ?? 0);
  const measured = analysis.uploadPercent;

  // A clock, so the estimate keeps counting down between progress writes rather
  // than freezing for the minute between them.
  //
  // Starts null and is first set by the interval, never synchronously here.
  // That avoids a hydration mismatch — the server has no "now" the client would
  // agree with — and the 10-second wait costs nothing, because an estimate
  // taken in the first seconds of a transfer is noise anyway.
  const [now, setNow] = useState<number | null>(null);
  const uploading = analysis.status === "uploading";

  useEffect(() => {
    // No reset on the way out: uploadEtaSeconds() already returns undefined for
    // any status but `uploading`, so a stale clock cannot surface an estimate.
    if (!uploading) return;
    const id = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(id);
  }, [uploading]);

  const etaSeconds = now === null ? undefined : uploadEtaSeconds(analysis, now);

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
      <div className="mb-4 flex items-center gap-3">
        <h2 className="text-[10px] font-medium tracking-[2.5px] text-[#AAAAAA] uppercase">
          Analysis
        </h2>
      </div>

      <div className={`${CARD} p-6`}>
        {uploading ? (
          <UploadingSteps uploadPercent={measured} etaSeconds={etaSeconds} />
        ) : (
          <>
            {/* Headline state */}
            <div className="flex items-baseline justify-between gap-4">
              <p
                className="text-[16px] font-normal tracking-[-0.4px]"
                style={{ color: failed ? "#E51837" : "#3B82F6" }}
              >
                {ANALYSIS_LABEL[analysis.status]}
              </p>
              {measured !== undefined && (
                <div className="flex flex-col items-end gap-0.5">
                  <p className="text-[28px] leading-none font-light tracking-[-0.5px] text-[#3B82F6] tabular-nums">
                    {Math.round(measured)}%
                  </p>
                  {/* Derived from elapsed time against percent moved, so it is
                  available on any device rather than only the tab doing the
                  uploading. Absent until there is enough of the transfer to
                  project from. */}
                  {etaSeconds !== undefined && (
                    <p className="text-[11px] text-[#AAAAAA] tabular-nums">
                      {formatEta(etaSeconds)}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Four milestones */}
            <div className="mt-5 flex gap-2">
              {PIPELINE_STAGES.map((stage, index) => {
                const isDone = index < currentIndex;
                const isCurrent = index === currentIndex;
                const failedHere = isCurrent && failed;
                // A milestone the job already cleared is full, whatever the
                // percentage says — a failure carries no percentage at all, and
                // without this the stages it passed would render empty.
                const fill =
                  isDone || failedHere ? 100 : stageFillPercent(index, percent);
                return (
                  <div
                    key={stage.label}
                    className={`flex min-w-0 flex-1 flex-col gap-2 ${
                      isDone || isCurrent ? "opacity-100" : "opacity-45"
                    }`}
                  >
                    <AnalysisProgressTrack
                      percent={fill}
                      // Only the stage actually being worked carries the sheen —
                      // sheening cleared stages would say four things are running.
                      live={isCurrent && !failed && isWorking(analysis.status)}
                      tone={failedHere ? "#E51837" : "#3B82F6"}
                    />
                    <span
                      className="truncate text-[12px]"
                      style={{
                        color: failedHere
                          ? "#E51837"
                          : isCurrent
                            ? "#3B82F6"
                            : "#0D0D0D",
                      }}
                    >
                      {stage.label}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Failure detail, or the reassurance line for a healthy job */}
            {failed ? (
              <div
                className="mt-6 flex items-start gap-2.5 rounded-[10px] border border-[rgba(229,24,55,0.2)] bg-[rgba(229,24,55,0.04)] px-3.5 py-3"
                role="alert"
              >
                {/* Not `CircleX` — reserved for `ResultMark`'s won/lost glyph
                elsewhere in the matches list. `TriangleAlert` matches
                `needs-attention.tsx`'s own icon for a failed analysis job. */}
                <TriangleAlert
                  className="mt-0.5 size-[15px] shrink-0 text-[#E51837]"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
                <div>
                  {/* Headline = the row's stored note when showsStoredNote()
                  let one through (a vendor or submit-path explanation), else
                  the class title. Never `failNote`: that is the unfiltered
                  error_message, which can be a raw writer string ("Failed to
                  fetch", Azure XML) or the reconciler talking to itself. */}
                  <p className="text-[13px] font-medium text-[#0D0D0D]">
                    {analysis.note ?? failedCopy.title}
                  </p>
                  <p className="mt-1 text-[12px] leading-[1.5] text-[#525252]">
                    {failedCopy.cardBody}
                  </p>
                  {/* RecoveryAction owns the retry-vs-link-vs-nothing
                  decision. Its link carries no margin of its own; the retry
                  button brings its own. */}
                  <div className="[&>a]:mt-3">
                    <RecoveryAction
                      recovery={failedClass}
                      jobId={analysis.jobId}
                      matchId={matchId}
                      variant="card"
                      stalled={false}
                    />
                  </div>
                </div>
              </div>
            ) : stalled ? (
              /* Ahead of STAGE_NOTE, because for this state that note says "your
             video is stored, nothing else is needed from you" — true of the
             bytes, false about the analysis, and the reason this state could
             sit unnoticed indefinitely. */
              <div
                className="mt-6 flex items-start gap-2.5 rounded-[10px] border border-[var(--border-field)] bg-[var(--surface-page)] px-3.5 py-3"
                role="status"
              >
                <Info
                  className="mt-0.5 size-[15px] shrink-0 text-[#888888]"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
                <div>
                  {/* A stored note (the allowance refusal, say) outranks the
                  fixed headline: it is the one line that says why. */}
                  <p className="text-[13px] font-medium text-[#0D0D0D]">
                    {analysis.note ?? stalledCopy.title}
                  </p>
                  <p className="mt-1 text-[12px] leading-[1.5] text-[#525252]">
                    {stalledCopy.cardBody}
                  </p>
                  <RecoveryAction
                    recovery={stalledClass}
                    jobId={analysis.jobId}
                    matchId={matchId}
                    variant="card"
                    stalled
                  />
                </div>
              </div>
            ) : (
              stageNote(analysis.status) && (
                <div className="mt-6 flex items-start gap-2 border-t border-[#F3F3F3] pt-4">
                  <Info
                    className="mt-px size-3.5 shrink-0 text-[#CCCCCC]"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                  <p className="text-[12px] leading-[1.5] text-[#888888]">
                    {stageNote(analysis.status)}
                  </p>
                </div>
              )
            )}
          </>
        )}

        {/* Job record */}
        {/* Label over value rather than a justified pair: at this page's width a
            justified row leaves a canyon between the two, and the eye loses which
            value belongs to which label. */}
        {facts.length > 0 && (
          <dl className="mt-6 grid grid-cols-2 gap-x-8 gap-y-4 border-t border-[#F3F3F3] pt-5 sm:grid-cols-4">
            {facts.map((fact) => (
              <div key={fact.label} className="flex min-w-0 flex-col gap-1">
                <dt className="text-[10px] font-medium tracking-[1.6px] text-[#AAAAAA] uppercase">
                  {fact.label}
                </dt>
                <dd className="min-w-0 truncate text-[12px] text-[#0D0D0D] tabular-nums">
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

/**
 * The `uploading` state, mirroring the wizard's "Uploading your video" screen.
 *
 * Every string comes from `UPLOADING_COPY`, the module `UploadMatchSuccess`
 * reads too. What differs is only what this page cannot know: it has the job
 * row's percentage and a projected ETA, not the tab's byte counts or its
 * Cancel handle.
 */
function UploadingSteps({
  uploadPercent,
  etaSeconds,
}: {
  uploadPercent: number | undefined;
  etaSeconds: number | undefined;
}): React.JSX.Element {
  // Floored, like the wizard: a rounded 99.6 would read "100%" on a transfer
  // that has not finished.
  const pct =
    uploadPercent === undefined ? undefined : Math.floor(uploadPercent);
  return (
    <>
      <p className="text-[16px] font-normal tracking-[-0.4px] text-[var(--ink-900)]">
        {UPLOADING_COPY.title}
      </p>
      <ol className="mt-5 flex flex-col" aria-label="Progress">
        <VerticalStep
          label={UPLOADING_COPY.steps.saved}
          state="done"
          last={false}
        />
        <VerticalStep
          label={UPLOADING_COPY.steps.video}
          state="now"
          value={pct === undefined ? undefined : `${pct}%`}
          last={false}
        >
          <AnalysisProgressTrack
            percent={uploadPercent ?? 0}
            live
            label={UPLOADING_COPY.trackLabel}
          />
          {/* Derived from elapsed time against percent moved, so it is
              available on any device rather than only the tab doing the
              uploading. Absent until there is enough of the transfer to
              project from. */}
          {etaSeconds !== undefined && (
            <p className="-mt-1 text-[11px] text-[var(--ink-400)] tabular-nums">
              {formatEta(etaSeconds)}
            </p>
          )}
          <div className="mt-1 flex flex-col gap-0.5">
            <p className="text-[12px] leading-[1.55] text-[var(--ink-700)]">
              {UPLOADING_COPY.notes.keepTabOpen}
            </p>
            <p className="text-[12px] leading-[1.55] text-[var(--ink-600)]">
              {UPLOADING_COPY.notes.keepUsing}
            </p>
          </div>
        </VerticalStep>
        <VerticalStep
          label={UPLOADING_COPY.steps.analysis}
          state="later"
          last
        />
      </ol>
    </>
  );
}
