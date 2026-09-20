"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Plus, Users } from "lucide-react";
import { useMatchData } from "@/components/dashboard/matches/match-data-provider";
import {
  useMatchSides,
  type MatchSide,
} from "@/components/dashboard/matches/match-detail/use-match-sides";
import type { MatchPoint } from "@/lib/data/match-points-server";
import type { SavedViewRow } from "@/lib/data/saved-views-server";
import {
  canManageSavedView,
  hasDuplicateViewName,
  mergeManageableOrder,
  moveItem,
} from "@/lib/data/saved-views-logic";
import type { ProgramRole, WorkspaceKind } from "@/lib/workspace/types";
import {
  deleteSavedView,
  duplicateSavedView,
  renameSavedView,
  reorderSavedViews,
  restoreSavedView,
  setSavedViewShared,
} from "@/app/dashboard/matches/(detail)/[matchId]/saved-views-actions";
import { CourtTile } from "./court-tile";
import { ManageTileMenu } from "./manage-tile-menu";
import { useVizState } from "./use-viz-state";
import type { VizState } from "./viz-url";
import { activeFilterEntries } from "./viz-url";
import { computeViz, subjectFor, EMPTY_VIZ_FILTERS } from "./viz-model";
import { truncatePillLabels } from "./viz-labels";
import { cn } from "@/lib/utils";

/**
 * Task 9 (P1a band + Part B Manage mode): every saved view the viewer can
 * see — their own private ones plus the workspace's shared ones, in the
 * given order — as the same 3-col `CourtTile` grid the wall draws, plus a
 * dashed "New view" tile. Mounted by `shots-tab.tsx` on both `VizWall` (via
 * its `savedViewsBand` slot) and `VizFocused` (ditto), so it is the SAME
 * band on both surfaces — one component, two mount points.
 *
 * P1b: renders nothing at all with zero views — never an empty band, a
 * skeleton or sample tiles.
 *
 * Manage mode (Part B) is entirely this component's own client state — on/off,
 * which tile's ⋯ menu is open, which tile is mid-rename, drag state, the
 * transient status line — never URL state, per the task's ruling. Toggled by
 * the "Manage views" / "Done" button in the header; only shown at all when at
 * least one view is `canManageSavedView`.
 */
