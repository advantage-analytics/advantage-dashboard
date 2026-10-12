import { LIST_TRACK_TRANSITION } from "@/components/dashboard/matches/match-list-layout";
import { cn } from "@/lib/utils";
import {
  OPPONENTS_COLUMNS,
  OPPONENTS_GRID_COLS,
  OPPONENTS_ROW_FRAME,
  TEAM_OPPONENTS_COLUMNS,
  TEAM_OPPONENTS_GRID_COLS,
  teamOpponentsGrid,
} from "./opponents-table-layout";

/**
 * The header row of an Opponents table — shared by the table, the skeleton
 * and the day-zero ghost, on either page (`scope`).
 *
 * The personal table has one set of tracks, so its header takes nothing else.
 * Only the live TEAM table passes `compact`, the drawer being open beside
 * it; the team skeleton and ghost never sit beside a drawer and keep the
 * resting tracks.
 */
export function OpponentsTableHeader(
  props: { scope?: "personal" } | { scope: "team"; compact?: boolean },
) {
  const team = props.scope === "team";
  const grid =
    props.scope === "team" && props.compact !== undefined
      ? teamOpponentsGrid(props.compact)
      : null;
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
