import { LIST_TRACK_TRANSITION } from "@/components/dashboard/matches/match-list-layout";
import { cn } from "@/lib/utils";
import {
  OPPONENTS_COLUMNS,
  OPPONENTS_GRID_COLS,
  OPPONENTS_ROW_FRAME,
  TEAM_OPPONENTS_COLUMNS,
  TEAM_OPPONENTS_GRID_COLS,
  opponentsGrid,
  teamOpponentsGrid,
  type OpponentsScope,
} from "./opponents-table-layout";

/**
 * The header row of an Opponents table — shared by the table, the skeleton
 * and the day-zero ghost, on either page (`scope`). Only the live table passes
 * `compact`: the skeleton and the ghost never sit beside a drawer, so they
 * keep the resting tracks.
 */
export function OpponentsTableHeader({
  compact,
  scope = "personal",
}: {
  compact?: boolean;
  scope?: OpponentsScope;
}) {
  const team = scope === "team";
  const grid =
    compact === undefined
      ? null
      : team
        ? teamOpponentsGrid(compact)
        : opponentsGrid(compact);
  const resting = team ? TEAM_OPPONENTS_GRID_COLS : OPPONENTS_GRID_COLS;
  const columns = team ? TEAM_OPPONENTS_COLUMNS : OPPONENTS_COLUMNS;
  return (
    <div
      className={cn(
        OPPONENTS_ROW_FRAME,
        "border-b border-[var(--border-hairline)] pt-3.5 pb-2.5",
        grid && [grid.className, LIST_TRACK_TRANSITION],
      )}
      style={grid ? grid.style : resting}
    >
      {columns.map((label) => (
        <span key={label} className="eyebrow-sm min-w-0 truncate">
          {label}
        </span>
      ))}
    </div>
  );
}