export function SavedViewsBand({
  views,
  workspaceRole,
  workspaceKind,
}: {
  views: SavedViewRow[];
  workspaceRole: ProgramRole;
  workspaceKind: WorkspaceKind;
}) {
  const router = useRouter();
  const { points } = useMatchData();
  const { you, opp } = useMatchSides();
  const { hrefFor } = useVizState();
  const [, startTransition] = useTransition();

  const [manageMode, setManageMode] = useState(false);
  const [optimisticViews, setOptimisticViews] = useState(views);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameDuplicate, setRenameDuplicate] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [status, setStatus] = useState<{
    text: string;
    undo?: () => void;
  } | null>(null);

  const tileElsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const menuTriggerElsRef = useRef<Map<string, HTMLButtonElement>>(new Map());
  const doneButtonRef = useRef<HTMLButtonElement>(null);
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragSnapshotRef = useRef<Map<string, DOMRect>>(new Map());
  const dragStartOrderRef = useRef<string[]>([]);
  const dragLastNearestIdRef = useRef<string | null>(null);
  const prevRectsRef = useRef<Map<string, DOMRect>>(new Map());

  const reducedMotion = usePrefersReducedMotion();

  // Every mutating action revalidates the page; a Server Action invoked from
  // a client component re-syncs the Router Cache once it resolves (see
  // `save-view-dialog.tsx`'s `router.refresh()` comment), which flows back
  // here as a fresh `views` prop. That prop is the source of truth this local
  // copy reconciles against on every change — optimistic edits in between are
  // this component's own state.
  //
  // `views` genuinely is an external source (server-confirmed state arriving
  // from outside, like `save-view-dialog.tsx`'s "clean slate on open" effect
  // a few lines away in the sibling file) rather than a value derivable from
  // props/state during render, so this is the legitimate case
  // `react-hooks/set-state-in-effect` warns about generally — same call as
  // `film-tab.tsx`'s identical suppression.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- external source (server-confirmed views), not a render-derivable value
    setOptimisticViews(views);
  }, [views]);

  useEffect(
    () => () => {
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    },
    [],
  );

  const manageableIds = useMemo(
    () =>
      optimisticViews
        .filter((v) => canManageSavedView(v, workspaceRole))
        .map((v) => v.id),
    [optimisticViews, workspaceRole],
  );
  const canManageAny = manageableIds.length > 0;

  // FLIP: whenever the rendered order of tiles changes (a drag preview or a
  // keyboard move — never a mount, never under `prefers-reduced-motion`),
  // slide each tracked tile from where it WAS to where it now is over 200ms.
  // Only manageable tiles are tracked in `tileElsRef` (see the render below),
  // and `mergeManageableOrder` guarantees a non-manageable id never changes
  // array index — so nothing here ever needs to animate a tile the viewer
  // cannot touch.
  const orderKey = optimisticViews.map((v) => v.id).join("|");
  const isFirstOrderRender = useRef(true);
  useLayoutEffect(() => {
    const newRects = new Map<string, DOMRect>();
    tileElsRef.current.forEach((el, id) =>
      newRects.set(id, el.getBoundingClientRect()),
    );

    if (!isFirstOrderRender.current && !reducedMotion) {
      const prevRects = prevRectsRef.current;
      newRects.forEach((newRect, id) => {
        const prevRect = prevRects.get(id);
        const el = tileElsRef.current.get(id);
        if (!prevRect || !el) return;
        const dx = prevRect.left - newRect.left;
        const dy = prevRect.top - newRect.top;
        if (dx === 0 && dy === 0) return;
        el.style.transition = "none";
        el.style.transform = `translate(${dx}px, ${dy}px)`;
        requestAnimationFrame(() => {
          el.style.transition = "transform 200ms var(--ease-primary)";
          el.style.transform = "";
        });
      });
    }

    isFirstOrderRender.current = false;
    prevRectsRef.current = newRects;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the order itself should retrigger this
  }, [orderKey]);

  // Manage mode mounts a fresh set of tracked (manageable-tile) DOM nodes —
  // `tileElsRef` is empty outside it. Baseline their rest positions the
  // moment it turns on, so the FIRST drag or keyboard move after entering
  // Manage mode has a `prevRect` to animate from too, not just the second one
  // onward.
  useLayoutEffect(() => {
    if (!manageMode) return;
    const rects = new Map<string, DOMRect>();
    tileElsRef.current.forEach((el, id) =>
      rects.set(id, el.getBoundingClientRect()),
    );
    prevRectsRef.current = rects;
  }, [manageMode]);

  if (views.length === 0) {
    return null;
  }

  function setStatusMessage(text: string, undo?: () => void, ms = 6000) {
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    setStatus({ text, undo });
    statusTimerRef.current = setTimeout(() => setStatus(null), ms);
  }

  function toggleManageMode() {
    setManageMode((m) => !m);
    setOpenMenuId(null);
    setRenamingId(null);
    setRenameDuplicate(false);
    setDragId(null);
  }

  function focusAfterRemoval(removedId: string) {
    const remaining = manageableIds.filter((id) => id !== removedId);
    const nextEl = remaining[0]
      ? menuTriggerElsRef.current.get(remaining[0])
      : undefined;
    (nextEl ?? doneButtonRef.current)?.focus();
  }

  function tileDataFor(view: SavedViewRow) {
    const subjectIsPlayer1 = subjectFor(view.filters, you.isPlayer1);
    const result = computeViz(points, view.cut, view.filters, subjectIsPlayer1);
    const subjectName = view.filters.player === "you" ? you.name : opp.name;
    const entries = activeFilterEntries({
      cut: view.cut,
      chart: view.chart,
      filters: view.filters,
      viewId: null,
    });
    const pills = truncatePillLabels(entries.map((entry) => entry.label));
    const countLabel =
      view.cut === "serve"
        ? `${result.count} of ${result.total}`
        : `${result.count} returns`;
    const href = hrefFor({
      cut: view.cut,
      chart: view.chart,
      filters: view.filters,
      viewId: view.id,
    });
    return { subjectName, pills, countLabel, dots: result.dots, href };
  }

  /* ── Rename ─────────────────────────────────────────────────────────── */

  function startRename(view: SavedViewRow) {
    if (openMenuId === view.id) setOpenMenuId(null);
    setRenamingId(view.id);
    setRenameValue(view.name);
    setRenameDuplicate(false);
  }

  function cancelRename() {
    const id = renamingId;
    setRenamingId(null);
    setRenameDuplicate(false);
    if (id) menuTriggerElsRef.current.get(id)?.focus();
  }

  function candidatePoolNames(view: SavedViewRow): string[] {
    return optimisticViews
      .filter(
        (v) =>
          v.id !== view.id && (view.shared ? v.shared : !v.shared && v.mine),
      )
      .map((v) => v.name);
  }

  function commitRename(view: SavedViewRow) {
    const trimmed = renameValue.trim();
    if (trimmed.length === 0) {
      cancelRename();
      return;
    }
    if (hasDuplicateViewName(trimmed, candidatePoolNames(view))) {
      setRenameDuplicate(true);
      return;
    }

    const previousName = view.name;
    setOptimisticViews((prev) =>
      prev.map((v) => (v.id === view.id ? { ...v, name: trimmed } : v)),
    );
    setRenamingId(null);
    setRenameDuplicate(false);

    startTransition(async () => {
      const result = await renameSavedView(view.id, trimmed);
      if (!result.ok) {
        setOptimisticViews((prev) =>
          prev.map((v) =>
            v.id === view.id ? { ...v, name: previousName } : v,
          ),
        );
        if (result.error === "duplicate_name") {
          setRenamingId(view.id);
          setRenameValue(trimmed);
          setRenameDuplicate(true);
        } else {
          setStatusMessage("Couldn't save that change");
        }
        return;
      }
      router.refresh();
    });
  }

  /* ── Duplicate ──────────────────────────────────────────────────────── */

  function handleDuplicate(view: SavedViewRow) {
    startTransition(async () => {
      const result = await duplicateSavedView(view.id);
      if (!result.ok) {
        setStatusMessage("Couldn't save that change");
        return;
      }
      router.refresh();
    });
  }

  /* ── Share / un-share ──────────────────────────────────────────────── */

  function handleShare(view: SavedViewRow) {
    setOptimisticViews((prev) =>
      prev.map((v) => (v.id === view.id ? { ...v, shared: true } : v)),
    );
    startTransition(async () => {
      const result = await setSavedViewShared(view.id, true);
      if (!result.ok) {
        setOptimisticViews((prev) =>
          prev.map((v) => (v.id === view.id ? { ...v, shared: false } : v)),
        );
        setStatusMessage(
          result.error === "duplicate_name"
            ? `A shared view is already called "${view.name}". Rename yours first.`
            : "Couldn't save that change",
        );
        return;
      }
      router.refresh();
    });
  }

  function handleUnshare(view: SavedViewRow) {
    setOptimisticViews((prev) =>
      prev.map((v) => (v.id === view.id ? { ...v, shared: false } : v)),
    );
    startTransition(async () => {
      const result = await setSavedViewShared(view.id, false);
      if (!result.ok) {
        setOptimisticViews((prev) =>
          prev.map((v) => (v.id === view.id ? { ...v, shared: true } : v)),
        );
        setStatusMessage("Couldn't save that change");
        return;
      }
      router.refresh();
    });
  }

  /* ── Delete / Undo ──────────────────────────────────────────────────── */

  function handleDelete(view: SavedViewRow) {
    if (openMenuId === view.id) setOpenMenuId(null);
    setOptimisticViews((prev) => prev.filter((v) => v.id !== view.id));
    focusAfterRemoval(view.id);

    startTransition(async () => {
      const result = await deleteSavedView(view.id);
      if (!result.ok) {
        setOptimisticViews((prev) =>
          [...prev, view].sort((a, b) => a.order - b.order),
        );
        setStatusMessage("Couldn't save that change");
        return;
      }
      const deleted = result.data;
      // Undo only ever restores the caller's OWN view — `restoreSavedView`
      // refuses anything else server-side (transferring a shared view's
      // ownership to whoever clicked Undo would be a bug, not a convenience).
      // A staff delete of a teammate's shared view gets the fact with no
      // offer to undo it.
      setStatusMessage(
        deleted.mine ? "View deleted · Undo" : "View deleted",
        deleted.mine ? () => handleUndo(deleted) : undefined,
      );
      router.refresh();
    });
  }

  function handleUndo(view: SavedViewRow) {
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    setStatus(null);
    startTransition(async () => {
      const result = await restoreSavedView(view);
      if (!result.ok) {
        setStatusMessage("Couldn't save that change");
        return;
      }
      router.refresh();
    });
  }

  /* ── Reorder (drag + ⌥←/→/↑/↓) ─────────────────────────────────────── */

  function previewManageableOrder(newManageableOrder: string[]): string[] {
    const allIds = optimisticViews.map((v) => v.id);
    const merged = mergeManageableOrder(
      allIds,
      manageableIds,
      newManageableOrder,
    );
    const byId = new Map(optimisticViews.map((v) => [v.id, v]));
    setOptimisticViews(
      merged
        .map((id) => byId.get(id))
        .filter((v): v is SavedViewRow => Boolean(v)),
    );
    return merged;
  }

  function commitReorder(merged: string[]) {
    startTransition(async () => {
      const result = await reorderSavedViews(merged);
      if (!result.ok) {
        setOptimisticViews(views);
        setStatusMessage("Couldn't save that change");
        return;
      }
      router.refresh();
    });
  }

  function handleTileKeyDown(
    e: ReactKeyboardEvent<HTMLDivElement>,
    view: SavedViewRow,
  ) {
    if (!manageMode || !canManageSavedView(view, workspaceRole)) return;
    if (!e.altKey) return;
    let dir = 0;
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") dir = -1;
    else if (e.key === "ArrowRight" || e.key === "ArrowDown") dir = 1;
    else return;
    e.preventDefault();

    const idx = manageableIds.indexOf(view.id);
    if (idx === -1) return;
    const newManageableOrder = moveItem(manageableIds, idx, idx + dir);
    if (newManageableOrder.join("|") === manageableIds.join("|")) return;

    const merged = previewManageableOrder(newManageableOrder);
    commitReorder(merged);
    const newIdx = newManageableOrder.indexOf(view.id);
    setStatusMessage(
      `Moved "${view.name}" to position ${newIdx + 1} of ${manageableIds.length}`,
    );
  }

  function handleTilePointerDown(
    e: ReactPointerEvent<HTMLDivElement>,
    view: SavedViewRow,
  ) {
    if (!manageMode || !canManageSavedView(view, workspaceRole)) return;
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);

    const snapshot = new Map<string, DOMRect>();
    manageableIds.forEach((id) => {
      const el = tileElsRef.current.get(id);
      if (el) snapshot.set(id, el.getBoundingClientRect());
    });
    dragSnapshotRef.current = snapshot;
    dragStartOrderRef.current = optimisticViews.map((v) => v.id);
    dragLastNearestIdRef.current = view.id;
    setDragId(view.id);
  }

  function handleTilePointerMove(
    e: ReactPointerEvent<HTMLDivElement>,
    view: SavedViewRow,
  ) {
    if (dragId !== view.id) return;
    const snapshot = dragSnapshotRef.current;
    if (snapshot.size === 0) return;

    let nearestId: string | null = null;
    let nearestDist = Infinity;
    snapshot.forEach((rect, id) => {
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dist = (e.clientX - cx) ** 2 + (e.clientY - cy) ** 2;
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestId = id;
      }
    });
    if (!nearestId || nearestId === dragLastNearestIdRef.current) return;
    dragLastNearestIdRef.current = nearestId;

    const fromIdx = manageableIds.indexOf(dragId);
    const toIdx = manageableIds.indexOf(nearestId);
    if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;

    // Hit-testing stays pinned to `dragSnapshotRef`'s frozen drag-start
    // positions on purpose — previewing the swap moves tiles on screen, and
    // re-measuring live rects mid-drag would feed that visual movement back
    // into where the pointer is compared against.
    const previewOrder = moveItem(manageableIds, fromIdx, toIdx);
    previewManageableOrder(previewOrder);
  }

  function handleTilePointerEnd(
    e: ReactPointerEvent<HTMLDivElement>,
    view: SavedViewRow,
  ) {
    if (dragId !== view.id) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setDragId(null);
    dragSnapshotRef.current = new Map();

    const currentIds = optimisticViews.map((v) => v.id);
    if (currentIds.join("|") !== dragStartOrderRef.current.join("|")) {
      commitReorder(currentIds);
    }
  }

  function registerTileEl(id: string, el: HTMLDivElement | null) {
    if (el) tileElsRef.current.set(id, el);
    else tileElsRef.current.delete(id);
  }

  function registerMenuTriggerEl(id: string, el: HTMLButtonElement | null) {
    if (el) menuTriggerElsRef.current.set(id, el);
    else menuTriggerElsRef.current.delete(id);
  }

  function handleMenuOpenChange(id: string, open: boolean) {
    setOpenMenuId(open ? id : null);
    // Opening a different tile's menu mid-rename abandons the edit rather
    // than leaving two tiles in conflicting transient states at once.
    if (open && renamingId && renamingId !== id) {
      setRenamingId(null);
      setRenameDuplicate(false);
    }
  }

  return (
    <div
      className="flex flex-col gap-4"
      style={{
        marginTop: 8,
        paddingTop: 24,
        borderTop: "1px solid var(--border-hairline)",
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <h2
            style={{
              fontSize: 24,
              fontWeight: 300,
              letterSpacing: "-0.3px",
              color: "var(--ink-900)",
            }}
          >
            Saved views
          </h2>
          <span className="text-micro">
            {views.length} saved view{views.length === 1 ? "" : "s"}
          </span>
        </div>
        {manageMode ? (
          <div className="flex shrink-0 items-center gap-3">
            <span className="text-micro whitespace-nowrap">
              Drag a view to reorder · ⋯ to rename or delete
            </span>
            <button
              type="button"
              ref={doneButtonRef}
              onClick={toggleManageMode}
              className="shrink-0 cursor-pointer text-[11px] font-medium whitespace-nowrap text-[var(--blue)] hover:text-[var(--blue-hover)]"
            >
              Done
            </button>
          </div>
        ) : (
          canManageAny && (
            <button
              type="button"
              onClick={toggleManageMode}
              className="shrink-0 cursor-pointer text-[11px] font-medium whitespace-nowrap text-[var(--blue)] hover:text-[var(--blue-hover)]"
            >
              Manage views
            </button>
          )
        )}
      </div>

      {manageMode && (
        <div
          role="status"
          aria-live="polite"
          className="text-micro flex items-center gap-1.5"
        >
          {status && (
            <>
              <span>{status.text}</span>
              {status.undo && (
                <button
                  type="button"
                  onClick={() => {
                    const undo = status.undo;
                    setStatus(null);
                    undo?.();
                  }}
                  className="cursor-pointer font-medium text-[var(--blue)] hover:text-[var(--blue-hover)]"
                >
                  Undo
                </button>
              )}
            </>
          )}
        </div>
      )}

      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}
      >
        {optimisticViews.map((view) => {
          const manageable = canManageSavedView(view, workspaceRole);
          const data = tileDataFor(view);

          if (manageMode && manageable) {
            return (
              <ManageableSavedViewTile
                key={view.id}
                view={view}
                data={data}
                workspaceKind={workspaceKind}
                workspaceRole={workspaceRole}
                isDragging={dragId === view.id}
                isRenaming={renamingId === view.id}
                renameValue={renameValue}
                renameDuplicate={renameDuplicate}
                menuOpen={openMenuId === view.id}
                onMenuOpenChange={(open) => handleMenuOpenChange(view.id, open)}
                onRegisterTileEl={(el) => registerTileEl(view.id, el)}
                onRegisterMenuTriggerEl={(el) =>
                  registerMenuTriggerEl(view.id, el)
                }
                onRenameValueChange={(value) => {
                  setRenameValue(value);
                  setRenameDuplicate(false);
                }}
                onRenameCommit={() => commitRename(view)}
                onRenameCancel={cancelRename}
                onStartRename={() => startRename(view)}
                onDuplicate={() => handleDuplicate(view)}
                onShare={() => handleShare(view)}
                onUnshare={() => handleUnshare(view)}
                onDelete={() => handleDelete(view)}
                onPointerDownTile={(e) => handleTilePointerDown(e, view)}
                onPointerMoveTile={(e) => handleTilePointerMove(e, view)}
                onPointerEndTile={(e) => handleTilePointerEnd(e, view)}
                onKeyDownTile={(e) => handleTileKeyDown(e, view)}
              />
            );
          }

          return (
            <CourtTile
              key={view.id}
              playerName={data.subjectName}
              name={view.name}
              nameAdornment={view.shared ? <SharedGlyph /> : undefined}
              pills={data.pills}
              countLabel={data.countLabel}
              cut={view.cut}
              dots={data.dots}
              href={data.href}
            />
          );
        })}
        <NewViewTile hrefFor={hrefFor} />
      </div>
    </div>
  );
}

