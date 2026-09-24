"use client";

import type { MouseEvent, ReactNode } from "react";
import Link from "next/link";
import { Maximize2 } from "lucide-react";
import { APRON_FILL, HEAT_APRON_FILL, CourtArt } from "./court-art";
import { heatFloorTintRgba } from "./court-geometry";
import { VIZ_PILL_RADIUS } from "./viz-labels";
import type { Chart, Cut, VizDot, VizBandZones, VizResult } from "./viz-model";
import type { VizState } from "./viz-url";
import { viewIdentityKey } from "./viz-url";
import { useVizState } from "./use-viz-state";
import { usePrefersReducedMotion } from "./use-reduced-motion";
import {
  VIZ_COURT_TRANSITION_NAME,
  VIZ_FOCUSED_COURT_MORPH_TARGET,
  courtTileDomId,
} from "./viz-court-transition";

/**
 * The wall/band card: art on top, a dark player-name chip over it, then a
 * label block (view name, filter pills, mono count). A `<Link>` by default
 * — clicking a tile navigates straight into the focused view. `overlay` is
 * the Manage ⋯ affordance (Task 9 Part B, `manageable-saved-view-tile.tsx`)
 * drawn over the art on a manageable tile in Manage mode.
 *
 * `as="static"` (round-3 review fix) renders the identical markup as a
 * `<div role="group">` instead of a `<Link>`, for exactly that manageable
 * tile in Manage mode. A nested interactive control (a `<button>`) inside a
 * real `<a href>` cannot be selectively click-suppressed: Radix's own
 * Popover trigger ignores a `preventDefault()`-ed click (so the ⋯ menu never
 * opens), and NOT preventing default lets the anchor's OWN click handler
 * navigate on the very same click a moment later (React 19 does not let one
 * handler cancel another's default via a boolean return, only via the
 * shared event object) — there is no `preventDefault()` policy that makes
 * both true at once. `as="static"` sidesteps the conflict instead of trying
 * to arbitrate it: there is no anchor to accidentally activate, so nothing
 * needs suppressing.
 *
 * F5: `navigateState`, when given, is this tile's OWN `VizState` (the same
 * one `href` was built from) — supplying it upgrades the plain `<Link>`
 * into the morph's source. A plain left-click intercepts the Link's default
 * navigation (`e.preventDefault()`; Next's `<Link>` skips its own handling
 * once the passed `onClick` does this — see `node_modules/next/dist/
 * client/link.js`) and instead hands `runCourtMorph`
 * (`viz-state-context.tsx`) this tile's complete card as the transition's
 * source element. A modified click (⌘/ctrl/shift/alt/middle-button) is left
 * alone, so opening a tile in a new tab still works exactly like any other
 * link — the one reason these tiles are real `<Link>`s and not buttons.
 *
 * Task 5: `actionSlot` (the fullscreen-door glyph) renders as a SIBLING of
 * the `<Link>`/static `<div>`, inside an outer `relative` wrapper this
 * component owns — never as a child of the anchor. A `<button>` nested
 * inside a real `<a href>` can't be selectively click-suppressed (the same
 * problem `as="static"` above exists to sidestep for the Manage ⋯ menu), so
 * the glyph gets its own element outside the anchor entirely instead of
 * trying to arbitrate the same conflict again. The card's hover styling
 * moves from the anchor's own `hover:` to the wrapper's `group`/
 * `group-hover:` so hovering the glyph (a sibling, not a descendant of the
 * anchor) still reads as hovering the card.
 */

const CARD_CLASS =
  "flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-hairline)] bg-[var(--surface-card)] shadow-[var(--shadow-card)] transition-[border-color,box-shadow] duration-200 ease-[var(--ease-primary)] group-hover:border-[var(--border-medium)] group-hover:shadow-[var(--shadow-card-emphasis)] motion-reduce:transition-none";

/**
 * Task 5's tile glyph — 24×24, `top-[10px] right-[10px]`, opens the
 * fullscreen viewer for `tileState` directly, bypassing the wall→focused
 * morph entirely (a fullscreen open is never a morph source or target).
 * `aria-label` names the tile so a screen-reader user hears which court is
 * about to open, since — unlike the tile itself — this control does not
 * also focus the view first; no tooltip (report P2a: "the tile is the
 * button", i.e. this is a second, smaller affordance beside it, not the
 * primary one a hover-delay label would be worth adding for).
 */
