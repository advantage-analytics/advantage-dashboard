import type { MatchPoint } from "@/lib/data/match-points-server";
import { seasonErrorSplitJudged } from "@/lib/data/player-season";
import { ZONES, type ZoneKey, type ZoneStats } from "@/lib/data/serve-zones";
import { depthBandRows, type BandSettings } from "@/lib/data/viz-bands";
import type { DistanceUnit } from "@/lib/format/distance";
import {
  MATCH_FILTER_KEYS,
  optionAvailability,
  type MatchFilterAvailability,
  type MatchFilterContext,
  type MatchFilterKey,
  type MatchFilterValue,
} from "@/components/dashboard/matches/match-detail/match-filters/model";
import type { SavedView } from "@/lib/data/saved-views-logic";
import { defaultCutsFor } from "@/components/dashboard/matches/match-detail/shots/default-cuts";
import {
  statPickDotIds,
  type StatPick,
} from "@/components/dashboard/matches/match-detail/shots/stat-cut";
import {
  EMPTY_VIZ_FILTERS,
  bandZonesFor,
  collapseErrorFilter,
  computeViz,
  computeVizStats,
  filterKeysFor,
  orderStatRows,
  subjectFor,
  type Chart,
  type Cut,
  type PlayerFilter,
  type StatGroup,
  type StatRow,
  type VizBandZones,
  type VizDot,
  type VizFilters,
  type VizResult,
  type VizStats,
} from "@/components/dashboard/matches/match-detail/shots/viz-model";
import { vizPoints } from "@/components/dashboard/matches/match-detail/shots/viz-points";
import {
  activeFilterEntries,
  errorOptionsFor,
  normalizeSeasonFilters,
  parseVizState,
  sameFilterValue,
  seasonMatchKept,
  seasonSurfaceOf,
  vizStateQuery,
  type OpponentHandFilter,
  type SeasonFilters,
  type SeasonResultFilter,
  type SeasonSurface,
  type VizState,
} from "@/components/dashboard/matches/match-detail/shots/viz-url";
import { compareMatchDays } from "@/lib/data/match-day";
import {
  lightboxCountLine,
  wallSummaryFor,
  type WallSummary,
} from "@/components/dashboard/matches/match-detail/shots/wall-summary";

/**
 * A player's season on the Visualizations tab (team player profile, design
 * Q): the match report's wall cards (`wall-card.tsx`) and its lightbox
 * (`viz-lightbox-shell.tsx`) over every analyzed match at once, computed on
 * the server from `PlayerSeason.perMatch` — a season's points are megabytes
 * and never reach the browser; what leaves here is what the cards and the
 * shell draw.
 *
 * NOTHING HERE DERIVES A STATISTIC. Each match is run through the report's
 * own calculators — `computeViz`, `computeVizStats`, `wallSummaryFor`,
 * `statPickDotIds` — with THAT match's own seat (`isPlayer1`) and its own
 * filter context (its `errorSplitJudged`, its `isDerived`, through
 * `vizPoints` so a video match's aces are named as the report names them),
 * and the fold only adds up what comes back: marks are concatenated, a
 * Statistics row's count and won are summed and its percentage divided once,
 * the wall footer is `wallSummaryFor` over the summed rows. A season figure
 * that disagrees with the sum of its match reports is a bug here, never a
 * second opinion. `tests/player-season-viz.spec.ts` pins the sums.
 *
 * Sides (guardrails §4): the player may sit in either seat from one match to
 * the next. Every match is computed with its own `isPlayer1`; nothing flips
 * a point to a common seat. "You" is the player whose profile this is,
 * "opponent" is whoever they played that day.
 *
 * Errors: the wall's errors card follows the season's own rule
 * (`seasonErrorSplitJudged`, as the Statistics tab's Errors row does) —
 * "Unforced errors" only when EVERY analyzed match has judged its errors,
 * else "Errors" over both kinds, a judged match contributing its unforced +
 * forced to it as the report's unjudged Errors cut would. Each match still
 * reads its own error kinds (`errorsJudgedIn` off its own context).
 *
 * Pure TypeScript — no React, no Supabase, no `"use client"` — so the page's
 * Server Component can call it and the spec can run it offline.
 */

/* ── Inputs ─────────────────────────────────────────────────────────────── */

/** One analyzed match, as the season's courts read it. */
export interface SeasonVizMatch {
  matchId: string;
  /** Every point of the match, as `getMatchPointsFromSupabase` returns them. */
  points: MatchPoint[];
  /** Which seat the PLAYER sat in for this match — never normalised. */
  isPlayer1: boolean;
  /** An Advantage Intelligence match: aces are its unreturned serves. */
  isDerived: boolean;
  /** Its errors are judged forced/unforced. */
  errorSplitJudged: boolean;
  /** The match's calendar day, `YYYY-MM-DD` (`matchDay()`), or null — the
   *  readout's "vs Lee · Nov 3". Never read as a moment. */
  date?: string | null;
  /** The opponent's name, as the match names them. */
  opponent?: string;
  /** Whether its Video tab has something to play. Omitted: an Advantage
   *  Intelligence match (`isDerived`) does, any other does not. */
  hasPlayableVideo?: boolean;
  /** The hand of whoever the player faced that day, read off the match row
   *  for the opponent's seat by the loader (`player-season-server.ts`), or
   *  null / omitted when the match does not say — "Opponent plays" reads it
   *  as Unknown. */
  opponentHand?: "right" | "left" | null;
  /** Won from the player's seat, null / omitted where the score cannot say
   *  — the Matches sheet's Result reads it, and its row's mark. */
  won?: boolean | null;
  /** The score from the player's seat, for the Matches sheet's row. */
  score?: string | null;
  /** `matches.court_type`, raw — "Surface" reads it (`seasonSurfaceOf`). */
  courtType?: string | null;
}

