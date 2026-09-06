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
 * What the analysis is doing, in the row's trailing cell.
 *
 * The Analysis column that used to sit mid-row is not coming back: it said
 * "View report" on every settled row, which is what clicking the row already
 * does. This cell says nothing at all on a settled row and carries the whole of
 * what is worth saying on the few that are not — mark the exception, not the
 * norm (v3 Data Table law 4).
 *
 * No dot. With the column gone this is a lone word in a row otherwise made of
 * words, so the tone colour carries the state on its own — the register `Badge`
 * already uses for won and lost. `StatusChip` keeps its dot everywhere it sits
 * beside other content.
 *
 * **Only the upload gets a bar.** `uploadPercent` is the one measured number in
 * the pipeline; the vendor sends its queue and analysis transitions with no
 * percentage, so `pipelinePercent` answers those with the START of the stage
 * they are in — a position, not a quantity. Drawing that as progress is what
 * the old row did, and it told the reader something the system does not know.
 */

/**
 * The phrases a match cycles through while OUR engine derives it.
 *
 * Each one describes what the finished report will cover. None of them narrates
 * a moment, and that distinction is the whole of why this is allowed to exist:
 * `stageNote` is declared on `MatchAnalysis` and no writer has ever set it, and
 * the vendor sends transitions with no sub-step detail, so "Detecting bounces"
 * would be a sentence about something nobody observed. Coverage is true for the
 * whole wait. Position, order and time remaining are not, and none of these
 * implies any of them.
 *
 * Every line is a column `calculate_match_stats` actually fills — placement by
 * T, body and wide; first serves in; aces and double faults; break points
 * faced; rally length; winners against unforced errors — and per-side stats are
 * why "Both ends of the court" is true rather than generous.
 *
 * They are also all measured: the widest draws ~134px at 11px Inter, inside the
 * 150px gate in `globals.css`. Adding a longer one silently breaks that.
 */
const ANALYZING_COPY = [
  "Analyzing",
  "T, body and wide",
  "Every first serve, in or out",
  "Aces and double faults",
  "Every break point faced",
  "How long your rallies ran",
  "Your winners, your errors",
  "Both ends of the court",
] as const;

/** One eighth of the 24s cycle in `globals.css`, per phrase. */
const PHRASE_SECONDS = 3;

function AnalyzingCopy(): React.JSX.Element {
  return (
    <>
      {/* The truth, once, for assistive tech. The two visual branches are both
          hidden from it: a live region announcing a new sentence every three
          seconds for the length of a match would be unusable, and the phrases
          are flavour on top of a state that is already named here. */}
      <span className="sr-only">{ANALYSIS_LABEL.deriving}</span>
      <span aria-hidden="true" className="analysis-copy-plain">
        {ANALYSIS_LABEL.deriving}
      </span>
      <span aria-hidden="true" className="analysis-copy-roll">
        {ANALYZING_COPY.map((phrase, i) => (
          <span key={phrase} style={{ animationDelay: `${i * PHRASE_SECONDS}s` }}>
            {phrase}
          </span>
        ))}
      </span>
    </>
  );
}

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
    return <StatusChip dot={false} tone="neutral">Not sent</StatusChip>;
  }

  if (isInFlight(status)) {
    if (status === "uploading") {
      const percent = analysis.uploadPercent;
      return (
        /* The track is exactly as wide as the words it measures — `items-stretch`
           on an inline-flex column, so the rule takes the label's width rather
           than one of its own. That is what makes it read as the label's own
           underline instead of a bar that happens to sit nearby.
           `justify-self-start` is what makes that true: a grid item stretches
           across its track by default, which handed the column its full width
           and the rule with it. */
        <span className="inline-flex flex-col items-stretch gap-[5px] justify-self-start">
          <span className="text-[11px] leading-none text-[var(--blue)]">
            {percent === undefined
              ? ANALYSIS_LABEL.uploading
              : `${ANALYSIS_LABEL.uploading} ${Math.round(percent)}%`}
          </span>
          {percent !== undefined && (
            /* The sheen is what separates a moving upload from a stalled one:
               the percentage is written at most every two points, so the number
               alone sits still for a minute at a time. */
            <AnalysisProgressTrack percent={percent} live label={`Uploading ${label}`} />
          )}
        </span>
      );
    }

    if (status === "deriving") {
      return (
        <span className="text-[11px] leading-none text-[var(--blue)]">
          <AnalyzingCopy />
        </span>
      );
    }

    /* Every other in-flight state says its own name. This used to collapse
       `uploaded`, `queued` and `processing` into "Analyzing", which told a
       player that a job sitting in a queue with nothing running was being
       analysed — the fake progress the system bans outright. `ANALYSIS_LABEL`
       is the product's one vocabulary for these, shared with the match page and
       the activity tray, so the words cannot drift between screens. */
    return (
      <StatusChip dot={false} tone="blue">
        {ANALYSIS_LABEL[status]}
      </StatusChip>
    );
  }

  if (isAnalysisFailed(status)) {
    // The word, not the action. "Start over" used to be a link in the row; the
    // row now opens the match page, which is where the retry lives and where
    // the failure is explained. A row states, a page acts.
    return <StatusChip dot={false} tone="loss">{ANALYSIS_LABEL[status]}</StatusChip>;
  }

  if (status === "manual") {
    return <StatusChip dot={false} tone="neutral">No video</StatusChip>;
  }

  return null;
}
