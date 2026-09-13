import {
  meanOfPresent,
  num,
  pct,
  presentPairs,
  statKey,
} from "@/lib/data/aggregate";
import { PLAYER_MEASURES } from "@/lib/data/player-measures";
import type { KpiFormat } from "@/lib/data/performance-server";
import type { MatchScore } from "@/lib/data/match-utils";

/**
 * The arithmetic behind a player's profile — Platform Audit `Te` / `Te2`.
 *
 * No Supabase import, on purpose: everything here is a pure function over
 * rows the loader (`player-profile-server.ts`) has already fetched, so the
 * rules that decide what a coach reads — which line a match counts for, what
 * "record in duals" means, when a trend has been earned — are testable
 * without a database and cannot drift from the page that draws them.
 *
 * ── The one rule that must not drift ────────────────────────────────────────
 * Every figure is read from THIS player's side of a match: `isPlayer1` on
 * the result decides which `match_stats` row is theirs and which name is the
 * opponent's. Nothing here ever decides who is player one — that is the
 * match row's fact (`docs/ui-revamp-guardrails.md`), and a helper that
 * flipped it would attribute a whole season to the wrong person with nothing
 * looking broken on screen.
 */

/**
 * One side of one match from `match_stats_with_percentages`, parsed.
 *
 * The ten rates are `PLAYER_MEASURES`' own columns, so a statistic the
 * customizer offers is read here exactly as the roster drawer and an
 * opponent's page read it. The raw counts beside them are what "34 of 81"
 * under Break pts won is made of.
 */
export interface ProfileStatRow {
  /** Every `PLAYER_MEASURES` rate, by its column key. Absent reads as null. */
  rates: Record<string, number | null>;
  breakPointsConverted: number | null;
  breakPointOpportunities: number | null;
  serviceGames: number | null;
  serviceGamesWon: number | null;
  returnGames: number | null;
  returnGamesWon: number | null;
  winners: number | null;
  unforcedErrors: number | null;
}

/** The columns a season strip reads from `match_stats_with_percentages`. */
export const STAT_COLUMNS = [
  "match_id",
  "is_player1",
  ...PLAYER_MEASURES.map((m) => m.key),
  "break_points_converted",
  "break_point_opportunities",
  "service_games",
  "service_games_won",
  "return_games",
  "return_games_won",
  "winners",
  "unforced_errors",
].join(", ");

/**
 * One row of that select, as PostgREST hands it over.
 *
 * The rate columns arrive as strings (`numeric` over PostgREST) and are
 * indexed rather than named for the same reason `team-roster-server`'s row
 * is: the column list IS `PLAYER_MEASURES`, and `pct()` parses each at the
 * read.
 */
export interface DbStatRow {
  match_id: string;
  is_player1: boolean;
  break_points_converted: number | null;
  break_point_opportunities: number | null;
  service_games: number | null;
  service_games_won: number | null;
  return_games: number | null;
  return_games_won: number | null;
  winners: number | null;
  unforced_errors: number | null;
  [measure: string]: unknown;
}

function toStatRow(row: DbStatRow): ProfileStatRow {
  return {
    rates: Object.fromEntries(
      PLAYER_MEASURES.map((m) => [
        m.key,
        pct(row[m.key] as string | number | null),
      ]),
    ),
    breakPointsConverted: num(row.break_points_converted),
    breakPointOpportunities: num(row.break_point_opportunities),
    serviceGames: num(row.service_games),
    serviceGamesWon: num(row.service_games_won),
    returnGames: num(row.return_games),
    returnGamesWon: num(row.return_games_won),
    winners: num(row.winners),
    unforcedErrors: num(row.unforced_errors),
  };
}

/** One match from this player's side. The loader's list is newest first. */
export interface ProfileResult {
  id: string;
  /** ISO date, or null for an undated row (sorted last by the loader). */
  date: string | null;
  isPlayer1: boolean;
  /** Null when the score cannot say — unrecorded, or level on sets. */
  won: boolean | null;
  entryId: string | null;
  opponentName: string;
  score: MatchScore | null;
  tournamentName: string | null;
  /** This player's stats row, or null when the match has none. */
  stats: ProfileStatRow | null;
}

