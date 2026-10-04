/**
 * How the labelling console lays out its video and court against the points
 * table (T24). Pure — the console reads and remembers the mode, the divider
 * (T25) drives the size; this file is the vocabulary and the arithmetic.
 *
 * Three modes, the labeller's choice:
 *
 * - **overlay** — the floating cards (`label-video-dock.tsx`,
 *   `label-court-dock.tsx`): the table keeps the whole screen and the two
 *   cards sit over it, a corner each, movable and minimisable.
 * - **docked-top** — a band above the table holding the video and the court
 *   side by side; the table takes what is left below and scrolls.
 * - **docked-side** — a column to the right of the table holding the video
 *   over the court; the table takes what is left and scrolls both ways.
 *
 * In a docked mode the band's height or the column's width is ONE number,
 * {@link DEFAULT_DOCK_SIZE} until the divider moves it, and the table takes
 * the rest. {@link clampDockSize} keeps that number where both halves still
 * work: the video no smaller than {@link MIN_DOCK_PX} (≥ 240px tall in a band,
 * ≥ 360px wide in a column) and the table no shorter or narrower than
 * {@link MIN_TABLE_PX}.
 */

export type LabelLayoutMode = "overlay" | "docked-top" | "docked-side";

/** The two modes with a dock whose size the divider drives. */
export type DockedLayoutMode = Exclude<LabelLayoutMode, "overlay">;

/** In the order the Layout menu lists them. */
export const LAYOUT_MODES: readonly LabelLayoutMode[] = [
  "overlay",
  "docked-top",
  "docked-side",
];

export const DEFAULT_LAYOUT_MODE: LabelLayoutMode = "overlay";

/** Separate from the docks' corner and minimised keys, which are per card. */
export const LAYOUT_MODE_STORAGE_KEY = "labels-layout-mode";
/** `{ "docked-top": px, "docked-side": px }` once the divider has moved (T25). */
export const LAYOUT_SIZE_STORAGE_KEY = "labels-layout-size";

/** The menu's words for each mode, and what choosing it does. */
export const LAYOUT_MODE_LABEL: Record<
  LabelLayoutMode,
  { label: string; description: string }
> = {
  overlay: {
    label: "Overlay",
    description: "Floating cards over the table, a corner each",
  },
  "docked-top": {
    label: "Docked top",
    description: "Video and court in a band above the table",
  },
  "docked-side": {
    label: "Docked side",
    description: "Video over the court in a column beside the table",
  },
};

/** A stored mode. Anything unknown — or nothing — is the overlay. */
export function parseLayoutMode(
  raw: string | null | undefined,
): LabelLayoutMode {
  return raw === "docked-top" || raw === "docked-side"
    ? raw
    : DEFAULT_LAYOUT_MODE;
}

/**
 * The band's height (docked-top) or the column's width (docked-side) before
 * the divider has moved it. The band is the court card's own height (board
 * 08i's 318), so the court panel sits in it at its natural size and the video
 * beside it runs 565 wide at 16:9; the column is the floating video's 480, so
 * the video runs 270 tall and the court takes the rest below it.
 */
export const DEFAULT_DOCK_SIZE: Record<DockedLayoutMode, number> = {
  "docked-top": 318,
  "docked-side": 480,
};

/** The least the dock may be: the video stays watchable. */
export const MIN_DOCK_PX: Record<DockedLayoutMode, number> = {
  "docked-top": 240,
  "docked-side": 360,
};

/** The least the table may be, in the dock's own direction. */
export const MIN_TABLE_PX = 240;

/**
 * `px` held inside `[MIN_DOCK_PX, available - MIN_TABLE_PX]`. A room too
 * small for both minimums gives the dock its minimum rather than a negative
 * table — the table scrolls, the video cannot. Anything that is not a number
 * is the mode's default.
 */
export function clampDockSize(
  mode: DockedLayoutMode,
  px: number,
  available: number,
): number {
  const min = MIN_DOCK_PX[mode];
  const max = available - MIN_TABLE_PX;
  if (max < min) return min;
  const wanted = Number.isFinite(px) ? px : DEFAULT_DOCK_SIZE[mode];
  return Math.min(max, Math.max(min, Math.round(wanted)));
}
