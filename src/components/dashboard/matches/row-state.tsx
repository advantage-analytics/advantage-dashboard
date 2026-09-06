import { NewPill } from "@/components/ui/new-pill";
import { StatusChip } from "@/components/ui/status-chip";
import {
  isAnalysisFailed,
  isInFlight,
  isSubmitStalled,
  isWorking,
  type MatchAnalysis,
} from "@/lib/data/match-analysis";

/**
 * The one state slot in a match row, sitting after the opponent's name.
 *
 * The Analysis column is gone. "View report" only ever restated what clicking
 * the row already does, and the states worth saying — analysing, failed, no
 * video — are exceptions on a handful of rows, so they ride beside the name
 * rather than holding a column open for the majority that have nothing to say.
 * Mark the exception, not the norm (v3 Data Table law 4).
 *
 * One slot is enough because the two things that could fill it are mutually
 * exclusive: "New" means a finished report nobody has opened, so a match still
 * analysing, failed, or never sent has no report to have left unread. There is
 * no row where both are true, and the slot never has to choose.
 *
 * The words stay the product's own — the same `ANALYSIS_LABEL` vocabulary the
 * match page and the activity tray use — except where a shorter one is
 * unambiguous in a row this dense. A second set of words for the same states is
 * how "Analyzing" and "Analyzed" end up meaning different things on different
 * screens, so the map below is deliberately small and named.
 */
export function RowState({
  analysis,
  unseen,
}: {
  analysis?: MatchAnalysis;
  /** Ready and never opened on this device. */
  unseen?: boolean;
}): React.JSX.Element | null {
  if (analysis) {
    // The one `uploaded` job whose hand-off to the vendor never went through.
    // A live chip would keep claiming work is under way; nothing is, and
    // nothing will until someone retries from the match page.
    if (isSubmitStalled(analysis)) {
      return (
        <StatusChip tone="neutral" className="shrink-0">
          Not sent
        </StatusChip>
      );
    }
    if (isInFlight(analysis.status)) {
      // `live` pulses only while something is actually happening: `uploaded`
      // and `processed` are in flight but idle, and a pulse there would claim
      // work that is not being done.
      return (
        <StatusChip tone="blue" live={isWorking(analysis.status)} className="shrink-0">
          {analysis.status === "processed" ? "Stats pending" : "Analyzing"}
        </StatusChip>
      );
    }
    if (isAnalysisFailed(analysis.status)) {
      // The word, not the action. "Start over" used to be a link in this cell;
      // the row now opens the match page, which is where the retry lives and
      // where the failure is explained — a row states, a menu or a page acts.
      return (
        <StatusChip tone="loss" className="shrink-0">
          Failed
        </StatusChip>
      );
    }
    if (analysis.status === "manual") {
      return (
        <StatusChip tone="neutral" className="shrink-0">
          No video
        </StatusChip>
      );
    }
  }

  return unseen ? <NewPill className="shrink-0" /> : null;
}
