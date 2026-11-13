/**
 * The links the connector hands a person: one visualization card with its
 * filters applied, and a match's Video tab on a filtered set of points.
 *
 * Nothing here invents a URL shape. The Visualizations query is written by
 * the tab's own `vizStateQuery()`, the Video filters by the shared
 * `serializeMatchFilters()`, and the point list by `matchFilmPointsHref()` —
 * the three functions the app's own links come from (`ask/actions.ts`,
 * `ask/figure-video.ts`), so a link from an AI app opens exactly what a
 * click in the app would. This module only maps the tools' plain argument
 * names onto those models.
 *
 * Pure: no database, no request. `siteUrl()` is the one environment read.
 */

import {
  EMPTY_MATCH_FILTERS,
  serializeMatchFilters,
  type MatchFilters,
} from "@/components/dashboard/matches/match-detail/match-filters/model";
import {
  chartAllowedOn,
  EMPTY_VIZ_FILTERS,
  filterKeysFor,
  type Chart,
  type Cut,
  type VizFilters,
} from "@/components/dashboard/matches/match-detail/shots/viz-model";
import {
  vizStateQuery,
  type SeasonFilters,
} from "@/components/dashboard/matches/match-detail/shots/viz-url";
import {
  matchFilmPointsHref,
  MAX_POINT_SET,
} from "@/lib/match-video/point-set";
import { siteUrl } from "@/lib/site-url";

/* ── Visualizations ─────────────────────────────────────────────────────── */

/** The cards a link can open, by the names the tool takes them under. */
export const VISUALIZATION_CUTS = {
  serves: "serve",
  return_placement: "returnPlacement",
  return_contact: "returnContact",
  rally_placement: "rallyPlacement",
  rally_position: "rallyPosition",
  errors: "errors",
} as const satisfies Record<string, Cut>;

export type VisualizationCutName = keyof typeof VISUALIZATION_CUTS;

/** A map's keys as the non-empty tuple `z.enum` takes. */
function keysOf<T extends Record<string, unknown>>(
  map: T,
): [keyof T & string, ...(keyof T & string)[]] {
  return Object.keys(map) as [keyof T & string, ...(keyof T & string)[]];
}

export const VISUALIZATION_CUT_NAMES = keysOf(VISUALIZATION_CUTS);

export const VISUALIZATION_CHARTS = ["scatter", "zones", "heat"] as const;

const PRESSURE = {
  break_points: "break",
  set_and_match_points: "setMatch",
} as const;
const ERRORS = {
  unforced: "unforced",
  forced: "forced",
  double_fault: "doubleFault",
} as const;

export const VISUALIZATION_PRESSURE = keysOf(PRESSURE);
export const VISUALIZATION_ERRORS = keysOf(ERRORS);

/** `open_visualization`'s filters, as the tool takes them. */
export interface VisualizationArgs {
  cut: VisualizationCutName;
  chart?: Chart;
  player?: "me" | "opponent";
  sets?: readonly number[];
  game?: readonly ("serving" | "returning")[];
  serve_number?: readonly ("first" | "second")[];
  court?: readonly ("deuce" | "ad")[];
  serve_zone?: readonly ("t" | "body" | "wide")[];
  pressure?: readonly (keyof typeof PRESSURE)[];
  result?: readonly ("won" | "lost" | "ace")[];
  rally?: readonly ("short" | "medium" | "long")[];
  error?: readonly (keyof typeof ERRORS)[];
  /** A team player's season only. */
  opponent_hand?: "right" | "left" | "unknown";
  season_result?: "won" | "lost";
  surface?: "hard" | "clay" | "grass" | "unknown";
}

/** The tool's argument for each filter key of the tab's model. */
const ARG_OF_KEY: Partial<Record<keyof VizFilters, keyof VisualizationArgs>> = {
  player: "player",
  set: "sets",
  game: "game",
  ball: "serve_number",
  court: "court",
  zone: "serve_zone",
  pressure: "pressure",
  result: "result",
  rally: "rally",
  error: "error",
};

const SEASON_ARGS = ["opponent_hand", "season_result", "surface"] as const;

function given(value: unknown): boolean {
  return Array.isArray(value) ? value.length > 0 : value !== undefined;
}

export type VisualizationTarget =
  { kind: "match"; matchId: string } | { kind: "player"; playerId: string };

export type VisualizationLink =
  | { ok: false; reason: string }
  | {
      ok: true;
      url: string;
      /** Arguments the card does not have a filter for, left out of the link. */
      ignored: string[];
    };

/**
 * The absolute URL of one visualization card. A filter the card does not
 * carry (a serve zone on the errors card, a season filter on a match) is
 * left out and named in `ignored`, so the caller can say what the link does
 * not show rather than describe a filter that was never applied.
 */
