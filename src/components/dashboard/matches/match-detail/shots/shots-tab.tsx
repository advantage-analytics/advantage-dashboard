"use client";

import dynamic from "next/dynamic";
import { useMounted } from "@/lib/ui/use-mounted";
import { VizWall } from "@/components/dashboard/matches/match-detail/shots/viz-wall";
import { VizFocused } from "@/components/dashboard/matches/match-detail/shots/viz-focused";
import {
  useVizState,
  VizStateProvider,
} from "@/components/dashboard/matches/match-detail/shots/viz-state-context";
import { useMatchReport } from "@/components/dashboard/matches/match-detail/match-report-context";
import { SavedViewsBand } from "@/components/dashboard/matches/match-detail/shots/saved-views-band";
import { VizBandsProvider } from "@/components/dashboard/matches/match-detail/shots/viz-bands-context";

/**
 * The Visualizations tab's panel. `?cut=` absent (or unrecognised) renders
 * the wall of default cuts (`VizWall`, P1a/P1b); a recognised `cut` renders
 * the focused court view (`VizFocused`, Task 5) — the wall's tiles and the
 * toolbar's cut/chart menus are the only way in.
 *
 * Attribution (guardrails §4): "you" is resolved exactly once, by
 * `useMatchSides()` — `VizWall` and `VizFocused` each call it directly and
 * pass the resolved side's own `isPlayer1` down to `computeViz`. Nothing
 * below this reads player1/player2 off the match.
 *
 * `savedViews`/`workspaceRole`/`workspaceKind`/`workspaceName` (Task 8/9)
 * come from `useMatchReport().meta` — loaded once in `page.tsx` and threaded
 * through `MatchReportProvider` rather than fetched here.
 *
 * `SavedViewsBand` (Task 9, including Part B's Manage mode) is built ONCE
 * here and handed to both surfaces through their existing `savedViewsBand`
 * slot — one band, two mount points, so the wall and the focused view can
 * never draw a different list, count, or Manage-mode state. Manage mode
 * itself is entirely the band's own client state (never a prop from here);
 * it withholds "Manage views" whenever nothing in the list is manageable.
 * F4: only one of the two ever actually renders it at a time (only one of
 * `VizWall`/`VizFocused` mounts per `state.cut`), so `variant` is set here
 * from that same `state.cut` — `"wall"` renders the pre-existing saved-only
 * grid, `"focused"` the Views grid — a wrapping grid reached by scrolling
 * the page, not a scrolling row (defaults, saved, Create view).
 *
 * Saving is always on — everyone, including players, may save a view — so
 * `VizFocused` no longer takes an `onSaveRequest` opt-in; it owns its own
 * Save dialog and only needs the workspace facts that dialog's "Share with
 * team" row depends on.
 *
 * `VizStateProvider` (`viz-state-context.tsx`) is mounted ONCE here, around
 * the whole wall/focused tree, so every descendant's `useVizState()` reads
 * the SAME store — a click in the filters popover and a click in the
 * applied strip a moment later both land, instead of the second racing the
 * first's still-pending navigation. `ShotsTab` itself needs `state.cut` to
 * choose wall vs. focused, so it's split into this outer component (mounts
 * the provider) and `ShotsTabBody` (reads it) — `useVizState()` must run
 * inside the provider it belongs to, never above it.
 */

