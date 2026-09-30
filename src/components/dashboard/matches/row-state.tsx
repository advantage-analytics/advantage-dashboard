import { AnalysisProgressTrack } from "./analysis-progress-track";
import {
  AnalysisStatusLine,
  STATUS_LINE_INDENT,
} from "@/components/dashboard/shared/analysis-status-line";
import {
  ANALYSIS_LABEL,
  isInFlight,
  isSubmitStalled,
  isWorking,
  matchListGroup,
  matchListStatusLabel,
  type MatchAnalysis,
} from "@/lib/data/match-analysis";

/**
 * Analysis status in the Matches table. Settled rows name their outcome;
 * provider details belong in the drawer. Only measured upload progress gets
 * a percentage or bar. Partial results retain their truthful availability label.
 *
 * Every state leads with the upload stepper's mark (`AnalysisStatusLine`), the
 * same vocabulary the Roster's Last-match cell uses: a spinner only while work
 * is running, a dashed ring while it waits — so a queued match no longer reads
 * as busy as one being analysed.
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
  const { status } = analysis;

  // The one `uploaded` job whose hand-off to the vendor never went through.
  // Waiting, not working: nothing will move until someone retries from the
  // match page.
  if (isSubmitStalled(analysis)) {
    return <AnalysisStatusLine mark="wait">Not sent</AnalysisStatusLine>;
  }

  if (status === "uploading") {
    const percent = analysis.uploadPercent;
    return (
      /* Line over track, both taking the cell's width up to a cap: a 3px rule
         running a whole wide cell starts to read as a divider in a table that
         has none. The track hangs under the word, past the mark, as it does
         under the stepper's label. */
      <span className="flex w-full max-w-[280px] flex-col items-stretch gap-[5px]">
        <AnalysisStatusLine
          mark="now"
          value={percent === undefined ? undefined : `${Math.round(percent)}%`}
        >
          {ANALYSIS_LABEL.uploading}
        </AnalysisStatusLine>
        {percent !== undefined && (
          /* The sheen is what separates a moving upload from a stalled one:
             the percentage is written at most every two points, so the number
             alone sits still for a minute at a time. */
          <span className={STATUS_LINE_INDENT}>
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

  if (isInFlight(status)) {
    // Both analysis engines read as Analyzing; waiting states keep their own
    // words and a still mark, so queued or stored video never implies work.
    return (
      <AnalysisStatusLine mark={isWorking(status) ? "now" : "wait"}>
        {status === "processing" || status === "deriving"
          ? "Analyzing"
          : ANALYSIS_LABEL[status]}
      </AnalysisStatusLine>
    );
  }

  // Follows the list's own grouping decision, not isAnalysisFailed() alone:
  // a `derivation_failed` row classified `stats_unavailable` must not read as
  // Failed (product decision 2026-09-27, matchListGroup() in match-analysis.ts).
  if (matchListGroup(analysis) === "Failed") {
    return <AnalysisStatusLine mark="fail">Failed</AnalysisStatusLine>;
  }

  // Every settled row leads with a mark. Only a real analysis (or an import)
  // earns the check; a cancelled job reads as stopped, and a match with no
  // analysis behind it — hand-scored, or stats our derivation refused — gets
  // the solid "nothing coming" ring.
  if (status === "cancelled") {
    return <AnalysisStatusLine mark="stopped">Cancelled</AnalysisStatusLine>;
  }
  if (status === "manual") {
    return <AnalysisStatusLine mark="none">Not analyzed</AnalysisStatusLine>;
  }
  const word = matchListStatusLabel(analysis);
  return (
    <AnalysisStatusLine
      mark={analysis.recovery === "stats_unavailable" ? "none" : "done"}
    >
      {word}
    </AnalysisStatusLine>
  );
}
