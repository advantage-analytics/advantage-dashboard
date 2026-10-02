"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ViewPills } from "@/components/admin/view-pills";
import { RequestsTable, requestRowId } from "@/components/admin/requests-table";
import { RequestDrawer } from "@/components/admin/request-drawer";
import { AdminPage } from "@/components/admin/admin-page";
import { DRAWER_ATTR } from "@/components/dashboard/matches/match-drawer";
import { cn } from "@/lib/utils";
import type {
  AdminRequestRow,
  AdminRequestsView,
} from "@/lib/data/admin-requests-server";

/**
 * Admin › Requests, everything below the header — the view pills, the table
 * and the peek drawer a row opens.
 *
 * ## The selection machine is the Roster's, verbatim
 *
 * Three pieces of state, not one: `selectedId` (which row wears the wash),
 * `drawerId` (which record the rail is drawing) and `closing` (the rail is
 * playing its width keyframe out). They come apart during the 200ms close —
 * the wash has to go at once so the click reads as landing, while the panel
 * is still on screen showing the record it was showing. `finishClose` is what
 * `onClosed` calls when the keyframe ends; the 240ms timer covers reduced
 * motion, where no animation runs and no `animationend` ever fires.
 *
 * Copied rather than abstracted: `roster-view.tsx` owns lineup mode alongside
 * this, and a shared hook would have to carry that or fork anyway. When a
 * third surface wants it, that is the moment it becomes a hook.
 *
 * ## Two kinds of URL state, two mechanisms
 *
 * The **view** is a navigation: `router.push`, re-read by the server page,
 * back button walks the tabs — the same `pushCut` shape `teams-page-content`
 * uses, with the default view kept out of the address so a first visit and a
 * deliberate reset agree.
 *
 * The **selection** is not. `?id=` is mirrored with `history.replaceState`, so
 * a row click is a state change rather than a round trip to the server, and
 * the back button does not walk one drawer open at a time. It still lands
 * open on a deep link, which is the one case the Peek Drawer gives a URL
 * (`tables.md`: "No URL of its own — `?player=` / `?event=` deep links are the
 * one case that lands open").
 *
 * ## `requests-view-pills.tsx` folded in
 *
 * T14 wrote that file explicitly as a placeholder for this one ("When T15
 * lands `RequestsPageContent`, this component's one job folds into it and
 * this file can go"). It is folded in here and the file is deleted: the pills
 * and the selection are not independent — switching view replaces the rows,
 * so the open drawer has to close with it, and two components cannot agree on
 * that without one owning both.
 */

const VIEW_OPTIONS: { value: AdminRequestsView; label: string }[] = [
  { value: "waiting", label: "Waiting on you" },
  { value: "verifying", label: "Verifying" },
  { value: "live", label: "Live" },
  { value: "closed", label: "Closed" },
];

