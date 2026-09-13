import { MatchesToolbarPending } from "@/components/dashboard/loading/list-toolbar-pending";
import { LIST_GRID_COLS, LIST_ROW_FRAME } from "./match-list-layout";

const SKELETON_ROWS = 5;

function Bar({ className }: { className: string }): React.JSX.Element {
  return (
    <div
      className={`max-w-full rounded bg-[var(--surface-skeleton)] motion-safe:animate-pulse ${className}`}
    />
  );
}

/**
 * The populated page's frame with the data blanked — same toolbar, same card,
 * same eight tracks — so nothing moves when the rows arrive.
 */
export function MatchesSkeleton(): React.JSX.Element {
  return (
    <div
      className="flex flex-col gap-6"
      role="status"
      aria-busy="true"
      aria-label="Loading matches"
    >
      <span className="sr-only">Loading matches</span>
      {/* Toolbar skeleton — four view pills left, Filters and the sort right. */}
      <MatchesToolbarPending />

      {/* Table card skeleton — same surface-card frame as the real table. */}
      <div
        aria-hidden="true"
        className="surface-card hidden lg:block"
        style={{ padding: "2px 24px 6px" }}
      >
        <div
          className={`${LIST_ROW_FRAME} border-b border-[var(--border-hairline)] pt-3.5 pb-2.5`}
          style={LIST_GRID_COLS}
        >
          {["Date", "Opponent", "Event", "Score", "Result"].map((label) => (
            <span key={label} className="eyebrow-sm min-w-0 truncate">
              {label}
            </span>
          ))}
          <span />
          <span />
          <span />
        </div>
        <div>
          {Array.from({ length: SKELETON_ROWS }).map((_, row) => (
            <div
              key={row}
              className={`${LIST_ROW_FRAME} h-[52px]`}
              style={LIST_GRID_COLS}
            >
              <Bar className="h-3 w-11" />
              <span className="flex min-w-0 items-center gap-2.5">
                <Bar className="size-[26px] shrink-0 rounded-full" />
                <Bar className="h-3 w-28" />
              </span>
              <Bar className="h-3 w-36" />
              <Bar className="h-3 w-20" />
              <Bar className="size-3.5 rounded-full" />
              <span />
              <span />
              <span />
            </div>
          ))}
        </div>
      </div>

      <div
        aria-hidden="true"
        className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:hidden"
      >
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="surface-card p-5">
            <div className="mb-3 flex justify-between">
              <Bar className="h-3 w-32" />
              <Bar className="h-3 w-16" />
            </div>
            <div className="mb-1 h-3" />
            {[0, 1].map((row) => (
              <div
                key={row}
                className="flex items-center justify-between px-3 py-2.5"
              >
                <Bar className="h-4 w-28" />
                <Bar className="h-4 w-20" />
              </div>
            ))}
            <div className="mt-3 border-t border-[var(--border-hairline)] pt-3">
              <Bar className="h-3 w-36" />
            </div>
          </div>
        ))}
      </div>

      {/* Footer skeleton — the range on the left, the quiet paging link right. */}
      <div className="flex items-center justify-between">
        <Bar className="h-2.5 w-14" />
        <Bar className="h-2.5 w-20" />
      </div>
    </div>
  );
}
