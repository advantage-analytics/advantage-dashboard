import { AnalysisProgressTrack } from "./analysis-progress-track";
import { StatusChip } from "@/components/ui/status-chip";
import {
  isAnalysisFailed,
  isInFlight,
  isSubmitStalled,
  isWorking,
  type MatchAnalysis,
} from "@/lib/data/match-analysis";

/**
 * A row's lifecycle, in the trailing cell after the score.
 *
 * The Analysis column that used to sit mid-row is not coming back: it said
 * "View report" on every settled row, which is what clicking the row already
 * does. This cell says nothing at all on a settled row, and carries the whole
 * of what is worth saying on the few that are not — mark the exception, not the
 * norm (v3 Data Table law 4).
 *
 * **Only the upload gets a bar.** `uploadPercent` is the one measured number in
 * the pipeline; the vendor sends its queue and analysis transitions with no
 * percentage attached, so `pipelinePercent` answers those with the START of the
 * stage they are in — a position, not a quantity. Drawing that as a progress
 * bar is what the old row did, and it told the reader something the system does
 * not know. Everything after the upload is a word.
 *
 * The number rides the chip as text rather than living only in the bar, so it
 * survives for anyone reading by colour, by screen reader, or on a still frame;
 * the track carries `role="progressbar"` with its value and a label, which puts
 * progress in the accessibility tree whether or not the activity tray — the
 * only other place it exists — happens to be open.
 *
 * The tray keeps its job. It holds the measured time remaining and every job at
 * once; this answers the narrower question the person watching one row is
 * actually asking, which is whether their upload is still moving.
 */
export function RowLifecycle({
  analysis,
  /** Names the match in the progress bar's accessible label. */
  label,
}: {
  analysis?: MatchAnalysis;
  label: string;
}): React.JSX.Element | null {
  if (!analysis) return null;

  // The one `uploaded` job whose hand-off to the vendor never went through. A
  // live chip would keep claiming work is under way; nothing is, and nothing
  // will move until someone retries from the match page.
  if (isSubmitStalled(analysis)) {
    return <StatusChip tone="neutral">Not sent</StatusChip>;
  }

  if (isInFlight(analysis.status)) {
    const percent = analysis.status === "uploading" ? analysis.uploadPercent : undefined;
    const word =
      analysis.status === "processed"
        ? "Stats pending"
        : analysis.status === "uploading"
          ? "Uploading"
          : "Analyzing";

    return (
      <span className="flex min-w-0 items-center gap-2.5">
        {/* `live` pulses only while something is happening: `uploaded` and
            `processed` are in flight but idle, and a pulse there would claim
            work that is not being done. */}
        <StatusChip tone="blue" live={isWorking(analysis.status)} className="shrink-0">
          {percent === undefined ? word : `${word} ${Math.round(percent)}%`}
        </StatusChip>
        {percent !== undefined && (
          /* Bounded, not fixed: this cell is the row's fluid track, so at the
             narrow end of `lg` the bar gives its width up before the words do.
             The sheen is what separates a moving upload from a stalled one —
             the percentage is written at most every two points, so the number
             alone sits still for a minute at a time. */
          <span className="min-w-0 max-w-[160px] flex-1">
            <AnalysisProgressTrack
              percent={percent}
              live
              label={`Uploading ${label}`}
            />
          </span>
        )}
      </span>
    );
  }

  if (isAnalysisFailed(analysis.status)) {
    // The word, not the action. "Start over" used to be a link in the row; the
    // row now opens the match page, which is where the retry lives and where
    // the failure is explained. A row states, a page acts.
    return <StatusChip tone="loss">Failed</StatusChip>;
  }

  if (analysis.status === "manual") {
    return <StatusChip tone="neutral">No video</StatusChip>;
  }

  return null;
}
