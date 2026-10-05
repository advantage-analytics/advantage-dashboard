/**
 * How the labelling console lays out its video and court against the points
 * table (T24). Pure — the console reads and remembers the mode, the divider
 * (T25, `label-divider.tsx`) drives the size; this file is the vocabulary and
 * the arithmetic.
 *
 * Three modes the Layout menu lists, the labeller's choice:
 *
 * - **overlay** — the floating cards (`label-video-dock.tsx`,
 *   `label-court-dock.tsx`): the table keeps the whole screen and the two
 *   cards sit over it, a corner each, movable and minimisable.
 * - **docked-top** — a band above the table holding the video and the court
 *   side by side; the table takes what is left below and scrolls.
 * - **docked-side** — a column to the right of the table holding the video
 *   over the court; the table takes what is left and scrolls both ways.
 *
 * And a fourth, **black** — the full-screen view (board 08l,
 * `label-black-view.tsx`): black to the edges, the film and the court on the
 * left and the points rail on the right. It has no dock and no divider; its
 * one size is the rail's width ({@link clampRailWidth}), kept under
 * {@link RAIL_WIDTH_STORAGE_KEY}. The menu lists it last, as "Full screen".
 *
 * In a docked mode the band's height or the column's width is ONE number,
 * {@link DEFAULT_DOCK_SIZE} until the divider moves it, and the table takes
 * the rest. {@link clampDockSize} keeps that number where both halves still
 * work: the video no smaller than {@link MIN_DOCK_PX} (≥ 240px tall in a band,
 * ≥ 360px wide in a column) and the table no shorter or narrower than
 * {@link MIN_TABLE_PX}. The room it clamps against is {@link dockRoom}'s — the
 * docked layout's measured box, less the divider's gap — and the size the
 * labeller left is kept per mode ({@link DockSizes}) under
 * {@link LAYOUT_SIZE_STORAGE_KEY}.
 */

export type LabelLayoutMode =
  "overlay" | "docked-top" | "docked-side" | "black";

/**
 * The two modes with a dock whose size the divider drives. Spelled out, not
 * `Exclude<LabelLayoutMode, "overlay">`: the black view has no dock, and must
 * not turn up in a `Record<DockedLayoutMode, …>`.
 */
export type DockedLayoutMode = "docked-top" | "docked-side";

/** In the order the Layout menu lists them. */
export const LAYOUT_MODES: readonly LabelLayoutMode[] = [
  "overlay",
  "docked-top",
  "docked-side",
  "black",
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
  black: {
    label: "Full screen",
    description:
      "Black to the edges: film and court on the left, the points rail on the right",
  },
};

/** A stored mode. Anything unknown — or nothing — is the overlay. */
export function parseLayoutMode(
  raw: string | null | undefined,
): LabelLayoutMode {
  return raw === "docked-top" || raw === "docked-side" || raw === "black"
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

/** What {@link clampDockSize} lets the dock reach in a room `available` long. */
export function maxDockSize(mode: DockedLayoutMode, available: number): number {
  return Math.max(MIN_DOCK_PX[mode], available - MIN_TABLE_PX);
}

/** One arrow press on the divider. */
export const DIVIDER_KEY_STEP_PX = 16;

/**
 * The gap between the dock and the table, which the divider sits in: its 8px
 * grab area with 4px either side. Not the dock's, not the table's.
 */
export const DIVIDER_GAP_PX = 16;

/**
 * Docked side, the court card under the video keeps at least this much height:
 * its header, foot and padding (96) and a court still worth reading (120).
 */
export const MIN_SIDE_COURT_PX = 216;

/**
 * The room the dock and the table share, in the dock's own direction — what
 * {@link clampDockSize} takes as `available` — from the docked layout's
 * measured box.
 *
 * Docked top it is the box's height less the divider's gap. Docked side it is
 * the box's width less the gap, and no more than the box's HEIGHT allows: the
 * video is 16:9 from the column's width with the court card under it, so a
 * column wider than this would push the court out of the bottom.
 */
export function dockRoom(
  mode: DockedLayoutMode,
  box: { width: number; height: number },
): number {
  if (mode === "docked-top") return Math.floor(box.height) - DIVIDER_GAP_PX;
  const widest = ((box.height - DIVIDER_GAP_PX - MIN_SIDE_COURT_PX) * 16) / 9;
  // Whole pixels: the clamp hands its upper bound straight back.
  return Math.floor(
    Math.min(box.width - DIVIDER_GAP_PX, widest + MIN_TABLE_PX),
  );
}

/** The size the labeller left each docked mode at, as asked — clamped on use. */
export type DockSizes = Record<DockedLayoutMode, number>;

/**
 * The stored sizes (`{ "docked-top": px, "docked-side": px }`). Anything
 * missing, malformed or not a positive number is that mode's default. Not
 * clamped here: the room is only known once the layout is measured, and a size
 * left in a bigger window comes back when the window does.
 */
export function parseDockSizes(raw: string | null | undefined): DockSizes {
  const sizes = { ...DEFAULT_DOCK_SIZE };
  if (!raw) return sizes;
  try {
    const stored: unknown = JSON.parse(raw);
    if (typeof stored !== "object" || stored === null) return sizes;
    for (const mode of ["docked-top", "docked-side"] as const) {
      const px = (stored as Record<string, unknown>)[mode];
      if (typeof px === "number" && Number.isFinite(px) && px > 0) {
        sizes[mode] = Math.round(px);
      }
    }
  } catch {
    /* not JSON — the defaults */
  }
  return sizes;
}

// ── The black view's rail ──────────────────────────────────────────────────

/** The least the points rail may be: its rows still read whole. */
export const RAIL_MIN_PX = 520;
/** The most: past this the film is the one being squeezed. */
export const RAIL_MAX_PX = 880;
/** Board 08l's rail, and where a double-click on its handle puts it back. */
export const RAIL_DEFAULT_PX = 640;

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
