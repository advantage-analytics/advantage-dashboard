import { AnalysisProgressTrack } from "./analysis-progress-track";
import { StatusChip } from "@/components/ui/status-chip";
import {
  ANALYSIS_LABEL,
  isAnalysisFailed,
  isInFlight,
  isSubmitStalled,
  type MatchAnalysis,
} from "@/lib/data/match-analysis";

/**
 * Analysis status in the Matches table. Settled rows name their outcome;
 * provider details belong in the drawer. Only measured upload progress gets
 * a percentage or bar. Partial results retain their truthful availability label.
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

  // The one `uploaded` job whose hand-off to the vendor never went through. A
  // live chip would keep claiming work is under way; nothing is, and nothing
  // will move until someone retries from the match page.
  if (isSubmitStalled(analysis)) {
    return (
      <StatusChip dot={false} tone="neutral">
        Not sent
      </StatusChip>
    );
  }

  if (isInFlight(status)) {
    if (status === "uploading") {
      const percent = analysis.uploadPercent;
      return (
        /* Label over track, both taking the cell's width up to a cap. The
           track was matched to the label at first, which bound the two
           tightly — and made the bar 89px, too short to read a change in. It
           takes the column now and stops at 280px, because a 3px rule running
           the whole of a 391px cell on a large display starts to read as a
           divider in a table that has none.

           What the earlier version was protecting still holds, differently:
           the track's length must not move DURING an upload. It is the cell's
           width now, and the cell is a fixed track for any one viewport, so it
           does not. */
        <span className="flex w-full max-w-[280px] flex-col items-stretch gap-[5px]">
          {/* `tabular` so the label itself does not shimmer as the digits
              change — the track no longer depends on its width, but the number
              is still read while it moves. */}
          <span className="tabular text-[11px] leading-none text-[var(--blue)]">
            {percent === undefined
              ? ANALYSIS_LABEL.uploading
              : `${ANALYSIS_LABEL.uploading} ${Math.round(percent)}%`}
          </span>
          {percent !== undefined && (
            /* The sheen is what separates a moving upload from a stalled one:
               the percentage is written at most every two points, so the number
               alone sits still for a minute at a time. */
            <AnalysisProgressTrack
              percent={percent}
              live
              label={`Uploading ${label}`}
            />
          )}
        </span>
      );
    }

    // Both analysis engines read as Analyzing; waiting states keep their
    // distinct labels so queued or stored video never implies active work.
    return (
      <StatusChip dot={false} tone="blue">
        {status === "processing" || status === "deriving"
          ? "Analyzing"
          : ANALYSIS_LABEL[status]}
      </StatusChip>
    );
  }

  if (isAnalysisFailed(status)) {
    return (
      <StatusChip dot={false} tone="loss">
        Failed
      </StatusChip>
    );
  }

  return (
    <StatusChip dot={false} tone="neutral">
      {status === "manual" ? "Not analyzed" : ANALYSIS_LABEL[status]}
    </StatusChip>
  );
}