function SharedGlyph() {
  return (
    <Users
      className="size-3 shrink-0"
      strokeWidth={1.5}
      style={{ color: "var(--ink-500)" }}
      aria-label="Shared with team"
      role="img"
    />
  );
}

/**
 * One manageable tile in Manage mode: the same `CourtTile`, plus the ⋯
 * overlay button/menu, an in-place rename field standing in for the name,
 * and the pointer/keyboard reorder handlers on the wrapping div.
 *
 * The wrapper intercepts the inner `<Link>`'s own click in the capture phase
 * — `preventDefault` there cancels the anchor's navigation before it fires,
 * for both a mouse click and an Enter/Space activation, without needing to
 * turn the tile into a non-link element. That is what keeps it "keyboard
 * reachable" (task-9-brief.md's own wording): it is still a real, focusable
 * `<a>`, just one whose default action this wrapper cancels while the tile
 * is a drag target instead of a navigation target.
 */
function ManageableSavedViewTile({
  view,
  data,
  workspaceKind,
  workspaceRole,
  isDragging,
  isRenaming,
  renameValue,
  renameDuplicate,
  menuOpen,
  onMenuOpenChange,
  onRegisterTileEl,
  onRegisterMenuTriggerEl,
  onRenameValueChange,
  onRenameCommit,
  onRenameCancel,
  onStartRename,
  onDuplicate,
  onShare,
  onUnshare,
  onDelete,
  onPointerDownTile,
  onPointerMoveTile,
  onPointerEndTile,
  onKeyDownTile,
}: {
  view: SavedViewRow;
  data: {
    subjectName: string;
    pills: string[];
    countLabel: string;
    dots: ReturnType<typeof computeViz>["dots"];
    href: string;
  };
  workspaceKind: WorkspaceKind;
  workspaceRole: ProgramRole;
  isDragging: boolean;
  isRenaming: boolean;
  renameValue: string;
  renameDuplicate: boolean;
  menuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
  onRegisterTileEl: (el: HTMLDivElement | null) => void;
  onRegisterMenuTriggerEl: (el: HTMLButtonElement | null) => void;
  onRenameValueChange: (value: string) => void;
  onRenameCommit: () => void;
  onRenameCancel: () => void;
  onStartRename: () => void;
  onDuplicate: () => void;
  onShare: () => void;
  onUnshare: () => void;
  onDelete: () => void;
  onPointerDownTile: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMoveTile: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerEndTile: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onKeyDownTile: (e: ReactKeyboardEvent<HTMLDivElement>) => void;
}) {
  const renameFieldId = useId();

  return (
    <div
      ref={onRegisterTileEl}
      onPointerDown={onPointerDownTile}
      onPointerMove={onPointerMoveTile}
      onPointerUp={onPointerEndTile}
      onPointerCancel={onPointerEndTile}
      onKeyDown={onKeyDownTile}
      onClickCapture={(e) => e.preventDefault()}
      className={cn(
        "rounded-[var(--radius-card)]",
        isDragging && "relative z-10",
      )}
      style={
        isDragging
          ? {
              boxShadow: "var(--shadow-card-emphasis)",
              outline: "2px solid var(--blue)",
              outlineOffset: "-1px",
              cursor: "grabbing",
            }
          : { cursor: "grab" }
      }
    >
      <CourtTile
        playerName={data.subjectName}
        name={view.name}
        nameAdornment={view.shared ? <SharedGlyph /> : undefined}
        nameSlot={
          isRenaming ? (
            <RenameField
              id={renameFieldId}
              value={renameValue}
              duplicate={renameDuplicate}
              onChange={onRenameValueChange}
              onCommit={onRenameCommit}
              onCancel={onRenameCancel}
            />
          ) : undefined
        }
        pills={data.pills}
        countLabel={data.countLabel}
        cut={view.cut}
        dots={data.dots}
        href={data.href}
        overlay={
          // Only `onPointerDown` needs to stop here — it keeps a press on the
          // ⋯ button from also being read as the START of a drag by the tile
          // wrapper's own (bubble-phase) pointerdown handler. A click does
          // NOT need stopping: the wrapper's `onClickCapture` above only
          // calls `preventDefault()` (cancelling the anchor's navigation),
          // never `stopPropagation()`, so the button's own click — and every
          // `FloatMenuItem` inside the portaled menu, which React still
          // treats as a descendant for event purposes — keeps working.
          <div
            className="absolute top-[10px] right-[10px]"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <ManageTileMenu
              viewName={view.name}
              view={view}
              workspaceKind={workspaceKind}
              role={workspaceRole}
              open={menuOpen}
              onOpenChange={onMenuOpenChange}
              onRename={onStartRename}
              onDuplicate={onDuplicate}
              onShare={onShare}
              onUnshare={onUnshare}
              onDelete={onDelete}
              trigger={
                <button
                  type="button"
                  ref={onRegisterMenuTriggerEl}
                  aria-label={`Manage "${view.name}"`}
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  className="flex size-6 cursor-pointer items-center justify-center rounded-full text-white"
                  style={{ backgroundColor: "rgba(13,13,13,.72)" }}
                >
                  <MoreHorizontal
                    className="size-3.5"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                </button>
              }
            />
          </div>
        }
      />
    </div>
  );
}

