/**
 * URL state layer for the Visualizations tab redesign.
 * Maps between VizState (the view's state model) and URLSearchParams.
 * Pure TypeScript; no React, no "use client".
 *
 * The layout: cut/chart/view/filters live in viz keys; other keys (like tab)
 * pass through untouched. Parsing is forgiving — unknown/garbage values read
 * as defaults; serialize omits defaults to keep URLs readable.
 */

import type { Cut, Chart, VizFilters, EMPTY_VIZ_FILTERS } from "./viz-model";
import { filterKeysFor } from "./viz-model";

/* ── Types ──────────────────────────────────────────────────────────────── */

export interface VizState {
  cut: Cut | null; // null = the wall
  chart: Chart;
  filters: VizFilters;
  viewId: string | null;
}

/* ── Parse & serialize helper ──────────────────────────────────────────── */

const OPTIONS = {
  player: { opponent: "Opponent" },
  game: { serving: "Serving", returning: "Returning" },
  ball: { first: "1st", second: "2nd" },
  court: { deuce: "Deuce", ad: "Ad" },
  zone: { t: "T", body: "Body", wide: "Wide" },
  pressure: { break: "Break points", setMatch: "Set & match points" },
  result: { won: "Won", lost: "Lost", ace: "Aces" },
  rally: { short: "1–4 shots", medium: "5–8 shots", long: "9+ shots" },
} as const;

const ORDER = [
  "player",
  "ball",
  "court",
  "zone",
  "result",
  "pressure",
  "rally",
  "game",
] as const;

const VIZ_KEYS = ["cut", "chart", "view", "set", ...ORDER];

type OptionKey = keyof typeof OPTIONS;

/* ── Public API ─────────────────────────────────────────────────────────── */

/**
 * URLSearchParams → VizState. Garbage values read as defaults.
 * `chart=zones` with a non-serve cut parses as `scatter`.
 */
export function parseVizState(params: URLSearchParams): VizState {
  const cutParam = params.get("cut");
  let cut: Cut | null = null;
  if (
    cutParam === "serve" ||
    cutParam === "returnPlacement" ||
    cutParam === "returnContact"
  ) {
    cut = cutParam;
  }

  let chart: Chart = "scatter";
  if (params.get("chart") === "zones") {
    if (cut === "serve") {
      chart = "zones";
    }
    // else: stays "scatter" (zones off serve reads as scatter)
  }

  const viewId = params.get("view");

  const filters = parseFilters(params, cut);

  return { cut, chart, filters, viewId };
}

/**
 * Clone params, delete all viz keys, then serialize state.
 * Omits defaults to keep URLs readable. Never mutates input params.
 * Keeps unrelated keys like tab.
 */
export function vizStateQuery(
  params: URLSearchParams,
  state: VizState,
): string {
  const next = new URLSearchParams(params.toString());

  // Delete all viz keys
  for (const key of VIZ_KEYS) {
    next.delete(key);
  }

  // If cut is null, we're done (the wall)
  if (state.cut === null) {
    return next.toString();
  }

  // Serialize cut and chart
  next.set("cut", state.cut);
  if (state.chart !== "scatter") {
    next.set("chart", state.chart);
  }

  // Serialize viewId if present
  if (state.viewId !== null) {
    next.set("view", state.viewId);
  }

  // Serialize filters: only non-default keys that are in filterKeysFor(cut)
  const allowedKeys = new Set(filterKeysFor(state.cut));

  if (state.filters.set !== "any") {
    if (allowedKeys.has("set")) {
      next.set("set", String(state.filters.set));
    }
  }

  for (const key of ORDER) {
    if (!allowedKeys.has(key)) continue;

    const value = state.filters[key as keyof typeof state.filters];
    const defaultValue = getDefaultFor(key as OptionKey);

    if (value !== defaultValue) {
      next.set(key, String(value));
    }
  }

  return next.toString();
}

/**
 * Reset serve-only filter values when switching off serve.
 * zone and result:"ace" reset to "any" on non-serve cuts.
 */
export function carryFilters(filters: VizFilters, nextCut: Cut): VizFilters {
  if (nextCut === "serve") {
    return filters;
  }

  // Off serve: reset serve-only values
  const next = { ...filters };
  if (filters.zone !== "any") {
    next.zone = "any";
  }
  if (filters.result === "ace") {
    next.result = "any";
  }
  return next;
}

/**
 * Active filter entries for the UI, ordered per ORDER then set,
 * skipping defaults and keys not in the cut. Returns label strings
 * from OPTIONS.
 */
export function activeFilterEntries(
  state: VizState,
): { key: keyof VizFilters; label: string }[] {
  if (state.cut === null) {
    return [];
  }

  const allowedKeys = new Set(filterKeysFor(state.cut));
  const result: { key: keyof VizFilters; label: string }[] = [];

  // ORDER then set
  for (const key of ORDER) {
    if (!allowedKeys.has(key)) continue;

    const value = state.filters[key as keyof typeof state.filters];
    const defaultValue = getDefaultFor(key as OptionKey);

    if (value !== defaultValue) {
      const label = getLabel(key as OptionKey, String(value));
      result.push({ key: key as keyof VizFilters, label });
    }
  }

  // set
  if (allowedKeys.has("set") && state.filters.set !== "any") {
    result.push({ key: "set", label: `Set ${state.filters.set}` });
  }

  return result;
}

/* ── Helpers ───────────────────────────────────────────────────────────── */

function parseFilters(params: URLSearchParams, cut: Cut | null): VizFilters {
  // Start with defaults (from viz-model.ts's EMPTY_VIZ_FILTERS shape)
  const filters: VizFilters = {
    player: "you",
    set: "any",
    game: "any",
    ball: "any",
    court: "any",
    zone: "any",
    pressure: "any",
    result: "any",
    rally: "any",
  };

  // Parse player
  const playerParam = params.get("player");
  if (playerParam === "opponent") {
    filters.player = "opponent";
  }

  // Parse other ORDER keys
  for (const key of ORDER) {
    if (key === "player") continue; // already handled

    const optionKey = key as OptionKey;
    const param = params.get(key);
    if (param !== null && param in OPTIONS[optionKey]) {
      filters[key as keyof typeof filters] = param as never;
    }
  }

  // Parse set (special: numeric)
  const setParam = params.get("set");
  if (setParam !== null) {
    const setNum = Number.parseInt(setParam, 10);
    if (setNum > 0) {
      filters.set = setNum;
    }
  }

  return filters;
}

function getDefaultFor(key: OptionKey): string {
  if (key === "player") return "you";
  return "any";
}

function getLabel(key: OptionKey, value: string): string {
  const options = OPTIONS[key] as Record<string, string>;
  return options[value] || value;
}
