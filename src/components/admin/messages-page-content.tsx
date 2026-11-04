"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CountPills,
  FilterDivider,
  FilterMenuPill,
  type FilterMenuOption,
} from "@/components/admin/admin-cells";
import { AdminPage } from "@/components/admin/admin-page";
import {
  MessagesTable,
  messagesRowId,
} from "@/components/admin/messages-table";
import { SupportThreadDrawer } from "@/components/admin/support-thread-drawer";
import type { AdminSupportThreadRow } from "@/lib/data/support-admin-server";
import {
  SUPPORT_ORIGINS,
  originLabel,
  type SupportOrigin,
} from "@/lib/data/support-view";

/**
 * Admin › Messages, everything below the header (Player Messaging canvas,
 * artboard 5): the title and its lede, the view pills with their counts
 * (Waiting on you · Waiting on them · All), a divider, the Started from
 * filter, the table and the thread drawer a row opens.
 *
 * The selection machine is Admin › Ask's, verbatim in shape: `selectedId`
 * (which row wears the wash), `drawerId` (which thread the rail is drawing)
 * and `closing` (the rail is playing its width keyframe out) come apart
 * during the 200ms close. `?id=` lands open on a deep link and is mirrored
 * with `replaceState`, never pushed.
 *
 * The rows live in state so a reply sent from the drawer moves its thread to
 * "Waiting on them" at once; `router.refresh()` then brings the header's
 * Messages count along.
 */
type MessagesView = "you" | "them" | "all";
type OriginFilter = "any" | SupportOrigin;

const VIEW_OPTIONS: { value: MessagesView; label: string }[] = [
  { value: "you", label: "Waiting on you" },
  { value: "them", label: "Waiting on them" },
  { value: "all", label: "All" },
];

const EMPTY_TITLE: Record<MessagesView, string> = {
  you: "Nothing waiting on you",
  them: "Nothing waiting on them",
  all: "No messages yet",
};

function inView(
  rows: readonly AdminSupportThreadRow[],
  view: MessagesView,
): AdminSupportThreadRow[] {
  return view === "all"
    ? [...rows]
    : rows.filter((row) => row.waitingOn === view);
}

function byOrigin(
  rows: readonly AdminSupportThreadRow[],
  origin: OriginFilter,
): AdminSupportThreadRow[] {
  return origin === "any"
    ? [...rows]
    : rows.filter((row) => row.origin === origin);
}

function syncUrl(id: string | null) {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set("id", id);
  else url.searchParams.delete("id");
  window.history.replaceState(null, "", url.toString());
}

export function MessagesPageContent({
  rows: initialRows,
  viewerId,
  initialSelectedId,
}: {
  rows: AdminSupportThreadRow[];
  /** The signed-in admin: their own replies read "You". */
  viewerId: string;
  /** `?id=` from the URL, or null. Ignored unless it names a thread. */
  initialSelectedId: string | null;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const initialRow = initialSelectedId
    ? (initialRows.find((row) => row.threadId === initialSelectedId) ?? null)
    : null;
  // A deep link to a thread waiting on the player opens on the view that
  // holds it.
  const [view, setView] = useState<MessagesView>(
    initialRow?.waitingOn === "them" ? "them" : "you",
  );
  const [origin, setOrigin] = useState<OriginFilter>("any");
  const [selectedId, setSelectedId] = useState<string | null>(
    initialRow?.threadId ?? null,
  );
  const [drawerId, setDrawerId] = useState<string | null>(
    initialRow?.threadId ?? null,
  );
  const [closing, setClosing] = useState(false);
  const [openedByKeyboard, setOpenedByKeyboard] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A reply moves the open thread out of "Waiting on you". It stays in the
  // table (and the drawer on it) until the row is let go, so the record does
  // not vanish from under the admin who just answered it; the pill counts
  // move at once.
  const viewRows = rows.filter(
    (row) =>
      view === "all" || row.waitingOn === view || row.threadId === selectedId,
  );
  const shown = byOrigin(viewRows, origin);
  const drawerRow = drawerId
    ? (rows.find((row) => row.threadId === drawerId) ?? null)
    : null;
  const drawerIndex = drawerRow ? shown.indexOf(drawerRow) : -1;

  const finishClose = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
    setDrawerId(null);
    setClosing(false);
  }, []);

  const select = useCallback(
    (row: AdminSupportThreadRow, viaKeyboard: boolean) => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
      closeTimer.current = null;
      setClosing(false);
      setSelectedId(row.threadId);
      setDrawerId(row.threadId);
      setOpenedByKeyboard(viaKeyboard);
      syncUrl(row.threadId);
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
        document.getElementById(messagesRowId(returnFocusTo))?.focus();
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
      .getElementById(messagesRowId(next.threadId))
      ?.scrollIntoView({ block: "nearest" });
  }

  function changeView(next: MessagesView) {
    if (next === view) return;
    setView(next);
    // The rows change under the drawer: close it with them.
    if (drawerId) close(null);
  }

  function changeOrigin(next: OriginFilter) {
    if (next === origin) return;
    setOrigin(next);
    if (drawerId) close(null);
  }

  // The staff reply landed: the thread's move is now the player's.
  const onSent = useCallback(
    (threadId: string, sentAt: string) => {
      setRows((current) =>
        current
          .map((row) =>
            row.threadId === threadId
              ? {
                  ...row,
                  lastAt: sentAt,
                  lastAuthorRole: "staff" as const,
                  waitingOn: "them" as const,
                }
              : row,
          )
          .sort((a, b) => Date.parse(b.lastAt) - Date.parse(a.lastAt)),
      );
      router.refresh();
    },
    [router],
  );

  const viewOptions = VIEW_OPTIONS.map((option) => ({
    ...option,
    count: inView(rows, option.value).length,
  }));
  const originOptions: FilterMenuOption<OriginFilter>[] = [
    { value: "any", label: "All" },
    ...SUPPORT_ORIGINS.map((value) => ({
      value,
      label: originLabel(value),
      count: byOrigin(viewRows, value).length,
    })),
  ];

  const toggle = (row: AdminSupportThreadRow, viaKeyboard: boolean) => {
    if (row.threadId === selectedId) close(row.threadId);
    else select(row, viaKeyboard);
  };

  return (
    <AdminPage
      rail={
        drawerRow && drawerIndex >= 0 ? (
          <SupportThreadDrawer
            row={drawerRow}
            viewerId={viewerId}
            index={drawerIndex}
            total={shown.length}
            closing={closing}
            autoFocus={openedByKeyboard}
            onPrev={() => step(-1)}
            onNext={() => step(1)}
            onClose={() => close(drawerRow.threadId)}
            onClosed={finishClose}
            onSent={onSent}
          />
        ) : null
      }
    >
      <div className="flex flex-col">
        <h1 className="text-display">Messages</h1>
        <p className="text-body-sm mt-[9px] text-[var(--ink-600)]">
          One conversation per player, wherever it started.
        </p>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <CountPills options={viewOptions} value={view} onChange={changeView} />
        <FilterDivider />
        <FilterMenuPill
          label="Started from"
          options={originOptions}
          value={origin}
          onChange={changeOrigin}
        />
      </div>

      <div className="mt-4">
        <MessagesTable
          rows={shown}
          emptyTitle={
            origin === "any"
              ? EMPTY_TITLE[view]
              : `No threads from ${originLabel(origin).toLowerCase()} here`
          }
          selectedId={selectedId}
          onSelect={toggle}
        />
      </div>
    </AdminPage>
  );
}
