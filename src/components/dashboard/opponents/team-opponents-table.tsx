import { LIST_TRACK_TRANSITION } from "@/components/dashboard/matches/match-list-layout";
import { ProgramCrest } from "@/components/dashboard/settings/teams/program-crest";
import { EmptyMark } from "@/components/ui/empty-mark";
import type { TeamOpponent } from "@/lib/data/team-opponents";
import { cn } from "@/lib/utils";
import { FacedByStack } from "./faced-by-stack";
import {
  OpponentLastMatchCell,
  OpponentNameCell,
  OpponentPlaysCell,
  OpponentRecordCell,
} from "./opponent-cells";
import { opponentFormBars } from "./opponent-form-links";
import { opponentRowId } from "./opponents-table";
import { OpponentsTableHeader } from "./opponents-table-header";
import {
  OPPONENTS_CARD_PADDING,
  OPPONENTS_ROW_BOX,
  OPPONENTS_ROW_FRAME,
  opponentRowControl,
  opponentRowWash,
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
 * row (law 3), so it peeks in the drawer; the whole row takes the click, the
 * selected one keeps its wash, and it is focusable, with Enter or Space opening
 * it. The links inside it travel and stop their own clicks. A form bar's
 * readout also names which of ours played that match.
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
   * one. `viaKeyboard` is true for Enter/Space on the row.
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
      <OpponentNameCell name={opponent.name} />

      <ProgramCell
        program={opponent.program}
        school={opponent.school}
        unattached={opponent.unattached}
      />

      {/* Faced by — clipped to its track, so a long first name truncates. */}
      <span className="flex min-w-0 items-center">
        <FacedByStack players={opponent.facedBy} />
      </span>

      <OpponentPlaysCell hand={opponent.hand} backhand={opponent.backhand} />

      <OpponentRecordCell
        wins={opponent.wins}
        losses={opponent.losses}
        bars={opponentFormBars(
          opponent.form,
          opponent.recent,
          (match) =>
            opponent.facedBy.find(
              (player) => player.playerId === match.rosterPlayerId,
            )?.name ?? null,
        )}
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
  unattached,
}: Pick<TeamOpponent, "program" | "school" | "unattached">) {
  const name = program?.schoolName ?? school;
  // An answer, not a gap: the word, with no crest and no dash.
  if (!name && unattached) {
    return (
      <span className="min-w-0 truncate text-[12px] text-[var(--ink-600)]">
        Unattached
      </span>
    );
  }
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