/** The workspace's bands and the viewer's unit — every Depth row and band
 *  overlay is bucketed with these, exactly as the report's lightbox is. */
export interface SeasonVizBands {
  bands: BandSettings;
  unit: DistanceUnit;
}

/** The two names the subtitle, readout and advanced-filter phrases use. */
export interface SeasonVizNames {
  /** The player whose profile this is. */
  you: string;
  /** Their opponents, as a group ("Opponents"). */
  opponent: string;
}

/** The filter context one match is computed under: its own seat for "you",
 *  its own judged and derived flags; hands unknown (Custom › Direction's
 *  inside-out never matches — the season's Filters panel does not offer it). */
export function seasonMatchContext(
  m: Pick<SeasonVizMatch, "isPlayer1" | "isDerived" | "errorSplitJudged">,
): MatchFilterContext {
  return {
    youIsPlayer1: m.isPlayer1,
    hands: { player1: null, player2: null },
    isDerived: m.isDerived,
    errorSplitJudged: m.errorSplitJudged,
  };
}

/* ── One match, computed ────────────────────────────────────────────────── */

interface SeasonPart {
  points: MatchPoint[];
  ctx: MatchFilterContext;
  /** The resolved subject for THIS match (`subjectFor` over its own seat). */
  subjectIsPlayer1: boolean;
  result: VizResult;
  stats: VizStats;
}

/**
 * Each match's computed parts, kept on its points array. A season's points
 * come from the process's points cache (`season-points-cache.ts`) as the
 * SAME array on every request until that match's version changes, so a
 * profile click that recomputes the wall's cards, the saved views' and the
 * opened card's finds every match it has already folded under the same cut,
 * filters, chart and bands here instead of running `computeViz` again. A
 * new version is a new array, so a changed match misses on its own, and the
 * entry goes when the cache lets the array go (`WeakMap`). Parts are only
 * read after this: the merges build fresh objects.
 */
const seasonPartMemo = new WeakMap<
  readonly MatchPoint[],
  Map<string, SeasonPart>
>();
/** Parts kept per match — the wall's cards, a handful of saved views and an
 *  opened card's recent filters. Oldest first out. */
const SEASON_PART_MEMO_MAX = 48;

function seasonPart(
  m: SeasonVizMatch,
  cut: Cut,
  filters: VizFilters,
  chart: Chart,
  bands: SeasonVizBands,
): SeasonPart {
  const key = JSON.stringify([
    m.isPlayer1,
    m.isDerived,
    m.errorSplitJudged,
    cut,
    chart,
    filters,
    bands.bands,
    bands.unit,
  ]);
  let memo = seasonPartMemo.get(m.points);
  const hit = memo?.get(key);
  if (hit !== undefined) return hit;
  const part = computeSeasonPart(m, cut, filters, chart, bands);
  if (memo === undefined) {
    memo = new Map();
    seasonPartMemo.set(m.points, memo);
  }
  if (memo.size >= SEASON_PART_MEMO_MAX) {
    const oldest = memo.keys().next().value;
    if (oldest !== undefined) memo.delete(oldest);
  }
  memo.set(key, part);
  return part;
}

function computeSeasonPart(
  m: SeasonVizMatch,
  cut: Cut,
  filters: VizFilters,
  chart: Chart,
  { bands, unit }: SeasonVizBands,
): SeasonPart {
  const points = vizPoints(m.points, m.isDerived);
  const ctx = seasonMatchContext(m);
  const subjectIsPlayer1 = subjectFor(filters, m.isPlayer1);
  const result = computeViz(points, cut, filters, subjectIsPlayer1, chart, ctx);
  const stats = computeVizStats(
    points,
    cut,
    filters,
    subjectIsPlayer1,
    result,
    bands,
    unit,
    ctx,
  );
  return { points, ctx, subjectIsPlayer1, result, stats };
}

/* ── Merging ────────────────────────────────────────────────────────────── */

/** `VizResult.noun` for a cut — what `computeViz` answers, for a season with
 *  no parts to read it off. */
export function cutNoun(cut: Cut): VizResult["noun"] {
  if (cut === "serve") return "serves";
  if (cut === "errors") return "errors";
  if (cut === "returnPlacement" || cut === "returnContact") return "returns";
  return "shots";
}

function mergeZoneStats(
  parts: readonly (Record<ZoneKey, ZoneStats> | null)[],
): Record<ZoneKey, ZoneStats> | null {
  const present = parts.filter(
    (zs): zs is Record<ZoneKey, ZoneStats> => zs !== null,
  );
  if (present.length === 0) return null;
  const merged = Object.fromEntries(
    ZONES.map(({ key }) => [
      key,
      {
        count: 0,
        pct: 0,
        first: 0,
        second: 0,
        won: 0,
        lost: 0,
        ace: 0,
        doubleFault: 0,
        winPct: 0,
      },
    ]),
  ) as Record<ZoneKey, ZoneStats>;
  for (const zs of present) {
    for (const { key } of ZONES) {
      const zone = zs[key];
      if (!zone) continue;
      const sum = merged[key];
      sum.count += zone.count;
      sum.first += zone.first;
      sum.second += zone.second;
      sum.won += zone.won;
      sum.lost += zone.lost;
      sum.ace += zone.ace;
      sum.doubleFault += zone.doubleFault;
    }
  }
  // `computeServeZoneStats`' own two divisions: a zone's share of every
  // in-serve, and its points won (aces included) of its own serves.
  const eligible = ZONES.reduce((n, { key }) => n + merged[key].count, 0);
  for (const { key } of ZONES) {
    const zone = merged[key];
    zone.pct = eligible ? Math.round((100 * zone.count) / eligible) : 0;
    zone.winPct = zone.count
      ? Math.round((100 * (zone.won + zone.ace)) / zone.count)
      : 0;
  }
  return merged;
}

