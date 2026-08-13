"use client";

/**
 * What a match's own page shows while its video is still being analyzed.
 *
 * The stat sections below this would all render zeroes until the job lands, so
 * they are skipped entirely — an empty serve chart reads as "you hit no serves"
 * rather than "we're still working". This panel carries the same vocabulary as
 * the Analysis column in the matches list, so a player who clicked through from
 * there sees the words they just read.
 */

import { useEffect, useState } from "react";
import { CircleX, Info } from "lucide-react";
import {
  ANALYSIS_LABEL,
  PIPELINE_STAGES,
  formatEta,
  isAnalysisFailed,
  isWorking,
  uploadEtaSeconds,
  stageFillPercent,
  stageIndexFor,
  type MatchAnalysis,
} from "@/lib/data/match-analysis";
import { AnalysisProgressTrack } from "../analysis-progress-track";
import {
  useLiveMatchAnalysis,
  withLiveAnalysis,
} from "@/hooks/use-live-match-analysis";

const CARD =
  "rounded-[14px] border border-[#F3F3F3] bg-white shadow-[0px_2px_8px_0px_rgba(0,0,0,0.06)]";

const STORED_NOTE = "Your video is stored. Nothing else is needed from you.";

/** Reassurance per stage. Every line has to be true of the pipeline as built. */
const STAGE_NOTE: Partial<Record<MatchAnalysis["status"], string>> = {
  uploading: "Keep this tab open until the transfer finishes. Everything after it runs on our side.",
  // Same line for both: from the player's side there is no difference between
  // "stored, not yet submitted" and "submitted, waiting" — neither needs them.
  uploaded: STORED_NOTE,
  queued: STORED_NOTE,
  processing: "Nothing needs to stay open — this page fills in as soon as the analysis lands.",
  deriving: "Turning detected strokes into points and shots. Almost there.",
};

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
  const livePatches = useLiveMatchAnalysis({ by: "match", matchId });
  const analysis = withLiveAnalysis(serverAnalysis, livePatches.get(matchId));
  const currentIndex = stageIndexFor(analysis.status);
  const failed = isAnalysisFailed(analysis.status);
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
  if (analysis.fileName) facts.push({ label: "Video", value: analysis.fileName });
  if (analysis.window) facts.push({ label: "Window", value: analysis.window });
  if (analysis.jobReference) facts.push({ label: "Job", value: analysis.jobReference });
  if (analysis.stageNote) facts.push({ label: "Stage", value: analysis.stageNote });

  return (
    <section aria-label="Analysis progress">
      <div className="mb-4 flex items-center gap-3">
        <h2 className="text-[10px] font-medium uppercase tracking-[2.5px] text-[#AAAAAA]">
          Analysis
        </h2>
      </div>

      <div className={`${CARD} p-6`}>
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
              <p className="text-[28px] font-light leading-none tracking-[-0.5px] text-[#3B82F6] tabular-nums">
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
                    color: failedHere ? "#E51837" : isCurrent ? "#3B82F6" : "#0D0D0D",
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
            <CircleX
              className="mt-0.5 size-[15px] shrink-0 text-[#E51837]"
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <div>
              <p className="text-[13px] font-medium text-[#0D0D0D]">
                {analysis.failNote ?? "Analysis stopped"}
              </p>
              <p className="mt-1 text-[12px] leading-[1.5] text-[#525252]">
                Trim to a window where the camera stays fixed, or upload a new recording.
              </p>
            </div>
          </div>
        ) : (
          STAGE_NOTE[analysis.status] && (
            <div className="mt-6 flex items-start gap-2 border-t border-[#F3F3F3] pt-4">
              <Info
                className="mt-px size-3.5 shrink-0 text-[#CCCCCC]"
                strokeWidth={1.75}
                aria-hidden="true"
              />
              <p className="text-[12px] leading-[1.5] text-[#888888]">
                {STAGE_NOTE[analysis.status]}
              </p>
            </div>
          )
        )}

        {/* Job record */}
        {/* Label over value rather than a justified pair: at this page's width a
            justified row leaves a canyon between the two, and the eye loses which
            value belongs to which label. */}
        {facts.length > 0 && (
          <dl className="mt-6 grid grid-cols-2 gap-x-8 gap-y-4 border-t border-[#F3F3F3] pt-5 sm:grid-cols-4">
            {facts.map((fact) => (
              <div key={fact.label} className="flex min-w-0 flex-col gap-1">
                <dt className="text-[10px] font-medium uppercase tracking-[1.6px] text-[#AAAAAA]">
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
