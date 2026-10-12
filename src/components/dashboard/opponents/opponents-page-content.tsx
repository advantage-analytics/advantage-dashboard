"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Brain, Filter as FilterIcon } from "lucide-react";
import { DRAWER_ATTR } from "@/components/dashboard/matches/match-drawer";
import { TableEmptyBody } from "@/components/dashboard/shared/table-empty-body";
import type { PersonalOpponent } from "@/lib/data/personal-opponents";
import type { PersonalOpponentsData } from "@/lib/data/personal-opponents-server";
import { cn } from "@/lib/utils";
import { OpponentDrawer } from "./opponent-drawer";
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
 * The roster's model (`team/roster-view.tsx`), on the shared rail: a row click
 * opens the peek drawer beside the column, so the table reflows; re-clicking
 * the selected row, Esc or the X closes it; ↑/↓ step through
 * `visibleOpponents`; and the choice mirrors into `?opponent=<group key>`.
 * `selectedKey` is the row that is washed, `drawerKey` the record the drawer
 * is drawing — they part for the 200ms of the slide-out, when nothing is
 * selected and the drawer still needs somebody to show.
 *
 * Esc and the arrows are a window listener, so they work wherever focus is;
 * it stands down for fields, open menus and modal dialogs, and tells the
 * drawer's own `role="dialog"` from those by `DRAWER_ATTR`.
 */
