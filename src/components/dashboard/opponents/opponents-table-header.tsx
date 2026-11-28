import { LIST_TRACK_TRANSITION } from "@/components/dashboard/matches/match-list-layout";
import { cn } from "@/lib/utils";
import {
  OPPONENTS_COLUMNS,
  OPPONENTS_GRID_COLS,
  OPPONENTS_ROW_FRAME,
  personalOpponentsGrid,
  TEAM_OPPONENTS_COLUMNS,
  TEAM_OPPONENTS_GRID_COLS,
  teamOpponentsGrid,
} from "./opponents-table-layout";

/**
 * The header row of an Opponents table — shared by the table, the skeleton
 * and the day-zero ghost, on either page (`scope`).
 *
 * Only the live tables pass `compact`, the drawer being open beside them; the
 * skeletons and ghosts never sit beside a drawer and keep the resting tracks.
 */
export function OpponentsTableHeader(props: {
  scope?: "personal" | "team";
  compact?: boolean;
}) {
  const team = props.scope === "team";
  const grid =
    props.compact === undefined
      ? null
      : team
        ? teamOpponentsGrid(props.compact)
        : personalOpponentsGrid(props.compact);
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
