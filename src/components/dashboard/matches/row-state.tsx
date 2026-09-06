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
 * Each one describes what the finished report will cover. None narrates a
 * moment, and that distinction is the whole of why this is allowed to exist:
 * `stageNote` is declared on `MatchAnalysis` and no writer has ever set it, and
 * the vendor sends transitions with no sub-step detail, so "Detecting bounces"
 * would be a sentence about something nobody observed. Coverage is true for the
 * whole wait. Position, order and time remaining are not, and none of these
 * implies any of them.
 *
 * Every line is a column `calculate_match_stats` actually fills — placement by
 * T, body and wide; double faults; winners against unforced errors; break
 * points saved and converted; net appearances — and per-side stats are why
 * "Both of you, every point" is true rather than generous.
 *
 * **The status word appears twice, at the head of each half.** It used to open
 * the cycle once, which left seven glances in eight landing on flavour and none
 * on the state — and "Even the double faults" in blue does not, on its own,
 * tell a first-time reader that anything is running. Twice puts the literal
 * state under one glance in four. Alternating it with every phrase was the
 * other option and reads as a stutter: the same word every other beat makes the
 * rest feel like interruptions of it.
 *
 * They are also all measured: the widest draws ~144px at 11px Inter, inside the
 * 150px gate in `globals.css`. Adding a longer one silently breaks that — the
 * cell is only 157px wide at a 1280 viewport.
 *
 * The COUNT is load-bearing too. `PHRASE_SECONDS` × this length must equal the
 * `analysis-copy-cycle` duration in `globals.css` (8 × 3s = 24s), and that
 * file's keyframe stops (1.5/3/10.5/12.5%) are computed for an eight-phase
 * cycle. Change the number of phrases and both must change with it — neither
 * is visible from here.
 */
const ANALYZING_COPY = [
  "Analyzing",
  "Where you really served",
  "Even the double faults",
  "Winners, and the other kind",
  "Analyzing",
  "Break points, both ways",
  "How often you came in",
  "Both of you, every point",
] as const;

/** One eighth of the 24s cycle in `globals.css`, per phrase. */
const PHRASE_SECONDS = 3;

/**
 * Fixed output, so it is built once at module load rather than on every render
 * of every deriving row.
 */
const ANALYZING_COPY_NODE = (
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
      {/* Keyed by position, not by text: the status word appears twice and two
          children cannot share a key. */}
      {ANALYZING_COPY.map((phrase, i) => (
        <span key={i} style={{ animationDelay: `${i * PHRASE_SECONDS}s` }}>
          {phrase}
        </span>
      ))}
    </span>
  </>
);

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
            <AnalysisProgressTrack percent={percent} live label={`Uploading ${label}`} />
          )}
        </span>
      );
    }

    if (status === "deriving") {
      return (
        <span className="text-[11px] leading-none text-[var(--blue)]">
          {ANALYZING_COPY_NODE}
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
    // "No video", not `ANALYSIS_LABEL.manual` ("Stats unavailable"). A hand-
    // scored match never had a video, and on a list of results that is the
    // plainer fact; the match page keeps "Stats unavailable" because there the
    // question is why the charts are empty. The one deliberate divergence from
    // the shared vocabulary.
    return <StatusChip dot={false} tone="neutral">No video</StatusChip>;
  }

  return null;
}
