"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { markAdminRowSeen } from "@/app/admin/seen-actions";
import {
  CountPills,
  FilterDivider,
  FilterMenuPill,
  type FilterMenuOption,
} from "@/components/admin/admin-cells";
import { AdminPage } from "@/components/admin/admin-page";
import { AskFeedbackDrawer } from "@/components/admin/ask-feedback-drawer";
import {
  AskFeedbackTable,
  AskFeedbackTableSkeleton,
  askFeedbackRowId,
} from "@/components/admin/ask-feedback-table";
import { PendingBar } from "@/components/dashboard/loading/pending";
import {
  adminAskLede,
  askSeenKey,
  filterAdminAskByReason,
  filterAdminAskFeedback,
  newestAdminAskFeedback,
  type AdminAskFeedbackRow,
  type AdminAskReasonFilter,
  type AdminAskView,
} from "@/lib/data/ask-admin-view";
import {
  ASK_FEEDBACK_REASONS,
  ASK_FEEDBACK_REASON_LABELS,
} from "@/lib/services/ask/feedback";
import { cn } from "@/lib/utils";

/**
 * Admin › Ask, everything below the header (Ask2 board): the title and its
 * lede, the view pills with their counts (Thumbs down · Thumbs up · All), a
 * divider, the Reason filter, the table and the peek drawer a row opens.
 * Opening a row clears its New dot (`markAdminRowSeen("ask", "ask:<id>")`).
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
  capped,
  freshIds: initialFreshIds,
  initialSelectedId,
}: {
  rows: AdminAskFeedbackRow[];
  /** The loader hit `MAX_ADMIN_ASK_FEEDBACK`: older thumbs may be unshown. */
  capped: boolean;
  /** Rows New since this admin last looked (`lookAtSurface`). */
  freshIds: string[];
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
  const [reason, setReason] = useState<AdminAskReasonFilter>("any");
  // A deep link opens its row: that is a look, so it starts without its dot
  // (and the effect below records it).
  const deepLinkedFreshId =
    initialRow && initialFreshIds.includes(initialRow.id)
      ? initialRow.id
      : null;
  const [freshIds, setFreshIds] = useState<ReadonlySet<string>>(
    () =>
      new Set(initialFreshIds.filter((rowId) => rowId !== deepLinkedFreshId)),
  );
  const [openedByKeyboard, setOpenedByKeyboard] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (deepLinkedFreshId) {
      void markAdminRowSeen("ask", askSeenKey(deepLinkedFreshId));
    }
  }, [deepLinkedFreshId]);

  // The All view reads newest first, as the lede says; the verdict views are
  // newest first already (`sortAdminAskFeedback`).
  const inView = filterAdminAskFeedback(rows, view);
  const shown = filterAdminAskByReason(
    view === "all" ? newestAdminAskFeedback(inView) : inView,
    reason,
  );
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

  // Opening a row is a look: its New dot goes, here and for the nav.
  function clearFresh(rowId: string) {
    if (!freshIds.has(rowId)) return;
    // Fire and forget: a dot that survives a failed write is harmless.
    void markAdminRowSeen("ask", askSeenKey(rowId));
    setFreshIds((current) => {
      const next = new Set(current);
      next.delete(rowId);
      return next;
    });
  }

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
    clearFresh(next.id);
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

  function changeReason(next: AdminAskReasonFilter) {
    if (next === reason) return;
    setReason(next);
    if (drawerId) close(null);
  }

  const viewOptions = VIEW_OPTIONS.map((option) => ({
    ...option,
    count: filterAdminAskFeedback(rows, option.value).length,
  }));
  const reasonOptions: FilterMenuOption<AdminAskReasonFilter>[] = [
    { value: "any", label: "All" },
    ...ASK_FEEDBACK_REASONS.map((value) => ({
      value,
      label: ASK_FEEDBACK_REASON_LABELS[value],
      count: filterAdminAskByReason(inView, value).length,
    })),
  ];

  const toggle = (row: AdminAskFeedbackRow, viaKeyboard: boolean) => {
    if (row.id === selectedId) close(row.id);
    else {
      select(row, viaKeyboard);
      clearFresh(row.id);
    }
  };

  // "Newest 200 shown" when the loader came back full: never a total the
  // page does not know.
  const lede = adminAskLede(freshIds.size, capped, rows.length);

  return (
    <AdminPage
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
      <AskHeading lede={<p className={LEDE}>{lede}</p>} />

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <CountPills options={viewOptions} value={view} onChange={changeView} />
        <FilterDivider />
        <FilterMenuPill
          label="Reason"
          options={reasonOptions}
          value={reason}
          onChange={changeReason}
        />
      </div>

      <div className="mt-4">
        <AskFeedbackTable
          rows={shown}
          emptyTitle={
            reason === "any"
              ? EMPTY_TITLE[view]
              : `No ${ASK_FEEDBACK_REASON_LABELS[reason].toLowerCase()} here`
          }
          selectedId={selectedId}
          freshIds={freshIds}
          onSelect={toggle}
        />
      </div>
    </AdminPage>
  );
}

const LEDE = "text-body-sm mt-[9px] text-[var(--ink-600)]";

function AskHeading({ lede }: { lede: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <h1 className="text-display">Ask</h1>
      {lede}
    </div>
  );
}

/**
 * Admin › Ask while the page loads (`app/admin/ask/loading.tsx`): the same
 * column, title and view pills as themselves — chrome the page already
 * knows — with a bar where the lede will be and the table's skeleton. The
 * pills draw as the loaded page opens (Thumbs down active), without counts
 * it does not know yet, and are inert until it lands.
 */
export function AskFeedbackPageSkeleton() {
  return (
    <AdminPage>
      <AskHeading lede={<PendingBar className="mt-3 h-3 w-72" />} />

      <div className="mt-6 flex items-center gap-1.5" aria-hidden="true">
        {VIEW_OPTIONS.map((option) => (
          <span
            key={option.value}
            className={cn(
              "inline-flex h-7 items-center rounded-full border px-3 text-[12px] whitespace-nowrap",
              option.value === "down"
                ? "border-[var(--border-medium)] bg-[var(--surface-subtle)] font-medium text-[var(--ink-900)]"
                : "border-[var(--border-hairline)] bg-[var(--surface-card)] text-[var(--ink-600)]",
            )}
          >
            {option.label}
          </span>
        ))}
      </div>

      <div className="mt-4">
        <AskFeedbackTableSkeleton />
      </div>
    </AdminPage>
  );
}
