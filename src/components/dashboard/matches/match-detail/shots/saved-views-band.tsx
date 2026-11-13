"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Users } from "lucide-react";
import { useMatchData } from "@/components/dashboard/matches/match-data-provider";
import { useVizPoints } from "@/components/dashboard/matches/match-detail/shots/use-viz-points";
import { useMatchFilters } from "../match-filters/provider";
import { useMatchSides } from "@/components/dashboard/matches/match-detail/use-match-sides";
import type { SavedViewRow } from "@/lib/data/saved-views-server";
import {
  applyIdOrder,
  bandVisibility,
  canManageSavedView,
  mergeManageableOrder,
  moveItem,
  nextFocusId,
  savedViewNamePool,
  tileDataKey,
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
import { useVizBands } from "@/components/dashboard/matches/match-detail/shots/viz-bands-context";
import { depthBandRows } from "@/lib/data/viz-bands";
import {
  ManageableSavedViewTile,
  type SavedViewCardData,
} from "./manageable-saved-view-tile";
import { SavedViewsStatusLine } from "./saved-views-status-line";
import { WallCard } from "./wall-card";
import { wallSummaryFor } from "./wall-summary";
import type { SavedViewAction } from "./saved-view-title-menu";
import { useVizState } from "./use-viz-state";
import { usePrefersReducedMotion } from "@/components/dashboard/shared/use-reduced-motion";
import type { VizState } from "./viz-url";
import {
  computeViz,
  computeVizStats,
  subjectFor,
  EMPTY_VIZ_FILTERS,
  type PlayerFilter,
} from "./viz-model";

/** An open view's ask (`SavedViewAction`), numbered so each runs once. */
export type SavedViewRequest = SavedViewAction & { n: number };

/**
 * The Saved wall: every saved view the viewer can see for the wall's player
 * — their own private ones plus the workspace's shared ones, in the given
 * order — drawn as the Default wall's own cards (`WallCard`) in its own
 * two-column grid, then a dashed "Create view" card. Mounted by
 * `shots-tab.tsx` in `VizWall`'s `savedViewsBand` slot, under the same
 * toolbar the Default wall has.
 *
 * A view the viewer may manage shows a ⋯ on its card (hover or focus):
 * Rename…, Duplicate, sharing in a team workspace, Reorder…, Delete view.
 * Rename is a small popover (`rename-view-dialog.tsx`); Delete removes the
 * card at once and leaves a "Deleted “name” from all matches · Undo" line
 * above the grid.
 *
 * "Reorder…" turns on reorder mode — this component's own client state,
 * never URL state: the cards stop being links, can be dragged or moved with
 * ⌥←/⌥→, and a hint with "Done" stands above the grid until it is left.
 *
 * The band stays mounted with zero saved views, where "Create view" is its
 * only item. The one exception is transient: if deleting the LAST view
 * leaves a status message on screen, the band renders that line alone until
 * it clears (`bandVisibility`), so the Undo is not crowded by the dashed
 * card arriving in the same instant.
 */
export function SavedViewsBand({
  views,
  workspaceRole,
  workspaceKind,
  canSaveViews,
  readOnly = false,
  player,
  request = null,
  onRequestFailed,
}: {
  /**
   * The public share page: the focused "Views" grid keeps its default tiles
   * and loses everything a workspace owns — saved views, Manage, "Create
   * view". The wall never mounts the band there at all.
   */
  readOnly?: boolean;
  views: SavedViewRow[];
  workspaceRole: ProgramRole;
  workspaceKind: WorkspaceKind;
  /**
   * `shotsWriteAccess(meta).canSaveViews`. `false` (a read-only report — the
   * share page, the sample match) draws no "Create view" card and no ⋯:
   * every view reads as unmanageable, so its card is the plain link.
   */
  canSaveViews: boolean;
  /** The wall's You | Opponent: only that player's saved views are drawn. */
  player: PlayerFilter;
  /**
   * A change asked for from outside the band — the open view's ⋯ menu
   * (`shots-tab.tsx` bumps `n` per ask). It runs through the band's own
   * handlers, so a delete's Undo line shows on the wall exactly as it does
   * for a delete made here.
   */
  request?: SavedViewRequest | null;
  /**
   * A `request` the server refused, with the sentence to show. The wall's
   * own status line sits under the lightbox's scrim, so whoever asked (the
   * open view) says it where the reader is looking.
   */
  onRequestFailed?: (failure: { n: number; message: string }) => void;
}) {
  const router = useRouter();
  const points = useVizPoints(useMatchData());
  const { bands, unit } = useVizBands();
  const { you, opp } = useMatchSides();
  const { context: matchCtx } = useMatchFilters();
  const { hrefFor } = useVizState();
  const [, startTransition] = useTransition();

  const manageHintId = useId();
  const [manageMode, setManageMode] = useState(false);
  const [optimisticViews, setOptimisticViews] = useState(views);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [status, setStatus] = useState<{
    text: string;
    undo?: () => void;
  } | null>(null);

  const tileElsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const menuTriggerElsRef = useRef<Map<string, HTMLButtonElement>>(new Map());
  const doneButtonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // Latest `optimisticViews.length`, kept current by an effect below so the
  // `setStatusMessage` expiry timer can read the count AT EXPIRY without
  // closing over a stale value from when the timer was scheduled.
  const optimisticViewCountRef = useRef(0);
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

  // Keeps `optimisticViewCountRef` current after every commit — a ref write,
  // not `setState`, so this doesn't trigger `react-hooks/set-state-in-effect`;
  // it also isn't a render-time ref write (`react-hooks/refs` forbids that),
  // since it runs in the effect phase. Read by `setStatusMessage`'s expiry
  // timer below to see the count AT EXPIRY, not whatever it was when the
  // timer was scheduled.
  useEffect(() => {
    optimisticViewCountRef.current = optimisticViews.length;
  }, [optimisticViews]);

  // Every manage gate in this file asks this, never `canManageSavedView`
  // directly, so a read-only report cannot reach a writer through any one of
  // them (the header button, the ⋯ menu tile, drag, ⌥←/⌥→).
  const canManage = (view: SavedViewRow) =>
    canSaveViews && canManageSavedView(view, workspaceRole);

  const manageableIds = useMemo(
    () =>
      optimisticViews
        .filter((v) => canSaveViews && canManageSavedView(v, workspaceRole))
        .map((v) => v.id),
    [optimisticViews, workspaceRole, canSaveViews],
  );
  // The wall shows one player's views at a time (its You | Opponent).
  const visibleViews = optimisticViews.filter(
    (v) => v.filters.player === player,
  );
  const visibleManageableIds = visibleViews
    .filter((v) => manageableIds.includes(v.id))
    .map((v) => v.id);

  function tileDataFor(view: SavedViewRow): SavedViewCardData {
    const subjectIsPlayer1 = subjectFor(view.filters, you.isPlayer1);
    const result = computeViz(
      points,
      view.cut,
      view.filters,
      subjectIsPlayer1,
      view.chart,
      matchCtx,
    );
    const mine = view.filters.player === "you";
    const state: VizState = {
      cut: view.cut,
      chart: view.chart,
      filters: view.filters,
      viewId: view.id,
    };
    return {
      subjectName: mine ? you.name : opp.name,
      possessive: mine ? "your" : "their",
      cut: view.cut,
      dots: result.dots,
      // The Default wall's own footer (`default-tiles.ts`), over this view's
      // filters — the same stats the open view's Statistics column reads.
      summary: wallSummaryFor(
        view.cut,
        result,
        computeVizStats(
          points,
          view.cut,
          view.filters,
          subjectIsPlayer1,
          result,
          bands,
          unit,
          matchCtx,
        ),
        depthBandRows(bands, unit),
      ),
      href: hrefFor(state),
      state,
    };
  }

  // Review I1: `tileDataFor` runs `computeViz(points, …)` — an O(points) scan
  // — for EVERY tile on EVERY render, including a pointer-move mid-drag
  // (`handleTilePointerMove` calls `setOptimisticViews` on every hit-test
  // change) and every filter click anywhere in the tab (the whole tree
  // re-renders off the one shared `VizStateProvider`, see that file's own
  // I1 fix). None of that ever changes what a tile draws — only a view being
  // added/removed/edited, `points` itself, or which side is "you" does — so
  // this key on `tileDataKey(optimisticViews)` (order-independent: a reorder
  // produces the SAME key) skips the recompute for everything else. Keeping
  // `optimisticViews` itself OUT of the dependency list is deliberate: the
  // memo must not itself see a reorder as a reason to recompute, only
  // `viewsKey` should decide that.
  //
  // Must run before the `visibility === "hidden"` early return below (hooks
  // can't be called conditionally) — hence living up here rather than beside
  // `tileDataFor`'s original call site.
  const viewsKey = tileDataKey(
    optimisticViews.map((v) => ({
      id: v.id,
      cut: v.cut,
      chart: v.chart,
      filters: v.filters,
    })),
  );
  const tileDataById = useMemo(() => {
    const map = new Map<string, ReturnType<typeof tileDataFor>>();
    // Only the wall's player's cards draw; the other side computes on demand
    // when `player` flips (`player` is a dependency below).
    for (const view of optimisticViews) {
      if (view.filters.player === player) map.set(view.id, tileDataFor(view));
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `viewsKey` already captures every view's id/cut/filters, order-independent; including `optimisticViews`/`tileDataFor` directly would recompute on every reorder, defeating the memo
  }, [
    points,
    you.isPlayer1,
    you.name,
    opp.name,
    hrefFor,
    viewsKey,
    player,
    matchCtx,
    bands,
    unit,
  ]);

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

  // `optimisticViews.length`, not the `views` prop: the prop only catches up
  // once `router.refresh()` resolves, but the band must already know it's
  // down to zero the instant `handleDelete`'s optimistic update removes the
  // last row, so `status-only` visibility kicks in from that first render
  // rather than a beat later.
  const visibility = bandVisibility(optimisticViews.length, status !== null);

  // The wall band is ALWAYS mounted, even with zero saved views (user
  // decision, superseding the old P1b "absent with zero views" rule): the
  // dashed "Create view" tile must stay reachable from the wall. The only
  // state that still withholds tiles is `"status-only"` — the instant a
  // delete empties the last view, the Undo window takes that slot instead so
  // the "Create view" tile doesn't jump in underneath it mid-animation. The
  // focused row was never hidden this way to begin with: it always carries
  // the default tiles and the New-view tile regardless of saved-view count.

  function setStatusMessage(text: string, undo?: () => void, ms = 6000) {
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    setStatus({ text, undo });
    statusTimerRef.current = setTimeout(() => {
      setStatus(null);
      // The band is `status-only` right now precisely because it has zero
      // views (see `bandVisibility`) — once this status clears it will
      // unmount on the next render. Switch Manage mode off so it isn't still
      // "on" if a view is ever added back and the band remounts fresh.
      if (optimisticViewCountRef.current === 0) {
        setManageMode(false);
      }
    }, ms);
  }

  function toggleManageMode() {
    setManageMode((m) => !m);
    setOpenMenuId(null);
    setRenamingId(null);
    setDragId(null);
  }

  function focusAfterRemoval(removedId: string) {
    // Among the cards on screen: the other player's views are not mounted.
    // With none left, the wall's first link ("Create view") takes focus
    // rather than letting it fall to the page.
    const nextId = nextFocusId(visibleManageableIds, removedId);
    const nextEl =
      (nextId ? menuTriggerElsRef.current.get(nextId) : undefined) ??
      (manageMode
        ? undefined
        : (listRef.current?.querySelector<HTMLElement>("a[href]") ??
          undefined));
    (nextEl ?? doneButtonRef.current)?.focus();
  }

  /* ── Rename ─────────────────────────────────────────────────────────── */

  function startRename(view: SavedViewRow) {
    if (openMenuId === view.id) setOpenMenuId(null);
    setRenamingId(view.id);
  }

  function candidatePoolNames(view: SavedViewRow): string[] {
    return savedViewNamePool(optimisticViews, {
      shared: view.shared,
      excludeId: view.id,
    });
  }

  /** The dialog has already refused an empty, unchanged or taken name. */
  function commitRename(
    view: SavedViewRow,
    name: string,
    onFail?: (message: string) => void,
  ) {
    const previousName = view.name;
    setOptimisticViews((prev) =>
      prev.map((v) => (v.id === view.id ? { ...v, name } : v)),
    );
    setRenamingId(null);

    startTransition(async () => {
      const result = await renameSavedView(view.id, name);
      if (!result.ok) {
        setOptimisticViews((prev) =>
          prev.map((v) =>
            v.id === view.id ? { ...v, name: previousName } : v,
          ),
        );
        const message =
          result.error === "duplicate_name"
            ? `A view called “${name}” already exists.`
            : "Couldn't save that change";
        setStatusMessage(message);
        onFail?.(message);
        return;
      }
      router.refresh();
    });
  }

  /* ── Duplicate ──────────────────────────────────────────────────────── */

  function handleDuplicate(
    view: SavedViewRow,
    onFail?: (message: string) => void,
  ) {
    startTransition(async () => {
      const result = await duplicateSavedView(view.id);
      if (!result.ok) {
        // I3: the constraint permitting this cut/chart combination is
        // committed but not yet applied to the live database — no
        // "Try again", a retry can't succeed either.
        const message =
          result.error === "unsupported_cut_chart"
            ? "This kind of view can't be saved yet."
            : "Couldn't save that change";
        setStatusMessage(message);
        onFail?.(message);
        return;
      }
      router.refresh();
    });
  }

  /* ── Share / un-share ──────────────────────────────────────────────── */

  function handleShare(view: SavedViewRow, onFail?: (message: string) => void) {
    setOptimisticViews((prev) =>
      prev.map((v) => (v.id === view.id ? { ...v, shared: true } : v)),
    );
    startTransition(async () => {
      const result = await setSavedViewShared(view.id, true);
      if (!result.ok) {
        setOptimisticViews((prev) =>
          prev.map((v) => (v.id === view.id ? { ...v, shared: false } : v)),
        );
        const message =
          result.error === "duplicate_name"
            ? `A shared view is already called "${view.name}". Rename yours first.`
            : "Couldn't save that change";
        setStatusMessage(message);
        onFail?.(message);
        return;
      }
      router.refresh();
    });
  }

  function handleUnshare(
    view: SavedViewRow,
    onFail?: (message: string) => void,
  ) {
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
        onFail?.("Couldn't save that change");
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
      // is only offered for one the caller owns (`deleted.mine`):
      // transferring a shared view's ownership to whoever clicked Undo would be
      // a bug, not a convenience.
      // A staff delete of a teammate's shared view gets the fact with no
      // offer to undo it.
      setStatusMessage(
        // A view is not this match's alone: say where it went from.
        `Deleted “${deleted.name}” from all matches`,
        deleted.mine ? () => handleUndo(deleted) : undefined,
      );
      router.refresh();
    });
  }

  function handleUndo(view: SavedViewRow) {
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    setStatus(null);
    // Optimistic re-add, mirroring every other rollback in this file — and
    // load-bearing here specifically: clearing `status` above with zero views
    // still in `optimisticViews` would otherwise read as `bandVisibility`'s
    // "hidden" case for the one render between this click and
    // `router.refresh()` landing, unmounting the band a beat into its own
    // Undo. Restoring the row immediately keeps `visibility` at "full"
    // throughout, so the band "continues normally in Manage mode" with no gap.
    setOptimisticViews((prev) =>
      [...prev, view].sort((a, b) => a.order - b.order),
    );
    startTransition(async () => {
      // `restoreSavedView` takes only what a restore needs to create — no
      // `id`, no `mine` (review M8: that field never authorized anything
      // server-side; it's a display-time decision, made once already, by
      // `handleDelete` choosing whether to offer Undo at all).
      const result = await restoreSavedView({
        name: view.name,
        cut: view.cut,
        chart: view.chart,
        filters: view.filters,
        shared: view.shared,
        order: view.order,
      });
      if (!result.ok) {
        setOptimisticViews((prev) => prev.filter((v) => v.id !== view.id));
        setStatusMessage(
          result.error === "unsupported_cut_chart"
            ? "This kind of view can't be saved yet."
            : "Couldn't save that change",
        );
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

  /**
   * `preSnapshotIds` is the full band order as of just BEFORE the optimistic
   * reorder this call is committing — captured at the gesture's start
   * (`dragStartOrderRef.current` for a drag; taken fresh for a keyboard
   * move). On failure, that snapshot is replayed onto whatever the list
   * looks like NOW via `applyIdOrder` inside a functional update, rather
   * than overwriting with the closed-over `views` prop: a row created or
   * deleted by another actor (or a router refresh from a DIFFERENT
   * in-flight action) while this reorder was in flight is neither
   * duplicated nor silently discarded — every other rollback in this file
   * restores a captured snapshot or uses a functional update, and this one
   * previously didn't, which `views` going stale between the optimistic
   * write and this failure resolving could snap the band back to.
   */
  function commitReorder(merged: string[], preSnapshotIds: string[]) {
    startTransition(async () => {
      const result = await reorderSavedViews(merged);
      if (!result.ok) {
        setOptimisticViews((prev) => applyIdOrder(prev, preSnapshotIds));
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
    if (!manageMode || !canManage(view)) return;
    if (!e.altKey) return;
    let dir = 0;
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") dir = -1;
    else if (e.key === "ArrowRight" || e.key === "ArrowDown") dir = 1;
    else return;
    e.preventDefault();

    // One step among the cards on screen: the wall shows one player's
    // views, so the neighbour is the next VISIBLE one, wherever it sits in
    // the full order.
    const pos = visibleManageableIds.indexOf(view.id);
    const neighbour = visibleManageableIds[pos + dir];
    if (pos === -1 || neighbour === undefined) return;
    const newManageableOrder = moveItem(
      manageableIds,
      manageableIds.indexOf(view.id),
      manageableIds.indexOf(neighbour),
    );
    if (newManageableOrder.join("|") === manageableIds.join("|")) return;

    const preSnapshotIds = optimisticViews.map((v) => v.id);
    const merged = previewManageableOrder(newManageableOrder);
    commitReorder(merged, preSnapshotIds);
    setStatusMessage(
      `Moved "${view.name}" to position ${pos + dir + 1} of ${visibleManageableIds.length}`,
    );
  }

  function handleTilePointerDown(
    e: ReactPointerEvent<HTMLDivElement>,
    view: SavedViewRow,
  ) {
    if (!manageMode || !canManage(view)) return;
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);

    const snapshot = new Map<string, DOMRect>();
    visibleManageableIds.forEach((id) => {
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
      commitReorder(currentIds, dragStartOrderRef.current);
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
    }
  }

  // A change asked for from the open view (`request`): the same handlers a
  // card's own menu runs, once per request.
  const handledRequestRef = useRef(request?.n ?? 0);
  useEffect(() => {
    if (!request || request.n === handledRequestRef.current) return;
    handledRequestRef.current = request.n;
    const view = optimisticViews.find((v) => v.id === request.id);
    if (!view || !canManage(view)) return;
    const n = request.n;
    const failed = (message: string) => onRequestFailed?.({ n, message });
    // eslint-disable-next-line react-hooks/set-state-in-effect -- external ask (the open view's ⋯ menu), not a render-derivable value
    if (request.kind === "rename") commitRename(view, request.name, failed);
    else if (request.kind === "duplicate") handleDuplicate(view, failed);
    else if (request.kind === "share") handleShare(view, failed);
    else if (request.kind === "unshare") handleUnshare(view, failed);
    else handleDelete(view);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the request alone; the handlers read current state when it fires
  }, [request]);

  /** One saved view, as the Default wall's own card. */
  function renderSavedTile(view: SavedViewRow) {
    const data = tileDataById.get(view.id) ?? tileDataFor(view);

    if (!readOnly && canManage(view)) {
      return (
        <ManageableSavedViewTile
          view={view}
          data={data}
          reorderMode={manageMode}
          hintId={manageHintId}
          workspaceKind={workspaceKind}
          workspaceRole={workspaceRole}
          isDragging={dragId === view.id}
          menuOpen={openMenuId === view.id}
          onMenuOpenChange={(open) => handleMenuOpenChange(view.id, open)}
          renameOpen={renamingId === view.id}
          onRenameOpenChange={(open) => {
            if (open) startRename(view);
            else if (renamingId === view.id) setRenamingId(null);
          }}
          renamePool={candidatePoolNames(view)}
          onRename={(name) => commitRename(view, name)}
          onRegisterTileEl={(el) => registerTileEl(view.id, el)}
          onRegisterMenuTriggerEl={(el) => registerMenuTriggerEl(view.id, el)}
          onStartRename={() => startRename(view)}
          onDuplicate={() => handleDuplicate(view)}
          onShare={() => handleShare(view)}
          onUnshare={() => handleUnshare(view)}
          onReorder={toggleManageMode}
          onDelete={() => handleDelete(view)}
          onPointerDownTile={(e) => handleTilePointerDown(e, view)}
          onPointerMoveTile={(e) => handleTilePointerMove(e, view)}
          onPointerEndTile={(e) => handleTilePointerEnd(e, view)}
          onKeyDownTile={(e) => handleTileKeyDown(e, view)}
        />
      );
    }

    return (
      <WallCard
        name={view.name}
        nameAdornment={view.shared ? <SharedGlyph /> : undefined}
        playerName={data.subjectName}
        possessive={data.possessive}
        cut={data.cut}
        dots={data.dots}
        summary={data.summary}
        href={data.href}
        navigateState={data.state}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Reorder mode's own line: how to move a card, and the way out. It is
          entered from a card's ⋯ menu ("Reorder…"), so nothing stands here
          at rest and the toolbar above stays the Default wall's. */}
      {manageMode && (
        <div className="flex items-center justify-end gap-3">
          <span id={manageHintId} className="text-micro whitespace-nowrap">
            Drag a view to reorder, or focus it and press ⌥← / ⌥→
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
      )}

      {/* Gated on `status !== null` alone, never `manageMode`: Done must not
          hide a live status or Undo line — it stays until it expires or Undo
          is pressed. */}
      {status !== null && (
        <SavedViewsStatusLine
          status={status}
          onDismiss={() => setStatus(null)}
        />
      )}

      {visibility !== "status-only" && (
        // Renders at `"hidden"` too (zero views, nothing pending) so "Create
        // view" stays reachable. The Default wall's own grid; rows stretch,
        // so the dashed card beside a saved one is exactly its height.
        <div
          ref={listRef}
          role="list"
          aria-label="Saved views"
          className="grid grid-cols-1 gap-4 @min-[640px]:grid-cols-2"
        >
          {visibleViews.map((view) => (
            <div key={view.id} role="listitem">
              {renderSavedTile(view)}
            </div>
          ))}
          {canSaveViews && !manageMode && (
            <div role="listitem">
              <NewViewTile hrefFor={hrefFor} player={player} />
            </div>
          )}
        </div>
      )}

      {/* Nothing saved for this player yet: say what saving does, since
          "Create view" inside one match reads as this match's alone. */}
      {visibility !== "status-only" &&
        visibleViews.length === 0 &&
        canSaveViews &&
        !manageMode && (
          <p className="text-micro">Views you save show up on every match.</p>
        )}

      {/* Honest zero: a viewer who cannot save (so has no "Create view"
          card) on a player with no saved views would otherwise see a blank
          wall under the toolbar. */}
      {visibility !== "status-only" &&
        visibleViews.length === 0 &&
        !canSaveViews && (
          <div
            className="flex items-center justify-center rounded-[var(--radius-card)] border px-6 py-8 text-center"
            style={{
              borderColor: "var(--border-hairline)",
              backgroundColor: "var(--surface-card)",
            }}
          >
            <p className="text-[12px]" style={{ color: "var(--ink-500)" }}>
              {player === "you"
                ? "No saved views of your shots yet."
                : "No saved views of the opponent's shots yet."}
            </p>
          </div>
        )}
    </div>
  );
}

/** Exported for `manageable-saved-view-tile.tsx`, the other tile it's used from. */
export function SharedGlyph() {
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
 * The band's trailing dashed tile — G4: opens the blank "Create view"
 * prompt (`draft: true`, Serve cut, no filters — never carries anything
 * over from the last-focused view) rather than jumping straight to a
 * plotted Serve court. `viz-focused.tsx` reads `state.draft` to draw the
 * empty court and its "Pick what to plot" overlay instead of Serve's real
 * dots.
 */
function NewViewTile({
  hrefFor,
  player,
}: {
  hrefFor: (next: VizState) => string;
  /** The wall's player: the blank court opens on them. */
  player: PlayerFilter;
}): ReactNode {
  const href = hrefFor({
    cut: "serve",
    chart: "scatter",
    filters: { ...EMPTY_VIZ_FILTERS, player },
    viewId: null,
    draft: true,
  });

  return (
    <Link
      href={href}
      className="relative flex h-full flex-col overflow-hidden rounded-[var(--radius-card)] border border-dashed border-[var(--border-medium)] bg-[var(--surface-card)] transition-colors duration-200 ease-[var(--ease-primary)] hover:border-[var(--blue)] motion-reduce:transition-none"
    >
      {/* A wall card's own box — its court, then its label block — so the
          dashed card is a card's size when it stands alone in a row. */}
      <span
        aria-hidden="true"
        className="block max-h-[300px] w-full"
        style={{ aspectRatio: "334 / 216" }}
      />
      <span aria-hidden="true" className="block h-[97px]" />
      <span className="absolute inset-0 flex flex-col items-center justify-center gap-2">
        <Plus
          className="size-4 shrink-0"
          strokeWidth={1.5}
          style={{ color: "var(--ink-500)" }}
          aria-hidden="true"
        />
        <span
          className="text-[12px] font-medium"
          style={{ color: "var(--ink-700)" }}
        >
          Create view
        </span>
      </span>
    </Link>
  );
}