/**
 * The in-place rename control that stands in for a tile's name in Manage
 * mode. Enter commits, Esc reverts and returns focus to the ⋯ button (both
 * handled by the parent's callbacks) — no blur-commit: unmounting a focused
 * input on Escape's own re-render can fire a native blur the synthetic event
 * system does not reliably see, so committing on blur risked a double-fire
 * race. The parent instead abandons an in-progress rename outright whenever
 * another tile's menu opens (`handleMenuOpenChange`).
 */
function RenameField({
  id,
  value,
  duplicate,
  onChange,
  onCommit,
  onCancel,
}: {
  id: string;
  value: string;
  duplicate: boolean;
  onChange: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  const errorId = `${id}-error`;
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
      <label htmlFor={id} className="sr-only">
        Rename view
      </label>
      <input
        id={id}
        value={value}
        autoFocus
        onPointerDown={(e) => e.stopPropagation()}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          // Stop every key here from also reaching the tile wrapper's own
          // keydown handler (⌥←/→/↑/↓ reorder) — typing a name with Alt held
          // for an accented character, say, must never be read as a reorder
          // request.
          e.stopPropagation();
          if (e.key === "Enter") {
            e.preventDefault();
            onCommit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
        aria-invalid={duplicate || undefined}
        aria-describedby={duplicate ? errorId : undefined}
        className={cn(
          "w-full truncate border-b bg-transparent pb-0.5 text-[16px] leading-tight font-normal outline-none",
          duplicate ? "border-[var(--error)]" : "border-[var(--blue)]",
        )}
        style={{ letterSpacing: "-0.2px", color: "var(--ink-900)" }}
      />
      {duplicate && (
        <span
          id={errorId}
          role="alert"
          className="text-[10px]"
          style={{ color: "var(--error)" }}
        >
          A view with this name already exists.
        </span>
      )}
    </span>
  );
}

/**
 * The band's trailing dashed tile — always the Serve cut, default filters
 * (never carries anything over from the last-focused view), matching the
 * wall's own default entry point.
 */
function NewViewTile({
  hrefFor,
}: {
  hrefFor: (next: VizState) => string;
}): ReactNode {
  const href = hrefFor({
    cut: "serve",
    chart: "scatter",
    filters: EMPTY_VIZ_FILTERS,
    viewId: null,
  });

  return (
    <Link
      href={href}
      className="flex min-h-[220px] flex-col items-center justify-center gap-2 rounded-[var(--radius-card)] border border-dashed border-[var(--border-medium)] transition-colors duration-200 ease-[var(--ease-primary)] hover:border-[var(--blue)] motion-reduce:transition-none"
    >
      <Plus
        className="size-4 shrink-0"
        strokeWidth={1.5}
        style={{ color: "var(--ink-500)" }}
        aria-hidden="true"
      />
      <span
        className="text-[12px] font-medium"
        style={{ color: "var(--ink-500)" }}
      >
        New view
      </span>
    </Link>
  );
}

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void): () => void {
  const mq = window.matchMedia(REDUCED_MOTION_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function getReducedMotionSnapshot(): boolean {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

function getReducedMotionServerSnapshot(): boolean {
  return false;
}

/**
 * `useSyncExternalStore` rather than an effect + `useState` — the same
 * value, but read as React's own recommended way to subscribe to an
 * external source of truth (the browser's media query), which sidesteps
 * `react-hooks/set-state-in-effect` entirely instead of triggering it.
 */
function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot,
  );
}
