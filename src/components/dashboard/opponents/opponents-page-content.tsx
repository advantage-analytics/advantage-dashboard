"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Brain, Filter as FilterIcon } from "lucide-react";
import { TableEmptyBody } from "@/components/dashboard/shared/table-empty-body";
import type { PersonalOpponentsData } from "@/lib/data/personal-opponents-server";
import { cn } from "@/lib/utils";
import { OpponentsTable } from "./opponents-table";
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
 * loader already sent) and which opponent is selected. Nothing sets the
 * selection yet — the row click and the drawer it opens arrive together — but
 * the state lives here already so the table reads it from one place and the
 * drawer can sit beside the column without the page being re-cut.
 */
export function OpponentsPageContent({
  opponents,
  totals,
}: Pick<PersonalOpponentsData, "opponents" | "totals">) {
  const [selectedKey] = useState<string | null>(null);
  const [cut, setCut] = useState<OpponentCut>(RESTING_OPPONENT_CUT);
  const applyCut = (patch: Partial<OpponentCut>) =>
    setCut((current) => ({ ...current, ...patch }));

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
    </div>
  );
}