/**
 * Several matches' `computeViz` results as one: the marks concatenated in
 * match order (ids are point and shot ids, unique across matches), the
 * counts summed, the serve zones' tallies summed and their percentages
 * divided once more.
 */
export function mergeVizResults(
  cut: Cut,
  parts: readonly VizResult[],
): VizResult {
  const merged: VizResult = {
    dots: parts.flatMap((p) => p.dots),
    count: parts.reduce((n, p) => n + p.count, 0),
    total: parts.reduce((n, p) => n + p.total, 0),
    noun: cutNoun(cut),
    zoneStats:
      cut === "serve" ? mergeZoneStats(parts.map((p) => p.zoneStats)) : null,
  };
  if (cut === "serve") {
    merged.serveOutOrNetCount = parts.reduce(
      (n, p) => n + (p.serveOutOrNetCount ?? 0),
      0,
    );
  }
  return merged;
}

/**
 * Several matches' `computeVizStats` as one: groups and rows united by key
 * (a row one match has and another lacks — an errors "Landed in" row, a
 * stroke nobody hit that day — is kept), count and won summed, the
 * percentage divided once — won of count for a points row, count of every
 * mark shown (`shareTotal`, the merged result's marks) for a share row — and
 * each group put back in `computeVizStats`' own order (`orderStatRows`).
 *
 * `title` is the cut's (the same on every part). `subtitle` and `sentence`
 * are per-match prose the shell does not print; the season says how many
 * matches it folds and claims nothing else.
 */
export function mergeVizStats(
  parts: readonly VizStats[],
  shareTotal: number,
  matches: number,
): VizStats {
  const groups = new Map<
    string,
    { label: string | null; rows: Map<string, StatRow> }
  >();
  for (const part of parts) {
    for (const group of part.groups) {
      let slot = groups.get(group.key);
      if (!slot) {
        slot = { label: group.label, rows: new Map() };
        groups.set(group.key, slot);
      }
      for (const row of group.rows) {
        const sum = slot.rows.get(row.key);
        if (sum) {
          sum.count += row.count;
          sum.won += row.won;
          if (row.share) sum.share = true;
        } else {
          slot.rows.set(row.key, {
            key: row.key,
            label: row.label,
            count: row.count,
            won: row.won,
            winPct: null,
            ...(row.share ? { share: true } : {}),
          });
        }
      }
    }
  }
  const merged: StatGroup[] = [...groups].map(([key, slot]) => ({
    key,
    label: slot.label,
    rows: orderStatRows(
      [...slot.rows.values()].map((row) => ({
        ...row,
        winPct: row.share
          ? shareTotal === 0
            ? null
            : Math.round((row.count / shareTotal) * 100)
          : row.count === 0
            ? null
            : Math.round((row.won / row.count) * 100),
      })),
    ),
  }));
  return {
    title: parts[0]?.title ?? "",
    subtitle: `Over ${matches} ${matches === 1 ? "match" : "matches"}`,
    groups: merged,
    sentence: null,
    total: parts.reduce((n, p) => n + p.total, 0),
  };
}

/* ── The wall ───────────────────────────────────────────────────────────── */

/** One of the wall's cards over the season: a default card (one of five for
 *  one subject) or one of the workspace's saved views. */
export interface SeasonCard {
  /** Stable key: `"you:serve"`, `"opponent:errors"`, `"view:<id>"`. */
  key: string;
  cut: Cut;
  chart: Chart;
  /** The card's title — the default cut's (`default-cuts.ts`) or the saved
   *  view's own name. */
  name: string;
  subject: PlayerFilter;
  /** The court's marks, every match's together. Without `meta`: the card
   *  draws shape, outcome and position only, and a season's readouts would
   *  be most of the payload. */
  dots: VizDot[];
  /** The footer (`wallSummaryFor` over the summed rows). */
  summary: WallSummary;
  /** What opening the card asks the URL for (`viz-url.ts`). */
  state: VizState;
  /** Drawable marks in the cut's pool — `0` on every card means the subject
   *  has nothing to show. */
  total: number;
}

function wallDot({
  id,
  outcome,
  shape,
  lateralM,
  depthM,
  atNet,
}: VizDot): VizDot {
  // To the millimetre, as the opened card's marks travel (`toMillimetre`).
  return toMillimetre({ id, outcome, shape, lateralM, depthM, atNet });
}

/** One card over the season: each match computed with its own seat and
 *  context, then merged — the one fold behind the default and saved cards. */
function seasonCard(
  perMatch: readonly SeasonVizMatch[],
  card: {
    key: string;
    cut: Cut;
    chart: Chart;
    name: string;
    filters: VizFilters;
    viewId: string | null;
  },
  bands: SeasonVizBands,
): SeasonCard {
  const parts = perMatch.map((m) =>
    seasonPart(m, card.cut, card.filters, card.chart, bands),
  );
  const result = mergeVizResults(
    card.cut,
    parts.map((p) => p.result),
  );
  const stats = mergeVizStats(
    parts.map((p) => p.stats),
    result.dots.length,
    perMatch.length,
  );
  return {
    key: card.key,
    cut: card.cut,
    chart: card.chart,
    name: card.name,
    subject: card.filters.player,
    dots: result.dots.map(wallDot),
    summary: wallSummaryFor(
      card.cut,
      result,
      stats,
      depthBandRows(bands.bands, bands.unit),
    ),
    state: {
      cut: card.cut,
      chart: card.chart,
      filters: card.filters,
      viewId: card.viewId,
    },
    total: result.total,
  };
}

