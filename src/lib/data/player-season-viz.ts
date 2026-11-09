import type { MatchPoint } from "@/lib/data/match-points-server";
import { seasonErrorSplitJudged } from "@/lib/data/player-season";
import { ZONES, type ZoneKey, type ZoneStats } from "@/lib/data/serve-zones";
import { depthBandRows, type BandSettings } from "@/lib/data/viz-bands";
import type { DistanceUnit } from "@/lib/format/distance";
import type { MatchFilterContext } from "@/components/dashboard/matches/match-detail/match-filters/model";
import { defaultCutsFor } from "@/components/dashboard/matches/match-detail/shots/default-cuts";
import {
  statPickDotIds,
  type StatPick,
} from "@/components/dashboard/matches/match-detail/shots/stat-cut";
import {
  EMPTY_VIZ_FILTERS,
  bandZonesFor,
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
  parseVizState,
  sameFilterValue,
  vizStateQuery,
  type VizState,
} from "@/components/dashboard/matches/match-detail/shots/viz-url";
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

function seasonPart(
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

/** One of the wall's four cards for one subject, over the season. */
export interface SeasonCard {
  /** Stable key: `"you:serve"`, `"opponent:errors"`. */
  key: string;
  cut: Cut;
  chart: Chart;
  /** The card's title — the default cut's (`default-cuts.ts`). */
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
  return { id, outcome, shape, lateralM, depthM, atNet };
}

/**
 * The wall's four cards for `side` over `perMatch` — the redesign's default
 * cuts (`defaultCutsFor` by the season's judged rule), each match computed
 * with its own seat and context, then merged. In wall order.
 */
export function buildSeasonCards(
  perMatch: readonly SeasonVizMatch[],
  side: PlayerFilter,
  bands: SeasonVizBands,
): SeasonCard[] {
  const judged = seasonErrorSplitJudged(perMatch);
  const depthRows = depthBandRows(bands.bands, bands.unit);
  return defaultCutsFor(judged).map((cut) => {
    const filters: VizFilters = {
      ...EMPTY_VIZ_FILTERS,
      ...cut.filters,
      player: side,
    };
    const parts = perMatch.map((m) =>
      seasonPart(m, cut.cut, filters, cut.chart, bands),
    );
    const result = mergeVizResults(
      cut.cut,
      parts.map((p) => p.result),
    );
    const stats = mergeVizStats(
      parts.map((p) => p.stats),
      result.dots.length,
      perMatch.length,
    );
    return {
      key: `${side}:${cut.cut}`,
      cut: cut.cut,
      chart: cut.chart,
      name: cut.name,
      subject: side,
      dots: result.dots.map(wallDot),
      summary: wallSummaryFor(cut.cut, result, stats, depthRows),
      state: { cut: cut.cut, chart: cut.chart, filters, viewId: null },
      total: result.total,
    };
  });
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
  return parseVizState(params, { errorSplitJudged });
}

/**
 * The opened card over the season: `state` (`?cut=` and its filters) over
 * every match, merged, with the words the report's `VizLightbox` container
 * works out — the title (the card's name while the court still holds the
 * card's own filters, else the cut's), the strip's sentence (every filter
 * beyond the card's), and "Clear filter"'s target. No saved views here, so
 * the card is the only baseline. `null` on the wall (`cut` null) and for a
 * season with nothing analyzed.
 */
export function buildSeasonLightbox(
  perMatch: readonly SeasonVizMatch[],
  state: VizState,
  bands: SeasonVizBands,
  names: SeasonVizNames,
): SeasonLightboxData | null {
  const cut = state.cut;
  if (cut === null || perMatch.length === 0) return null;
  const judged = seasonErrorSplitJudged(perMatch);
  const filters = state.filters;

  const parts = perMatch.map((m) =>
    seasonPart(m, cut, filters, state.chart, bands),
  );
  const result = mergeVizResults(
    cut,
    parts.map((p) => p.result),
  );
  const stats = mergeVizStats(
    parts.map((p) => p.stats),
    result.dots.length,
    perMatch.length,
  );

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
      const ids = new Set<string>();
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
          ids.add(id);
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

  const sets = [
    ...new Set(parts.flatMap((p) => p.points.map((pt) => pt.setNumber))),
  ]
    .filter((n) => n > 0)
    .sort((a, b) => a - b);

  // The card's baseline (`default-cuts.ts`): its own filters for the player
  // on court. While the court still holds them the card's name is the title
  // and they are not repeated in the strip; loosen one and the title falls
  // back to the cut's own name and every filter is named.
  const defaultCut = defaultCutsFor(judged).find((c) => c.cut === cut);
  const baseline =
    defaultCut !== undefined
      ? {
          name: defaultCut.name,
          filters: {
            ...EMPTY_VIZ_FILTERS,
            ...defaultCut.filters,
            player: filters.player,
          } as VizFilters,
          keys: Object.keys(defaultCut.filters) as (keyof VizFilters)[],
        }
      : null;
  const onCard =
    baseline !== null &&
    baseline.keys.every((key) =>
      sameFilterValue(key, filters, baseline.filters),
    );
  const clearFilters: VizFilters =
    baseline !== null && onCard
      ? baseline.filters
      : { ...EMPTY_VIZ_FILTERS, player: filters.player };
  const panelActive = filterKeysFor(cut).some(
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

  const subjectName = filters.player === "you" ? names.you : names.opponent;
  const matches = perMatch.length;

  return {
    cut,
    chart: state.chart,
    filters,
    result,
    stats,
    bandZones: bandZonesFor(cut, bands.bands, bands.unit, stats),
    subjectName,
    unit: bands.unit,
    hasFilters: activeFilterEntries(state).length > 0,
    title: baseline !== null && onCard ? baseline.name : SEASON_CUT_LABEL[cut],
    subtitle: `${SEASON_CUT_LABEL[cut]} · ${subjectName} · ${matches} ${matches === 1 ? "match" : "matches"} · ${lightboxCountLine(
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
): string {
  const query = vizStateQuery(EMPTY_PARAMS, {
    cut,
    chart,
    filters,
    viewId: null,
  });
  const canonical = parseVizState(new URLSearchParams(query), {
    errorSplitJudged,
  });
  return vizStateQuery(EMPTY_PARAMS, { ...canonical, viewId: null });
}
