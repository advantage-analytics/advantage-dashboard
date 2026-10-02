"use client";

import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ListFilter } from "lucide-react";
import { ViewPills } from "@/components/admin/view-pills";
import { TeamsTable } from "@/components/admin/teams-table";
import {
  ApprovePilotPopover,
  type ApprovePilotTarget,
} from "@/components/admin/approve-pilot-popover";
import { CreateTeamDialog } from "@/components/admin/create-team-dialog";
import { loadMoreAdminTeams } from "@/components/admin/teams-actions";
import {
  FilterTrigger,
  SortTrigger,
} from "@/components/dashboard/shared/list-toolbar-trigger";
import {
  FloatMenu,
  FloatMenuDivider,
  FloatMenuItem,
} from "@/components/ui/float-menu";
import { advButton } from "@/lib/ui/adv-button";
import type {
  AdminTeamRow,
  AdminTeamsSort,
  AdminTeamsView,
} from "@/lib/data/admin-teams-server";

/**
 * Admin › Teams, everything below the header.
 *
 * ## Where each control's state lives
 *
 * View, sort and the three filters are **URL state**, pushed with
 * `router.push` and re-read by the server page — an admin who has narrowed to
 * "Needs review, D-I, sorted Z–A" can send that link to another admin, and the
 * back button walks the cuts. Only two things are local: the extra keyset
 * pages "Load more" has appended (they belong to the page the URL already
 * names, and putting a cursor chain in the address bar would make the back
 * button undo one page at a time), and which row's approve popover is open.
 *
 * ## The cut is a sentence, never chips
 *
 * v3's Data Table law 6: on apply the panel closes and a grey strip states the
 * cut in words, with one quiet "Clear filters". Accumulating chips is the
 * banned pattern, and the trigger carries no count badge either — engaged, it
 * just takes the nav-active wash that `FilterTrigger` already implements.
 *
 * View pills sit outside all of that (law 7): a view is not a filter, so
 * switching one never clears the other and the strip never mentions it.
 */

const VIEW_OPTIONS: { value: AdminTeamsView; label: string }[] = [
  { value: "on_advantage", label: "On Advantage" },
  { value: "in_pilot", label: "In pilot" },
  { value: "needs_review", label: "Needs review" },
  { value: "all", label: "Whole directory" },
];

/**
 * Both sorts `listAdminTeams` actually supports, and no more.
 *
 * The loader's keyset pagination is built on the `(school_name, id)` index and
 * its `sort` union is `'name_asc' | 'name_desc'` — there is no by-members or
 * by-claim-date ordering behind this menu, so the menu does not offer one. A
 * third row that silently returned the same rows in the same order would be
 * worse than two honest ones.
 */
const SORT_OPTIONS: { value: AdminTeamsSort; label: string }[] = [
  { value: "name_asc", label: "Name A–Z" },
  { value: "name_desc", label: "Name Z–A" },
];

/** One facet's offered values — raw value for the URL, label for the eye. */
export interface FacetOption {
  value: string;
  label: string;
}

export interface TeamsFacetOptions {
  divisions: FacetOption[];
  conferences: FacetOption[];
  states: FacetOption[];
}

export interface TeamsCut {
  division: string | null;
  conference: string | null;
  state: string | null;
}

const FACET_KEYS = ["division", "conference", "state"] as const;
type FacetKey = (typeof FACET_KEYS)[number];

