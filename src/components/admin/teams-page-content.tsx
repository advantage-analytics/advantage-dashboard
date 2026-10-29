"use client";

import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  CountPills,
  FilterDivider,
  FilterMenuPill,
} from "@/components/admin/admin-cells";
import { markAdminRowSeen } from "@/app/admin/seen-actions";
import { TeamsTable } from "@/components/admin/teams-table";
import {
  ApprovePilotPopover,
  type ApprovePilotTarget,
} from "@/components/admin/approve-pilot-popover";
import { CreateTeamDialog } from "@/components/admin/create-team-dialog";
import { loadMoreAdminTeams } from "@/components/admin/teams-actions";
import { SortTrigger } from "@/components/dashboard/shared/list-toolbar-trigger";
import { FloatMenu, FloatMenuItem } from "@/components/ui/float-menu";
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
 * ## Teams2's toolbar
 *
 * View pills with their counts as text ("On Advantage · 9"), a hairline, then
 * one pill menu per facet — Division and Conference — whose trigger names the
 * current value, so the cut reads off the toolbar and no strip restates it. A
 * view is not a filter (law 7): switching one never clears the other, and
 * the pill counts are taken under the current facets.
 *
 * ## New since you last looked
 *
 * The server decides which rows are New (`lookAtSurface(adminId, "teams")`,
 * keyed on program id against `claimed_at`) and passes ids only. Opening a
 * row calls `markAdminRowSeen` and clears its dot here at once.
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
  /** Programs in the whole directory with this value. */
  count?: number;
}

/** The facet menus' unfiltered option — never a real column value. */
const ANY = "__any";

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
  freshIds,
  joinedCount,
  viewCounts,
  nextCursor: serverCursor,
  view,
  sort,
  cut,
  facets,
}: {
  rows: AdminTeamRow[];
  /** Ids of the rows that are New since this admin last looked. */
  freshIds: string[];
  /** Programs that joined since the last look, across the directory. */
  joinedCount: number;
  /** Rows per view under the current facets; null when a count failed. */
  viewCounts: Record<AdminTeamsView, number | null>;
  nextCursor: string | null;
  view: AdminTeamsView;
  sort: AdminTeamsSort;
  cut: TeamsCut;
  facets: TeamsFacetOptions;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const [sortOpen, setSortOpen] = useState(false);

  // Rows opened during this visit lose their dot at once; the server learns
  // through `markAdminRowSeen`, fire and forget.
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set());
  const fresh = useMemo(() => {
    const ids = new Set(freshIds);
    for (const id of opened) ids.delete(id);
    return ids;
  }, [freshIds, opened]);
  const openRow = useCallback((row: AdminTeamRow) => {
    setOpened((current) => new Set(current).add(row.id));
    void markAdminRowSeen("teams", row.id).catch(() => {});
  }, []);

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

  const hasCut = Boolean(cut.division || cut.conference || cut.state);
  const stateLabel = cut.state
    ? (facets.states.find((o) => o.value === cut.state)?.label ?? cut.state)
    : null;

  const facetOptions = (all: string, options: FacetOption[]) => [
    { value: ANY, label: all },
    ...options.map((option) => ({
      value: option.value,
      label: option.label,
      count: option.count ?? null,
    })),
  ];

  const total = viewCounts[view];

  return (
    <div className="flex flex-col gap-4">
      {/* Title slot — the page's one primary sits here. */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-display">Teams</h1>
          <p className="text-body-sm mt-[9px]">
            Every program in the directory.
            {joinedCount > 0 && ` ${joinedCount} joined since you last looked.`}
          </p>
        </div>
        <CreateTeamButton />
      </div>

      {/* Views, a divider, then one pill menu per facet. */}
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <CountPills
          options={VIEW_OPTIONS.map((option) => ({
            ...option,
            count: viewCounts[option.value],
          }))}
          value={view}
          onChange={(next) => pushCut({ view: next })}
        />
        <FilterDivider />
        <FilterMenuPill<string>
          label="Division"
          width={220}
          options={facetOptions("All divisions", facets.divisions)}
          value={cut.division ?? ANY}
          onChange={(next) => pushCut({ division: next === ANY ? null : next })}
        />
        <FilterMenuPill<string>
          label="Conference"
          width={280}
          options={facetOptions("All conferences", facets.conferences)}
          value={cut.conference ?? ANY}
          onChange={(next) =>
            pushCut({ conference: next === ANY ? null : next })
          }
        />
        <div className="flex-1" />

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
          freshIds={fresh}
          onOpenRow={openRow}
        />
      </div>

      {rows.length > 0 && (
        <p className="flex flex-wrap items-center gap-2 text-[12px] text-[var(--ink-600)] tabular-nums">
          <span>
            {total != null
              ? `Showing ${rows.length.toLocaleString("en-US")} of ${total.toLocaleString("en-US")} ${total === 1 ? "program" : "programs"}`
              : `Showing ${rows.length.toLocaleString("en-US")} programs`}
            {stateLabel && ` in ${stateLabel}`}
          </span>
          {stateLabel && (
            <button
              type="button"
              onClick={() => pushCut({ state: null })}
              className="font-medium text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)]"
            >
              Clear state
            </button>
          )}
        </p>
      )}

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
