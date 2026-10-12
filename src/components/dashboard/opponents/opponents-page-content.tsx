"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Brain } from "lucide-react";
import { useRowSelection } from "@/components/dashboard/schedule/use-row-selection";
import { TableEmptyBody } from "@/components/dashboard/shared/table-empty-body";
import type { PersonalOpponentsData } from "@/lib/data/personal-opponents-server";
import { cn } from "@/lib/utils";
import { OpponentDrawer } from "./opponent-drawer";
import { OpponentsFilterStrip } from "./opponents-filter-strip";
import { OpponentsTable, opponentRowId } from "./opponents-table";
import {
  OPPONENTS_PAGE_COLUMN,
  OPPONENTS_PAGE_FRAME,
  OPPONENTS_PAGE_GAP,
} from "./opponents-table-layout";
import { OpponentsTitleRow } from "./opponents-title-row";
import { OpponentsToolbar } from "./opponents-toolbar";
import {
  applyOpponentCut,
  describeOpponentFilters,
  emptyOpponentCut,
  hasOpponentFilters,
  NO_OPPONENT_FILTERS,
  personalOpponentsSubline,
  RESTING_OPPONENT_CUT,
  type OpponentCut,
} from "./opponents-views";

/**
 * The populated personal Opponents page: title row, toolbar, the table card
 * and the footer line — the one list-page shape (`reference/tables.md`).
 *
 * A client component because it owns two things: the cut (which view chip,
 * which filter, which sort — all applied here, client-side, to the rows the
 * loader already sent) and which opponent is selected.
 *
 * ── The selection ───────────────────────────────────────────────────────────
 * The shared peek-drawer model, `useRowSelection` (`schedule/`): a row click
 * opens the drawer beside the column, so the table reflows; re-clicking the
 * selected row, Esc or the X closes it; ↑/↓ step through `visibleOpponents`;
 * and the choice mirrors into `?opponent=<group key>`. `selectedId` is the
 * row that is washed, `drawerId` the record the drawer is drawing — they part
 * for the 200ms of the slide-out, when nothing is selected and the drawer
 * still needs somebody to show.
 *
 * Esc and the arrows are the hook's window listener, so they work wherever
 * focus is; it stands down for fields, open menus, modal dialogs and this
 * page's toolbar, and tells the drawer's own `role="dialog"` from those by
 * `DRAWER_ATTR`.
 */