export function TeamsPageContent({
  rows: serverRows,
  nextCursor: serverCursor,
  view,
  sort,
  cut,
  facets,
}: {
  rows: AdminTeamRow[];
  nextCursor: string | null;
  view: AdminTeamsView;
  sort: AdminTeamsSort;
  cut: TeamsCut;
  facets: TeamsFacetOptions;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);

  // Pages appended by "Load more", on top of whatever the server rendered. A
  // new server render (any URL change, or `router.refresh()` after a decision)
  // replaces `serverRows`, so the appended pages have to be dropped with it —
  // keyed on the identity of the server page rather than cleared in an effect,
  // which would paint the stale tail for one frame first.
  const [extra, setExtra] = useState<{
    key: string;
    rows: AdminTeamRow[];
    cursor: string | null;
  }>({ key: "", rows: [], cursor: null });
  const [loadingMore, startLoadingMore] = useTransition();

  const pageKey = `${view}|${sort}|${cut.division ?? ""}|${cut.conference ?? ""}|${cut.state ?? ""}|${serverCursor ?? ""}|${serverRows.length}`;
  const appended = extra.key === pageKey ? extra : null;
  const rows = appended ? [...serverRows, ...appended.rows] : serverRows;
  const cursor = appended ? appended.cursor : serverCursor;

  const pushCut = useCallback(
    (
      next: Partial<{ view: AdminTeamsView; sort: AdminTeamsSort } & TeamsCut>,
    ) => {
      const params = new URLSearchParams();
      const merged = { view, sort, ...cut, ...next };
      // Defaults stay out of the URL — a first visit and a deliberate reset
      // should produce the same address.
      if (merged.view !== "on_advantage") params.set("view", merged.view);
      if (merged.sort !== "name_asc") params.set("sort", merged.sort);
      for (const key of FACET_KEYS) {
        const value = merged[key];
        if (value) params.set(key, value);
      }
      // Any change invalidates the cursor chain: `after` names a boundary in
      // the previous ordering, and carrying it into a new one skips rows.
      const query = params.toString();
      router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [cut, pathname, router, sort, view],
  );

  const clearFilters = useCallback(() => {
    pushCut({ division: null, conference: null, state: null });
  }, [pushCut]);

  const loadMore = () => {
    if (!cursor || loadingMore) return;
    const key = pageKey;
    startLoadingMore(async () => {
      const page = await loadMoreAdminTeams({
        view,
        sort,
        after: cursor,
        filters: {
          division: cut.division ?? undefined,
          conference: cut.conference ?? undefined,
          state: cut.state ?? undefined,
        },
      });
      setExtra((current) => {
        const base = current.key === key ? current.rows : [];
        return { key, rows: [...base, ...page.rows], cursor: page.nextCursor };
      });
    });
  };

  /* ── Approve popover ──────────────────────────────────────────────────── */

  // `TeamsTable`'s `onApprove` hands over the row, not the event, so the chip's
  // position is captured here instead: this fires in the capture phase of the
  // same click, before the row's own handler runs, so the rect is the chip's
  // and it is current.
  const chipRect = useRef<DOMRect | null>(null);
  const captureChip = (event: React.MouseEvent<HTMLDivElement>) => {
    const button = (event.target as HTMLElement | null)?.closest("button");
    chipRect.current = button?.getBoundingClientRect() ?? null;
  };

  const [approving, setApproving] = useState<ApprovePilotTarget | null>(null);
  const openApprove = (row: AdminTeamRow) => {
    const claimId = row.pendingClaim?.id;
    const rect = chipRect.current;
    // A row whose plan is `approve` always carries `pendingClaim` (the loader
    // sets them together), so this is a type narrowing rather than a case.
    if (!claimId || !rect) return;
    setApproving({
      claimId,
      teamName: row.name,
      anchorRect: {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      },
    });
  };

  /* ── The cut, in words ────────────────────────────────────────────────── */

  const cutSentence = useMemo(() => {
    const labelOf = (options: FacetOption[], value: string | null) =>
      value ? (options.find((o) => o.value === value)?.label ?? value) : null;
    const clauses = [
      labelOf(facets.divisions, cut.division),
      labelOf(facets.conferences, cut.conference),
      labelOf(facets.states, cut.state),
    ].filter(Boolean);
    if (clauses.length === 0) return null;
    return `Teams in ${clauses.join(", ")}`;
  }, [cut, facets]);

  const hasCut = cutSentence !== null;

  return (
    <div className="flex flex-col gap-4">
      {/* Title slot — the page's one primary sits here. */}
      <div className="flex items-end gap-2.5">
        <div>
          <h1 className="text-display">Teams</h1>
          <p className="text-body-sm mt-[9px]">
            Every program in the directory.
          </p>
        </div>
        <div className="flex-1" />
        <CreateTeamButton />
      </div>

      {/* Views, then the toolbar. */}
      <div className="flex flex-wrap items-center gap-3">
        <ViewPills
          options={VIEW_OPTIONS}
          value={view}
          onChange={(next) => pushCut({ view: next })}
        />
        <div className="flex-1" />

        <FloatMenu
          open={filtersOpen}
          onOpenChange={setFiltersOpen}
          label="Filter teams"
          width={256}
          trigger={
            <FilterTrigger
              aria-expanded={filtersOpen}
              engaged={filtersOpen || hasCut}
            />
          }
        >
          <FacetSection
            heading="Division"
            options={facets.divisions}
            value={cut.division}
            onSelect={(value) => {
              setFiltersOpen(false);
              pushCut({ division: value });
            }}
          />
          <FloatMenuDivider />
          <FacetSection
            heading="Conference"
            options={facets.conferences}
            value={cut.conference}
            onSelect={(value) => {
              setFiltersOpen(false);
              pushCut({ conference: value });
            }}
          />
          <FloatMenuDivider />
          <FacetSection
            heading="State"
            options={facets.states}
            value={cut.state}
            onSelect={(value) => {
              setFiltersOpen(false);
              pushCut({ state: value });
            }}
          />
        </FloatMenu>

        <FloatMenu
          open={sortOpen}
          onOpenChange={setSortOpen}
          label="Sort teams"
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

      {/* The applied cut as one grey sentence — never chips. */}
      {hasCut && (
        <div
          className="flex flex-wrap items-center gap-2 rounded-[var(--radius-element)] px-3.5 py-2.5"
          style={{ background: "var(--surface-subtle)" }}
        >
          <ListFilter
            className="size-[13px] shrink-0"
            strokeWidth={1.5}
            style={{ color: "var(--ink-500)" }}
            aria-hidden="true"
          />
          <span className="text-[11px]" style={{ color: "var(--ink-700)" }}>
            {cutSentence}
          </span>
          <span
            className="size-[3px] rounded-full"
            style={{ background: "var(--ink-300)" }}
            aria-hidden="true"
          />
          {/* "N shown", not "N of M": keyset pagination never counts the tail,
              and a total would have to be a second query for a number nothing
              on this page decides anything with. */}
          <span className="text-micro tabular">
            {rows.length} shown{cursor ? "+" : ""}
          </span>
          <div className="flex-1" />
          <button
            type="button"
            onClick={clearFilters}
            className="text-[11px] font-medium whitespace-nowrap text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)]"
          >
            Clear filters
          </button>
        </div>
      )}

      <div onClickCapture={captureChip}>
        <TeamsTable
          rows={rows}
          emptyTitle={
            hasCut ? "No teams fit this filter" : "No teams in this view"
          }
          emptyAction={
            hasCut
              ? { label: "Clear filters", onClick: clearFilters }
              : {
                  label: "Show the whole directory",
                  onClick: () => pushCut({ view: "all" }),
                }
          }
          onApprove={openApprove}
        />
      </div>

      {cursor && (
        <div className="flex justify-center">
          <button
            type="button"
            className={advButton("outline", "sm")}
            onClick={loadMore}
            disabled={loadingMore}
          >
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        </div>
      )}

      <ApprovePilotPopover
        target={approving}
        onClose={() => setApproving(null)}
        // The decided row's Plan cell is now wrong on screen — the server page
        // re-renders and the chip becomes a `PilotPill` (approve) or an em
        // dash (decline).
        onDecided={() => router.refresh()}
      />
    </div>
  );
}

/**
 * One facet's rows, under a quiet heading, with an "Any" reset at the top.
 *
 * Capped and scrollable because two of the three sets are open-ended — 137
 * conferences and 50 states in the live directory. A single uncapped list
 * would make the panel taller than the window and bury Division, which is the
 * facet with five values and the one an admin actually reaches for.
 */
function FacetSection({
  heading,
  options,
  value,
  onSelect,
}: {
  heading: string;
  options: FacetOption[];
  value: string | null;
  onSelect: (value: string | null) => void;
}) {
  return (
    <div className="flex flex-col">
      <p className="px-2.5 pt-1.5 pb-1 text-[11px] text-[var(--ink-400)]">
        {heading}
      </p>
      <div className="flex max-h-[184px] flex-col overflow-y-auto">
        <FloatMenuItem
          label="Any"
          chosen={value === null}
          onSelect={() => onSelect(null)}
        />
        {options.map((option) => (
          <FloatMenuItem
            key={option.value}
            label={option.label}
            chosen={option.value === value}
            onSelect={() => onSelect(option.value)}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * The page's primary, and the dialog behind it.
 *
 * The dialog owns its own reset and its own two steps, so all this holds is
 * whether it is open.
 */
function CreateTeamButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        className={advButton("primary", "md")}
        onClick={() => setOpen(true)}
      >
        Create team
      </button>
      <CreateTeamDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