/**
 * The wall's five cards for `side` over `perMatch` — the redesign's default
 * cuts (`defaultCutsFor` by the season's judged rule), each match computed
 * with its own seat and context, then merged. In wall order.
 */
export function buildSeasonCards(
  perMatch: readonly SeasonVizMatch[],
  side: PlayerFilter,
  bands: SeasonVizBands,
): SeasonCard[] {
  const judged = seasonErrorSplitJudged(perMatch);
  return defaultCutsFor(judged).map((cut) =>
    seasonCard(
      perMatch,
      {
        key: `${side}:${cut.cut}`,
        cut: cut.cut,
        chart: cut.chart,
        name: cut.name,
        filters: { ...EMPTY_VIZ_FILTERS, ...cut.filters, player: side },
        viewId: null,
      },
      bands,
    ),
  );
}

/**
 * A saved view's filters as the season reads them: Error type under the
 * season's rule (`collapseErrorFilter`, as `parseSeasonVizState` reads a
 * `?verr=`), so the card, its link and the lightbox's baseline are the same
 * court — an Unforced view on a season with an unjudged match is every error.
 */
function seasonViewFilters(view: SavedView, judged: boolean): VizFilters {
  return {
    ...EMPTY_VIZ_FILTERS,
    ...view.filters,
    error: collapseErrorFilter(
      view.filters.error ?? EMPTY_VIZ_FILTERS.error,
      judged,
    ),
  };
}

/**
 * The Saved collection over the season: one card per saved view the viewer
 * can see in this workspace (`getSavedViews` — their own private views and
 * the workspace's shared ones, in its order), each the view's own cut,
 * chart, filters and player, folded over every analyzed match exactly as a
 * default card is. Opening one asks the URL for the view (`?view=`), so the
 * lightbox names it (`buildSeasonLightbox`'s `views`).
 */
export function buildSeasonViewCards(
  perMatch: readonly SeasonVizMatch[],
  views: readonly SavedView[],
  bands: SeasonVizBands,
): SeasonCard[] {
  const judged = seasonErrorSplitJudged(perMatch);
  return views.map((view) =>
    seasonCard(
      perMatch,
      {
        key: `view:${view.id}`,
        cut: view.cut,
        chart: view.chart,
        name: view.name,
        filters: seasonViewFilters(view, judged),
        viewId: view.id,
      },
      bands,
    ),
  );
}

/* ── The lightbox ───────────────────────────────────────────────────────── */

/**
 * `CUT_LABEL` (`viz-labels.tsx`, a client module this server module cannot
 * import) for the cuts the lightbox can open on. The spec pins the two equal.
 */
export const SEASON_CUT_LABEL: Record<Cut, string> = {
  serve: "Serve placement",
  returnPlacement: "Return placement",
  returnContact: "Return contact",
  rallyPosition: "Rally position",
  rallyPlacement: "Rally placement",
  errors: "Errors",
};

/** The lookup key for a Statistics row's marks (`statRowDots`). On serve
 *  the group is the court side the row sits in, as `LightboxStats` picks it. */
export function statPickKey(pick: Pick<StatPick, "group" | "row">): string {
  return `${pick.group}/${pick.row}`;
}

/** The lookup key for one Filters-panel option's count (`optionCounts`):
 *  the patch the panel would hand `countWith`, spelled deterministically. */
export function optionCountKey(patch: Partial<VizFilters>): string {
  return Object.keys(patch)
    .sort()
    .map((key) => {
      const value = patch[key as keyof VizFilters];
      const values = Array.isArray(value)
        ? value.map(String).join("|")
        : JSON.stringify(value ?? null);
      return `${key}=${values}`;
    })
    .join("&");
}

/**
 * Every patch the lightbox's Filters panel asks a count for
 * (`LightboxFilterPanel`'s checklists: Zone, Score and Error type, each
 * option alone), for the keys the cut allows.
 */
export function filterOptionPatches(
  cut: Cut,
  errorSplitJudged: boolean,
): Partial<VizFilters>[] {
  const keys = new Set(filterKeysFor(cut));
  const patches: Partial<VizFilters>[] = [];
  if (keys.has("zone"))
    for (const zone of ["t", "body", "wide"] as const)
      patches.push({ zone: [zone] });
  if (keys.has("pressure"))
    for (const pressure of ["break", "setMatch"] as const)
      patches.push({ pressure: [pressure] });
  if (keys.has("error"))
    for (const option of errorOptionsFor(errorSplitJudged))
      patches.push({ error: [...option.values] });
  return patches;
}

/** `MatchFilterAvailability` as plain data: each group's offered values, in
 *  catalog order (sets ascending). Sets do not cross to the browser. */
export type SeasonAdvancedOptions = {
  [K in MatchFilterKey]: MatchFilterValue<K>[];
};

/**
 * One match's `optionAvailability`, kept on its points array as the parts
 * are (`seasonPartMemo`). It reads only the match — never the filters — yet
 * walking every point of every match was three quarters of a profile filter
 * click's fold (measured 2026-11-10: ~25 of ~35 ms over 24 matches of 190
 * points), recomputed on each one.
 */