/** The `program_event_entries` row a match was played under. */
export interface ProfileEntry {
  id: string;
  eventId: string;
  /** "S1"…"S6", "D1"…"D3"; null for a tournament draw. */
  slot: string | null;
  discipline: string | null;
  opponentSchool: string | null;
  forfeit: string | null;
}

/** The `program_events` row an entry belongs to. */
export interface ProfileEvent {
  id: string;
  kind: string;
  /** For a dual, the opponent school. */
  name: string;
  startsOn: string | null;
}

/** One line of the line-history card. */
export interface LineRow {
  slot: string;
  wins: number;
  losses: number;
  /** Rounded, or null with nothing decided. */
  winPct: number | null;
  /** The last five decided results at this line, oldest left. */
  form: ("win" | "loss")[];
}

/** One tile of the season strip — `KpiTile`'s own vocabulary. */
export interface ProfileKpi {
  key: string;
  label: string;
  value: string;
  subtext?: string;
  trend?: { change: number; changeLabel: string };
  hintText?: string;
  /** Oldest → newest, at most `KPI_SERIES_WINDOW` long. */
  sparkline?: number[];
  /** The tooltip on the label — what this statistic actually counts. */
  description?: string;
  /** Which group the picker files it under. */
  category: SeasonKpiCategory;
  /**
   * The sparkline's own points, for the hover chart — same window, same
   * order, so the two cannot disagree. Absent on a tile whose figure is not
   * a per-match rate (Record), which is why hovering that one draws nothing.
   */
  points?: SeriesPoint[];
  format?: KpiFormat;
}

export type SeasonKpiCategory = "Serve" | "Return" | "Other";

/**
 * One statistic the strip can show.
 *
 * The catalogue the picker offers, and the reason the two pages stay one
 * strip: a viewer's chosen four or five are chosen once, and both the
 * personal Home and a team player's profile read the same list. The ten
 * rates ARE `PLAYER_MEASURES` — same keys, same hints — so a statistic here
 * cannot mean something different from the same statistic on the roster
 * drawer or an opponent's page. `label` is the tile's own short spelling
 * ("1st serve won" fits a 9px tile where "First serve won" does not), the
 * precedent `ROSTER_DRAWER_MEASURES` already sets.
 */
export interface SeasonKpiSpec {
  key: string;
  label: string;
  category: SeasonKpiCategory;
}

const MEASURE_HINTS = new Map(PLAYER_MEASURES.map((m) => [m.key, m.hint]));

export const SEASON_KPI_SPECS: readonly SeasonKpiSpec[] = [
  // The default five, in strip order.
  { key: "record", label: "Record", category: "Other" },
  { key: "first_serve_pct", label: "First serve in", category: "Serve" },
  { key: "first_serve_won_pct", label: "1st serve won", category: "Serve" },
  { key: "break-points-won", label: "Break pts won", category: "Return" },
  { key: "games-won", label: "Games won", category: "Other" },
  // Everything else the picker offers.
  { key: "second_serve_won_pct", label: "2nd serve won", category: "Serve" },
  {
    key: "service_games_won_pct",
    label: "Service games held",
    category: "Serve",
  },
  {
    key: "break_points_saved_pct",
    label: "Break points saved",
    category: "Serve",
  },
  {
    key: "first_return_won_pct",
    label: "First return won",
    category: "Return",
  },
  {
    key: "second_return_won_pct",
    label: "Second return won",
    category: "Return",
  },
  {
    key: "return_games_won_pct",
    label: "Return games won",
    category: "Return",
  },
  { key: "total_points_won_pct", label: "Total points won", category: "Other" },
];

/** The catalogue by key, for the lookups the strip does per render. */
export const SEASON_KPI_BY_KEY: ReadonlyMap<string, SeasonKpiSpec> = new Map(
  SEASON_KPI_SPECS.map((spec) => [spec.key, spec]),
);

/** How many tiles the strip shows, and the floor the picker holds. */
export const SEASON_KPI_MAX = 5;
export const SEASON_KPI_MIN = 4;

/** The five a viewer who has never chosen sees — and the day-zero labels. */
export const SEASON_KPI_DEFAULT_KEYS: readonly string[] =
  SEASON_KPI_SPECS.slice(0, SEASON_KPI_MAX).map((s) => s.key);

/**
 * The default five, in strip order — what the empty strip labels itself
 * with, so day zero promises exactly the tiles that arrive with the first
 * report.
 */
