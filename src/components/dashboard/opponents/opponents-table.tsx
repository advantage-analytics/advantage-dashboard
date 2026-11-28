import { LIST_TRACK_TRANSITION } from "@/components/dashboard/matches/match-list-layout";
import type { PersonalOpponent } from "@/lib/data/personal-opponents";
import { cn } from "@/lib/utils";
import {
  OpponentLastMatchCell,
  OpponentNameCell,
  OpponentPlaysCell,
  OpponentRecordCell,
} from "./opponent-cells";
import { opponentFormBars } from "./opponent-form-links";
import {
  OPPONENTS_CARD_PADDING,
  OPPONENTS_MIN_WIDTH,
  OPPONENTS_MIN_WIDTH_COMPACT,
  OPPONENTS_ROW_BOX,
  OPPONENTS_ROW_FRAME,
  opponentRowControl,
  opponentRowWash,
  personalOpponentsGrid,
} from "./opponents-table-layout";
import { OpponentsTableHeader } from "./opponents-table-header";

/** The row's DOM id — what ↑/↓ stepping scrolls to and Esc returns focus to. */
export function opponentRowId(key: string): string {
  // A group key holds a colon and may hold spaces; an id may not hold a space.
  return `opponent-row-${encodeURIComponent(key)}`;
}

/**
 * The personal Opponents table: one card, four tracks, a 52px row per
 * opponent (`reference/tables.md` law 9 — a hairline under the header only,
 * none between rows, and the hover wash as the row's boundary).
 *
 * Opponent · Plays · Record · Last match
 *
 * The three cells after the name are the shared ones in `opponent-cells.tsx`,
 * the same the team table draws, so the two pages cannot drift. Beside the
 * open drawer (`compact`) Plays slides shut, as it does on the team table:
 * the drawer states the hand and backhand under the name, and a 1280 window
 * leaves the card too little room for all four (`opponents-table-layout`).
 *
 * An opponent is a CONTAINER row (law 3): it peeks in the drawer rather than
 * travelling. The whole row takes the click and the selected one keeps its
 * wash; it is focusable and Enter or Space opens it, as a Matches or Roster row
 * does. The links inside it travel and stop their own clicks: the name to this
 * opponent's matches, a form bar or Last match to that match's report.
 *
 * Every cell that can be unknown draws the one `EmptyMark`, on the same x as
 * the column's real values — a style nobody recorded, a meeting with no
 * score, an outcome nobody is yet known to have won.
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
   * one. `viaKeyboard` is true for Enter/Space on the row, so the drawer can
   * take focus for the person who cannot click into it.
   */
  onToggle: (key: string, viaKeyboard: boolean) => void;
  /**
   * What the body shows when a chip or filter leaves no rows — a
   * `TableEmptyBody`. It is drawn under the column headers: the card and its
   * labels stay, so an empty cut never swaps the table for a line on the
   * bare page.
   */
  empty?: React.ReactNode;
  /** The drawer is open beside the table: Plays collapses. */
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
  onToggle: (key: string, viaKeyboard: boolean) => void;
}) {
  const grid = personalOpponentsGrid(compact);
  return (
    <div
      id={opponentRowId(opponent.key)}
      {...opponentRowControl(opponent.key, selected, onToggle)}
      className={cn(
        OPPONENTS_ROW_FRAME,
        OPPONENTS_ROW_BOX,
        grid.className,
        LIST_TRACK_TRANSITION,
        "cursor-pointer",
        opponentRowWash(selected),
      )}
      style={grid.style}
    >
      {/* It truncates bare; the drawer, one click away, states it in full. */}
      <OpponentNameCell name={opponent.name} />

      <OpponentPlaysCell hand={opponent.hand} backhand={opponent.backhand} />

      <OpponentRecordCell
        wins={opponent.wins}
        losses={opponent.losses}
        bars={opponentFormBars(opponent.form, opponent.recent)}
      />

      <OpponentLastMatchCell lastMatch={opponent.lastMatch} />
    </div>
  );
}
