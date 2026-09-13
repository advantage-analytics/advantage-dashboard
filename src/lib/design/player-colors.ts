/**
 * Canonical player colors, transcribed from `styles/design-system/colors.css`.
 *
 * Dual-track pattern: these JS hex constants are the source for libraries
 * that need runtime values (Recharts, inline SVG fills). For component
 * styling, prefer the matching CSS variables defined in `globals.css`
 * (`--color-player-1`, `--color-player-2`, etc.) so theme changes flow
 * through the cascade. Keep both in sync — if you change a hex here,
 * update the corresponding CSS variable.
 *
 * This file is a TRANSCRIPTION, never an authority. colors.css is where the
 * decision lives; `scripts/check-design-drift.mjs` check 5 fails if the two
 * disagree. That check exists because they did: player-2 shipped violet here
 * for months after colors.css retired it (review decision C), and every
 * checker that treated this file as a palette source laundered the violet as
 * legitimate.
 *
 * Player 2 is cool slate: you own Signal Blue, the opponent recedes.
 */
export const PLAYER_1 = "#3B82F6";
export const PLAYER_2 = "#64748B";

export const PLAYER_1_TEXT = "#1D4ED8";
export const PLAYER_2_TEXT = "#475569";

export const PLAYER_1_SOFT = "#EFF4FF";
export const PLAYER_2_SOFT = "#F1F5F9";

export const PLAYER_1_BAR_TINT = "#BFD5FB";
export const PLAYER_2_BAR_TINT = "#CBD5E1";

/** Accent for match-specific events (e.g., break of serve). Chart-only amber. */
export { VIZ_AMBER as EVENT_ACCENT } from "./data-viz";
