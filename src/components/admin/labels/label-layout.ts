/**
 * How the labelling console lays out its video and court against the points
 * list. Pure — the console holds the mode; this file is the vocabulary, the
 * full screen's two rules and the rail's arithmetic.
 *
 * Two modes, the labeller's choice, and one arrangement between them — the
 * film top-left with its transport, the court under it, the points rail
 * (`label-black-rail.tsx`) down the right:
 *
 * - **docked-side** (`label-side-view.tsx`) — that arrangement inside the
 *   admin page, under the console's header: the film and the court as dark
 *   cards on the light page, the rail as a white card. The default.
 * - **black** (board 08l, `label-black-view.tsx`) — the same arrangement on
 *   black, in the browser's own full screen: the whole display, never under
 *   the browser's bars. The menu calls it "Full screen". The two are one
 *   state ({@link layoutAfterFullscreenRequest},
 *   {@link layoutAfterFullscreenLeft}); only a browser with no Fullscreen API
 *   shows the black layer by itself.
 *
 * The mode is not stored: a reload cannot re-enter the browser's full screen
 * without a gesture, so the console always starts docked.
 *
 * Both are sized by the rail's width alone ({@link clampRailWidth}, kept
 * under {@link RAIL_WIDTH_STORAGE_KEY}): the film and the court take what is
 * left.
 */

export type LabelLayoutMode = "docked-side" | "black";

/** In the order the Layout menu lists them. */
export const LAYOUT_MODES: readonly LabelLayoutMode[] = [
  "docked-side",
  "black",
];

export const DEFAULT_LAYOUT_MODE: LabelLayoutMode = "docked-side";

/** The menu's words for each mode, and what choosing it does. */
export const LAYOUT_MODE_LABEL: Record<
  LabelLayoutMode,
  { label: string; description: string }
> = {
  "docked-side": {
    label: "Docked side",
    description: "Video over the court, the points list on the right",
  },
  black: {
    label: "Full screen",
    description: "The same layout on black, filling the whole screen",
  },
};

/**
 * The layout once the browser has answered a request for its full screen
 * (`use-browser-fullscreen.ts`): black when it went along, and when the
 * browser has no Fullscreen API at all — there the black layer is the only
 * full screen there is. A REFUSED request is docked side: black is never
 * shown under the browser's bars.
 */
export function layoutAfterFullscreenRequest(
  outcome: "entered" | "refused" | "unsupported",
): LabelLayoutMode {
  return outcome === "refused" ? "docked-side" : "black";
}

/**
 * The layout once the page has left the browser's full screen by any road —
 * the exit button, the Layout menu, the browser's own Esc: docked side,
 * whatever it was.
 */
export function layoutAfterFullscreenLeft(
  _mode: LabelLayoutMode,
): LabelLayoutMode {
  return "docked-side";
}

// ── The rail ────────────────────────────────────────────────────────────────

/** The least the points rail may be: its rows still read whole. */
export const RAIL_MIN_PX = 520;
/** The most: past this the film is the one being squeezed. */
export const RAIL_MAX_PX = 880;
/** Board 08l's rail, and where a double-click on its handle puts it back. */
export const RAIL_DEFAULT_PX = 640;

/** One arrow press on the rail's handle. */
export const RAIL_KEY_STEP_PX = 16;

/** The rail's width in px, once its handle has moved. A key of its own. */
export const RAIL_WIDTH_STORAGE_KEY = "labels-rail-width";

/**
 * `px` held inside `[RAIL_MIN_PX, RAIL_MAX_PX]`, in whole pixels. Anything
 * that is not a finite number is the default.
 */
export function clampRailWidth(px: number): number {
  if (!Number.isFinite(px)) return RAIL_DEFAULT_PX;
  return Math.min(RAIL_MAX_PX, Math.max(RAIL_MIN_PX, Math.round(px)));
}

/**
 * The stored rail width (a bare number of px). Nothing, or anything that is
 * not a number, is the default; a number outside the bounds is clamped.
 */
export function parseRailWidth(raw: string | null | undefined): number {
  if (raw === null || raw === undefined || raw.trim() === "") {
    return RAIL_DEFAULT_PX;
  }
  return clampRailWidth(Number(raw));
}
