import { LIST_TRACK_TRANSITION } from "@/components/dashboard/matches/match-list-layout";
import { ProgramCrest } from "@/components/dashboard/settings/teams/program-crest";
import { EmptyMark } from "@/components/ui/empty-mark";
import type { TeamOpponent } from "@/lib/data/team-opponents";
import { cn } from "@/lib/utils";
import { FacedByStack } from "./faced-by-stack";
import {
  OpponentLastMatchCell,
  OpponentPlaysCell,
  OpponentRecordCell,
} from "./opponent-cells";
import { opponentRowId } from "./opponents-table";
import { OpponentsTableHeader } from "./opponents-table-header";
import {
  OPPONENTS_CARD_PADDING,
  OPPONENTS_ROW_BOX,
  OPPONENTS_ROW_FRAME,
  TEAM_OPPONENTS_MIN_WIDTH,
  TEAM_OPPONENTS_MIN_WIDTH_COMPACT,
  teamOpponentsGrid,
} from "./opponents-table-layout";

/**
 * The team Opponents table: one card, six tracks, a 52px row per opponent
 * player the program has faced (`reference/tables.md` law 9 — a hairline under
 * the header only, none between rows, the hover wash as the row's boundary).
 *
 * Opponent · Program · Faced by · Plays · Record · Last match
 *
 * The row behaves exactly as the personal table's: an opponent is a CONTAINER
 * row (law 3), so it peeks in the drawer and carries no chevron; the whole row
 * takes the click, the selected one keeps its wash, and the name is the row's
 * one control — a `<button aria-pressed>` with no handler of its own, whose
 * click bubbles to the row so a press is counted once. It is also the first
 * `button` in the row, which is where the page returns focus on close.
 *
 * Beside the open drawer (`compact`) Program and Plays slide shut; the drawer
 * states both under the name. Their cells stay in the DOM — the six tracks
 * are what lets the browser interpolate the shift — and are clipped by their
 * own `min-w-0 overflow-hidden` at zero width.
 */
export function TeamOpponentsTable({
  opponents,
  selectedKey,
  onToggle,
  empty,
  compact = false,
}: {
  /** The rows to draw, already chipped, filtered and sorted by the page. */
  opponents: readonly TeamOpponent[];
  /** `TeamOpponent.key` of the row the drawer is showing, if any. */
  selectedKey: string | null;
  /**
   * A row was pressed: open its drawer, or close it when it is the selected
   * one. `viaKeyboard` is true for Enter/Space on the name.
   */
  onToggle: (key: string, viaKeyboard: boolean) => void;
  /**
   * What the body shows when a chip or filter leaves no rows — a
   * `TableEmptyBody`, drawn under the column headers so an empty cut never
   * swaps the table for a line on the bare page.
   */
  empty?: React.ReactNode;
  /** The drawer is open beside the table: Program and Plays collapse. */
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
          compact ? TEAM_OPPONENTS_MIN_WIDTH_COMPACT : TEAM_OPPONENTS_MIN_WIDTH,
          LIST_TRACK_TRANSITION,
        )}
      >
        <OpponentsTableHeader scope="team" compact={compact} />
        {opponents.length === 0 ? (
          empty
        ) : (
          <div>
            {opponents.map((opponent) => (
              <TeamOpponentRow
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

function TeamOpponentRow({
  opponent,
  selected,
  onToggle,
  compact,
}: {
  opponent: TeamOpponent;
  selected: boolean;
  compact: boolean;
  onToggle: (key: string, viaKeyboard: boolean) => void;
}) {
  const grid = teamOpponentsGrid(compact);

  return (
    <div
      id={opponentRowId(opponent.key)}
      // `detail` is 0 for a click the keyboard made (Enter/Space on the name).
      onClick={(event) => onToggle(opponent.key, event.detail === 0)}
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

      <ProgramCell program={opponent.program} school={opponent.school} />

      {/* Faced by — clipped to its track, so a long first name truncates. */}
      <span className="flex min-w-0 items-center">
        <FacedByStack players={opponent.facedBy} />
      </span>

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

/**
 * Program — the 26px crest and the school's name on one line; the name
 * truncates bare, with no tooltip and no `title` (the drawer states it in
 * full).
 *
 * Three cases, not two. A directory program draws its crest, or its short
 * code on the grey tile. A school somebody typed that is not in the directory
 * is still where the opponent plays: it draws the same tile from the typed
 * name's initials — it has no short code and no crest to offer — beside the
 * name as typed. Only an opponent with neither draws the dash.
 */
function ProgramCell({
  program,
  school,
}: Pick<TeamOpponent, "program" | "school">) {
  const name = program?.schoolName ?? school;
  if (!name) {
    return (
      <span className="min-w-0 overflow-hidden">
        <EmptyMark label="No team" />
      </span>
    );
  }
  return (
    <span className="flex min-w-0 items-center gap-2.5 overflow-hidden">
      <ProgramCrest
        name={name}
        crestUrl={program?.crestUrl ?? null}
        shortCode={program?.shortCode ?? null}
        size={26}
      />
      <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--ink-600)]">
        {name}
      </span>
    </span>
  );
}
