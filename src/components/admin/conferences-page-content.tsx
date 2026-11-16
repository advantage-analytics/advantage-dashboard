"use client";

import { useCallback, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { AdminPage } from "@/components/admin/admin-page";
import {
  CountPills,
  FilterDivider,
  FilterMenuPill,
  PillSearch,
} from "@/components/admin/admin-cells";
import {
  ConferencesTable,
  ConferencesTableSkeleton,
} from "@/components/admin/conferences-table";
import { InertButton } from "@/components/admin/inert-button";
import { PendingBar } from "@/components/dashboard/loading/pending";
import { AddConferenceDialog } from "@/components/admin/add-conference-dialog";
import { SortTrigger } from "@/components/dashboard/shared/list-toolbar-trigger";
import { FloatMenu, FloatMenuItem } from "@/components/ui/float-menu";
// The client-safe half of the data layer — `admin-conferences-server.ts`
// imports the Supabase server client at top level and must not reach this
// bundle.
import {
  applyConferenceView,
  matchesConferenceSearch,
  sortConferences,
} from "@/lib/data/admin-conferences-view";
import type {
  AdminConferenceRow,
  AdminConferencesSort,
  AdminConferencesView,
} from "@/lib/data/admin-conferences-view";
import { DIVISION_VALUES, divisionLabel } from "@/lib/data/programs-server";
import { advButton } from "@/lib/ui/adv-button";

/**
 * Admin › Conferences, the whole page — title slot, views and toolbar, and
 * the table. A row is a record row: it navigates to the conference's own page
 * (`/admin/conferences/[id]`), which holds everything about one conference —
 * crest, details, Merge, Delete, its teams and Add team. Nothing here selects.
 *
 * ## The cut
 *
 * `teams-page-content.tsx`'s `pushCut`: view, sort and division are URL state
 * pushed with `router.push`, defaults kept out of the address. The search
 * pill is local state — typing is not a navigation — and narrows on name,
 * short name or label. View pill counts are taken after the division and the
 * search, so each says what pressing it would show.
 *
 * ## Load all, render 50
 *
 * The directory holds ~137 conferences, so the server hands over every row and
 * the view, sort and division are applied here. The table draws the first 50;
 * "Show all" is local state (not a cursor, not the URL) and resets whenever
 * the cut changes.
 *
 * "Add conference" lands on the new conference's page once it exists.
 */

const VIEW_OPTIONS: { value: AdminConferencesView; label: string }[] = [
  { value: "all", label: "All" },
  { value: "on_advantage", label: "With teams on Advantage" },
  { value: "missing", label: "Missing details" },
];

const SORT_OPTIONS: { value: AdminConferencesSort; label: string }[] = [
  { value: "most_teams", label: "Most teams" },
  { value: "name_asc", label: "Name A–Z" },
];

/** The Division menu's unfiltered option — never a real division value. */
const ANY_DIVISION = "all";

/** Rows drawn before "Show all". */
const PAGE_SIZE = 50;

const count = (value: number) => value.toLocaleString("en-US");

export function ConferencesPageContent({
  rows,
  unplaced,
  view,
  sort,
  division,
}: {
  rows: AdminConferenceRow[];
  /** Programs with no conference at all. */
  unplaced: number;
  view: AdminConferencesView;
  sort: AdminConferencesSort;
  /** Raw division value (`'D1'`), or null for any. */
  division: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const [query, setQuery] = useState("");

  // Division and search first — the pills count over what they leave.
  const narrowed = useMemo(
    () =>
      rows.filter(
        (row) =>
          (!division || row.division === division) &&
          matchesConferenceSearch(row, query),
      ),
    [rows, division, query],
  );
  const visible = useMemo(
    () => sortConferences(applyConferenceView(narrowed, view), sort),
    [narrowed, view, sort],
  );
  const viewOptions = useMemo(
    () =>
      VIEW_OPTIONS.map((option) => ({
        ...option,
        count: applyConferenceView(narrowed, option.value).length,
      })),
    [narrowed],
  );

  // "Show all" belongs to the cut it was pressed on. Keyed rather than reset
  // in an effect, so a new cut never paints the long list for a frame.
  const cutKey = `${view}|${sort}|${division ?? ""}|${query.trim()}`;
  const [expandedFor, setExpandedFor] = useState<string | null>(null);
  const expanded = expandedFor === cutKey;
  const shown = useMemo(
    () => (expanded ? visible : visible.slice(0, PAGE_SIZE)),
    [expanded, visible],
  );

  const [sortOpen, setSortOpen] = useState(false);
  const [adding, setAdding] = useState(false);

  const pushCut = useCallback(
    (
      next: Partial<{
        view: AdminConferencesView;
        sort: AdminConferencesSort;
        division: string | null;
      }>,
    ) => {
      const merged = { view, sort, division, ...next };
      const params = new URLSearchParams();
      // Defaults stay out of the URL — a first visit and a deliberate reset
      // should produce the same address.
      if (merged.view !== "all") params.set("view", merged.view);
      if (merged.sort !== "most_teams") params.set("sort", merged.sort);
      if (merged.division) params.set("division", merged.division);
      const query = params.toString();
      router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [division, pathname, router, sort, view],
  );

  const clearFilter = useCallback(() => pushCut({ division: null }), [pushCut]);

  /* ── Title slot numbers ───────────────────────────────────────────────── */

  // `teams` counts every program pointing at a conference, so the sum is the
  // programs placed in one; `unplaced` is the programs with no conference.
  const placed = rows.reduce((sum, row) => sum + row.teams, 0);
  const summary = [
    `${count(rows.length)} ${rows.length === 1 ? "conference" : "conferences"}`,
    `${count(placed)} ${placed === 1 ? "team" : "teams"} placed`,
    `${count(unplaced)} with none`,
  ].join(" · ");

  const truncated = !expanded && visible.length > shown.length;

  return (
    <AdminPage className="gap-4">
      {/* Title slot — the page's one primary sits here. */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-display">Conferences</h1>
          <p className="text-body-sm mt-[9px] tabular-nums">{summary}</p>
        </div>
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={adding}
          className={advButton("primary", "md")}
          onClick={() => setAdding(true)}
        >
          <Plus className="size-3.5" strokeWidth={1.5} aria-hidden />
          Add conference
        </button>
      </div>

      {/* Search, views, a divider, then the division menu. */}
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <PillSearch
          value={query}
          onChange={setQuery}
          placeholder="Conference"
          label="Search conferences"
        />
        <CountPills
          options={viewOptions}
          value={view}
          onChange={(next) => pushCut({ view: next })}
        />
        <FilterDivider />
        <FilterMenuPill<string>
          label="Division"
          width={196}
          options={[
            { value: ANY_DIVISION, label: "All" },
            ...DIVISION_VALUES.map((value) => ({
              value: value as string,
              label: divisionLabel(value) ?? value,
            })),
          ]}
          value={division ?? ANY_DIVISION}
          onChange={(next) =>
            pushCut({ division: next === ANY_DIVISION ? null : next })
          }
        />
        <div className="flex-1" />

        <FloatMenu
          open={sortOpen}
          onOpenChange={setSortOpen}
          label="Sort conferences"
          width={196}
          trigger={
            <SortTrigger aria-expanded={sortOpen} engaged={sortOpen}>
              {SORT_OPTIONS.find((o) => o.value === sort)?.label}
            </SortTrigger>
          }
        >
          {SORT_OPTIONS.map((option) => (
            <FloatMenuItem
              key={option.value}
              label={option.label}
              chosen={option.value === sort}
              onSelect={() => {
                setSortOpen(false);
                pushCut({ sort: option.value });
              }}
            />
          ))}
        </FloatMenu>
      </div>

      <ConferencesTable
        rows={shown}
        emptyTitle={
          query.trim()
            ? "No conferences match that search"
            : division
              ? "No conferences fit this filter"
              : "No conferences in this view"
        }
        emptyAction={
          query.trim()
            ? { label: "Clear search", onClick: () => setQuery("") }
            : division
              ? { label: "Clear filter", onClick: clearFilter }
              : view !== "all"
                ? {
                    label: "Show every conference",
                    onClick: () => pushCut({ view: "all" }),
                  }
                : undefined
        }
      />

      {truncated && (
        <div className="flex items-center gap-2 text-[12px] whitespace-nowrap text-[var(--ink-600)]">
          <span className="tabular-nums">
            {count(shown.length)} of {count(visible.length)}
          </span>
          <span className="text-[var(--ink-300)]" aria-hidden="true">
            ·
          </span>
          <ShowAll onClick={() => setExpandedFor(cutKey)} />
        </div>
      )}

      <AddConferenceDialog
        open={adding}
        onOpenChange={setAdding}
        onCreated={(id) =>
          router.push(`/admin/conferences/${encodeURIComponent(id)}`)
        }
      />
    </AdminPage>
  );
}

/** The truncation line's one blue text action. */
function ShowAll({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-[12px] font-medium whitespace-nowrap text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)]"
    >
      Show all
    </button>
  );
}

/** A no-op for the skeleton's inert controls. */
function ignore() {}

/**
 * Admin › Conferences while the page loads (`app/admin/conferences/loading.tsx`):
 * the title and Add conference, then the search, the view pills, the
 * Division menu and the sort as the loaded page opens them — inert, and
 * without counts — then the table's real column labels over rows of bars.
 * The summary carries counts, so it is a bar.
 */
export function ConferencesPageSkeleton() {
  return (
    <AdminPage className="gap-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-display">Conferences</h1>
          <PendingBar className="mt-3 mb-[3px] h-3 w-72" />
        </div>
        <InertButton variant="primary" size="md">
          <Plus className="size-3.5" strokeWidth={1.5} aria-hidden />
          Add conference
        </InertButton>
      </div>

      <div inert className="mt-2 flex flex-wrap items-center gap-3">
        <PillSearch
          value=""
          onChange={ignore}
          placeholder="Conference"
          label="Search conferences"
        />
        <CountPills options={VIEW_OPTIONS} value="all" onChange={ignore} />
        <FilterDivider />
        <FilterMenuPill<string>
          label="Division"
          width={196}
          options={[{ value: ANY_DIVISION, label: "All" }]}
          value={ANY_DIVISION}
          onChange={ignore}
        />
        <div className="flex-1" />
        <SortTrigger>{SORT_OPTIONS[0].label}</SortTrigger>
      </div>

      <ConferencesTableSkeleton />
    </AdminPage>
  );
}
