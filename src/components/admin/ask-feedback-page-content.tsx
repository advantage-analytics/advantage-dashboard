"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AdminPage } from "@/components/admin/admin-page";
import { AskFeedbackDrawer } from "@/components/admin/ask-feedback-drawer";
import {
  AskFeedbackTable,
  askFeedbackRowId,
} from "@/components/admin/ask-feedback-table";
import { ViewPills } from "@/components/admin/view-pills";
import {
  filterAdminAskFeedback,
  type AdminAskFeedbackRow,
  type AdminAskView,
} from "@/lib/data/ask-admin-view";

/**
 * Admin › Ask, everything below the header: the title with its count, the
 * view pills (Thumbs down · Thumbs up · All), the table and the peek drawer
 * a row opens.
 *
 * The selection machine is the Requests page's, verbatim in shape: three
 * pieces of state — `selectedId` (which row wears the wash), `drawerId`
 * (which record the rail is drawing) and `closing` (the rail is playing its
 * width keyframe out) — that come apart during the 200ms close. `?id=` lands
 * open on a deep link and is mirrored with `replaceState`, never pushed.
 */
const VIEW_OPTIONS: { value: AdminAskView; label: string }[] = [
  { value: "down", label: "Thumbs down" },
  { value: "up", label: "Thumbs up" },
  { value: "all", label: "All" },
];

const EMPTY_TITLE: Record<AdminAskView, string> = {
  down: "No thumbs down yet",
  up: "No thumbs up yet",
  all: "No feedback yet",
};

function syncUrl(id: string | null) {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set("id", id);
  else url.searchParams.delete("id");
  window.history.replaceState(null, "", url.toString());
}

export function AskFeedbackPageContent({
  rows,
  initialSelectedId,
}: {
  rows: AdminAskFeedbackRow[];
  /** `?id=` from the URL, or null. Ignored unless it names a row. */
  initialSelectedId: string | null;
}) {
  const initialRow = initialSelectedId
    ? (rows.find((row) => row.id === initialSelectedId) ?? null)
    : null;
  // A deep link to a thumbs up opens on the view that holds it.
  const [view, setView] = useState<AdminAskView>(
    initialRow?.rating === "up" ? "up" : "down",
  );
  const [selectedId, setSelectedId] = useState<string | null>(
    initialRow?.id ?? null,
  );
  const [drawerId, setDrawerId] = useState<string | null>(
    initialRow?.id ?? null,
  );
  const [closing, setClosing] = useState(false);
  const [openedByKeyboard, setOpenedByKeyboard] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const shown = filterAdminAskFeedback(rows, view);
  const drawerRow = drawerId
    ? (rows.find((row) => row.id === drawerId) ?? null)
    : null;
  const drawerIndex = drawerRow ? shown.indexOf(drawerRow) : -1;

  const finishClose = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
    setDrawerId(null);
    setClosing(false);
  }, []);

  const select = useCallback(
    (row: AdminAskFeedbackRow, viaKeyboard: boolean) => {
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
        document.getElementById(askFeedbackRowId(returnFocusTo))?.focus();
      }
    },
    [finishClose],
  );

  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [],
  );

  function step(delta: number) {
    if (drawerIndex < 0) return;
    const next = shown[drawerIndex + delta];
    if (!next) return;
    select(next, true);
    document
      .getElementById(askFeedbackRowId(next.id))
      ?.scrollIntoView({ block: "nearest" });
  }

  function changeView(next: AdminAskView) {
    if (next === view) return;
    setView(next);
    // The rows change under the drawer: close it with them.
    if (drawerId) close(null);
  }

  const toggle = (row: AdminAskFeedbackRow, viaKeyboard: boolean) => {
    if (row.id === selectedId) close(row.id);
    else select(row, viaKeyboard);
  };

  const down = rows.filter((row) => row.rating === "down").length;
  const summary = `${rows.length} ${rows.length === 1 ? "thumb" : "thumbs"} · ${down} down · ${rows.length - down} up`;

  return (
    <AdminPage
      className="gap-4"
      rail={
        drawerRow && drawerIndex >= 0 ? (
          <AskFeedbackDrawer
            row={drawerRow}
            index={drawerIndex}
            total={shown.length}
            closing={closing}
            autoFocus={openedByKeyboard}
            onPrev={() => step(-1)}
            onNext={() => step(1)}
            onClose={() => close(drawerRow.id)}
            onClosed={finishClose}
          />
        ) : null
      }
    >
      <div className="flex items-end gap-2.5">
        <div className="flex min-w-0 flex-1 items-baseline gap-4">
          <h1 className="text-display">Ask</h1>
          <p className="text-body-sm truncate tabular-nums">{summary}</p>
        </div>
      </div>

      <ViewPills options={VIEW_OPTIONS} value={view} onChange={changeView} />

      <AskFeedbackTable
        rows={shown}
        emptyTitle={EMPTY_TITLE[view]}
        selectedId={selectedId}
        onSelect={toggle}
      />
    </AdminPage>
  );
}
