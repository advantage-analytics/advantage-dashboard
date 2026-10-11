import { ResultMark } from "@/components/dashboard/result-mark";
import { ScoreLine } from "@/components/dashboard/score-line";
import { FormTicks } from "@/components/dashboard/shared/form-ticks";
import { LIST_TRACK_TRANSITION } from "@/components/dashboard/matches/match-list-layout";
import { EmptyMark } from "@/components/ui/empty-mark";
import type { PersonalOpponent } from "@/lib/data/personal-opponents";
import { formatShortDate } from "@/lib/ui/date-format";
import { playedSets } from "@/lib/ui/score-format";
import { cn } from "@/lib/utils";
import { opponentBackhandLabel, opponentHandLabel } from "./opponent-style";
import {
  OPPONENTS_CARD_PADDING,
  OPPONENTS_COLUMNS,
  OPPONENTS_MIN_WIDTH,
  OPPONENTS_MIN_WIDTH_COMPACT,
  OPPONENTS_ROW_BOX,
  OPPONENTS_ROW_FRAME,
  opponentsGrid,
} from "./opponents-table-layout";
import { OpponentsTableHeader } from "./opponents-table-header";

/** How many ticks the Form cell holds — the grouping's own five-match window. */
const FORM_SLOTS = 5;

/** The row's DOM id — what ↑/↓ stepping scrolls to and Esc returns focus to. */
export function opponentRowId(key: string): string {
  // A group key holds a colon and may hold spaces; an id may not hold a space.
  return `opponent-row-${encodeURIComponent(key)}`;
}

/**
 * The personal Opponents table: one card, eight tracks, a 52px row per
 * opponent (`reference/tables.md` law 9 — a hairline under the header only,
 * none between rows, and the hover wash as the row's boundary).
 *
 * An opponent is a CONTAINER row (law 3): it peeks in the drawer rather than
 * travelling, so it carries no chevron. The whole row takes the click and the
 * selected one keeps its wash; the name is the row's one control — a
 * `<button aria-pressed>` — so the selection has somewhere to live for a
 * keyboard and a screen reader. The button has no handler of its own: its
 * click bubbles to the row, so a press is counted once.
 *
 * Every cell that can be unknown draws the one `EmptyMark`, on the same x as
 * the column's real values — a hand nobody recorded, a meeting with no score,
 * an outcome nobody is yet known to have won.
 */
export function OpponentsTable({
  opponents,
  selectedKey,
  onToggle,
  empty,
  compact = false,
}: {
  /** The rows to draw, already chipped, filtered and sorted by the page. */
  opponents: readonly PersonalOpponent[];
  /** `PersonalOpponent.key` of the row the drawer is showing, if any. */
  selectedKey: string | null;
  /**
   * A row was pressed: open its drawer, or close it when it is the selected
   * one. `viaKeyboard` is true for Enter/Space on the name, so the drawer can
   * take focus for the person who cannot click into it.
   */
  onToggle: (opponent: PersonalOpponent, viaKeyboard: boolean) => void;
  /**
   * What the body shows when a chip or filter leaves no rows — a
   * `TableEmptyBody`. It is drawn under the column headers: the card and its
   * labels stay, so an empty cut never swaps the table for a line on the
   * bare page.
   */
  empty?: React.ReactNode;
  /**
   * The drawer is open beside the table: Hand and Backhand collapse (the
   * drawer states both), so Score stays inside the card.
   */
  compact?: boolean;
}) {
  return (
    <section
      aria-label="Opponents"
      className="surface-card overflow-x-auto"
      style={{ padding: OPPONENTS_CARD_PADDING }}
    >
      <div
        className={cn(
          compact ? OPPONENTS_MIN_WIDTH_COMPACT : OPPONENTS_MIN_WIDTH,
          LIST_TRACK_TRANSITION,
        )}
      >
        <OpponentsTableHeader compact={compact} />
        {opponents.length === 0 ? (
          empty
        ) : (
          <div>
            {opponents.map((opponent) => (
              <OpponentRow
                key={opponent.key}
                opponent={opponent}
                selected={opponent.key === selectedKey}
                onToggle={onToggle}
                compact={compact}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function OpponentRow({
  opponent,
  selected,
  onToggle,
  compact,
}: {
  opponent: PersonalOpponent;
  selected: boolean;
  compact: boolean;
  onToggle: (opponent: PersonalOpponent, viaKeyboard: boolean) => void;
}) {
  const hand = opponentHandLabel(opponent.hand);
  const backhand = opponentBackhandLabel(opponent.backhand);
  const { lastMatch } = opponent;
  const sets = playedSets(lastMatch.sets);
  const grid = opponentsGrid(compact);

  return (
    <div
      id={opponentRowId(opponent.key)}
      // `detail` is 0 for a click the keyboard made (Enter/Space on the name).
      onClick={(event) => onToggle(opponent, event.detail === 0)}
      className={cn(
        OPPONENTS_ROW_FRAME,
        OPPONENTS_ROW_BOX,
        grid.className,
        LIST_TRACK_TRANSITION,
        "cursor-pointer hover:bg-[var(--surface-muted)]",
        selected && "bg-[var(--surface-muted)]",
      )}
      style={grid.style}
    >
      {/* Opponent — the name a reader scans for, and the row's one control. */}
      <button
        type="button"
        aria-pressed={selected}
        className="min-w-0 cursor-pointer truncate rounded-[var(--radius-cell)] text-left text-[13px] font-medium text-[var(--ink-900)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
      >
        {opponent.name}
      </button>

      {/* Hand, Backhand — the noun is in the header, the qualifier in the cell. */}
      <span className="min-w-0 truncate text-[12px] text-[var(--ink-600)]">
        {hand ?? <EmptyMark label="Hand not recorded" />}
      </span>
      <span className="min-w-0 truncate text-[12px] text-[var(--ink-600)]">
        {backhand ?? <EmptyMark label="Backhand not recorded" />}
      </span>

      {/* Record — the viewer's wins, then losses. An undecided meeting is in
          neither figure, which is why the two need not sum to `played`. */}
      <span className="tabular text-[13px] text-[var(--ink-900)]">
        <span aria-hidden="true">
          {opponent.wins}-{opponent.losses}
        </span>
        <span className="sr-only">
          {opponent.wins} won, {opponent.losses} lost
        </span>
      </span>

      {/* Form — the last five meetings, oldest at the left. */}
      <span className="flex items-center">
        <FormTicks form={opponent.form} slots={FORM_SLOTS} />
      </span>

      {/* Last match — the stored date, formatted here. */}
      <span className="tabular text-[12px] whitespace-nowrap text-[var(--ink-700)]">
        {lastMatch.date ? (
          formatShortDate(lastMatch.date)
        ) : (
          <EmptyMark label="No date" />
        )}
      </span>

      {/* Result — the glyph, or the dash on the same x when nobody is yet
          known to have won. `ResultMark`'s own null means a level dual, which
          a singles match cannot be, so null never reaches it. */}
      <span className="flex items-center">
        {lastMatch.won === null ? (
          <EmptyMark label="No result yet" />
        ) : (
          <ResultMark won={lastMatch.won} />
        )}
      </span>

      {/* Score — the shared score line, tiebreaks raised. */}
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
    </div>
  );
}