const availabilityMemo = new WeakMap<
  readonly MatchPoint[],
  Map<string, MatchFilterAvailability>
>();

function matchAvailability(m: SeasonVizMatch): MatchFilterAvailability {
  const key = `${m.isPlayer1}|${m.isDerived}|${m.errorSplitJudged}`;
  let memo = availabilityMemo.get(m.points);
  const hit = memo?.get(key);
  if (hit !== undefined) return hit;
  const availability = optionAvailability(m.points, seasonMatchContext(m));
  if (memo === undefined) {
    memo = new Map();
    availabilityMemo.set(m.points, memo);
  }
  memo.set(key, availability);
  return availability;
}

/**
 * The Video tab's advanced options the season can produce: each match's
 * `optionAvailability` (its own points and context, as the report reads
 * them), united — an option is offered when any match has a point it
 * matches.
 */
export function seasonAdvancedOptions(
  perMatch: readonly SeasonVizMatch[],
): SeasonAdvancedOptions {
  const each = perMatch.map(matchAvailability);
  const out = {} as Record<MatchFilterKey, unknown[]>;
  for (const key of MATCH_FILTER_KEYS) {
    const values = new Set<unknown>();
    for (const availability of each)
      for (const value of availability[key] as ReadonlySet<unknown>)
        values.add(value);
    const list = [...values];
    // Sets ascending, as one match's are; every other group in catalog
    // order, which a single match's Set already iterates in.
    if (key === "sets") (list as number[]).sort((a, b) => a - b);
    out[key] = list;
  }
  return out as SeasonAdvancedOptions;
}

/** `SeasonAdvancedOptions` back as the `MatchFilterAvailability` the panel
 *  reads. */
export function advancedAvailability(
  options: SeasonAdvancedOptions,
): MatchFilterAvailability {
  const out = {} as Record<MatchFilterKey, ReadonlySet<unknown>>;
  for (const key of MATCH_FILTER_KEYS)
    out[key] = new Set<unknown>(options[key] ?? []);
  return out as unknown as MatchFilterAvailability;
}

/** One match the opened card's court is drawn over — what a mark needs to
 *  name its match and open it. */
export interface SeasonLightboxMatch {
  id: string;
  /** `YYYY-MM-DD` (`match-day.ts`), or null when the match has none. */
  date: string | null;
  opponentName: string;
  /** A second click on one of its marks opens its Video tab. */
  hasPlayableVideo: boolean;
}

/**
 * Where one mark's point sits, as five numbers rather than its point:
 * `[match, pointNumber, setNumber, gameNumber, server]` — `match` an index
 * into `SeasonLightboxData.matches`, `server` 1 when the player served, 0
 * when their opponent did, -1 when the point does not say. Compact on
 * purpose: one per mark, and a season has hundreds.
 */
export type SeasonDotPoint = [number, number, number, number, number];

/** Everything the season's lightbox container hands `VizLightboxShell`,
 *  computed on the server. Plain data — no points, no functions, no Sets. */
export interface SeasonLightboxData {
  cut: Cut;
  chart: Chart;
  /** The URL's filters, as the server read them (`parseVizState` with the
   *  season's judged rule). */
  filters: VizFilters;
  result: VizResult;
  stats: VizStats;
  bandZones: VizBandZones | null;
  subjectName: string;
  unit: DistanceUnit;
  /** Any filter beyond the defaults is on (`activeFilterEntries`). */
  hasFilters: boolean;
  title: string;
  subtitle: string;
  /** The strip's sentence for the filters beyond the card's own. */
  filterPhrases: string[];
  /** A filter beyond "Clear filter"'s target is on. */
  panelActive: boolean;
  /** What "Clear filter" leaves: the card's own filters while the title
   *  still names the card, else the player alone. */
  clearFilters: VizFilters;
  /** The sets there are to pick, across the season. */
  sets: number[];
  /** The season's rule: Error type offers Unforced and Forced apart only
   *  when every match judged its errors. */
  errorSplitJudged: boolean;
  /** Each Statistics row's marks, by `statPickKey` — every row of `stats`
   *  has an entry: the positions in `result.dots` of the marks the row
   *  picks, ascending (`encodeStatRowDots`). Positions, not ids: the ids are
   *  already in `result.dots`, and a row list repeating them was most of the
   *  payload. `decodeStatRowDots` turns one back into the id set the shell
   *  reads. */
  statRowDots: Record<string, number[]>;
  /** Each Filters-panel option's count, by `optionCountKey` — every patch
   *  of `filterOptionPatches` has an entry. */
  optionCounts: Record<string, number>;
  /** The Filters panel's "Advanced filters" options (`seasonAdvancedOptions`).
   *  No counts: a draft there is any combination, and the season's points
   *  stay here, so the advanced panel draws none. */
  advancedOptions: SeasonAdvancedOptions;
  /** The names those options use ("Serve › Player"). */
  names: SeasonVizNames;
  /** The matches the court is drawn over, in `perMatch` order. */
  matches: SeasonLightboxMatch[];
  /** Each mark of `result.dots`, in the same order: its match and where in
   *  it the point was (`SeasonDotPoint`). */
  dotPoints: SeasonDotPoint[];
  /** The URL's season filters as the server read them (`?vopp=`, `?vm=`,
   *  canonical, unvalidated), or null — the court's echo, compared by the
   *  container (`courtSignature`). */
  season: SeasonFilters | null;
  /** "Opponent plays" and "Matches" in the Filters panel. */
  seasonOptions: SeasonFilterOptions;
}