export function RequestsPageContent({
  rows,
  view,
  initialSelectedId,
  emptyTitle,
}: {
  rows: AdminRequestRow[];
  view: AdminRequestsView;
  /** `?id=` from the URL, or null. Ignored unless it names a row on this page. */
  initialSelectedId: string | null;
  emptyTitle: string;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const initial =
    initialSelectedId && rows.some((row) => row.id === initialSelectedId)
      ? initialSelectedId
      : null;

  const [selectedId, setSelectedId] = useState<string | null>(initial);
  const [drawerId, setDrawerId] = useState<string | null>(initial);
  const [closing, setClosing] = useState(false);
  const [openedByKeyboard, setOpenedByKeyboard] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const drawerRow = drawerId
    ? (rows.find((row) => row.id === drawerId) ?? null)
    : null;
  const drawerIndex = drawerRow ? rows.indexOf(drawerRow) : -1;

  const finishClose = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
    setDrawerId(null);
    setClosing(false);
  }, []);

  const select = useCallback((row: AdminRequestRow, viaKeyboard: boolean) => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
    setClosing(false);
    setSelectedId(row.id);
    setDrawerId(row.id);
    setOpenedByKeyboard(viaKeyboard);
    syncUrl(row.id);
  }, []);

  const close = useCallback(
    (returnFocusTo: string | null) => {
      setSelectedId(null);
      setClosing(true);
      syncUrl(null);
      // `onAnimationEnd` normally finishes this; the timer covers reduced
      // motion, where no animation runs, and is harmless when both fire.
      closeTimer.current = setTimeout(finishClose, 240);
      if (returnFocusTo) {
        document.getElementById(requestRowId(returnFocusTo))?.focus();
      }
    },
    [finishClose],
  );

  const toggle = useCallback(
    (row: AdminRequestRow, viaKeyboard: boolean) => {
      if (selectedId === row.id) close(viaKeyboard ? row.id : null);
      else select(row, viaKeyboard);
    },
    [selectedId, select, close],
  );

  const step = useCallback(
    (direction: 1 | -1) => {
      if (!selectedId) return;
      const index = rows.findIndex((row) => row.id === selectedId);
      const next = rows[index + direction];
      if (!next) return;
      select(next, true);
      document
        .getElementById(requestRowId(next.id))
        ?.scrollIntoView({ block: "nearest" });
    },
    [rows, selectedId, select],
  );

  // The row the drawer showed is gone — decided, and the refresh dropped it
  // from this view. Adjusted during render rather than in an effect, so
  // nothing paints a drawer for a row that no longer exists.
  if (drawerId && !drawerRow) {
    setSelectedId(null);
    setDrawerId(null);
    setClosing(false);
  }

  useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

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
        // The drawer's own `role="dialog"` is not a modal; a confirm dialog
        // opened from inside it is, and Esc there belongs to the dialog.
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

  const pushView = useCallback(
    (next: AdminRequestsView) => {
      // The rows are about to be replaced wholesale, so the open record goes
      // with them — and `?id=` has to leave the URL before the push, or the
      // server page would re-open a row the new view does not contain.
      setSelectedId(null);
      finishClose();
      syncUrl(null);
      const params = new URLSearchParams();
      if (next !== "waiting") params.set("view", next);
      const query = params.toString();
      router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [finishClose, pathname, router],
  );

  return (
    // The column eases to 40px on the right while the drawer is open; the
    // drawer itself goes in `rail`, outside the padding, on the screen edge.
    <AdminPage
      className={cn("gap-4", drawerRow && "pr-10")}
      rail={
        drawerRow && (
          <RequestDrawer
            row={drawerRow}
            index={drawerIndex}
            total={rows.length}
            canPrev={drawerIndex > 0}
            canNext={drawerIndex < rows.length - 1}
            closing={closing}
            autoFocus={openedByKeyboard}
            onPrev={() => step(-1)}
            onNext={() => step(1)}
            onClose={() => close(drawerRow.id)}
            onClosed={finishClose}
            onChanged={() => router.refresh()}
          />
        )
      }
    >
      <div>
        <h1 className="text-display">Requests</h1>
        <p className="text-body-sm mt-[9px]">
          Program claims and invite requests, merged into one queue.
        </p>
      </div>

      <ViewPills options={VIEW_OPTIONS} value={view} onChange={pushView} />

      <RequestsTable
        rows={rows}
        emptyTitle={emptyTitle}
        selectedId={selectedId}
        onSelect={(row) =>
          toggle(row, document.activeElement?.id === requestRowId(row.id))
        }
      />
    </AdminPage>
  );
}

/**
 * Mirror the selection into `?id=` without a navigation — `roster-view.tsx`'s
 * `syncUrl`, on this page's param. `history.replaceState` rather than
 * `router.replace`: the App Router treats the latter as a navigation and
 * re-renders from the server, which for a click on a row is a round trip to
 * change one query string.
 */
function syncUrl(id: string | null) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (id) url.searchParams.set("id", id);
  else url.searchParams.delete("id");
  window.history.replaceState(window.history.state, "", url);
}
