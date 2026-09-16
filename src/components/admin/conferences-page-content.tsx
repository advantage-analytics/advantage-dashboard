"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ListFilter, Plus } from "lucide-react";
import { AdminPage } from "@/components/admin/admin-page";
import { ViewPills } from "@/components/admin/view-pills";
import { ConferencesTable } from "@/components/admin/conferences-table";
import { conferenceRowId } from "@/components/admin/conferences-table-layout";
import { ConferenceDrawer } from "@/components/admin/conference-drawer";
import { AddConferenceDialog } from "@/components/admin/add-conference-dialog";
import { DRAWER_ATTR } from "@/components/dashboard/matches/match-drawer";
import {
  FilterTrigger,
  SortTrigger,
} from "@/components/dashboard/shared/list-toolbar-trigger";
import { FloatMenu, FloatMenuItem } from "@/components/ui/float-menu";
// The client-safe half of the data layer — `admin-conferences-server.ts`
// imports the Supabase server client at top level and must not reach this
// bundle.
import {
  applyConferenceView,
  sortConferences,
} from "@/lib/data/admin-conferences-view";
import type {
  AdminConferenceRow,
  AdminConferencesSort,
  AdminConferencesView,
} from "@/lib/data/admin-conferences-view";
import {
  DIVISION_VALUES,
  divisionLabel,
  divisionLongLabel,
} from "@/lib/data/programs-server";
import { advButton } from "@/lib/ui/adv-button";
import { cn } from "@/lib/utils";

/**
 * Admin › Conferences, the whole page — title slot, views and toolbar, the
 * table and the peek drawer a row opens.
 *
 * ## Two machines, copied from their owners
 *
 * The **selection** is `requests-page-content.tsx`'s verbatim: `selectedId`
 * (the wash), `drawerId` (what the rail draws) and `closing` (the width
 * keyframe playing out), a 240ms fallback for reduced motion, `?id=` mirrored
 * with `history.replaceState`, Esc and ↑/↓ over the rows on screen, and a
 * render-time reset when the open row leaves them.
 *
 * The **cut** is `teams-page-content.tsx`'s `pushCut`: view, sort and division
 * are URL state pushed with `router.push`, defaults kept out of the address.
 *
 * ## Load all, render 50
 *
 * The directory holds ~137 conferences, so the server hands over every row and
 * the view, sort and division are applied here. The table draws the first 50;
 * "Show all" is local state (not a cursor, not the URL) and resets whenever
 * the cut changes. The drawer's counter and ↑/↓ run over what is on screen,
 * so stepping never lands on a row the table is not drawing.
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

/** Rows drawn before "Show all". */
const PAGE_SIZE = 50;

const count = (value: number) => value.toLocaleString("en-US");