/** One row of the Filters panel's "Matches" checklist. */
export interface SeasonMatchOption {
  id: string;
  opponentName: string;
  /** `YYYY-MM-DD`, or null. */
  date: string | null;
  /** The marks this match adds to the court under the live shot filters,
   *  whatever the match filters say — the Matches sheet sums the ones its
   *  draft keeps for "Show N serves". */
  count: number;
  /** Won from the player's seat; null where the score cannot say. */
  won: boolean | null;
  /** The score from the player's seat, or null. */
  score: string | null;
  hand: OpponentHandFilter;
  surface: SeasonSurface;
}

/** The Matches sheet's rows, computed here. The sheet counts its own menus'
 *  options in the browser, over these rows. */
export interface SeasonFilterOptions {
  /** Every analyzed match, newest first (`compareMatchDays`). */
  matches: SeasonMatchOption[];
}

/** The strip's words for "Opponent plays". */
export const OPPONENT_HAND_PHRASE: Record<OpponentHandFilter, string> = {
  // The Matches sheet's own menu words (`lightbox-matches-sheet.tsx`), so the
  // strip, the panel's Matches row and the menu name one filter one way.
  right: "Right-handed",
  left: "Left-handed",
  unknown: "Hand unknown",
};

/** The strip's words for "Result" and "Surface". */
export const SEASON_RESULT_PHRASE: Record<SeasonResultFilter, string> = {
  won: "Won",
  lost: "Lost",
};
export const SEASON_SURFACE_PHRASE: Record<SeasonSurface, string> = {
  hard: "Hard",
  clay: "Clay",
  grass: "Grass",
  unknown: "Surface unknown",
};

/** A match's opponent hand as "Opponent plays" reads it. */
export function opponentHandOf(
  m: Pick<SeasonVizMatch, "opponentHand">,
): OpponentHandFilter {
  return m.opponentHand === "right" || m.opponentHand === "left"
    ? m.opponentHand
    : "unknown";
}

/**
 * The URL's season filters narrowed to this season: a hand as asked, and the
 * ticked ids that name one of `perMatch` (a `?vm=` is untrusted — an id that
 * is not a match of this season is ignored, never an empty court).
 */
export function appliedSeasonFilters(
  perMatch: readonly Pick<SeasonVizMatch, "matchId">[],
  season: SeasonFilters | undefined,
): SeasonFilters {
  const known = new Set(perMatch.map((m) => m.matchId));
  return {
    opponentHand: season?.opponentHand ?? null,
    result: season?.result ?? null,
    surface: season?.surface ?? null,
    matches: (season?.matches ?? []).filter((id) => known.has(id)),
  };
}

/** Whether one match is drawn under `applied`: its hand (`hand: true`) and
 *  its tick (`ticks: true`), each tested only when asked. */
function seasonMatchPasses(
  m: SeasonVizMatch,
  applied: SeasonFilters,
  { hand = true, ticks = true }: { hand?: boolean; ticks?: boolean } = {},
): boolean {
  if (
    !seasonMatchKept(
      {
        won: m.won ?? null,
        hand: opponentHandOf(m),
        surface: seasonSurfaceOf(m.courtType),
      },
      { ...applied, opponentHand: hand ? applied.opponentHand : null },
    )
  )
    return false;
  if (ticks && applied.matches.length > 0)
    return applied.matches.includes(m.matchId);
  return true;
}

/**
 * A mark's metres to the millimetre for the trip to the browser. Tracked
 * positions arrive with 15–17 significant digits; the opened card ships every
 * mark of the season on every filter click, and a millimetre is far under a
 * pixel at any zoom the court allows.
 */
function toMillimetre(dot: VizDot): VizDot {
  return {
    ...dot,
    lateralM: Math.round(dot.lateralM * 1000) / 1000,
    depthM: Math.round(dot.depthM * 1000) / 1000,
  };
}

/** One mark's `SeasonDotPoint`, read off its match's own point. */
function dotPointOf(
  matchIndex: number,
  isPlayer1: boolean,
  point: MatchPoint | undefined,
): SeasonDotPoint {
  if (point === undefined) return [matchIndex, 0, 0, 0, -1];
  const server =
    typeof point.serverIsPlayer1 === "boolean"
      ? point.serverIsPlayer1 === isPlayer1
        ? 1
        : 0
      : -1;
  return [
    matchIndex,
    point.pointNumber,
    point.setNumber,
    point.gameNumber,
    server,
  ];
}

/**
 * One Statistics row's marks as positions in `dots`: every mark whose id the
 * row picks, ascending, each once. An id the row picks that is not on the
 * court (`statPickDotIds` on serve reads its own zoned court, which can hold
 * a mark the live filters leave off) has no position and is dropped — the
 * shell only ever asks the set about marks it draws, and every mark it draws
 * is one of `dots`, so the answers are the same.
 */
export function encodeStatRowDots(
  dots: readonly Pick<VizDot, "id">[],
  ids: Iterable<string>,
): number[] {
  const picked = new Set(ids);
  const indices: number[] = [];
  dots.forEach((dot, i) => {
    if (picked.has(dot.id)) indices.push(i);
  });
  return indices;
}

/** A row's positions back into the ids the shell's `statRowDots` answers
 *  with. An index outside `dots` (never written by `encodeStatRowDots`) is
 *  ignored. */
export function decodeStatRowDots(
  dots: readonly Pick<VizDot, "id">[],
  indices: readonly number[],
): Set<string> {
  const ids = new Set<string>();
  for (const i of indices) {
    const dot = dots[i];
    if (dot !== undefined) ids.add(dot.id);
  }
  return ids;
}