export const SEASON_KPI_LABELS: readonly string[] = SEASON_KPI_SPECS.slice(
  0,
  SEASON_KPI_MAX,
).map((s) => s.label);

/** How many recent matches "lately" means — the roster and drawer's window. */
export const RECENT_WINDOW = 5;

/** How many points a sparkline — and so its hover chart — carries. */
export const KPI_SERIES_WINDOW = 8;

/** One match, as the hover chart's tooltip names it. */
export interface SeriesMeta {
  date: string;
  opponent: string;
}

export interface SeriesPoint extends SeriesMeta {
  value: number;
}

/** The line a match counts for, or null when it was not played on one. */
export function resolveLine(
  entry: ProfileEntry | null | undefined,
): string | null {
  return entry?.slot ?? null;
}

/**
 * Who the match was against, as an institution.
 *
 * The entry's own opponent school first (a tournament draw names it there);
 * then the dual's name, which IS the opponent for a dual; then the match's
 * free-text event name, the only thing an unscheduled upload carries.
 */
export function resolveSchool(
  entry: ProfileEntry | null | undefined,
  event: ProfileEvent | null | undefined,
  tournamentName: string | null,
): string | null {
  const fromEntry = entry?.opponentSchool?.trim();
  if (fromEntry) return fromEntry;
  if (event?.kind === "dual" && event.name.trim()) return event.name.trim();
  const fromMatch = tournamentName?.trim();
  return fromMatch || null;
}

/**
 * Games won as a share of games played, from the stats row's serve and
 * return halves. Null where either half is unmeasured or nothing was played:
 * a zero here would claim a player lost every game of a match that has no
 * game counts at all.
 */
export function gamesWonPct(row: ProfileStatRow | null): number | null {
  if (!row) return null;
  const { serviceGames, serviceGamesWon, returnGames, returnGamesWon } = row;
  if (
    serviceGames === null ||
    serviceGamesWon === null ||
    returnGames === null ||
    returnGamesWon === null
  ) {
    return null;
  }
  const played = serviceGames + returnGames;
  if (played <= 0) return null;
  return ((serviceGamesWon + returnGamesWon) / played) * 100;
}

/**
 * Wins and losses in dual matches only — the "8–2 in duals" under Record.
 *
 * Decided by the match's own score, never by the dual's outcome: a line can
 * be won inside a dual the team lost. Matches with no entry, or whose event
 * is not a dual, are not counted here at all.
 */
export function dualRecordFrom(
  results: readonly ProfileResult[],
  entriesById: ReadonlyMap<string, ProfileEntry>,
  eventsById: ReadonlyMap<string, ProfileEvent>,
): { wins: number; losses: number } {
  let wins = 0;
  let losses = 0;
  for (const result of results) {
    if (result.won === null || !result.entryId) continue;
    const entry = entriesById.get(result.entryId);
    const event = entry ? eventsById.get(entry.eventId) : undefined;
    if (event?.kind !== "dual") continue;
    if (result.won) wins++;
    else losses++;
  }
  return { wins, losses };
}

/** "S3" → [0, 3]; "D1" → [1, 1]; anything else sorts after both. */
function slotRank(slot: string): [number, number, string] {
  const match = /^([SD])(\d+)$/i.exec(slot.trim());
  if (!match) return [2, Number.MAX_SAFE_INTEGER, slot];
  return [match[1].toUpperCase() === "S" ? 0 : 1, Number(match[2]), slot];
}

/**
 * The player's matches grouped by the line they were played on.
 *
 * `results` newest first, as the loader hands them over, so "the last five"
 * is the first five decided rows at a line and the strip is reversed to read
 * oldest-left. A match with no entry — an unscheduled upload — belongs to no
 * line and is left out rather than filed under an invented one.
 */
