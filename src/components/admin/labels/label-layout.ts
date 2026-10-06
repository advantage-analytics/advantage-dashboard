/**
 * How the labelling console lays out its video and court against the points
 * list. Pure — the console reads and remembers the mode; this file is the
 * vocabulary and the rail's arithmetic.
 *
 * Two modes, the labeller's choice, and one arrangement between them — the
 * film top-left with its transport, the court under it, the points rail
 * (`label-black-rail.tsx`) down the right:
 *
 * - **docked-side** (`label-side-view.tsx`) — that arrangement inside the
 *   admin page, under the console's header: the film and the court as dark
 *   cards on the light page, the rail as a white card. The default.
 * - **black** (board 08l, `label-black-view.tsx`) — the same arrangement over
 *   the whole page, black to the edges, and — where the browser has one — in
 *   the browser's own full screen. The menu calls it "Full screen".
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

export const LAYOUT_MODE_STORAGE_KEY = "labels-layout-mode";

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
 * A stored mode. Anything else — nothing, or a value that names no mode of
 * this console — is the default.
 */
export function parseLayoutMode(
  raw: string | null | undefined,
): LabelLayoutMode {
  return raw === "black" ? raw : DEFAULT_LAYOUT_MODE;
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