/**
 * The URL's viz state for the season page, read as `VizStateProvider` reads
 * it (`parseVizState`) with the season's judged rule, from a page's
 * `searchParams` record.
 */
export function parseSeasonVizState(
  searchParams: Record<string, string | string[] | undefined>,
  errorSplitJudged: boolean,
): VizState {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (value === undefined) continue;
    for (const v of Array.isArray(value) ? value : [value])
      params.append(key, v);
  }
  return parseVizState(params, { errorSplitJudged, season: true });
}

/**
 * The opened card over the season: `state` (`?cut=` and its filters) over
 * every match, merged, with the words the report's `VizLightbox` container
 * works out — the title (the card's name while the court still holds the
 * card's own filters, else the cut's), the strip's sentence (every filter
 * beyond the card's), and "Clear filter"'s target. The baseline is the saved
 * view the URL names (`?view=`, or `?vfrom=` once its filters are edited)
 * when it is one of `views` on this cut — as the report's `VizLightbox`
 * reads it — else the default card. `null` on the wall (`cut` null) and for
 * a season with nothing analyzed.
 */
export function buildSeasonLightbox(
  perMatch: readonly SeasonVizMatch[],
  state: VizState,
  bands: SeasonVizBands,
  names: SeasonVizNames,
  views: readonly SavedView[] = [],
  /**
   * The subtitle's word for each side, when it differs from `names`: the
   * player switch's own two words (`seasonPlayerChipLabels`), so the line
   * under the title says what the pressed chip says. `names` still words the
   * filter phrases, which need a name ("Maya Chen’s last shot").
   */
  subjectWords: SeasonVizNames = names,
): SeasonLightboxData | null {
  const cut = state.cut;
  if (cut === null || perMatch.length === 0) return null;
  const judged = seasonErrorSplitJudged(perMatch);
  const filters = state.filters;

  // Every match is computed (the season-only options count each one), and
  // the court folds the ones "Opponent plays" and "Matches" keep — each
  // part keeping its index into `perMatch`, which `matches` and
  // `dotPoints` name.
  const applied = appliedSeasonFilters(perMatch, state.season);
  const seasonActive =
    applied.opponentHand !== null ||
    applied.result != null ||
    applied.surface != null ||
    applied.matches.length > 0;
  const allParts = perMatch.map((m) =>
    seasonPart(m, cut, filters, state.chart, bands),
  );
  const included = perMatch.flatMap((m, i) =>
    seasonMatchPasses(m, applied) ? [i] : [],
  );
  const parts = included.map((i) => allParts[i]);
  const result = mergeVizResults(
    cut,
    parts.map((p) => p.result),
  );
  const merged = mergeVizStats(
    parts.map((p) => p.stats),
    result.dots.length,
    included.length,
  );
  const stats = merged.title
    ? merged
    : { ...merged, title: SEASON_CUT_LABEL[cut] };

  // A Statistics row's marks: the stats' own rule per match
  // (`statPickDotIds`), united. On serve the pick's group is the court
  // side, as `LightboxStats` hands it.
  const statRowDots: Record<string, number[]> = {};
  for (const group of stats.groups) {
    for (const row of group.rows) {
      const pick: StatPick = {
        group: cut === "serve" ? row.key.split("-")[0] : group.key,
        row: row.key,
        label: row.label,
      };
      const ids: string[] = [];
      for (const part of parts) {
        for (const id of statPickDotIds(
          part.points,
          cut,
          filters,
          part.subjectIsPlayer1,
          part.ctx,
          part.result.dots,
          pick,
          bands.bands,
        ))
          ids.push(id);
      }
      statRowDots[statPickKey(pick)] = encodeStatRowDots(result.dots, ids);
    }
  }

  // Each Filters-panel option's count: the court with that option over the
  // live filters, per match, summed — what the report's `countWith` runs
  // `computeViz` for in the browser.
  const optionCounts: Record<string, number> = {};
  for (const patch of filterOptionPatches(cut, judged)) {
    optionCounts[optionCountKey(patch)] = parts.reduce(
      (n, part) =>
        n +
        computeViz(
          part.points,
          cut,
          { ...filters, ...patch },
          part.subjectIsPlayer1,
          "scatter",
          part.ctx,
        ).count,
      0,
    );
  }

  // Every match's sets, so the Set row does not shift as matches are ticked.
  const sets = [
    ...new Set(allParts.flatMap((p) => p.points.map((pt) => pt.setNumber))),
  ]
    .filter((n) => n > 0)
    .sort((a, b) => a - b);

  // The court's baseline: the saved view the court is (or was edited from)
  // when it is on this cut, else the card's (`default-cuts.ts`) — its own
  // filters for the player on court. While the court still holds them the
  // view's or card's name is the title and they are not repeated in the
  // strip; loosen one and the title falls back to the cut's own name and
  // every filter is named.
  const baseViewId = state.viewId ?? state.editedFrom ?? null;
  const baseView =
    baseViewId !== null
      ? (views.find((v) => v.id === baseViewId) ?? null)
      : null;
  const defaultCut = defaultCutsFor(judged).find((c) => c.cut === cut);
  let baseline: {
    name: string;
    filters: VizFilters;
    keys: (keyof VizFilters)[];
  } | null = null;
  if (baseView !== null && baseView.cut === cut) {
    const viewFilters: VizFilters = {
      ...seasonViewFilters(baseView, judged),
      player: filters.player,
    };
    baseline = {
      name: baseView.name,
      filters: viewFilters,
      keys: (Object.keys(EMPTY_VIZ_FILTERS) as (keyof VizFilters)[]).filter(
        (key) =>
          key !== "player" &&
          !sameFilterValue(key, viewFilters, EMPTY_VIZ_FILTERS),
      ),
    };
  } else if (defaultCut !== undefined && baseView === null) {
    baseline = {
      name: defaultCut.name,
      filters: {
        ...EMPTY_VIZ_FILTERS,
        ...defaultCut.filters,
        player: filters.player,
      },
      keys: Object.keys(defaultCut.filters) as (keyof VizFilters)[],
    };
  }
  const onCard =
    baseline !== null &&
    baseline.keys.every((key) =>
      sameFilterValue(key, filters, baseline.filters),
    );
  const clearFilters: VizFilters =
    baseline !== null && onCard
      ? baseline.filters
      : { ...EMPTY_VIZ_FILTERS, player: filters.player };
  const panelActive =
    seasonActive ||
    filterKeysFor(cut).some(
      (key) => key !== "player" && !sameFilterValue(key, filters, clearFilters),
    );
  const filterPhrases = activeFilterEntries(state, names, {
    errorSplitJudged: judged,
  })
    .filter(
      (entry) =>
        entry.key !== "player" &&
        !(onCard && baseline !== null && baseline.keys.includes(entry.key)),
    )
    .map((entry) => entry.label);
  // The season's own filters close the sentence: "Won · Lefties · Clay ·
  // 2 matches".
  if (applied.result != null)
    filterPhrases.push(SEASON_RESULT_PHRASE[applied.result]);
  if (applied.opponentHand !== null)
    filterPhrases.push(OPPONENT_HAND_PHRASE[applied.opponentHand]);
  if (applied.surface != null)
    filterPhrases.push(SEASON_SURFACE_PHRASE[applied.surface]);
  if (applied.matches.length > 0)
    filterPhrases.push(
      `${applied.matches.length} ${applied.matches.length === 1 ? "match" : "matches"}`,
    );

  const matchOptions: SeasonMatchOption[] = perMatch
    .map((m, i) => ({
      id: m.matchId,
      opponentName: m.opponent ?? "Opponent",
      date: m.date ?? null,
      count: allParts[i].result.count,
      won: m.won ?? null,
      score: m.score ?? null,
      hand: opponentHandOf(m),
      surface: seasonSurfaceOf(m.courtType),
    }))
    .sort((a, b) => compareMatchDays(b.date, a.date));

  const subjectName = filters.player === "you" ? names.you : names.opponent;
  const subjectWord =
    filters.player === "you" ? subjectWords.you : subjectWords.opponent;
  const matches = included.length;

  return {
    cut,
    chart: state.chart,
    filters,
    result: { ...result, dots: result.dots.map(toMillimetre) },
    stats,
    bandZones: bandZonesFor(cut, bands.bands, bands.unit, stats),
    subjectName,
    unit: bands.unit,
    hasFilters: seasonActive || activeFilterEntries(state).length > 0,
    title: baseline !== null && onCard ? baseline.name : SEASON_CUT_LABEL[cut],
    subtitle: `${SEASON_CUT_LABEL[cut]} · ${subjectWord} · ${matches} ${matches === 1 ? "match" : "matches"} · ${lightboxCountLine(
      cut,
      result,
      stats,
      depthBandRows(bands.bands, bands.unit),
    )}`,
    filterPhrases,
    panelActive,
    clearFilters,
    sets,
    errorSplitJudged: judged,
    statRowDots,
    optionCounts,
    advancedOptions: seasonAdvancedOptions(perMatch),
    names,
    matches: perMatch.map((m) => ({
      id: m.matchId,
      date: m.date ?? null,
      opponentName: m.opponent ?? "Opponent",
      hasPlayableVideo: m.hasPlayableVideo ?? m.isDerived,
    })),
    // `mergeVizResults` concatenates the parts' marks in match order, so
    // this runs alongside `result.dots` mark for mark.
    dotPoints: included.flatMap((i) => {
      const part = allParts[i];
      const byId = new Map(part.points.map((p) => [p.id, p]));
      const isPlayer1 = perMatch[i].isPlayer1;
      return part.result.dots.map((dot) =>
        dotPointOf(
          i,
          isPlayer1,
          dot.meta?.pointId ? byId.get(dot.meta.pointId) : undefined,
        ),
      );
    }),
    season: normalizeSeasonFilters(state.season) ?? null,
    seasonOptions: { matches: matchOptions },
  };
}

const EMPTY_PARAMS = new URLSearchParams();

/** One court, as a string: the cut, chart and filters a `VizState` names,
 *  in canonical form. The store keeps a checklist in click order (ticking
 *  appends), while the server's echo comes through `parseVizState`, which
 *  dedupes and sorts every checklist into option order and collapses the
 *  Error type by the season's rule — so both sides are written to the URL
 *  and read back through that same parser, with the same rule, before they
 *  are compared. Ticking Forced before Double faults is the same court. */
export function courtSignature(
  cut: Cut,
  chart: Chart,
  filters: VizFilters,
  errorSplitJudged: boolean,
  /** The season's own filters (`VizState.season`), as asked — never the
   *  validated ones, so an id the server ignored still echoes. */
  season?: SeasonFilters | null,
): string {
  const query = vizStateQuery(EMPTY_PARAMS, {
    cut,
    chart,
    filters,
    viewId: null,
    ...(season ? { season } : {}),
  });
  const canonical = parseVizState(new URLSearchParams(query), {
    errorSplitJudged,
    season: true,
  });
  return vizStateQuery(EMPTY_PARAMS, { ...canonical, viewId: null });
}