export function OpponentsPageContent({
  opponents,
  totals,
  initialSelectedKey = null,
}: Pick<PersonalOpponentsData, "opponents" | "totals"> & {
  /** `?opponent=` from the URL, or null. Ignored unless it names a listed row. */
  initialSelectedKey?: string | null;
}) {
  // A deep link is the one case that lands open — and only on a row the
  // resting cut actually lists.
  const landOn = () =>
    initialSelectedKey !== null &&
    applyOpponentCut(opponents, RESTING_OPPONENT_CUT).visible.some(
      (o) => o.key === initialSelectedKey,
    )
      ? initialSelectedKey
      : null;

  const [selectedKey, setSelectedKey] = useState<string | null>(landOn);
  const [drawerKey, setDrawerKey] = useState<string | null>(landOn);
  // Slid shut but still mounted: the drawer holds a record nothing selects.
  const closing = drawerKey !== null && selectedKey === null;
  const [openedByKeyboard, setOpenedByKeyboard] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  // Looked up in every opponent, not the visible ones: when a cut hides the
  // selected row the drawer still has its record to draw while it slides out.
  const drawerOpponent = drawerKey
    ? (opponents.find((o) => o.key === drawerKey) ?? null)
    : null;
  const drawerIndex = visibleOpponents.findIndex((o) => o.key === drawerKey);

  const finishClose = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
    setDrawerKey(null);
  }, []);

  const select = useCallback((key: string, viaKeyboard: boolean) => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
    setSelectedKey(key);
    setDrawerKey(key);
    setOpenedByKeyboard(viaKeyboard);
    syncUrl(key);
  }, []);

  const close = useCallback(
    (returnFocusTo: string | null) => {
      setSelectedKey(null);
      syncUrl(null);
      // `onAnimationEnd` normally finishes this; the timer covers reduced
      // motion, where no animation runs, and is harmless when both fire.
      if (closeTimer.current) clearTimeout(closeTimer.current);
      closeTimer.current = setTimeout(finishClose, 240);
      if (returnFocusTo) {
        document
          .getElementById(opponentRowId(returnFocusTo))
          ?.querySelector("button")
          ?.focus();
      }
    },
    [finishClose],
  );

  const toggle = useCallback(
    (opponent: PersonalOpponent, viaKeyboard: boolean) => {
      if (selectedKey === opponent.key) {
        close(viaKeyboard ? opponent.key : null);
      } else {
        select(opponent.key, viaKeyboard);
      }
    },
    [selectedKey, select, close],
  );

  const step = useCallback(
    (direction: 1 | -1) => {
      if (!selectedKey) return;
      const index = visibleOpponents.findIndex((o) => o.key === selectedKey);
      const next = visibleOpponents[index + direction];
      if (!next) return;
      select(next.key, true);
      document
        .getElementById(opponentRowId(next.key))
        ?.scrollIntoView({ block: "nearest" });
    },
    [visibleOpponents, selectedKey, select],
  );

  /**
   * Every chip, filter and sort change comes through here. A cut that no
   * longer lists the selected opponent closes the drawer in the same event —
   * left open, it would describe a row the table is not showing, and ↑/↓
   * would have nowhere to step from.
   */
  const applyCut = (patch: Partial<OpponentCut>) => {
    const next = { ...cut, ...patch };
    setCut(next);
    if (
      selectedKey &&
      !applyOpponentCut(opponents, next).visible.some(
        (o) => o.key === selectedKey,
      )
    ) {
      close(null);
    }
  };

  // The opponent the drawer showed is gone from the data itself — a refresh
  // after their last match was deleted. Adjusted during render rather than in
  // an effect, so nothing paints a drawer for a record that no longer exists.
  if (drawerKey && !drawerOpponent) {
    setSelectedKey(null);
    setDrawerKey(null);
  }

  useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!selectedKey) return;

    function onKeyDown(event: KeyboardEvent) {
      if (
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      )
        return;
      const target = event.target as HTMLElement | null;
      if (target) {
        if (target.closest("input, textarea, select, [contenteditable=true]"))
          return;
        if (
          target.closest(
            `[role="dialog"]:not([${DRAWER_ATTR}] [role="dialog"])`,
          )
        )
          return;
        if (target.closest("[data-radix-popper-content-wrapper]")) return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        close(selectedKey);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        step(1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        step(-1);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedKey, close, step]);

  const filtered = hasOpponentFilters(cut.filters);
  const clearFilters = () => applyCut({ filters: NO_OPPONENT_FILTERS });
  const emptyCut = emptyOpponentCut(cut);
  const shown = visibleOpponents.length;

  return (
    <div className={OPPONENTS_PAGE_FRAME}>
      <div className={cn(OPPONENTS_PAGE_COLUMN, OPPONENTS_PAGE_GAP)}>
        <OpponentsTitleRow totals={totals} />
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

        {/* The panel closes on apply; this states the cut in words —
            "Left-handed · Two-handed · 3 of 10 · Clear filter". Never chips,
            never a badge (Data Table law 6). */}
        {filtered ? (
          <div
            className="flex flex-wrap items-center gap-2 rounded-[var(--radius-element)] px-3.5 py-2.5"
            style={{ background: "var(--surface-subtle)" }}
          >
            <FilterIcon
              className="size-[13px] shrink-0"
              strokeWidth={1.5}
              style={{ color: "var(--ink-500)" }}
              aria-hidden="true"
            />
            <span className="text-[11px]" style={{ color: "var(--ink-700)" }}>
              {describeOpponentFilters(cut.filters)}
            </span>
            <span
              className="size-[3px] rounded-full"
              style={{ background: "var(--ink-300)" }}
              aria-hidden="true"
            />
            <span className="text-micro tabular">
              {shown} of {inView}
            </span>
            <div className="flex-1" />
            <button
              type="button"
              onClick={clearFilters}
              className="cursor-pointer rounded-sm text-[11px] font-medium whitespace-nowrap text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
            >
              Clear filter
            </button>
          </div>
        ) : null}

        {/* A cut that leaves nothing keeps the card and its header row and
            says so in the body; the title row, chips and footer do not move. */}
        <OpponentsTable
          opponents={visibleOpponents}
          selectedKey={selectedKey}
          onToggle={toggle}
          // Tracks follow the rail: collapsed while a row is selected, and
          // reopening as soon as the slide-out starts.
          compact={selectedKey !== null}
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
          index={Math.max(drawerIndex, 0)}
          total={Math.max(visibleOpponents.length, 1)}
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
 * Mirror the selection into `?opponent=` without a navigation.
 *
 * `history.replaceState` rather than `router.replace`: the App Router treats
 * the latter as a navigation and re-renders from the server, which for a click
 * on a row is a round trip to change one query string. The native call is one
 * the router listens to, so `useSearchParams` elsewhere still sees it.
 */
function syncUrl(key: string | null) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (key) url.searchParams.set("opponent", key);
  else url.searchParams.delete("opponent");
  window.history.replaceState(window.history.state, "", url);
}