export function visualizationLink(
  target: VisualizationTarget,
  args: VisualizationArgs,
): VisualizationLink {
  const cut = VISUALIZATION_CUTS[args.cut];
  const chart = args.chart ?? "scatter";
  if (!chartAllowedOn(cut, chart)) {
    return {
      ok: false,
      reason: `The ${args.cut} card has no ${chart} chart. (chart)`,
    };
  }
  const filters: VizFilters = {
    ...EMPTY_VIZ_FILTERS,
    player: args.player === "opponent" ? "opponent" : "you",
    set: [...(args.sets ?? [])],
    game: [...(args.game ?? [])],
    ball: [...(args.serve_number ?? [])],
    court: [...(args.court ?? [])],
    zone: [...(args.serve_zone ?? [])],
    pressure: (args.pressure ?? []).map((value) => PRESSURE[value]),
    // Aces are a filter of the serves card alone.
    result: (args.result ?? []).filter(
      (value) => value !== "ace" || cut === "serve",
    ),
    rally: [...(args.rally ?? [])],
    error: (args.error ?? []).map((value) => ERRORS[value]),
  };

  const allowed = new Set(filterKeysFor(cut));
  const ignored: string[] = [];
  for (const [key, arg] of Object.entries(ARG_OF_KEY)) {
    if (key === "player") continue;
    if (!allowed.has(key as keyof VizFilters) && given(args[arg])) {
      ignored.push(arg);
    }
  }

  if (cut !== "serve" && (args.result ?? []).includes("ace")) {
    ignored.push("result: ace");
  }

  const season: SeasonFilters | undefined =
    target.kind === "player" && SEASON_ARGS.some((arg) => given(args[arg]))
      ? {
          opponentHand: args.opponent_hand ?? null,
          result: args.season_result ?? null,
          surface: args.surface ?? null,
          matches: [],
        }
      : undefined;
  if (target.kind === "match") {
    for (const arg of SEASON_ARGS) if (given(args[arg])) ignored.push(arg);
  }

  const base = new URLSearchParams({
    tab: target.kind === "match" ? "shots" : "visualizations",
  });
  const query = vizStateQuery(base, {
    cut,
    chart,
    filters,
    viewId: null,
    ...(season ? { season } : {}),
  });
  const path =
    target.kind === "match"
      ? `/dashboard/matches/${encodeURIComponent(target.matchId)}`
      : `/dashboard/team/roster/${encodeURIComponent(target.playerId)}`;
  return { ok: true, url: `${siteUrl()}${path}?${query}`, ignored };
}

/* ── Video ──────────────────────────────────────────────────────────────── */

const SITUATION = {
  pressure: "pressure",
  break_point: "breakpoint",
  set_point: "setPoint",
  match_point: "matchPoint",
} as const;
const SERVE_ZONE = { wide: "Wide", body: "Body", t: "T" } as const;
const SERVE_RESULT = {
  ace: "ace",
  service_winner: "service-winner",
  return_error: "return-error",
  in_play: "in-play",
  double_fault: "double-fault",
} as const;
const STROKE = { forehand: "Forehand", backhand: "Backhand" } as const;
const LAST_SHOT = {
  serve: "Serve",
  return: "Return",
  forehand: "Forehand",
  backhand: "Backhand",
  volley: "Volley",
  overhead: "Overhead",
} as const;
const MISSED = { out: "Out", net: "Net" } as const;

export const POINT_SITUATIONS = keysOf(SITUATION);
export const POINT_SERVE_ZONES = keysOf(SERVE_ZONE);
export const POINT_SERVE_RESULTS = keysOf(SERVE_RESULT);
export const POINT_RETURN_STROKES = keysOf(STROKE);
export const POINT_LAST_SHOTS = keysOf(LAST_SHOT);
export const POINT_MISSES = keysOf(MISSED);

/** `find_points`' filters, as the tool takes them. Rally length and point numbers are not here: they become the link's point list. */
export interface PointFilterArgs {
  sets?: readonly number[];
  situation?: readonly (keyof typeof SITUATION)[];
  server?: "me" | "opponent";
  court?: "deuce" | "ad";
  serve_number?: readonly ("first" | "second")[];
  serve_zone?: readonly (keyof typeof SERVE_ZONE)[];
  serve_result?: readonly (keyof typeof SERVE_RESULT)[];
  return_stroke?: readonly (keyof typeof STROKE)[];
  outcome?: "won" | "lost";
  last_shot_by?: "me" | "opponent";
  last_shot?: readonly (keyof typeof LAST_SHOT)[];
  ending?: readonly ("winner" | "error")[];
  missed?: readonly (keyof typeof MISSED)[];
}

const side = (value: "me" | "opponent" | undefined) =>
  value === undefined ? null : value === "me" ? "you" : "opponent";

/** The Video tab's filter model for these arguments. */
export function pointFilters(args: PointFilterArgs): MatchFilters {
  return {
    ...EMPTY_MATCH_FILTERS,
    sets: [...(args.sets ?? [])],
    scoreType: (args.situation ?? []).map((value) => SITUATION[value]),
    server: side(args.server),
    court: args.court ?? null,
    serveType: [...(args.serve_number ?? [])],
    serveZone: (args.serve_zone ?? []).map((value) => SERVE_ZONE[value]),
    serveResult: (args.serve_result ?? []).map((value) => SERVE_RESULT[value]),
    returnType: (args.return_stroke ?? []).map((value) => STROKE[value]),
    resultOutcome: args.outcome ? [args.outcome] : [],
    resultPlayer: side(args.last_shot_by),
    resultShot: (args.last_shot ?? []).map((value) => LAST_SHOT[value]),
    resultEnding: [...(args.ending ?? [])],
    resultMissed: (args.missed ?? []).map((value) => MISSED[value]),
  };
}

/**
 * The absolute URL of a match's Video tab on these filters and, when given,
 * exactly these points. The tab ANDs the two. `numbers` beyond the tab's
 * limit are cut off: `truncated` says so.
 */
export function videoLink(
  matchId: string,
  args: PointFilterArgs,
  numbers: readonly number[] | null,
): { url: string; filters: string; truncated: boolean } {
  const filters = serializeMatchFilters(pointFilters(args));
  const listed = numbers ? numbers.slice(0, MAX_POINT_SET) : [];
  return {
    url: `${siteUrl()}${matchFilmPointsHref(matchId, listed, filters)}`,
    filters,
    truncated: numbers !== null && numbers.length > MAX_POINT_SET,
  };
}
