/**
 * The label session's two views. Pure: the console holds the mode; this file
 * is the vocabulary, the full screen's rule and the rail's arithmetic.
 *
 * - `overview` (`label-dashboard.tsx`): the page a session opens on. The
 *   match's data, read: what was entered at upload, the score, the open
 *   marks, the publish check, the statistics. Nothing is labelled here.
 * - `black` (`label-black-view.tsx`): the film, the court and the points rail
 *   on black, in the browser's own full screen (use-browser-fullscreen.ts).
 *   The one place a match is labelled.
 *
 * There was a third, the film and rail docked inside the admin page. Nobody
 * labelled from it once full screen existed, and it was removed 2026-10-13.
 *
 * In full screen the rail's width alone sizes the layout ({@link
 * clampRailWidth}, kept under {@link RAIL_WIDTH_STORAGE_KEY}): the film and the
 * court take what is left.
 */

export type LabelLayoutMode = "overview" | "black";

/**
 * `AdminPage`'s classes on `/admin/labels/[sessionId]`, the page and its
 * skeleton both: bounded to the viewport under the admin header and clipped,
 * so the console's points rail is the one thing that scrolls.
 */
export const LABEL_SESSION_PAGE =
  "h-[calc(100dvh-var(--header-h))] gap-3.5 overflow-hidden pb-6";

/** The page opens on the overview; a spec that reads the rail asks for black. */
export const DEFAULT_LAYOUT_MODE: LabelLayoutMode = "black";

/**
 * The layout once the browser has answered a request for its full screen: black
 * when it went along, and when the browser has no Fullscreen API at all. A
 * refused request is the overview: black is never shown under the browser's
 * bars.
 */
export function layoutAfterFullscreenRequest(
  outcome: "entered" | "refused" | "unsupported",
): LabelLayoutMode {
  return outcome === "refused" ? "overview" : "black";
}

// ── The film ────────────────────────────────────────────────────────────────

/** What the court always keeps of the black stage's height. */
const BLACK_COURT_MIN = "max(320px, 40cqh)";

/**
 * The film's width on the black stage (a size container): the stage's, or —
 * where that would crowd the court out — 16:9 of the height the court leaves.
 * Never under 16:9 of 120px, for a window too short to honour both. Shared by
 * `LabelBlackView` and `/label/[sessionId]`'s skeleton, so the court does not
 * jump when the console mounts.
 */
export const BLACK_VIDEO_WIDTH = `min(100cqw, max(calc((100cqh - ${BLACK_COURT_MIN}) * 16 / 9), 213px))`;

// ── The rail ────────────────────────────────────────────────────────────────

/** The least the points rail may be: its rows still read whole. */
export const RAIL_MIN_PX = 520;
/** The most: past this the film is the one being squeezed. */
export const RAIL_MAX_PX = 880;
/** The default, and where a double-click on its handle puts it back. */
export const RAIL_DEFAULT_PX = 640;

/** One arrow press on the rail's handle. */
export const RAIL_KEY_STEP_PX = 16;

/** The rail's width in px, once its handle has moved. A key of its own. */
export const RAIL_WIDTH_STORAGE_KEY = "labels-rail-width";

/** `px` clamped to the rail's bounds; a non-finite number is the default. */
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

/** Targets a window key handler leaves alone: the key belongs to the control. */
export const KEY_OWNER_SELECTOR =
  "input, select, textarea, button, a, [role='button'], [role='menu'], [role='dialog'], [role='alertdialog'], [contenteditable='true']";
