import {
  PendingBar,
  PendingRegion,
} from "@/components/dashboard/loading/pending";
import { cn } from "@/lib/utils";
import {
  OPPONENTS_CARD_PADDING,
  OPPONENTS_GRID_COLS,
  OPPONENTS_MIN_WIDTH,
  OPPONENTS_PAGE_COLUMN,
  OPPONENTS_PAGE_FRAME,
  OPPONENTS_PAGE_GAP,
  OPPONENTS_ROW_BOX,
  OPPONENTS_ROW_FRAME,
  TEAM_OPPONENTS_GRID_COLS,
  TEAM_OPPONENTS_MIN_WIDTH,
  type OpponentsScope,
} from "./opponents-table-layout";
import { OpponentsTableHeader } from "./opponents-table-header";
import { OpponentsToolbarStatic } from "./opponents-toolbar";

/**
 * How many rows to hold open before anything has been counted. The opponent
 * count is only known once the matches have been read and grouped, which is
 * the read this skeleton is waiting on.
 */
const PENDING_ROWS = 5;

/**
 * The populated page's frame with the data blanked — the `Suspense` fallback
 * for either Opponents page (`scope`), so nothing moves when the rows arrive.
 *
 * What the page already knows renders as itself: the "Opponents" h1, the
 * toolbar at rest, and the column labels — eight on the personal table, six
 * on the team one. Only what is arriving is a
 * bar, and every bar is a `PendingBar` inside the one `PendingRegion`.
 *
 * The h1 sits OUTSIDE the region on purpose. `PendingRegion` hides its
 * contents from assistive technology, and a page whose only heading is hidden
 * has not told a screen reader where it landed.
 */
export function OpponentsSkeleton({
  scope = "personal",
}: {
  scope?: OpponentsScope;
}) {
  const team = scope === "team";
  return (
    <div className={OPPONENTS_PAGE_FRAME}>
      <div className={cn(OPPONENTS_PAGE_COLUMN, OPPONENTS_PAGE_GAP)}>
        {/* Title row — `OpponentsTitleRow`'s geometry: h1, then the 18px
            subline 9px under it. The date fades in with the real row. */}
        <div className="flex items-end gap-2.5">
          <div>
            <h1 className="text-display">Opponents</h1>
            <div className="mt-[9px] flex h-[18px] items-center">
              <PendingBar className="h-3 w-52 rounded" />
            </div>
          </div>
        </div>

        <PendingRegion
          label="opponents"
          innerClassName={cn("flex flex-col", OPPONENTS_PAGE_GAP)}
        >
          <OpponentsToolbarStatic />

          {/* The table's own card: same inset, same tracks, same row box. */}
          <div
            className="surface-card overflow-x-auto"
            style={{ padding: OPPONENTS_CARD_PADDING }}
          >
            <div
              className={team ? TEAM_OPPONENTS_MIN_WIDTH : OPPONENTS_MIN_WIDTH}
            >
              <OpponentsTableHeader scope={scope} />
              <div>
                {Array.from({ length: PENDING_ROWS }, (_, row) => (
                  <div
                    key={row}
                    className={cn(OPPONENTS_ROW_FRAME, OPPONENTS_ROW_BOX)}
                    style={
                      team ? TEAM_OPPONENTS_GRID_COLS : OPPONENTS_GRID_COLS
                    }
                  >
                    {team ? <TeamPendingCells /> : <PersonalPendingCells />}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Footer — the count line at the micro line's 15px, and the link. */}
          <div className="flex h-[15px] items-center gap-2">
            <PendingBar className="h-2.5 w-64" />
            <div className="flex-1" />
            <PendingBar className="h-2.5 w-[84px]" />
          </div>
        </PendingRegion>
      </div>
    </div>
  );
}

/** Opponent · Hand · Backhand · Record · Form · Last match · Result · Score. */
function PersonalPendingCells() {
  return (
    <>
      <PendingBar className="h-3 w-32" />
      <PendingBar className="h-3 w-[72px]" />
      <PendingBar className="h-3 w-[68px]" />
      <PendingBar className="h-3 w-7" />
      <PendingBar className="h-3 w-[25px]" />
      <PendingBar className="h-3 w-11" />
      <PendingBar className="size-3.5 rounded-full" />
      <PendingBar className="h-3 w-20" />
    </>
  );
}

/**
 * Opponent · Program · Faced by · Plays · Record · Last match — each cell at
 * the footprint its real content takes: the 26px crest and a name, one 26px
 * face and a first name, the record beside its ticks, the date, mark and
 * score on one line.
 */
function TeamPendingCells() {
  return (
    <>
      <PendingBar className="h-3 w-32" />
      <span className="flex items-center gap-2.5">
        <PendingBar className="size-[26px] rounded-[8px]" />
        <PendingBar className="h-3 w-20" />
      </span>
      <span className="flex items-center gap-2">
        <PendingBar className="size-[26px] rounded-full" />
        <PendingBar className="h-3 w-10" />
      </span>
      <PendingBar className="h-3 w-[104px]" />
      <span className="flex items-center gap-2.5">
        <PendingBar className="h-3 w-[26px]" />
        <PendingBar className="h-3 w-[25px]" />
      </span>
      <span className="flex items-center gap-2.5">
        <PendingBar className="h-3 w-11" />
        <PendingBar className="size-3.5 rounded-full" />
        <PendingBar className="h-3 w-20" />
      </span>
    </>
  );
}
