/**
 * The Visualizations tab's ONE animation: the clicked court (a wall tile, or
 * a tile in the focused view's own "Views" grid) growing into the focused
 * view's big court, and the reverse on "Back to wall". Nothing else in the
 * tab animates.
 *
 * ── Mechanism decision ──────────────────────────────────────────────────
 * React's `<ViewTransition>` component (option A in the brief) is NOT
 * available in this build: `grep -rl ViewTransition node_modules/react/
 * node_modules/react-dom/` finds nothing — the app pins `react@19.1.0`
 * stable, not the canary channel the component ships on. Next's own docs
 * (`node_modules/next/dist/docs/01-app/02-guides/view-transitions.md`)
 * claim "the App Router uses React canary releases… you do not need to
 * install react@canary yourself", but that's only true when Next itself
 * swaps in its vendored `react-experimental` build — and grepping this
 * Next install's `config-schema.js`/`server`/`build`/`shared` trees for
 * `viewTransition` turns up nothing either: this Next version has no
 * `experimental.viewTransition` flag (or any other switch) that would make
 * it do so. There is no configuration, flagged or not, that puts
 * `ViewTransition` in this app's hands.
 *
 * So this uses option B: the browser's native View Transitions API
 * (`document.startViewTransition`) directly, feature-detected via
 * `supportsViewTransitions()`. Where it's unsupported (or the visitor
 * prefers reduced motion), callers fall straight through to an unanimated
 * state change — every evergreen browser this app targets (Chromium 111+,
 * Safari 18+, Firefox 144+) supports the API, so a hand-rolled FLIP
 * fallback (option C) would exist only for browsers this product doesn't
 * otherwise support, at the cost of a second, harder-to-verify animation
 * engine.
 */

/** The ONE `view-transition-name` this tab ever assigns — see
 * `runCourtMorph` (`viz-state-context.tsx`) for how it's kept on at most one
 * element at a time. The API throws if two elements share a name in the
 * same snapshot, so nothing else in this tree may reuse this string. */
export const VIZ_COURT_TRANSITION_NAME = "viz-court-shared";

export function supportsViewTransitions(): boolean {
  return (
    typeof document !== "undefined" &&
    typeof document.startViewTransition === "function"
  );
}

/**
 * `id` of the focused view's court-card eyebrow (`viz-focused.tsx`,
 * `tabIndex={-1}`) — `runCourtMorph`'s focus-landing target for every morph
 * that lands ON the focused view (a wall tile or a Views-grid tile). Lives
 * here (not `viz-focused.tsx`) so `viz-state-context.tsx` can reference it
 * without importing a component file, the same reason `courtTileDomId`
 * lives here instead of `court-tile.tsx` below.
 */
export const VIZ_FOCUSED_HEADING_ID = "viz-focused-heading";

/**
 * `runCourtMorph`'s destination sentinel for every FORWARD morph (a wall
 * tile, or a Views-grid tile, growing into the focused view) — never a real
 * DOM `id`, just a string no `courtTileDomId` output can ever equal.
 *
 * A morph landing on the focused view is ALWAYS the big court, never a
 * tile — but the focused view's own "Views" grid (`saved-views-band.tsx`,
 * `variant="focused"`) renders a tile for the SAME view that's now on
 * screen (the "current" ring), with the SAME `viewIdentityKey` the big
 * court just took on. Matching by that key alone (what an earlier version
 * of this file did) made BOTH elements claim `VIZ_COURT_TRANSITION_NAME` in
 * one snapshot — the API's "two elements, one name" case, which aborts the
 * transition outright (`Unexpected duplicate view-transition-name`). This
 * sentinel is compared by IDENTITY, not by which view it names, so only
 * `viz-focused.tsx`'s one big court ever matches it — a same-key Views-grid
 * tile compares its own `courtTileDomId(...)` against `morphTargetKey`
 * instead (see `court-tile.tsx`), which this sentinel cannot equal.
 */
export const VIZ_FOCUSED_COURT_MORPH_TARGET = "viz-focused-court-morph-target";

/**
 * `id` for a wall/Views-grid tile, derived from its own `viewIdentityKey`
 * (`viz-url.ts`) — `court-tile.tsx` sets this on every tile with a
 * `navigateState`, and `runCourtMorph`'s focus-landing target for the
 * REVERSE morph (Back to wall) uses it to refocus the tile that was
 * opened, if it still exists. Pulled out to this leaf module (no React, no
 * dependents inside the tab's own import graph) rather than living in
 * `court-tile.tsx` itself, so `viz-state-context.tsx` can compute the same
 * id without importing a component file back — the exact circular-import
 * shape `viz-labels.tsx`'s own docstring warns about.
 *
 * `encodeURIComponent` because a `viewIdentityKey` can contain `:` and an
 * empty segment (a viewless default tile's `viewId` half) — both valid in
 * an HTML `id`, but not worth reasoning about unescaped.
 */
export function courtTileDomId(key: string): string {
  return `viz-tile-${encodeURIComponent(key)}`;
}
