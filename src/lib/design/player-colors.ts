/**
 * Canonical player colors per SKILL.md "Match Detail Colors".
 *
 * Dual-track pattern: these JS hex constants are the source for libraries
 * that need runtime values (Recharts, inline SVG fills). For component
 * styling, prefer the matching CSS variables defined in `globals.css`
 * (`--color-player-1`, `--color-player-2`, etc.) so theme changes flow
 * through the cascade. Keep both in sync — if you change a hex here,
 * update the corresponding CSS variable.
 */
export const PLAYER_1 = "#3B82F6";
export const PLAYER_2 = "#A855F7";

export const PLAYER_1_TEXT = "#1D4ED8";
export const PLAYER_2_TEXT = "#7E22CE";

export const PLAYER_1_SOFT = "#EFF4FF";
export const PLAYER_2_SOFT = "#FAF5FF";

export const PLAYER_1_BAR_TINT = "#BFD5FB";
export const PLAYER_2_BAR_TINT = "#DDC7F7";

/** Accent for match-specific events (e.g., break of serve). */
export const EVENT_ACCENT = "#F59E0B";
