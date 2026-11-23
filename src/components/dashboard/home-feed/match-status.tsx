import type { DisplayMatch } from "@/lib/data/matches-list-types";
import {
  ANALYSIS_LABEL,
  isSubmitStalled,
  isUploadPaused,
} from "@/lib/data/match-analysis";
import { AnalysisStatusLine } from "@/components/dashboard/shared/analysis-status-line";
import { RowLifecycle } from "@/components/dashboard/matches/row-state";

/**
 * Where a match stands, on one line.
 *
 * Every answer comes from the Matches table's own `RowLifecycle`, so a match
 * reads the same here as there — the one exception is a running upload, which
 * that table draws as a line over a track and a single row here has no second
 * line for: it prints the same word and percentage without the track.
 */
export function MatchStatus({ match }: { match: DisplayMatch }) {
  const { analysis } = match;
  if (!analysis) return null;
  if (
    analysis.status === "uploading" &&
    !isSubmitStalled(analysis) &&
    !isUploadPaused(analysis)
  ) {
    return (
      <AnalysisStatusLine
        mark="now"
        value={
          analysis.uploadPercent === undefined
            ? undefined
            : `${Math.round(analysis.uploadPercent)}%`
        }
      >
        {ANALYSIS_LABEL.uploading}
      </AnalysisStatusLine>
    );
  }
  return (
    <RowLifecycle
      analysis={analysis}
      verification={match.verification}
      verificationPending={match.verificationPending}
      label={[match.player2.name, match.tournamentName]
        .filter(Boolean)
        .join(", ")}
    />
  );
}