export function lineHistoryFrom(
  results: readonly ProfileResult[],
  entriesById: ReadonlyMap<string, ProfileEntry>,
): LineRow[] {
  const bySlot = new Map<string, ProfileResult[]>();
  for (const result of results) {
    if (!result.entryId) continue;
    const slot = resolveLine(entriesById.get(result.entryId));
    if (!slot) continue;
    const list = bySlot.get(slot);
    if (list) list.push(result);
    else bySlot.set(slot, [result]);
  }

  const rows: LineRow[] = [];
  for (const [slot, matches] of bySlot) {
    const decided = matches.filter((m) => m.won !== null);
    const wins = decided.filter((m) => m.won).length;
    const losses = decided.length - wins;
    rows.push({
      slot,
      wins,
      losses,
      winPct:
        decided.length === 0 ? null : Math.round((wins / decided.length) * 100),
      form: decided
        .slice(0, RECENT_WINDOW)
        .reverse()
        .map((m) => (m.won ? ("win" as const) : ("loss" as const))),
    });
  }

  return rows.sort((a, b) => {
    const [ka, na, sa] = slotRank(a.slot);
    const [kb, nb, sb] = slotRank(b.slot);
    return ka - kb || na - nb || sa.localeCompare(sb);
  });
}

/** How many measured matches a trend needs: two — one to compare, one to compare against. */
export const TREND_MIN_MATCHES = 2;

/**
 * A rate's sparkline and trend, from its per-match values newest first.
 *
 * The sparkline is the last `window` measured values, oldest → newest. The
 * trend is the recent half against the earlier half — the newest match
 * against the one before it on day two, the last five against the rest once
 * the season is long enough — and null with fewer than two measured matches,
 * because a trend is a comparison and one number compares with nothing. The
 * recent half is capped at `RECENT_WINDOW` so a long season still reads
 * "lately versus before" rather than "first half versus second half". One
 * decimal, which is what `KpiTile` prints.
 */
export function kpiSeries(
  valuesNewestFirst: readonly (number | null)[],
  /**
   * The match each value came from, index for index, so the chart's tooltip
   * cannot land on the wrong one. Omitted where there is no chart to draw.
   */
  metaNewestFirst: readonly SeriesMeta[] = [],
  window = KPI_SERIES_WINDOW,
): {
  sparkline: number[];
  /** The sparkline's own points, enlarged — same window, same order. */
  points: SeriesPoint[];
  trend: { change: number; changeLabel: string } | null;
} {
  // Paired before filtering: dropping the unmeasured values alone would shift
  // every remaining tooltip onto its neighbour's match.
  const pairs = presentPairs([...valuesNewestFirst], [...metaNewestFirst]);
  const present = pairs.map((p) => p.value);

  // ONE window for both. The hover chart is the sparkline enlarged, so a
  // sparkline over the last eight matches beside a chart over the whole
  // season would draw two different lines for one statistic and invite the
  // reader to trust whichever they saw last.
  const slice = pairs.slice(0, window).reverse();
  const sparkline = slice.map((p) => p.value);
  // No meta, no chart. Emitting points with blank dates and a generic
  // "Opponent" would hand the tile a hover chart whose every tooltip names
  // nobody — worse than the tile having no chart at all, and silent.
  const points =
    metaNewestFirst.length === 0
      ? []
      : slice.map((p) => ({
          value: p.value,
          date: p.meta?.date ?? "",
          opponent: p.meta?.opponent ?? "Opponent",
        }));

  if (present.length < TREND_MIN_MATCHES)
    return { sparkline, points, trend: null };

  const recentSize = Math.min(RECENT_WINDOW, Math.floor(present.length / 2));
  const recent = meanOfPresent(present.slice(0, recentSize), 1);
  const earlier = meanOfPresent(present.slice(recentSize), 1);
  const trend =
    recent === null || earlier === null
      ? null
      : {
          change: Math.round((recent - earlier) * 10) / 10,
          changeLabel: "vs earlier",
        };

  return { sparkline, points, trend };
}

/**
 * The season as a running W−L, oldest → newest — the shape under Record.
 *
 * A record has no rate to draw, but it does have a direction, and a line
 * climbing or falling across the season says more than "12–4" alone. Only
 * decided matches move it.
 */
export function runningDifferential(
  results: readonly ProfileResult[],
): number[] {
  const out: number[] = [];
  let running = 0;
  for (let i = results.length - 1; i >= 0; i--) {
    const won = results[i].won;
    if (won === null) continue;
    running += won ? 1 : -1;
    out.push(running);
  }
  return out;
}

/** `${wins}–${losses}` with an en dash — the roster's spelling. */
export function recordLabel(wins: number, losses: number): string {
  return `${wins}–${losses}`;
}

