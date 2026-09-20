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
import { useMatchSides } from "@/components/dashboard/matches/match-detail/use-match-sides";
import type { SavedViewRow } from "@/lib/data/saved-views-server";
import {
  applyIdOrder,
  bandVisibility,
  canManageSavedView,
  hasDuplicateViewName,
  mergeManageableOrder,
  moveItem,
  nextFocusId,
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
import { CourtTile } from "./court-tile";
import { ManageableSavedViewTile } from "./manageable-saved-view-tile";
import { useVizState } from "./use-viz-state";
import { usePrefersReducedMotion } from "./use-reduced-motion";
import type { VizState } from "./viz-url";
import { activeFilterEntries, sameView } from "./viz-url";
import {
  computeViz,
  subjectFor,
  tileCountLabel,
  EMPTY_VIZ_FILTERS,
} from "./viz-model";
import {
  truncatePillLabels,
  VIZ_TILE_GRID_CLASS,
  VIZ_TILE_GRID_STYLE,
} from "./viz-labels";
import { buildDefaultTiles, type DefaultTile } from "./default-tiles";

// M3: `variant="wall"` never renders a default tile (`viz-wall.tsx` builds
// its own) — a shared, frozen empty array lets the `defaultTiles` memo below
// skip `buildDefaultTiles`'s six `computeViz` scans entirely on that variant
// instead of running them for output nothing reads.
const EMPTY_DEFAULT_TILES: readonly DefaultTile[] = Object.freeze([]);

/**
 * Task 9 (P1a band + Part B Manage mode): every saved view the viewer can
 * see — their own private ones plus the workspace's shared ones, in the
 * given order — as the same 3-col `CourtTile` grid the wall draws, plus a
 * dashed "New view" tile. Mounted by `shots-tab.tsx` on both `VizWall` (via
 * its `savedViewsBand` slot) and `VizFocused` (ditto), so it is the SAME
 * band on both surfaces — one component, two mount points.
 *
 * P1b: renders nothing at all with zero views and nothing pending — never an
 * empty band, a skeleton or sample tiles. The one exception is transient: if
 * deleting the LAST view leaves a status message (the Undo window, or an
 * error) on screen, the band stays mounted status-only (heading + status
 * line, no tiles) until that status clears — see `bandVisibility`. Otherwise
 * the 6-second Undo affordance for the last view would be unreachable, since
 * the whole band carrying it would vanish the instant the delete lands.
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
  variant = "wall",
}: {
  views: SavedViewRow[];
  workspaceRole: ProgramRole;
  workspaceKind: WorkspaceKind;
  /**
   * F4: `"wall"` (default) is the pre-existing grid — saved views only,
   * absent with zero of them. `"focused"` is the focused view's "Views"
   * grid — the SAME 3-column wrapping grid the wall draws
   * (`VIZ_TILE_GRID_CLASS`/`VIZ_TILE_GRID_STYLE`, `viz-labels.tsx`), never a
   * horizontally scrolling row (that shape shipped once in this file's
   * history and was corrected: the design frame's "5 views" with three
   * tiles visible meant a second grid ROW below the fold, not a scroll
   * axis) — the six default tiles first, then saved views, then the dashed
   * New-view tile — ALWAYS mounted, even with zero saved views. The
   * container the grid lives in scrolls the page vertically, same as the
   * wall; nothing in this variant scrolls horizontally. Both variants share
   * every piece of Manage-mode state
   * and every mutation handler in this file; only what gets rendered, and
   * how, differs below.
   */
  variant?: "wall" | "focused";
}) {
  const router = useRouter();
  const { points } = useMatchData();
  const { you, opp } = useMatchSides();
  const { state, hrefFor } = useVizState();
  const [, startTransition] = useTransition();

  const manageHintId = useId();
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

  const manageableIds = useMemo(
    () =>
      optimisticViews
        .filter((v) => canManageSavedView(v, workspaceRole))
        .map((v) => v.id),
    [optimisticViews, workspaceRole],
  );
  const canManageAny = manageableIds.length > 0;

  function tileDataFor(view: SavedViewRow) {
    const subjectIsPlayer1 = subjectFor(view.filters, you.isPlayer1);
    const result = computeViz(
      points,
      view.cut,
      view.filters,
      subjectIsPlayer1,
      view.chart,
    );
    const subjectName = view.filters.player === "you" ? you.name : opp.name;
    const entries = activeFilterEntries({
      cut: view.cut,
      chart: view.chart,
      filters: view.filters,
      viewId: null,
    });
    const pills = truncatePillLabels(entries.map((entry) => entry.label));
    const countLabel = tileCountLabel(result);
    const href = hrefFor({
      cut: view.cut,
      chart: view.chart,
      filters: view.filters,
      viewId: view.id,
    });
    return { subjectName, pills, countLabel, dots: result.dots, href };
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
    optimisticViews.map((v) => ({ id: v.id, cut: v.cut, filters: v.filters })),
  );
  const tileDataById = useMemo(() => {
    const map = new Map<string, ReturnType<typeof tileDataFor>>();
    for (const view of optimisticViews) {
      map.set(view.id, tileDataFor(view));
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `viewsKey` already captures every view's id/cut/filters, order-independent; including `optimisticViews`/`tileDataFor` directly would recompute on every reorder, defeating the memo
  }, [points, you.isPlayer1, you.name, opp.name, hrefFor, viewsKey]);

  // F4 (`variant="focused"` only, but computed unconditionally — hooks can't
  // run conditionally): the same six default tiles the wall draws
  // (`buildDefaultTiles`, shared with `viz-wall.tsx` so the two can never
  // list a different set), keyed the same way `tileDataById` above is so a
  // scroll, a focus move, or a Manage-mode reorder never re-triggers the
  // O(points) scan inside it — only `points`/`you.isPlayer1`/the names/
  // `hrefFor` changing does. M3: `variant="wall"` never reads this output
  // (`viz-wall.tsx` already built its own default tiles for that render),
  // so it's gated to the shared frozen empty array there instead of running
  // `buildDefaultTiles`'s six scans for nothing.
  const defaultTiles = useMemo(
    () =>
      variant === "focused"
        ? buildDefaultTiles(
            points,
            {
              you: { isPlayer1: you.isPlayer1, name: you.name },
              opp: { isPlayer1: opp.isPlayer1, name: opp.name },
            },
            hrefFor,
          )
        : EMPTY_DEFAULT_TILES,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `opp.isPlayer1` is always `you.isPlayer1`'s inverse (same rule `viz-wall.tsx`'s own memo relies on), so it carries no information this dependency list doesn't already have
    [points, you.isPlayer1, you.name, opp.name, hrefFor, variant],
  );

  // Mirrors `viz-wall.tsx`'s `EmptySubjectRow` rule: a subject with nothing
  // drawable in any default cut loses its three tiles from the row entirely,
  // rather than showing three empty courts.
  const visibleDefaultTiles = useMemo(() => {
    const bySubject = new Map<DefaultTile["subject"], DefaultTile[]>();
    for (const tile of defaultTiles) {
      const arr = bySubject.get(tile.subject) ?? [];
      arr.push(tile);
      bySubject.set(tile.subject, arr);
    }
    const result: DefaultTile[] = [];
    for (const subject of ["you", "opponent"] as const) {
      const arr = bySubject.get(subject) ?? [];
      if (arr.length > 0 && !arr.every((t) => t.total === 0)) {
        result.push(...arr);
      }
    }
    return result;
  }, [defaultTiles]);

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

  // The wall band is absent outright with zero saved views and no status to
  // show — P1b. The focused row is never hidden this way: it always carries
  // the default tiles and the New-view tile even with zero saved views (the
  // user decision this task implements).
  if (variant === "wall" && visibility === "hidden") {
    return null;
  }

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
    setRenameDuplicate(false);
    setDragId(null);
  }

  function focusAfterRemoval(removedId: string) {
    const nextId = nextFocusId(manageableIds, removedId);
    const nextEl = nextId ? menuTriggerElsRef.current.get(nextId) : undefined;
    (nextEl ?? doneButtonRef.current)?.focus();
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
    // Enter commits and unmounts the rename field the same way Esc's
    // `cancelRename` does — focus must return to the tile's ⋯ button here
    // too, not just on cancel. The button itself is unaffected by
    // `renamingId` (only the name slot swaps), so it's already mounted and
    // `.focus()` lands immediately, before `router.refresh()` below re-renders
    // the tile with the server-confirmed name.
    menuTriggerElsRef.current.get(view.id)?.focus();

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

    const preSnapshotIds = optimisticViews.map((v) => v.id);
    const merged = previewManageableOrder(newManageableOrder);
    commitReorder(merged, preSnapshotIds);
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
      setRenameDuplicate(false);
    }
  }

  /**
   * One saved-view tile — the Manage-mode/plain branch shared by the wall's
   * grid and the focused view's grid, so the two can never draw it
   * differently. `current` rings the tile Signal Blue (F4) — omitted
   * (defaults to `false`) by the wall's own call, which never has a
   * "current" tile to mark.
   */
  function renderSavedTile(
    view: SavedViewRow,
    opts: { current?: boolean } = {},
  ) {
    const manageable = canManageSavedView(view, workspaceRole);
    const data = tileDataById.get(view.id) ?? tileDataFor(view);

    if (manageMode && manageable) {
      return (
        <ManageableSavedViewTile
          view={view}
          data={data}
          hintId={manageHintId}
          workspaceKind={workspaceKind}
          workspaceRole={workspaceRole}
          isDragging={dragId === view.id}
          isRenaming={renamingId === view.id}
          renameValue={renameValue}
          renameDuplicate={renameDuplicate}
          menuOpen={openMenuId === view.id}
          current={opts.current}
          onMenuOpenChange={(open) => handleMenuOpenChange(view.id, open)}
          onRegisterTileEl={(el) => registerTileEl(view.id, el)}
          onRegisterMenuTriggerEl={(el) => registerMenuTriggerEl(view.id, el)}
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
        playerName={data.subjectName}
        name={view.name}
        nameAdornment={view.shared ? <SharedGlyph /> : undefined}
        pills={data.pills}
        countLabel={data.countLabel}
        cut={view.cut}
        dots={data.dots}
        href={data.href}
        current={opts.current}
        navigateState={{
          cut: view.cut,
          chart: view.chart,
          filters: view.filters,
          viewId: view.id,
        }}
      />
    );
  }

  const totalRowViews = visibleDefaultTiles.length + optimisticViews.length;

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
        {variant === "focused" ? (
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2
              style={{
                fontSize: 24,
                fontWeight: 300,
                letterSpacing: "-0.3px",
                color: "var(--ink-900)",
              }}
            >
              Views
            </h2>
            <span className="text-micro truncate">
              {totalRowViews} view{totalRowViews === 1 ? "" : "s"} · {you.name}{" "}
              vs {opp.name}
            </span>
          </div>
        ) : (
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
            {visibility === "full" && (
              <span className="text-micro">
                {optimisticViews.length} saved view
                {optimisticViews.length === 1 ? "" : "s"}
              </span>
            )}
          </div>
        )}
        {manageMode ? (
          <div className="flex shrink-0 items-center gap-3">
            <span id={manageHintId} className="text-micro whitespace-nowrap">
              Drag a view to reorder, or focus it and press ⌥← / ⌥→ · ⋯ to
              rename or delete
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

      {/* Gated on `status !== null` alone, never `manageMode`: pressing Done
          only toggles Manage mode off (`toggleManageMode` doesn't touch
          `status`) and must not also hide a live status/Undo line — that
          line stays reachable until it expires or Undo is clicked,
          regardless of Manage mode. If Undo then restores a view, this
          renders in the band's normal (non-manage) mode, same as any other
          `full`-visibility render. */}
      {status !== null && (
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

      {variant === "focused" ? (
        <div
          role="list"
          // F5: `viz-vt-views-grid` only on the FOCUSED variant — the wall's
          // own saved-views grid never carries it, so this name is never
          // present in both the old and new snapshot of a wall→focused
          // transition at once (which would pair them as an "update"
          // instead of letting this grid stagger in as new content). See
          // `globals.css`'s `::view-transition-new(.viz-vt-views-grid)
          // :only-child` rule.
          className={`${VIZ_TILE_GRID_CLASS} viz-vt-views-grid`}
          style={VIZ_TILE_GRID_STYLE}
        >
          {visibleDefaultTiles.map((tile) => {
            const isCurrent = sameView(state, {
              cut: tile.cut,
              chart: tile.state.chart,
              filters: tile.state.filters,
            });
            return (
              <div key={tile.key} role="listitem">
                <CourtTile
                  playerName={tile.playerName}
                  name={tile.name}
                  pills={tile.pills}
                  countLabel={tile.countLabel}
                  cut={tile.cut}
                  dots={tile.dots}
                  href={tile.href}
                  current={isCurrent}
                  navigateState={tile.state}
                />
              </div>
            );
          })}

          {optimisticViews.map((view) => {
            const isCurrent = sameView(state, {
              cut: view.cut,
              chart: view.chart,
              filters: view.filters,
              id: view.id,
            });
            return (
              <div key={view.id} role="listitem">
                {renderSavedTile(view, { current: isCurrent })}
              </div>
            );
          })}

          <div role="listitem">
            <NewViewTile hrefFor={hrefFor} />
          </div>
        </div>
      ) : (
        visibility === "full" && (
          // M9: matches the focused variant's grid — one list, labelled the
          // same way the focused Views grid's own tiles are grouped.
          <div
            role="list"
            aria-label="Saved views"
            className={VIZ_TILE_GRID_CLASS}
            style={VIZ_TILE_GRID_STYLE}
          >
            {optimisticViews.map((view) => (
              <div key={view.id} role="listitem">
                {renderSavedTile(view)}
              </div>
            ))}
            <div role="listitem">
              <NewViewTile hrefFor={hrefFor} />
            </div>
          </div>
        )
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
