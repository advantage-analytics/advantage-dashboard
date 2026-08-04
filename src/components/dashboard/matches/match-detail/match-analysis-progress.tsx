/**
 * What a match's own page shows while its video is still being analyzed.
 *
 * The stat sections below this would all render zeroes until the job lands, so
 * they are skipped entirely — an empty serve chart reads as "you hit no serves"
 * rather than "we're still working". This panel carries the same vocabulary as
 * the Analysis column in the matches list, so a player who clicked through from
 * there sees the words they just read.
 */

import { CircleX, Info } from "lucide-react";
import {
  ANALYSIS_LABEL,
  PIPELINE_STAGES,
  isAnalysisFailed,
  stageFillPercent,
  stageIndexFor,
  type MatchAnalysis,
} from "@/lib/data/match-analysis";

const CARD =
  "rounded-[14px] border border-[#F3F3F3] bg-white shadow-[0px_2px_8px_0px_rgba(0,0,0,0.06)]";

/** Reassurance per stage. Every line has to be true of the pipeline as built. */
const STAGE_NOTE: Partial<Record<MatchAnalysis["status"], string>> = {
  uploading: "Keep this tab open until the transfer finishes. Everything after it runs on our side.",
  queued: "Your video is stored. Nothing else is needed from you.",
  processing: "Nothing needs to stay open — this page fills in as soon as the analysis lands.",
  deriving: "Turning detected strokes into points and shots. Almost there.",
};

interface MatchAnalysisProgressProps {
  analysis: MatchAnalysis;
}

export function MatchAnalysisProgress({
  analysis,
}: MatchAnalysisProgressProps): React.JSX.Element {
  const currentIndex = stageIndexFor(analysis.status);
  const failed = isAnalysisFailed(analysis.status);
  const percent = Math.round(analysis.progressPercent ?? 0);

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
          {!failed && (
            <p className="text-[28px] font-light tracking-[-0.5px] text-[#3B82F6] tabular-nums">
              {percent}%
            </p>
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
                <div className="h-[3px] overflow-hidden rounded-full bg-[#F0F0F0]">
                  <div
                    className="h-full rounded-full transition-[width] duration-700 ease-[cubic-bezier(0.25,0.46,0.45,0.94)]"
                    style={{
                      width: `${fill}%`,
                      background: failedHere ? "#E51837" : "#3B82F6",
                    }}
                  />
                </div>
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
