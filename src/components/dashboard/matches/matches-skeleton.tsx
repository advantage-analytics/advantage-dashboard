import { MatchesToolbarPending } from "@/components/dashboard/loading/list-toolbar-pending";
import {
  PendingBar,
  PendingRegion,
} from "@/components/dashboard/loading/pending";
import { cn } from "@/lib/utils";
import {
  DATE_COL,
  DATE_COL_WITH_YEAR,
  LIST_MIN_WIDTH,
  LIST_ROW_FRAME,
  TEAM_LIST_MIN_WIDTH,
  listColumnLabels,
  listGridCols,
  type MatchesListShape,
} from "./match-list-layout";

/** Before anything has been counted: the list's shape the first time it is met. */
const UNKNOWN_SHAPE: MatchesListShape = {
  rows: 5,
  needsYear: false,
  paged: false,
};

/**
 * The populated page's frame with the data blanked — same toolbar, same card,
 * the scope's own tracks, the first page's row count, Date track and footer —
 * so nothing moves when the rows arrive. The team table carries a Player
 * column the personal one does not.
 */
export function MatchesSkeleton({
  scope = "personal",
  shape = UNKNOWN_SHAPE,
}: {
  scope?: "personal" | "team";
  shape?: MatchesListShape;
}): React.JSX.Element {
  const isTeam = scope === "team";
  const cols = listGridCols(scope);
  const cardStyle = {
    padding: "2px 24px 6px",
    "--date-col": shape.needsYear ? DATE_COL_WITH_YEAR : DATE_COL,
  } as React.CSSProperties;
  return (
    <PendingRegion label="matches" innerClassName="flex flex-col gap-[18px]">
      {/* Toolbar skeleton — four view pills left, Filters and the sort right. */}
      <MatchesToolbarPending />

      {/* Table card skeleton — same surface-card frame as the real table. */}
      <div
        aria-hidden="true"
        className="surface-card hidden overflow-x-auto lg:block"
        style={cardStyle}
      >
        <div className={isTeam ? TEAM_LIST_MIN_WIDTH : LIST_MIN_WIDTH}>
          <div
            className={cn(
              LIST_ROW_FRAME,
              "border-b border-[var(--border-hairline)] pt-3.5 pb-2.5",
            )}
            style={cols}
          >
            {listColumnLabels(scope).map((label, i) => (
              <span
                key={label || `col-${i}`}
                className="eyebrow-sm min-w-0 truncate"
              >
                {label}
              </span>
            ))}
          </div>
          <div>
            {Array.from({ length: shape.rows }, (_, row) => (
              <div
                key={row}
                className={cn(LIST_ROW_FRAME, "h-[52px]")}
                style={cols}
              >
                <PendingBar className="h-3 w-11" />
                {isTeam && (
                  <span className="flex min-w-0 items-center gap-2.5">
                    <PendingBar className="size-[26px] shrink-0 rounded-full" />
                    <PendingBar className="h-3 w-24" />
                  </span>
                )}
                <PendingBar className={isTeam ? "h-3 w-20" : "h-3 w-28"} />
                <PendingBar className="size-3.5 rounded-full" />
                <PendingBar className="h-3 w-20" />
                <PendingBar className="h-3 w-36" />
                <span />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div
        aria-hidden="true"
        className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:hidden"
      >
        {Array.from({ length: shape.rows }, (_, i) => (
          <div key={i} className="surface-card p-5">
            <div className="mb-3 flex justify-between">
              <PendingBar className="h-3 w-32" />
              <PendingBar className="h-3 w-16" />
            </div>
            <div className="mb-1 h-3" />
            {[0, 1].map((row) => (
              <div
                key={row}
                className="flex items-center justify-between px-3 py-2.5"
              >
                <PendingBar className="h-4 w-28" />
                <PendingBar className="h-4 w-20" />
              </div>
            ))}
            <div className="mt-3 border-t border-[var(--border-hairline)] pt-3">
              <PendingBar className="h-3 w-36" />
            </div>
          </div>
        ))}
      </div>

      {/* Footer skeleton — the range on the left at the micro line's 15px, and
          the quiet paging link (a 17px button) only when a second page exists. */}
      <div
        aria-hidden="true"
        className={cn(
          "flex items-center gap-2",
          shape.paged ? "h-[17px]" : "h-[15px]",
        )}
      >
        <PendingBar className="h-2.5 w-11" />
        {shape.paged && (
          <>
            <div className="flex-1" />
            <PendingBar className="h-2.5 w-[72px]" />
          </>
        )}
      </div>
    </PendingRegion>
  );
}
