"use client";

import { ChromeTooltip } from "@/components/dashboard/shared/chrome-tooltip";
import type { LabelScoreMismatch } from "@/lib/services/labels/set-scores";
import { cn } from "@/lib/utils";

/**
 * The "Score doesn't add up" banner (board 08m, `BANNER` / `.fx-ban`): for
 * the whole match, above the black rail's list, when the labelled points make
 * a set score the entered one disagrees with. Until now a mismatch was
 * accepted without a word.
 *
 * The DS warning triple — `--warning-bg`, `--warning-border`,
 * `--warning-text` — even on the dark rail, as the frame draws it: the banner
 * is the one light thing there, which is what makes it read as a notice and
 * not a row. Built to fit the rail from 520px: the sentence wraps, the three
 * answers wrap as a row of words, nothing scrolls sideways.
 *
 * It changes nothing until a click, and its answers write ONLY
 * `label_sessions` (`final_score`, `video_ends_early`) — never `matches`:
 * "Fix the entered score" stores the labelled sets as the session's score,
 * "Video ends early" says the rows stop before the match did, and "Find the
 * gap" goes to the mismatching set's first point and writes nothing. The
 * answers are absent on a session that cannot be written.
 */
export function LabelScoreBanner({
  mismatch,
  onFixEnteredScore,
  onVideoEndsEarly,
  onFindGap,
}: {
  mismatch: LabelScoreMismatch;
  /** Store the labelled sets as `final_score`. Absent: no answers at all. */
  onFixEnteredScore?: () => void;
  onVideoEndsEarly?: () => void;
  /** Hold and scroll to the set's first point (null: the rows end before it). */
  onFindGap?: (pointId: string | null) => void;
}) {
  const { setNumber, labelled, entered, firstPointId } = mismatch;
  const answers = onFixEnteredScore && onVideoEndsEarly && onFindGap;
  const gapHover =
    firstPointId === null
      ? `The points never reach set ${setNumber}: goes to the last point labelled.`
      : `Goes to the first point of set ${setNumber}. The entered score is a set total, so the gap can't be placed at a game.`;
  return (
    <div
      data-label-score-banner=""
      role="status"
      className="mx-3 mt-3 mb-2.5 grid shrink-0 gap-1 rounded-[10px] border border-[var(--warning-border)] bg-[var(--warning-bg)] px-3.5 py-3 text-[12px] leading-[1.5] text-[var(--warning-text)]"
    >
      <b data-label-score-banner-title="" className="font-medium">
        Score doesn’t add up
      </b>
      <span data-label-score-banner-text="" className="break-words">
        These points make {labelled} in set {setNumber}. The score entered was{" "}
        {entered}. Stats are estimates until one of them is fixed.
      </span>
      {answers ? (
        <span
          data-label-score-banner-actions=""
          className="flex flex-wrap items-center font-medium"
        >
          <button
            type="button"
            data-label-score-fix=""
            onClick={onFixEnteredScore}
            className={ANSWER}
          >
            Fix the entered score
          </button>
          <Dot />
          <button
            type="button"
            data-label-score-ends-early=""
            onClick={onVideoEndsEarly}
            className={ANSWER}
          >
            Video ends early
          </button>
          <Dot />
          <ChromeTooltip label={gapHover} side="top" wrap>
            <button
              type="button"
              data-label-score-find-gap=""
              aria-label={`Find the gap — ${gapHover}`}
              onClick={() => onFindGap(firstPointId)}
              className={ANSWER}
            >
              Find the gap
            </button>
          </ChromeTooltip>
        </span>
      ) : null}
    </div>
  );
}

/**
 * An answer is a word in the banner's own ink, washed with the border on
 * hover — the Notice primitive's warning answers, laid in a row. Never a
 * button shape: the frame writes them as text.
 */
const ANSWER = cn(
  "-mx-1 cursor-pointer rounded-[var(--radius-button)] px-1 whitespace-nowrap text-[var(--warning-text)]",
  "transition-colors duration-200 hover:bg-[rgba(253,230,138,0.6)]",
  "focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
);

function Dot() {
  return (
    <span aria-hidden="true" className="px-2.5 select-none">
      ·
    </span>
  );
}