export function ConferencesPageContent({
  rows,
  unplaced,
  view,
  sort,
  division,
  initialSelectedId,
}: {
  rows: AdminConferenceRow[];
  /** Programs with no conference at all. */
  unplaced: number;
  view: AdminConferencesView;
  sort: AdminConferencesSort;
  /** Raw division value (`'D1'`), or null for any. */
  division: string | null;
  /** `?id=` from the URL, or null. Ignored unless it names a row in this cut. */
  initialSelectedId: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const inView = useMemo(
    () => sortConferences(applyConferenceView(rows, view), sort),
    [rows, view, sort],
  );
  const visible = useMemo(
    () =>
      division ? inView.filter((row) => row.division === division) : inView,
    [inView, division],
  );

  // "Show all" belongs to the cut it was pressed on. Keyed rather than reset
  // in an effect, so a new cut never paints the long list for a frame.
  const cutKey = `${view}|${sort}|${division ?? ""}`;
  const initialIndex = initialSelectedId
    ? visible.findIndex((row) => row.id === initialSelectedId)
    : -1;
  const [expandedFor, setExpandedFor] = useState<string | null>(
    // A deep link to a row past the first 50 lands with the list open.
    initialIndex >= PAGE_SIZE ? cutKey : null,
  );
  const expanded = expandedFor === cutKey;
  const shown = useMemo(
    () => (expanded ? visible : visible.slice(0, PAGE_SIZE)),
    [expanded, visible],
  );

  const initial = initialIndex >= 0 ? initialSelectedId : null;

  const [selectedId, setSelectedId] = useState<string | null>(initial);
  const [drawerId, setDrawerId] = useState<string | null>(initial);
  const [closing, setClosing] = useState(false);
  const [openedByKeyboard, setOpenedByKeyboard] = useState(false);
  /** A just-created conference, waiting for the refresh to bring its row. */
  const [pendingId, setPendingId] = useState<string | null>(null);
  /**
   * Bumped when a landing closes the drawer instead of opening it, so an
   * effect drops `?id=` — the decision is made during render, and the URL
   * write must not be. A counter rather than a boolean so a second hidden
   * landing re-runs the effect without a reset.
   */
  const [clearUrl, setClearUrl] = useState(0);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [adding, setAdding] = useState(false);

  const drawerRow = drawerId
    ? (shown.find((row) => row.id === drawerId) ?? null)
    : null;
  const drawerIndex = drawerRow ? shown.indexOf(drawerRow) : -1;

  const finishClose = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
    setDrawerId(null);
    setClosing(false);
  }, []);

  const select = useCallback(
    (row: AdminConferenceRow, viaKeyboard: boolean) => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
      closeTimer.current = null;
      setClosing(false);
      setSelectedId(row.id);
      setDrawerId(row.id);
      setOpenedByKeyboard(viaKeyboard);
      syncUrl(row.id);
    },
    [],
  );

  const close = useCallback(
    (returnFocusTo: string | null) => {
      setSelectedId(null);
      setClosing(true);
      syncUrl(null);
      // `onAnimationEnd` normally finishes this; the timer covers reduced
      // motion, where no animation runs, and is harmless when both fire.
      closeTimer.current = setTimeout(finishClose, 240);
      if (returnFocusTo) {
        document.getElementById(conferenceRowId(returnFocusTo))?.focus();
      }
    },
    [finishClose],
  );

  const toggle = useCallback(
    (row: AdminConferenceRow, viaKeyboard: boolean) => {
      if (selectedId === row.id) close(viaKeyboard ? row.id : null);
      else select(row, viaKeyboard);
    },
    [selectedId, select, close],
  );

  const step = useCallback(
    (direction: 1 | -1) => {
      if (!selectedId) return;
      const index = shown.findIndex((row) => row.id === selectedId);
      const next = shown[index + direction];
      if (!next) return;
      select(next, true);
      document
        .getElementById(conferenceRowId(next.id))
        ?.scrollIntoView({ block: "nearest" });
    },
    [shown, selectedId, select],
  );

  // A landing — a conference just added, or a merge target: once its row is
  // loaded and in this cut, open it (past the first 50, open the list too).
  //
  // If the row is loaded but this cut excludes it — a new conference has no
  // teams on Advantage, a merge target outside the division filter — the
  // landing target is not in this view → close and clear the URL. Switching
  // to the All view instead was rejected: the view is a URL-held cut
  // (`pushCut`), and changing it on the user's behalf discards their filter.
  // Closing here also stops the drawer lingering on a merged-away source.
  if (pendingId && rows.some((row) => row.id === pendingId)) {
    const index = visible.findIndex((row) => row.id === pendingId);
    setPendingId(null);
    if (index >= 0) {
      if (index >= PAGE_SIZE) setExpandedFor(cutKey);
      setSelectedId(pendingId);
      setDrawerId(pendingId);
      setClosing(false);
    } else {
      setSelectedId(null);
      setDrawerId(null);
      setClosing(false);
      setClearUrl((n) => n + 1);
    }
  }

  // The row the drawer showed is gone — deleted or merged, or the cut no
  // longer shows it. Adjusted during render rather than in an effect, so
  // nothing paints a drawer for a row that is not on screen.
  if (drawerId && !drawerRow && drawerId !== pendingId) {
    setSelectedId(null);
    setDrawerId(null);
    setClosing(false);
  }

  useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  // The URL half of a hidden landing, kept out of render.
  useEffect(() => {
    if (clearUrl > 0) syncUrl(null);
  }, [clearUrl]);

  useEffect(() => {
    if (!selectedId) return;

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
        // The drawer's own `role="dialog"` is not a modal; a dialog opened
        // from inside it is — including `ConfirmDialog`, which renders
        // `role="alertdialog"` — and Esc and ↑/↓ there belong to the dialog.
        if (
          target.closest(
            `[role="dialog"]:not([${DRAWER_ATTR}] [role="dialog"]), [role="alertdialog"]`,
          )
        )
          return;
        if (target.closest("[data-radix-popper-content-wrapper]")) return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        close(selectedId);
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
  }, [selectedId, close, step]);

  const pushCut = useCallback(
    (
      next: Partial<{
        view: AdminConferencesView;
        sort: AdminConferencesSort;
        division: string | null;
      }>,
    ) => {
      // The rows on screen are about to change, so the open record goes with
      // them — and `?id=` is not carried into the new address.
      setSelectedId(null);
      finishClose();
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
    [division, finishClose, pathname, router, sort, view],
  );

  const clearFilter = useCallback(() => pushCut({ division: null }), [pushCut]);

  /* ── Title slot numbers ───────────────────────────────────────────────── */

  const placed = rows.reduce((sum, row) => sum + row.teams, 0);
  const summary = [
    `${count(rows.length)} ${rows.length === 1 ? "conference" : "conferences"}`,
    `${count(placed)} ${placed === 1 ? "team" : "teams"} placed`,
    `${count(unplaced)} with none`,
  ].join(" · ");

  const truncated = !expanded && visible.length > shown.length;

  return (
    // The column eases to 40px on the right while the drawer is open; the
    // drawer itself goes in `rail`, outside the padding, on the screen edge.
    <AdminPage
      className={cn("gap-4", drawerRow && "pr-10")}
      rail={
        drawerRow && (
          <ConferenceDrawer
            row={drawerRow}
            index={drawerIndex}
            total={shown.length}
            canPrev={drawerIndex > 0}
            canNext={drawerIndex < shown.length - 1}
            closing={closing}
            autoFocus={openedByKeyboard}
            onPrev={() => step(-1)}
            onNext={() => step(1)}
            onClose={() => close(drawerRow.id)}
            onClosed={finishClose}
            onChanged={() => router.refresh()}
            conferences={rows}
            onMerged={(targetId) => {
              // The merge target is already a loaded row, so the pending-id
              // pass opens it at once — or, when this cut hides it, closes the
              // drawer and clears `?id=`. The refresh then brings the new
              // counts and drops the source.
              setPendingId(targetId);
              syncUrl(targetId);
              router.refresh();
            }}
            onDeleted={() => close(null)}
          />
        )
      }
    >
      {/* Title slot — the page's one primary sits here. */}
      <div className="flex items-end gap-2.5">
        <div className="flex min-w-0 flex-1 items-baseline gap-4">
          <h1 className="text-display">Conferences</h1>
          <p className="text-body-sm truncate tabular-nums">{summary}</p>
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

      {/* Views, then the toolbar. */}
      <div className="flex flex-wrap items-center gap-2">
        <ViewPills
          options={VIEW_OPTIONS}
          value={view}
          onChange={(next) => pushCut({ view: next })}
        />
        <div className="flex-1" />

        <FloatMenu
          open={filtersOpen}
          onOpenChange={setFiltersOpen}
          label="Filter conferences"
          width={196}
          trigger={
            <FilterTrigger
              aria-expanded={filtersOpen}
              engaged={filtersOpen || division !== null}
            />
          }
        >
          <p className="px-2.5 pt-1.5 pb-1 text-[11px] text-[var(--ink-400)]">
            Division
          </p>
          <FloatMenuItem
            label="Any"
            chosen={division === null}
            onSelect={() => {
              setFiltersOpen(false);
              pushCut({ division: null });
            }}
          />
          {DIVISION_VALUES.map((value) => (
            <FloatMenuItem
              key={value}
              label={divisionLabel(value) ?? value}
              chosen={division === value}
              onSelect={() => {
                setFiltersOpen(false);
                pushCut({ division: value });
              }}
            />
          ))}
        </FloatMenu>

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
          division
            ? "No conferences fit this filter"
            : "No conferences in this view"
        }
        emptyAction={
          division
            ? { label: "Clear filter", onClick: clearFilter }
            : view !== "all"
              ? {
                  label: "Show every conference",
                  onClick: () => pushCut({ view: "all" }),
                }
              : undefined
        }
        selectedId={selectedId}
        onSelect={(row) =>
          toggle(row, document.activeElement?.id === conferenceRowId(row.id))
        }
      />

      {division ? (
        // The applied cut as one grey sentence — never chips (table law 6).
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
            {divisionLongLabel(division)}
          </span>
          <Dot />
          <span className="text-micro tabular">
            {count(shown.length)} of {count(inView.length)}
          </span>
          {truncated && (
            <>
              <Dot />
              <ShowAll onClick={() => setExpandedFor(cutKey)} small />
            </>
          )}
          <div className="flex-1" />
          <button
            type="button"
            onClick={clearFilter}
            className="text-[11px] font-medium whitespace-nowrap text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)]"
          >
            Clear filter
          </button>
        </div>
      ) : (
        truncated && (
          <div className="flex items-center gap-2 text-[12px] whitespace-nowrap text-[var(--ink-600)]">
            <span className="tabular-nums">
              {count(shown.length)} of {count(visible.length)}
            </span>
            <span className="text-[var(--ink-300)]" aria-hidden="true">
              ·
            </span>
            <ShowAll onClick={() => setExpandedFor(cutKey)} />
          </div>
        )
      )}

      <AddConferenceDialog
        open={adding}
        onOpenChange={setAdding}
        onCreated={(id) => {
          setPendingId(id);
          syncUrl(id);
        }}
      />
    </AdminPage>
  );
}

function Dot() {
  return (
    <span
      className="size-[3px] rounded-full"
      style={{ background: "var(--ink-300)" }}
      aria-hidden="true"
    />
  );
}

/** The strip's one blue text action. */
function ShowAll({
  onClick,
  small = false,
}: {
  onClick: () => void;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "font-medium whitespace-nowrap text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)]",
        small ? "text-[11px]" : "text-[12px]",
      )}
    >
      Show all
    </button>
  );
}

/**
 * Mirror the selection into `?id=` without a navigation — the Requests page's
 * `syncUrl`. `history.replaceState` rather than `router.replace`, which the
 * App Router treats as a navigation and re-renders from the server.
 */
function syncUrl(id: string | null) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (id) url.searchParams.set("id", id);
  else url.searchParams.delete("id");
  window.history.replaceState(window.history.state, "", url);
}
