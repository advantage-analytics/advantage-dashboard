/**
 * Data-visualization color tokens.
 *
 * The brand palette (DESIGN.md §2) is intentionally closed: one accent
 * (Signal Blue), two outcome colors (Win Green / Loss Red), and cool
 * neutrals. That closed palette governs UI chrome.
 *
 * Charts are the one sanctioned exception. A multi-series line chart or a
 * court dot-plot needs more separable hues than two outcome colors can
 * provide. This module is the SINGLE SOURCE OF TRUTH for those hues. Every
 * value here is anchored to the brand palette: outcomes ARE Win Green and
 * Loss Red; ramps derive from Win Green; neutrals are cool-tinted slates;
 * the one warm accent (amber) is reserved for "free point / key event"
 * semantics and never appears as UI chrome.
 *
 * Rules:
 *  - These hues are for data-viz ONLY (Recharts series, inline SVG fills).
 *    Never use them for buttons, text, borders, or other chrome.
 *  - Won / lost in any chart MUST use VIZ_OUTCOME so a green dot on the
 *    court matches a green "WON" badge elsewhere.
 *  - If a chart needs a new role, add a named token here. Do not inline a
 *    raw hex in a component.
 */

/* ── Outcome (anchored to the brand palette, DESIGN.md §2) ───────────── */

/** Won points / positive deltas. Identical to brand Win Green. */
export const VIZ_WON = "#5DB955";
/** Lost points / negative deltas. Identical to brand Loss Red. */
export const VIZ_LOST = "#E51837";

export const VIZ_OUTCOME = {
  won: VIZ_WON,
  lost: VIZ_LOST,
} as const;

/* ── Chart-only roles (sanctioned extensions) ───────────────────────── */

/**
 * Amber. The one warm hue allowed in the system, data-viz only. Reads as
 * "a free or decisive point / key event": aces, unforced errors, break of
 * serve. Calmer than a neon amber so it sits quietly on a light court.
 */
export const VIZ_AMBER = "#E0902E";

/** Cool slate ramp for neutral / context series (cool-tinted, not pure gray). */
export const VIZ_SLATE_DEEP = "#475569";
export const VIZ_SLATE = "#64748B";
export const VIZ_SLATE_LIGHT = "#94A3B8";

/**
 * Shot outcomes on the court visualization. Won/lost reuse the brand
 * outcome colors; ace and double fault are the two chart-only roles the
 * court needs to stay legible.
 */
export const VIZ_SHOT = {
  ace: VIZ_AMBER,
  won: VIZ_WON,
  lost: VIZ_LOST,
  doubleFault: VIZ_SLATE_LIGHT,
} as const;

/* ── Green ramp (return-family series, anchored on Win Green) ────────── */

export const VIZ_GREEN_DEEP = "#3E9A45";
export const VIZ_GREEN = "#5DB955"; // = Win Green
export const VIZ_GREEN_MID = "#84C97E";
export const VIZ_GREEN_LIGHT = "#ABDCA6";

/* ── Blue ramp (serve-family series, anchored on Signal Blue) ────────── */

export const VIZ_BLUE_DEEP = "#2563EB"; // = Signal Blue Deep
export const VIZ_BLUE = "#3B82F6"; // = Signal Blue
export const VIZ_BLUE_MID = "#60A5FA";
export const VIZ_BLUE_LIGHT = "#93C5FD";

/* ── Violet ramp (player-2 / secondary-family series, anchored on Player Violet) ── */

export const VIZ_VIOLET_DEEP = "#7C3AED";
export const VIZ_VIOLET = "#8B5CF6";
export const VIZ_VIOLET_LIGHT = "#A855F7"; // = Player Violet

/* ── Player attribution (multi-series charts) ───────────────────────── */

export const VIZ_PLAYER = {
  p1: VIZ_BLUE, // Signal Blue
  p2: VIZ_VIOLET_LIGHT, // Player Violet
} as const;

/**
 * Calendar-heatmap density ramp. Empty cells are a bare neutral; intensity
 * climbs to the Signal Blue peak (the one sanctioned large-area blue in a
 * density viz, per DESIGN.md §2). Index 0 = no matches → 3 = peak.
 */
export const VIZ_HEATMAP = ["#F2F2F2", "#B8D4F9", "#6AABFF", "#3B82F6"] as const;

/* ── Court surfaces (categorical) ───────────────────────────────────── */

export const VIZ_SURFACE: Record<string, string> = {
  Hard: "#3B82F6", // Signal Blue
  Clay: VIZ_SLATE_LIGHT,
  Grass: VIZ_GREEN,
  Indoor: "#8B5CF6", // Player Violet family
  Carpet: VIZ_SLATE,
};
export const VIZ_SURFACE_DEFAULT = VIZ_SLATE_LIGHT;
