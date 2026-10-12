import { ResultMark } from "@/components/dashboard/result-mark";
import { ScoreLine } from "@/components/dashboard/score-line";
import { FormTicks } from "@/components/dashboard/shared/form-ticks";
import { EmptyMark } from "@/components/ui/empty-mark";
import type { PersonalOpponent } from "@/lib/data/personal-opponents";
import { formatShortDate } from "@/lib/ui/date-format";
import { playedSets } from "@/lib/ui/score-format";
import { opponentPlaysLabel } from "./opponent-style";

/**
 * The three merged cells of the six-column Opponents table — Plays, Record
 * and Last match — each one grid cell holding what the eight-column table
 * spread over two or three tracks.
 *
 * Shared, not private to either table: the team table draws them in its six
 * columns and the personal table in its four, and a cell drawn twice drifts
 * by a pixel within a week. Every absence is the one `EmptyMark`, on the same x as the column's
 * real values. No cell carries a `title`: clipped text truncates bare and the
 * drawer, one click away, states it in full (`reference/chrome.md`).
 */

/** How many ticks the Form strip holds — the grouping's own five-match window. */
export const OPPONENT_FORM_SLOTS = 5;

/** Plays — "Right · Two-handed"; the noun is the header's, the cell qualifies. */
export function OpponentPlaysCell({
  hand,
  backhand,
}: Pick<PersonalOpponent, "hand" | "backhand">) {
  const plays = opponentPlaysLabel(hand, backhand);
  return (
    <span className="min-w-0 truncate text-[12px] text-[var(--ink-600)]">
      {plays ?? <EmptyMark label="Hand and backhand not recorded" />}
    </span>
  );
}

/**
 * Record — wins then losses, with the last five meetings beside the figure
 * they explain. An undecided meeting is in neither figure, which is why the
 * two need not sum to `played`. The figure holds a 26px floor so the ticks
 * start on one x down the column for any record up to "10-9".
 */
export function OpponentRecordCell({
  wins,
  losses,
  form,
}: Pick<PersonalOpponent, "wins" | "losses" | "form">) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="tabular min-w-[26px] text-[13px] whitespace-nowrap text-[var(--ink-900)]">
        <span aria-hidden="true">
          {wins}-{losses}
        </span>
        <span className="sr-only">
          {wins} won, {losses} lost
        </span>
      </span>
      <span className="flex items-center">
        <FormTicks form={form} slots={OPPONENT_FORM_SLOTS} />
      </span>
    </span>
  );
}

/**
 * Last match — the date, the result and the score on one line, which is how
 * the drawer already writes a match.
 *
 * The date holds a 52px floor ("Sep 27") so the result glyph sits on one x for
 * every match of the current year; a date carrying its year is wider and
 * pushes its own row's glyph along rather than being clipped. The score is the
 * one part that may truncate.
 *
 * `ResultMark`'s own null means a level dual, which a singles match cannot be,
 * so an undecided result draws the dash and null never reaches it.
 */
export function OpponentLastMatchCell({
  lastMatch,
}: Pick<PersonalOpponent, "lastMatch">) {
  const sets = playedSets(lastMatch.sets);
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <span className="tabular min-w-[52px] shrink-0 text-[12px] whitespace-nowrap text-[var(--ink-700)]">
        {lastMatch.date ? (
          formatShortDate(lastMatch.date)
        ) : (
          <EmptyMark label="No date" />
        )}
      </span>
      <span className="flex w-3.5 shrink-0 items-center">
        {lastMatch.won === null ? (
          <EmptyMark label="No result yet" />
        ) : (
          <ResultMark won={lastMatch.won} />
        )}
      </span>
      {sets.length > 0 ? (
        <ScoreLine
          sets={sets}
          className="min-w-0 truncate text-[13px] text-[var(--ink-900)]"
        />
      ) : (
        <span>
          <EmptyMark label="No score" />
        </span>
      )}
    </span>
  );
}
