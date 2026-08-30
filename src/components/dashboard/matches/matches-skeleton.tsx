import { LIST_GRID_COLS, LIST_ROW_FRAME } from "./match-card-list";

const SKELETON_ROWS = 5;
const SKELETON_COLS = 6;

function Bar({ className }: { className: string }): React.JSX.Element {
  return <div className={`animate-pulse rounded bg-[var(--surface-skeleton)] ${className}`} />;
}

export function MatchesSkeleton(): React.JSX.Element {
  return (
    <div aria-busy="true" aria-label="Loading matches">
      {/* Toolbar skeleton — lifecycle pills left, quiet controls right. */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Bar key={i} className="h-[26px] w-24 rounded-full" />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Bar className="h-7 w-20 rounded-[var(--radius-element)]" />
          <Bar className="h-7 w-24 rounded-[var(--radius-element)]" />
          <Bar className="h-7 w-24 rounded-[var(--radius-element)]" />
        </div>
      </div>

      {/* Table card skeleton — same surface-card frame as the real table. */}
      <div className="surface-card" style={{ padding: "8px 24px 12px" }}>
        <div
          className={`${LIST_ROW_FRAME} border-b border-[var(--border-hairline)] pb-2 pt-3`}
          style={LIST_GRID_COLS}
        >
          {Array.from({ length: SKELETON_COLS }).map((_, i) => (
            <Bar key={i} className="h-2.5 w-12" />
          ))}
        </div>
        <div className="pt-1">
          {Array.from({ length: SKELETON_ROWS }).map((_, row) => (
            <div key={row} className={`${LIST_ROW_FRAME} h-[52px]`} style={LIST_GRID_COLS}>
              <Bar className="h-5 w-11 rounded-full" />
              <Bar className="h-3 w-28" />
              <Bar className="h-3 w-20" />
              <Bar className="h-3 w-28" />
              <Bar className="h-3 w-16" />
              <Bar className="h-3 w-12" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