/**
 * Phase 2A: the fullscreen court viewer. Client-only (`ssr: false`) — it is a
 * `createPortal` onto `document.body` that measures its own stage before it
 * can place the court, so there is nothing meaningful for the server to
 * render, and keeping it out of the initial bundle keeps the tab's own
 * first paint unchanged for everyone who never opens it.
 *
 * Fix round 2 — this must NEVER be rendered during SSR or the hydration
 * render, which is what `useMounted()` below is for. `next/dynamic(...,
 * {ssr:false})` expands to `<Suspense fallback={null}><BailoutToCSR>
 * <Lazy/></BailoutToCSR></Suspense>`, and `BailoutToCSR` THROWS on the server
 * (`node_modules/next/dist/shared/lib/lazy-dynamic/dynamic-bailout-to-csr.js`).
 * The throw is caught by its own Suspense boundary, so the server HTML ends up
 * carrying a bailed-out boundary — `<!--$?-->` plus a `<template>` — that the
 * client tree does not reproduce at that position. A hard load of
 * `?tab=shots&cut=…&fullscreen=1` therefore hydrated with a mismatch and React
 * re-rendered the whole match report on the client.
 */
const VizFullscreen = dynamic(
  () =>
    import("@/components/dashboard/matches/match-detail/shots/viz-fullscreen").then(
      (m) => m.VizFullscreen,
    ),
  { ssr: false },
);

export function ShotsTab() {
  return (
    // `VizBandsProvider` (Phase 2B) sits INSIDE the state provider and
    // around both surfaces: the optimistic band override has to be visible
    // to the focused court's stats card and to the fullscreen viewer's
    // overlay at once, since a preset pick must move the band rects and the
    // percentages printed on them in the same frame. Mounted here rather
    // than in the viewer because the viewer unmounts on Esc and the override
    // (and its pending save) must outlive that.
    <VizStateProvider>
      <VizBandsProvider>
        <ShotsTabBody />
      </VizBandsProvider>
    </VizStateProvider>
  );
}

function ShotsTabBody() {
  const { state } = useVizState();
  const { meta } = useMatchReport();
  const mounted = useMounted();

  // ONE gated value. Anything that ever needs to know "is the viewer up" while
  // RENDERING — an `inert`/`aria-hidden`/class toggle on the court behind it,
  // say — must read this and not `state.fullscreen`, or it reintroduces the
  // same server/client divergence one attribute at a time.
  const viewerOpen =
    mounted &&
    state.fullscreen === true &&
    state.cut !== null &&
    state.draft !== true;

  const savedViewsBand = (
    <SavedViewsBand
      views={meta.savedViews}
      workspaceRole={meta.workspaceRole}
      workspaceKind={meta.workspaceKind}
      variant={state.cut === null ? "wall" : "focused"}
    />
  );

  return (
    <>
      {/* Final review #2: everything behind the viewer goes `inert` while it
          is up. The portal is a plain `role="region"` with no focus trap, so
          without this, Tab past the last zoom button walked the toolbar, the
          court, the stats card and the whole saved-views grid — all covered,
          all operable — and a screen reader read the entire document. React
          19 takes `inert` as a boolean prop; `undefined` (not `false`) is
          what removes the attribute.

          It MUST be `viewerOpen` and not `state.fullscreen`: the gated value
          is false during SSR and hydration, so the attribute can never be
          part of the server HTML and absent from the first client render. */}
      <div inert={viewerOpen || undefined}>
        {state.cut === null ? (
          <VizWall savedViewsBand={savedViewsBand} />
        ) : (
          <VizFocused
            savedViews={meta.savedViews}
            savedViewsBand={savedViewsBand}
            workspaceKind={meta.workspaceKind}
            workspaceName={meta.workspaceName}
          />
        )}
      </div>
      {/* The focused view stays mounted UNDERNEATH the viewer — leaving is a
          state change (the `fullscreen` key dropped), not a remount, so the
          court behind is already exactly where it was.

          RULING (fix round 1): never while drafting. `?draft=1` is G4's
          "Create view" prompt, where the focused court deliberately draws NO
          dots until something has been chosen; a viewer opened over it plotted
          the whole unfiltered cut, so the same URL showed a blank court and a
          full one at once. The door itself is hidden in draft mode, but
          `&fullscreen=1` can arrive straight off a pasted URL, so the guard
          belongs here rather than only on the button. */}
      {viewerOpen && <VizFullscreen />}
    </>
  );
}
