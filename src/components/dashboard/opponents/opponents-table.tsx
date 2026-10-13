import type { PersonalOpponent } from "@/lib/data/personal-opponents";
import { cn } from "@/lib/utils";
import {
  OpponentLastMatchCell,
  OpponentPlaysCell,
  OpponentRecordCell,
} from "./opponent-cells";
import {
  OPPONENTS_CARD_PADDING,
  OPPONENTS_GRID_COLS,
  OPPONENTS_MIN_WIDTH,
  OPPONENTS_ROW_BOX,
  OPPONENTS_ROW_FRAME,
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
 * the same the team table draws, so the two pages cannot drift. Four tracks
 * fit beside the open drawer as they are (`opponents-table-layout`), so the
 * table has one set of tracks and nothing slides shut on a row click.
 *
 * An opponent is a CONTAINER row (law 3): it peeks in the drawer rather than
 * travelling, so it carries no chevron. The whole row takes the click and the
 * selected one keeps its wash; the name is the row's one control — a
 * `<button aria-pressed>` — so the selection has somewhere to live for a
 * keyboard and a screen reader. The button has no handler of its own: its
 * click bubbles to the row, so a press is counted once.
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
  onToggle: (key: string, viaKeyboard: boolean) => void;
  /**
   * What the body shows when a chip or filter leaves no rows — a
   * `TableEmptyBody`. It is drawn under the column headers: the card and its
   * labels stay, so an empty cut never swaps the table for a line on the
   * bare page.
   */
  empty?: React.ReactNode;
}) {
  return (
    <section
      aria-label="Opponents"
      className="surface-card overflow-x-auto"
      style={{ padding: OPPONENTS_CARD_PADDING }}
    >
      <div className={OPPONENTS_MIN_WIDTH}>
        <OpponentsTableHeader />
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
}: {
  opponent: PersonalOpponent;
  selected: boolean;
  onToggle: (key: string, viaKeyboard: boolean) => void;
}) {
  return (
    <div
      id={opponentRowId(opponent.key)}
      // `detail` is 0 for a click the keyboard made (Enter/Space on the name).
      onClick={(event) => onToggle(opponent.key, event.detail === 0)}
      className={cn(
        OPPONENTS_ROW_FRAME,
        OPPONENTS_ROW_BOX,
        "cursor-pointer transition-[background-color] duration-200 ease-[var(--ease-primary)] hover:bg-[var(--surface-muted)]",
        selected && "bg-[var(--surface-muted)]",
      )}
      style={OPPONENTS_GRID_COLS}
    >
      {/* Opponent — the name a reader scans for, and the row's one control.
          It truncates bare; the drawer, one click away, states it in full. */}
      <button
        type="button"
        aria-pressed={selected}
        className="min-w-0 cursor-pointer truncate rounded-[var(--radius-cell)] text-left text-[13px] font-medium text-[var(--ink-900)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
      >
        {opponent.name}
      </button>

      <OpponentPlaysCell hand={opponent.hand} backhand={opponent.backhand} />

      <OpponentRecordCell
        wins={opponent.wins}
        losses={opponent.losses}
        form={opponent.form}
      />

      <OpponentLastMatchCell lastMatch={opponent.lastMatch} />
    </div>
  );
}
