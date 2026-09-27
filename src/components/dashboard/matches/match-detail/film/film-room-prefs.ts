/**
 * The fullscreen film room's viewer preferences, and the `fullscreen` URL
 * param helper. Pure logic, no React — `film-fullscreen.tsx` and the shell
 * both read/write these.
 *
 * Persistence is localStorage, following `film-room:board-anchor`
 * (`board-position.ts`): court on/off, court mode and the points drawer
 * open/closed. There is no `user_preferences` column and no migration for
 * any of this (spec: "Settled mismatches" § Persistence).
 *
 * The URL only ever carries `fullscreen=1`, written on enter and stripped on
 * exit — never honoured on load (spec: "Settled mismatches" § URL). Modeled
 * on `serializeCut` (`film/filters/types.ts`).
 */

/* ── Storage keys ───────────────────────────────────────────────────────── */

export const COURT_ON_STORAGE_KEY = "film-room:court-on";
export const COURT_MODE_STORAGE_KEY = "film-room:court-mode";
export const DRAWER_OPEN_STORAGE_KEY = "film-room:drawer-open";

/* ── State ──────────────────────────────────────────────────────────────── */

export type CourtMode = "point" | "match";

export const DEFAULT_COURT_ON = true;
export const DEFAULT_COURT_MODE: CourtMode = "point";
export const DEFAULT_DRAWER_OPEN = false;

/* ── Parsers ────────────────────────────────────────────────────────────── */

/** A stored value, or the default (`true`) when it is missing or unrecognised. */
export function parseCourtOn(raw: string | null): boolean {
  if (raw === "0") return false;
  if (raw === "1") return true;
  return DEFAULT_COURT_ON;
}

/** A stored value, or the default (`"point"`) when it is missing or unrecognised. */
export function parseCourtMode(raw: string | null): CourtMode {
  return raw === "point" || raw === "match" ? raw : DEFAULT_COURT_MODE;
}

/** A stored value, or the default (`false`) when it is missing or unrecognised. */
export function parseDrawerOpen(raw: string | null): boolean {
  return raw === "1";
}

/* ── Read/write helpers ─────────────────────────────────────────────────── */
/*
 * Every `localStorage` access sits in its own try/catch and falls back to
 * the default, the way `film-scoreboard.tsx` reads and writes
 * `BOARD_POSITION_STORAGE_KEY` — a private window or blocked storage just
 * means the preference isn't kept, not a crash.
 */

export function readCourtOn(): boolean {
  try {
    return parseCourtOn(localStorage.getItem(COURT_ON_STORAGE_KEY));
  } catch {
    return DEFAULT_COURT_ON;
  }
}

export function writeCourtOn(value: boolean): void {
  try {
    localStorage.setItem(COURT_ON_STORAGE_KEY, value ? "1" : "0");
  } catch {
    /* private window or storage blocked — the preference just isn't kept */
  }
}

export function readCourtMode(): CourtMode {
  try {
    return parseCourtMode(localStorage.getItem(COURT_MODE_STORAGE_KEY));
  } catch {
    return DEFAULT_COURT_MODE;
  }
}

export function writeCourtMode(value: CourtMode): void {
  try {
    localStorage.setItem(COURT_MODE_STORAGE_KEY, value);
  } catch {
    /* private window or storage blocked — the preference just isn't kept */
  }
}

export function readDrawerOpen(): boolean {
  try {
    return parseDrawerOpen(localStorage.getItem(DRAWER_OPEN_STORAGE_KEY));
  } catch {
    return DEFAULT_DRAWER_OPEN;
  }
}

export function writeDrawerOpen(value: boolean): void {
  try {
    localStorage.setItem(DRAWER_OPEN_STORAGE_KEY, value ? "1" : "0");
  } catch {
    /* private window or storage blocked — the preference just isn't kept */
  }
}

/* ── The `fullscreen` URL param ────────────────────────────────────────── */

/** Anything with `toString()`, so a bare query string or `URLSearchParams` both fit. */
type RoomParamsInput = { toString(): string } | null | undefined;

/**
 * A new query string with `fullscreen` set (entering the room) or deleted
 * (leaving it); every other param is carried through, `params` is never
 * mutated, and a null/undefined `params` is treated as empty.
 */
export function roomParam(params: RoomParamsInput, open: boolean): string {
  const next = new URLSearchParams(params?.toString() ?? "");
  if (open) next.set("fullscreen", "1");
  else next.delete("fullscreen");
  return next.toString();
}
