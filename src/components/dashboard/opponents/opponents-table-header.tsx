import { LIST_TRACK_TRANSITION } from "@/components/dashboard/matches/match-list-layout";
import { cn } from "@/lib/utils";
import {
  OPPONENTS_COLUMNS,
  OPPONENTS_GRID_COLS,
  OPPONENTS_ROW_FRAME,
  opponentsGrid,
} from "./opponents-table-layout";

/**
 * The header row of the Opponents table — shared by the table, the skeleton
 * and the day-zero ghost. Only the live table passes `compact`: the skeleton
 * and the ghost never sit beside a drawer, so they keep the resting tracks.
 */
export function OpponentsTableHeader({ compact }: { compact?: boolean }) {
  const grid = compact === undefined ? null : opponentsGrid(compact);
  return (
    <div
      className={cn(
        OPPONENTS_ROW_FRAME,
        "border-b border-[var(--border-hairline)] pt-3.5 pb-2.5",
        grid && [grid.className, LIST_TRACK_TRANSITION],
      )}
      style={grid ? grid.style : OPPONENTS_GRID_COLS}
    >
      {OPPONENTS_COLUMNS.map((label) => (
        <span key={label} className="eyebrow-sm min-w-0 truncate">
          {label}
        </span>
      ))}
    </div>
  );
}