export function OpponentsPageContent({
  opponents,
  totals,
  initialSelectedKey = null,
}: Pick<PersonalOpponentsData, "opponents" | "totals"> & {
  /** `?opponent=` from the URL, or null. Ignored unless it names a listed row. */
  initialSelectedKey?: string | null;
}) {
  const [cut, setCut] = useState<OpponentCut>(RESTING_OPPONENT_CUT);

  /**
   * `visibleOpponents` is the table's rows in the order it draws them — after
   * the chip, the filter and the sort. It is the one sequence anything that
   * walks the list (the drawer's ‹ › and ↑↓ stepping, its "n / N" counter)
   * must step through, so read it from here rather than re-deriving it.
   *
   * `inView` is how many the chip alone holds: the filter's "N of M" reads
   * against it, since a filter is a cut of the view it is applied to.
   */
  const { visible: visibleOpponents, inView } = useMemo(
    () => applyOpponentCut(opponents, cut),
    [opponents, cut],
  );
  const visibleKeys = useMemo(
    () => visibleOpponents.map((o) => o.key),
    [visibleOpponents],
  );

  // A deep link is the one case that lands open — and only on a row the
  // resting cut actually lists, which is what `ids` holds on the first render.
  const {
    selectedId,
    drawerId,
    closing,
    openedByKeyboard,
    index,
    total,
    toggle,
    step,
    close,
    finishClose,
  } = useRowSelection({
    ids: visibleKeys,
    initialId: initialSelectedKey,
    param: "opponent",
    rowId: opponentRowId,
    focusTarget: opponentNameButton,
  });

  // Looked up in every opponent, not the visible ones: when a cut hides the
  // selected row the drawer still has its record to draw while it slides out.
  // An opponent gone from the data itself draws nothing, and the hook lets go
  // of the id.
  const drawerOpponent = drawerId
    ? (opponents.find((o) => o.key === drawerId) ?? null)
    : null;

  /**
   * Every chip, filter and sort change comes through here. A cut that no
   * longer lists the selected opponent closes the drawer in the same event —
   * left open, it would describe a row the table is not showing, and ↑/↓
   * would have nowhere to step from. The close comes BEFORE the cut so the
   * drawer is already sliding out when the shorter list arrives, and the hook
   * lets the slide-out finish instead of dropping the drawer on the spot.
   */
  const applyCut = (patch: Partial<OpponentCut>) => {
    const next = { ...cut, ...patch };
    if (
      selectedId &&
      !applyOpponentCut(opponents, next).visible.some(
        (o) => o.key === selectedId,
      )
    ) {
      close(null);
    }
    setCut(next);
  };

  const filtered = hasOpponentFilters(cut.filters);
  const clearFilters = () => applyCut({ filters: NO_OPPONENT_FILTERS });
  const emptyCut = emptyOpponentCut(cut);
  const shown = visibleOpponents.length;

  return (
    <div className={OPPONENTS_PAGE_FRAME}>
      <div className={cn(OPPONENTS_PAGE_COLUMN, OPPONENTS_PAGE_GAP)}>
        <OpponentsTitleRow subline={personalOpponentsSubline(totals)} />
        <OpponentsToolbar
          view={cut.view}
          onViewChange={(view) => applyCut({ view })}
          filters={cut.filters}
          onFiltersChange={(filters) => applyCut({ filters })}
          sort={cut.sort}
          onSortChange={(sort) => applyCut({ sort })}
          resultCount={shown}
          totalCount={inView}
        />

        {filtered ? (
          <OpponentsFilterStrip
            description={describeOpponentFilters(cut.filters)}
            shown={shown}
            inView={inView}
            onClear={clearFilters}
          />
        ) : null}

        {/* A cut that leaves nothing keeps the card and its header row and
            says so in the body; the title row, chips and footer do not move. */}
        <OpponentsTable
          opponents={visibleOpponents}
          selectedKey={selectedId}
          onToggle={toggle}
          empty={
            <TableEmptyBody
              icon={Brain}
              title={emptyCut.title}
              action={{
                label: emptyCut.action.label,
                onClick: () => applyCut(emptyCut.action.undo),
              }}
            />
          }
        />

        <div className="flex items-center gap-2">
          <span className="text-micro tabular">
            {shown} of {totals.opponents}{" "}
            {totals.opponents === 1 ? "opponent" : "opponents"} ·{" "}
            {totals.analyzed} of {totals.matches}{" "}
            {totals.matches === 1 ? "match" : "matches"} analyzed
            {totals.unnamed > 0
              ? ` · ${totals.unnamed} more ${totals.unnamed === 1 ? "match names" : "matches name"} no opponent`
              : null}
          </span>
          <div className="flex-1" />
          <Link
            href="/dashboard/statistics"
            className="rounded-sm text-[11px] font-medium whitespace-nowrap text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
          >
            Open Statistics
          </Link>
        </div>
      </div>

      {/* A sibling of the padded column, so it sits flush to the right edge
          and the column — not the page — gives up the 340px. */}
      {drawerOpponent && (
        <OpponentDrawer
          opponent={drawerOpponent}
          index={Math.max(index, 0)}
          total={Math.max(total, 1)}
          closing={closing}
          autoFocus={openedByKeyboard}
          onPrev={() => step(-1)}
          onNext={() => step(1)}
          onClose={() => close(drawerOpponent.key)}
          onClosed={finishClose}
        />
      )}
    </div>
  );
}

/**
 * Where focus returns when the drawer closes: the name `<button>`, the row's
 * one control — the row `<div>` itself is not focusable.
 */
function opponentNameButton(row: HTMLElement): HTMLElement | null {
  return row.querySelector("button");
}
