import { LIST_GRID_COLS, LIST_ROW_FRAME } from "./match-card-list";

const SKELETON_ROWS = 5;

function Bar({ className }: { className: string }): React.JSX.Element {
  return <div className={`animate-pulse rounded bg-[var(--surface-skeleton)] ${className}`} />;
}

/**
 * The populated page's frame with the data blanked — same toolbar, same card,
 * same seven tracks — so nothing moves when the rows arrive.
 */
export function MatchesSkeleton(): React.JSX.Element {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading matches">
      {/* Toolbar skeleton — four view pills left, Filters and the sort right. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Bar key={i} className="h-[26px] w-20 rounded-full" />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Bar className="h-7 w-[72px] rounded-[var(--radius-element)]" />
          <Bar className="h-7 w-24 rounded-[var(--radius-element)]" />
        </div>
      </div>

      {/* Table card skeleton — same surface-card frame as the real table. */}
      <div className="surface-card" style={{ padding: "8px 24px 12px" }}>
        <div
          className={`${LIST_ROW_FRAME} border-b border-[var(--border-hairline)] pb-2 pt-3`}
          style={LIST_GRID_COLS}
        >
          <Bar className="h-2.5 w-8" />
          <Bar className="h-2.5 w-16" />
          <Bar className="h-2.5 w-12" />
          <Bar className="h-2.5 w-14" />
          <Bar className="h-2.5 w-10 justify-self-end" />
          <Bar className="h-2.5 w-11 justify-self-end" />
          <span />
        </div>
        <div className="pt-1">
          {Array.from({ length: SKELETON_ROWS }).map((_, row) => (
            <div key={row} className={`${LIST_ROW_FRAME} h-[52px]`} style={LIST_GRID_COLS}>
              <Bar className="h-3 w-11" />
              <Bar className="h-3 w-28" />
              <Bar className="h-3 w-32" />
              <Bar className="h-3 w-20" />
              <Bar className="h-3 w-20 justify-self-end" />
              <Bar className="h-2.5 w-8 justify-self-end" />
              <span />
            </div>
          ))}
        </div>
      </div>

      {/* Footer skeleton — the range on the left, the quiet paging link right. */}
      <div className="flex items-center justify-between">
        <Bar className="h-2.5 w-14" />
        <Bar className="h-2.5 w-20" />
      </div>
    </div>
  );
}