export function TileFullscreenGlyph({
  name,
  tileState,
}: {
  name: string;
  tileState: VizState;
}) {
  const { setState } = useVizState();
  return (
    <button
      type="button"
      aria-label={`Open ${name} fullscreen`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        // Updater form ignores `prev` on purpose — the target is this
        // tile's own full state (`tileState`), not a patch onto whatever
        // the store currently holds.
        setState(() => ({ ...tileState, fullscreen: true }));
      }}
      className="absolute top-[10px] right-[10px] z-[1] flex h-6 w-6 cursor-pointer items-center justify-center rounded-[8px] bg-[rgba(13,13,13,0.72)] text-white transition-colors duration-200 ease-[var(--ease-primary)] hover:bg-[rgba(13,13,13,0.92)]"
    >
      <Maximize2 className="h-3 w-3" strokeWidth={1.6} aria-hidden="true" />
    </button>
  );
}

function isPlainLeftClick(e: MouseEvent): boolean {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}

export function CourtTile({
  playerName,
  name,
  nameAdornment,
  nameSlot,
  pills,
  countLabel,
  cut,
  dots,
  zones,
  bandZones,
  chart = "scatter",
  href,
  overlay,
  as = "link",
  ariaDescribedBy,
  current = false,
  navigateState,
  actionSlot,
}: {
  playerName: string;
  name: string;
  /** A small glyph beside `name` — the saved-views band's `users` "shared" mark. */
  nameAdornment?: ReactNode;
  /**
   * Replaces the rendered `name` text entirely — Manage mode's in-place
   * rename field (`manageable-saved-view-tile.tsx`), so the tile shows an
   * editable underline input over its own name rather than the static
   * `<p>`. `name` is still required even when this is set (it stays the
   * accessible name other callers reason about); only what's PAINTED
   * changes.
   */
  nameSlot?: ReactNode;
  pills: string[];
  countLabel: string;
  cut: Cut;
  dots: VizDot[];
  zones?: NonNullable<VizResult["zoneStats"]>;
  bandZones?: VizBandZones | null;
  /** G3b: forwarded straight to `CourtArt` — a saved-view tile can be a heat
   * chart same as the focused view; the six default tiles never are
   * (`DEFAULT_CUTS` is scatter-only), so they simply omit it and get the
   * ordinary dot court. */
  chart?: Chart;
  href: string;
  overlay?: ReactNode;
  /**
   * `"link"` (default): a real `<Link href>` — every tile outside Manage
   * mode, and every tile inside it that this viewer cannot manage. `"static"`:
   * the same markup as a non-anchor `<div>` (`tabIndex={0}`, `role="group"`,
   * `aria-label={name}`) — a manageable tile while Manage mode is on, so it
   * can be dragged/arranged without also being a navigation target. `href`
   * is still required either way (the type stays simple for every existing
   * caller); it is simply unused when `as="static"`.
   */
  as?: "link" | "static";
  /**
   * Id of an element that describes this tile — `as="static"`'s only
   * consumer (`manageable-saved-view-tile.tsx`, review M7): the Manage-mode
   * keyboard-reorder hint, so screen-reader users landing on a manageable
   * tile hear how to reorder it via ⌥←/⌥→, not just see the hint text
   * elsewhere in the header. Unused (and not rendered) on `as="link"`.
   */
  ariaDescribedBy?: string;
  /**
   * F4: rings this tile Signal Blue — the tile for the view currently drawn
   * in the big court, in the focused view's Views grid (a wrapping grid
   * reached by scrolling the page, not a scrolling row). Never set outside
   * that grid (the wall has no "current" tile to mark).
   */
  current?: boolean;
  /**
   * F5: this tile's OWN `VizState` — the same one `href` was built from.
   * Supplying it does two things: it makes a plain left-click morph
   * straight into the focused view (via `runCourtMorph`) instead of a plain
   * navigation, and it gives the tile a stable `id`
   * (`courtTileDomId(viewIdentityKey(navigateState))`) and a
   * `view-transition-name` for whenever it's the RETURN morph's
   * destination (`runCourtMorph`'s `targetKey` matching this tile's own
   * key). Omit it for a tile that isn't a real navigation target —
   * `manageable-saved-view-tile.tsx`'s `as="static"` tiles never pass it
   * at all, so they get neither the `id`/`view-transition-name` nor the
   * click interception; they're a `<div>`, not a `<Link>`, in the first
   * place.
   */
  navigateState?: VizState;
  /**
   * Task 5's fullscreen-door glyph (`TileFullscreenGlyph`, above) — a
   * SIBLING of the anchor/static `<div>`, never its child. Omitted in
   * Manage mode (`manageable-saved-view-tile.tsx` never passes it) and on
   * the dashed "Create view" tile (`saved-views-band.tsx`'s `NewViewTile`
   * doesn't render a `CourtTile` at all).
   */
  actionSlot?: ReactNode;
}) {
  const { runCourtMorph, morphTargetKey } = useVizState();
  const reducedMotion = usePrefersReducedMotion();

  const ownKey = navigateState ? viewIdentityKey(navigateState) : null;
  const domId = ownKey !== null ? courtTileDomId(ownKey) : undefined;
  // Compared by DOM id, not by `viewIdentityKey` equality — a Views-grid
  // tile can share its `viewIdentityKey` with the big court currently on
  // screen (the "current" ring), and matching on that key alone let both
  // claim `VIZ_COURT_TRANSITION_NAME` at once. See
  // `VIZ_FOCUSED_COURT_MORPH_TARGET`'s doc comment for the incident this
  // fixed.
  const isMorphTarget = domId !== undefined && domId === morphTargetKey;

  function handleClick(e: MouseEvent<HTMLAnchorElement>): void {
    if (!navigateState || !isPlainLeftClick(e)) return;
    e.preventDefault();
    const sourceEl = e.currentTarget;
    runCourtMorph({
      sourceEl,
      next: navigateState,
      // A tile only ever navigates INTO the focused view (never to the
      // wall), so the destination is always the one big court — see
      // `VIZ_FOCUSED_COURT_MORPH_TARGET`.
      targetKey: VIZ_FOCUSED_COURT_MORPH_TARGET,
      reducedMotion,
    });
  }

  // Defect fix: mirrors `CourtArt`'s own `showHeat` test exactly, so the art
  // box wrapper (the letterbox strips around the svg) desaturates in lockstep
  // with the court it surrounds instead of staying the normal apron green.
  const showHeat = chart === "heat";
  // heat-blob follow-up (I3, "the tint is not consistent on the view"): the
  // filter used to paint its own floor tint, covering only the svg's own
  // content box — a CSS gradient here then tried to match it on any
  // letterbox sliver the svg's `preserveAspectRatio` leaves inside ITSELF,
  // but the two never quite lined up (visibly different greens). The floor
  // now lives ONLY here — a single flat wash div covering the WHOLE art box,
  // above the svg — so there is one tint, not two to keep consistent. No
  // dots (or not heat mode) ⇒ no wash, plain `HEAT_APRON_FILL`/`APRON_FILL`.
  const heatHasDots = showHeat && dots.length > 0;

  const body = (
    <>
      <div
        data-viz-court-art="true"
        className="relative overflow-hidden rounded-t-[var(--radius-card)]"
        style={{
          aspectRatio: "334 / 216",
          backgroundColor: showHeat ? HEAT_APRON_FILL : APRON_FILL,
        }}
      >
        <CourtArt
          cut={cut}
          dots={dots}
          zones={zones}
          bandZones={bandZones}
          chart={chart}
          fill
          className="block h-full w-full"
        />
        {heatHasDots && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{ backgroundColor: heatFloorTintRgba() }}
          />
        )}
        <span
          className="absolute top-[10px] left-[10px] inline-flex h-5 items-center rounded-full px-[7px] text-[10px] font-medium text-white"
          style={{ backgroundColor: "rgba(13,13,13,.72)" }}
        >
          {playerName}
        </span>
        {overlay}
      </div>
      <div className="flex flex-col gap-2 px-4 pt-[14px] pb-[15px]">
        <span className="flex min-w-0 items-center gap-1.5">
          {nameSlot ?? (
            <p
              className="truncate text-[16px] leading-tight font-normal"
              style={{ letterSpacing: "-0.2px", color: "var(--ink-900)" }}
            >
              {name}
            </p>
          )}
          {nameAdornment}
        </span>
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            {pills.map((pill) => (
              <span
                key={pill}
                className={`inline-flex h-5 items-center ${VIZ_PILL_RADIUS} border px-[7px] text-[10px] font-medium whitespace-nowrap`}
                style={{
                  backgroundColor: "var(--surface-subtle)",
                  borderColor: "var(--border-hairline)",
                  color: "var(--ink-700)",
                }}
              >
                {pill}
              </span>
            ))}
          </div>
          <span
            className="shrink-0 font-mono text-[11px] tabular-nums"
            style={{ color: "var(--ink-500)" }}
          >
            {countLabel}
          </span>
        </div>
      </div>
    </>
  );

  const ringStyle = current
    ? {
        outline: "1px solid var(--blue)",
        boxShadow: "0 0 0 2px var(--blue-ring-30)",
      }
    : undefined;

  if (as === "static") {
    return (
      <div className="group relative">
        <div
          id={domId}
          tabIndex={0}
          role="group"
          aria-label={name}
          aria-describedby={ariaDescribedBy}
          aria-current={current ? "true" : undefined}
          className={CARD_CLASS}
          style={ringStyle}
        >
          {body}
        </div>
        {actionSlot}
      </div>
    );
  }

  return (
    <div className="group relative">
      <Link
        href={href}
        id={domId}
        onClick={handleClick}
        className={CARD_CLASS}
        style={{
          ...ringStyle,
          viewTransitionName: isMorphTarget
            ? VIZ_COURT_TRANSITION_NAME
            : undefined,
        }}
        aria-current={current ? "true" : undefined}
      >
        {body}
      </Link>
      {actionSlot}
    </div>
  );
}