function percent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value)}%`;
}

/** What the trend row says while a trend is still being earned. */
function trendHint(measured: number): string | undefined {
  if (measured === 0) return "After the first report";
  const needed = TREND_MIN_MATCHES - measured;
  return needed > 0
    ? `${needed} more ${needed === 1 ? "match" : "matches"} for a trend`
    : undefined;
}

/**
 * A paragraph cut to fit its slot, on a word, with an ellipsis.
 *
 * The engine's summary is written for the report page and can run long; the
 * card gives it a line and a half, and the "Why this" link beside it is the
 * way to the rest. Cutting on a word rather than a character keeps the last
 * thing on screen a word.
 */
export function clipText(text: string, max: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  const head = trimmed.slice(0, max - 1);
  const cut = head.lastIndexOf(" ");
  return `${(cut > max / 2 ? head.slice(0, cut) : head).replace(/[\s,;:—-]+$/, "")}…`;
}

/**
 * The stats rows of a read, keyed the way a `ProfileResult` looks them up.
 *
 * Every caller of `seasonKpis` builds this same map before it can build its
 * results, and each was writing the same three lines. `statKey` is the one
 * spelling of "this match, this side" the aggregate layer already owns.
 */
export function statRowsByKey(
  rows: readonly DbStatRow[],
): Map<string, ProfileStatRow> {
  const byKey = new Map<string, ProfileStatRow>();
  for (const row of rows) {
    byKey.set(statKey(row.match_id, row.is_player1), toStatRow(row));
  }
  return byKey;
}

/** What a season strip needs to render, off the results behind it. */
export interface SeasonStrip {
  kpis: ProfileKpi[];
  /** How many matches the strip read. */
  matchesPlayed: number;
  /**
   * Whether any RATE tile holds a figure — what turns the empty strip real.
   *
   * Not "a stats row exists": a row whose measured columns are all null is a
   * real state (a score-only import, a half-written report), and gating on
   * its existence draws a strip of dashes under a title row claiming N
   * matches analyzed. Record is excluded because it always has a value, so
   * counting it would make this always true.
   */
  hasStats: boolean;
  wins: number;
  losses: number;
}

/**
 * The strip, from a season already attributed to one side.
 *
 *
 * Three loaders reach `seasonKpis` — the personal Home, a team player's
 * profile and Team Home's squad — and what genuinely differs between them is
 * which matches are theirs and what to call the other side. Everything after
 * that was written out three times: tally the decided results, ask whether
 * anything measured, count what was read. A change to any of those rules
 * (what a retirement counts as, say) had to be found in three files.
 */
export function seasonStrip(
  results: readonly ProfileResult[],
  duals: { wins: number; losses: number } = { wins: 0, losses: 0 },
  /**
   * What the Record tile should read, where the results are not the record.
   *
   * Team Home is that case: its results are the analyzed dual matches the
   * strip averages, so tallying them would headline "3–1" for a squad that
   * is 6–2 in duals — the denominator being "matches we filmed" with nothing
   * on the tile saying so. It passes the program's dual record instead.
   */
  record?: { wins: number; losses: number },
): SeasonStrip {
  let wins = 0;
  let losses = 0;
  for (const result of results) {
    if (result.won === true) wins++;
    else if (result.won === false) losses++;
  }
  const kpis = seasonKpis(results, {
    wins: record?.wins ?? wins,
    losses: record?.losses ?? losses,
    duals,
  });
  return {
    kpis,
    matchesPlayed: results.length,
    hasStats: kpis.some((kpi) => kpi.key !== "record" && kpi.value !== "—"),
    wins,
    losses,
  };
}

/**
 * Every tile the strip can show, in catalogue order.
 *
 * One strip, two homes: the personal Home and a team player's profile draw
 * from exactly this list, so a player who moves between workspaces meets one
 * vocabulary and one saved pick. Every figure is the player's own — no team
 * average rides along, because a personal workspace has no team and a team
 * page should not read differently from the same player's own.
 *
 * The rates are means of per-match rates — the same arithmetic as
 * `PLAYER_MEASURES`, so this strip and the roster drawer cannot disagree
 * about a first-serve percentage. Break points won is a SUM (converted over
 * opportunities) so the number agrees with the "34 of 81" printed under it;
 * a mean of per-match rates would not. Games won is the one figure with no
 * column of its own — service and return games, added.
 *
 * The picker renders the whole list and the strip shows the chosen four or
 * five, so every tile is built whether or not it is on screen. That is a
 * few dozen arithmetic operations over a season already in memory, and it
 * is what lets the choice be made client-side without a round trip.
 */
export function seasonKpis(
  results: readonly ProfileResult[],
  input: {
    wins: number;
    losses: number;
    /** Zero and zero where there are no duals — the personal workspace. */
    duals: { wins: number; losses: number };
  },
): ProfileKpi[] {
  const rows = results.map((r) => r.stats);
  const measured = rows.filter((r) => r !== null).length;

  // The match each per-match value came from, for the hover chart's tooltip.
  const meta = results.map((r) => ({
    date: r.date ?? "",
    opponent: r.opponentName || "Unknown",
  }));

  /**
   * A rate tile, from the per-match values it is the mean of.
   *
   * `withTrend` is off for a tile whose headline figure is not that mean —
   * break points, which is a season sum — so the trend row is never computed
   * and then thrown away.
   */
  const rateTile = (
    spec: SeasonKpiSpec,
    values: (number | null)[],
    withTrend = true,
  ): ProfileKpi => {
    const series = kpiSeries(values, meta);
    const mean = meanOfPresent([...values], 1);
    const tile: ProfileKpi = {
      key: spec.key,
      label: spec.label,
      category: spec.category,
      value: percent(mean),
      sparkline: series.sparkline,
      description: MEASURE_HINTS.get(spec.key),
      format: "percent",
      points: series.points,
    };
    if (!withTrend) return tile;
    if (series.trend) tile.trend = series.trend;
    else {
      const hint = trendHint(values.filter((v) => v !== null).length);
      if (hint) tile.hintText = hint;
    }
    return tile;
  };

  const tiles: ProfileKpi[] = [];

  for (const spec of SEASON_KPI_SPECS) {
    if (spec.key === "record") {
      const record: ProfileKpi = {
        key: spec.key,
        label: spec.label,
        category: spec.category,
        value: recordLabel(input.wins, input.losses),
        // No `points`: a record is not a per-match rate, so there is no
        // chart to open under it — the line is the season's shape, and the
        // hover would have nothing truthful to plot.
        sparkline: runningDifferential(results).slice(-KPI_SERIES_WINDOW),
        description: "Matches won and lost this season",
      };
      if (input.duals.wins + input.duals.losses > 0) {
        record.subtext = `${recordLabel(input.duals.wins, input.duals.losses)} in duals`;
      }
      tiles.push(record);
      continue;
    }

    if (spec.key === "break-points-won") {
      // Chances taken over chances faced, across the season. A player who
      // faced none has no percentage — not a zero, which would read as
      // "converted nothing" rather than "was never at break point".
      let converted = 0;
      let opportunities = 0;
      for (const row of rows) {
        if (
          !row ||
          row.breakPointsConverted === null ||
          row.breakPointOpportunities === null
        ) {
          continue;
        }
        converted += row.breakPointsConverted;
        opportunities += row.breakPointOpportunities;
      }
      const values = rows.map((r) =>
        r &&
        r.breakPointsConverted !== null &&
        r.breakPointOpportunities !== null
          ? r.breakPointOpportunities === 0
            ? null
            : (r.breakPointsConverted / r.breakPointOpportunities) * 100
          : null,
      );
      const tile = rateTile(spec, values, false);
      // The season figure is the sum, not the mean of the per-match rates —
      // only the sparkline and the hover chart are per-match.
      tile.value = percent(
        opportunities > 0 ? (converted / opportunities) * 100 : null,
      );
      tile.description = MEASURE_HINTS.get("break_points_converted_pct");
      if (opportunities > 0) tile.subtext = `${converted} of ${opportunities}`;
      else {
        const hint = trendHint(measured);
        if (hint) tile.hintText = hint;
      }
      tiles.push(tile);
      continue;
    }

    if (spec.key === "games-won") {
      const tile = rateTile(
        spec,
        rows.map((r) => gamesWonPct(r)),
      );
      tile.description = "Share of all games won, serving and returning";
      tiles.push(tile);
      continue;
    }

    tiles.push(
      rateTile(
        spec,
        rows.map((r) => r?.rates[spec.key] ?? null),
      ),
    );
  }

  // In catalogue order by construction — the picker looks tiles up by key and
  // renders them in its own order, so this is the order the strip reads in.
  return tiles;
}
