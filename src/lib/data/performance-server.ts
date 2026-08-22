import { meanOfPresent, num, pct, presentPairs } from "./aggregate";
import { createClient } from "@/lib/supabase/server";
import { getMyPlayerIds } from "@/lib/data/player-identity-server";

interface WinLossView {
  wins: number;
  losses: number;
  label: string;
}

interface PerformanceRating {
  label: string;
  value: number;
  barColor: string;
}

interface RecentPerformanceStat {
  label: string;
  value: number;
  change: number;
}

export type KpiCategory = "Serve" | "Return" | "Other";

export interface KpiCardData {
  key: string;
  label: string;
  value: string;
  change: number;
  changeLabel: string;
  sparkline: number[];
  /** Per-point metadata aligned index-for-index with `sparkline` (oldest → newest). */
  points?: { value: number; date: string; opponent: string }[];
  /** Value formatting hint for charts/tooltips. */
  format?: KpiFormat;
  description?: string;
  category: KpiCategory;
  lowerIsBetter?: boolean;
}

export interface PerformanceProfileDimension {
  label: string;
  current: number;
  previous: number;
}

/**
 * Top KPI movers: the stats with the largest absolute non-zero change vs the prior
 * period. Shared by the home-insight prompt builder (which narrates these) and the
 * home AI-insight card (which renders them as deterministic evidence chips), so the
 * prose and the chips always reflect the same underlying stats.
 */
export function getTopKpiMovers(
  kpiCards: KpiCardData[],
  n: number,
): KpiCardData[] {
  return kpiCards
    .filter((k) => k.change !== 0 && k.value !== "—")
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
    .slice(0, n);
}

export interface HeatmapMatchSummary {
  id: string;
  opponent: string;
  won: boolean;
  score: string;
}

export interface HeatmapDay {
  date: string;
  count: number;
  matchIds: string[];
  matches: HeatmapMatchSummary[];
}

export interface OverallPerformanceData {
  views: WinLossView[];
  performanceRatings: PerformanceRating[];
  recentPerformance: RecentPerformanceStat[];
  kpiCards: KpiCardData[];
  winRate: { value: number; change: number; sparkline: number[] };
  form: ("W" | "L")[];
  matchCount: number;
  heatmap: HeatmapDay[];
  performanceProfile: PerformanceProfileDimension[];
}

interface DbMatch {
  id: string;
  date: string;
  player1_id: string | null;
  /** Needed to tell "I was player two" from "not my match at all". */
  player2_id: string | null;
  player1_name: string | null;
  player2_name: string | null;
  score: {
    player1: number[];
    player2: number[];
  } | null;
}

interface DbMatchStats {
  match_id: string;
  is_player1: boolean;
  first_serve_pct: string | null;
  first_serve_won_pct: string | null;
  second_serve_won_pct: string | null;
  serve_rating: string | null;
  first_return_won_pct: string | null;
  second_return_won_pct: string | null;
  break_points_saved_pct: string | null;
  break_points_converted_pct: string | null;
  service_games_won_pct: string | null;
  return_games_won_pct: string | null;
  total_points_won_pct: string | null;
  aces: number | null;
  double_faults: number | null;
  winners: number | null;
  unforced_errors: number | null;
  avg_rally_length: number | null;
}

const DEFAULT_PERFORMANCE: OverallPerformanceData = {
  views: [
    { wins: 0, losses: 0, label: "Overall Record" },
    { wins: 0, losses: 0, label: "Last 30 Days" },
    { wins: 0, losses: 0, label: "Last 7 Days" },
  ],
  performanceRatings: [
    { label: "Serve Rating", value: 0, barColor: "#666666" },
    { label: "Return Rating", value: 0, barColor: "#4A90E2" },
    { label: "Under Pressure Rating", value: 0, barColor: "#666666" },
  ],
  recentPerformance: [
    { label: "First Serve In Percentage", value: 0, change: 0 },
    { label: "First Serve Won Percentage", value: 0, change: 0 },
    { label: "Second Serve Won Percentage", value: 0, change: 0 },
  ],
  kpiCards: [],
  winRate: { value: 0, change: 0, sparkline: [] },
  form: [],
  matchCount: 0,
  heatmap: [],
  performanceProfile: [
    { label: "SERVE", current: 0, previous: 0 },
    { label: "RETURN", current: 0, previous: 0 },
    { label: "FOREHAND", current: 0, previous: 0 },
    { label: "BACKHAND", current: 0, previous: 0 },
    { label: "NET", current: 0, previous: 0 },
    { label: "DEPTH", current: 0, previous: 0 },
    { label: "CLUTCH", current: 0, previous: 0 },
    { label: "FITNESS", current: 0, previous: 0 },
  ],
};

/**
 * Which side of a match the viewer played, or null when it is not theirs.
 *
 * `player1_id` used to be compared to a single user id, and everything else
 * inferred: `isUserPlayer1 ? player1Won : !player1Won`. That treats an UNKNOWN
 * player one as proof the viewer was player two, so a row with a null or
 * foreign `player1_id` inverted — a match our side won counted as a loss. It is
 * the bug `statistics-server.ts` fixed for Statistics and this file inherited.
 *
 * It matters more now. A coach uploading for a roster athlete writes that
 * athlete's PROFILE id here, so these rows are reliably somebody else's — this
 * page is the personal workspace and they do not belong in it at all. Returning
 * null lets the callers skip them instead of counting them upside down.
 *
 * The last clause covers legacy personal matches, uploaded before player ids
 * were populated: the uploader is the only evidence of whose match it is. It is
 * deliberately last, so an id always wins when there is one.
 */
function viewerSide(
  match: { player1_id: string | null; player2_id?: string | null },
  playerIds: readonly string[],
  viewerId: string,
  createdBy?: string | null
): "player1" | "player2" | null {
  if (match.player1_id && playerIds.includes(match.player1_id)) return "player1";
  if (match.player2_id && playerIds.includes(match.player2_id)) return "player2";
  if (!match.player1_id && !match.player2_id && (createdBy ?? viewerId) === viewerId) {
    return "player1";
  }
  return null;
}

function calculateWinLoss(
  matches: DbMatch[],
  playerIds: readonly string[],
  viewerId: string,
  daysAgo?: number
): { wins: number; losses: number } {
  const cutoffDate = daysAgo
    ? new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000)
    : null;

  let wins = 0;
  let losses = 0;

  for (const match of matches) {
    if (cutoffDate && new Date(match.date) < cutoffDate) continue;
    if (!match.score?.player1 || !match.score?.player2) continue;

    const p1Sets = match.score.player1.filter(
      (s, i) => s > (match.score?.player2[i] ?? 0)
    ).length;
    const p2Sets = match.score.player2.filter(
      (s, i) => s > (match.score?.player1[i] ?? 0)
    ).length;

    const side = viewerSide(match, playerIds, viewerId);
    if (side === null) continue;

    const player1Won = p1Sets > p2Sets;
    const userWon = side === "player1" ? player1Won : !player1Won;

    if (userWon) wins++;
    else losses++;
  }

  return { wins, losses };
}

function calculateAverageRating(
  stats: DbMatchStats[],
  userId: string,
  matchPlayerMap: Map<string, boolean>
): { serve: number; return_: number; pressure: number } {
  if (stats.length === 0) return { serve: 0, return_: 0, pressure: 0 };

  // THREE measures, THREE divisors. One shared `count` meant a match that
  // measured serve but not returns still incremented the divisor for returns,
  // after adding a hard zero to their sum — so a video-derived match (whose
  // `serve_rating` is null because its formula needs the ace count) dragged
  // down averages it had contributed nothing to.
  //
  // The `?? 0` this replaces was worse than the divisor: `(firstRet ?? 0 +
  // secondRet ?? 0) / 2` HALVES a present value whose partner is absent.
  // `break_points_saved_pct` is null whenever the player faced no break
  // points, which is an ordinary thing to do, so a real converted-percentage
  // was reported at half its value. `meanOfPresent` — already imported, and
  // already used by `calculatePerformanceProfile` further down — is the rule
  // this file states everywhere else: absent is not zero.
  let serveSum = 0;
  let serveCount = 0;
  let returnSum = 0;
  let returnCount = 0;
  let pressureSum = 0;
  let pressureCount = 0;

  for (const stat of stats) {
    const isUserPlayer1 = matchPlayerMap.get(stat.match_id);
    if (isUserPlayer1 === undefined) continue;
    if (stat.is_player1 !== isUserPlayer1) continue;

    const serveRating = pct(stat.serve_rating);
    const returnWonPct = meanOfPresent([
      pct(stat.first_return_won_pct),
      pct(stat.second_return_won_pct),
    ]);
    const pressurePct = meanOfPresent([
      pct(stat.break_points_saved_pct),
      pct(stat.break_points_converted_pct),
    ]);

    // No all-null guard needed any more: a match that measured nothing now
    // increments no divisor, which is what that guard was standing in for.
    if (serveRating !== null) {
      serveSum += serveRating;
      serveCount++;
    }
    if (returnWonPct !== null) {
      returnSum += returnWonPct * 3; // Scale to ~150-200 range
      returnCount++;
    }
    if (pressurePct !== null) {
      pressureSum += pressurePct * 3;
      pressureCount++;
    }
  }

  return {
    serve: serveCount === 0 ? 0 : Math.round(serveSum / serveCount),
    return_: returnCount === 0 ? 0 : Math.round(returnSum / returnCount),
    pressure: pressureCount === 0 ? 0 : Math.round(pressureSum / pressureCount),
  };
}

function calculateRecentPerformance(
  stats: DbMatchStats[],
  matchPlayerMap: Map<string, boolean>,
  orderedMatchIds: string[]
): RecentPerformanceStat[] {
  if (stats.length === 0) {
    return DEFAULT_PERFORMANCE.recentPerformance;
  }

  // Build a map of matchId → user's stats
  // `number | null` per field: a match can measure the first serve and not the
  // second, and flattening that null to 0 is the difference between "we did
  // not measure it" and "you won none of them".
  const matchStatsMap = new Map<
    string,
    {
      firstServeIn: number | null;
      firstServeWon: number | null;
      secondServeWon: number | null;
    }
  >();
  for (const stat of stats) {
    const isUserPlayer1 = matchPlayerMap.get(stat.match_id);
    if (isUserPlayer1 === undefined) continue;
    if (stat.is_player1 !== isUserPlayer1) continue;

    // A match that measured none of these is not a match with three zeroes —
    // it is a match with no serve data, and the loop below looks for "the two
    // most recent matches that have stats". Recording it would make an
    // unmeasured match satisfy that search and compare against nothing.
    const firstServeIn = pct(stat.first_serve_pct);
    const firstServeWon = pct(stat.first_serve_won_pct);
    const secondServeWon = pct(stat.second_serve_won_pct);
    if (firstServeIn === null && firstServeWon === null && secondServeWon === null) {
      continue;
    }

    // Nulls are CARRIED, not flattened to 0. The guard above only skips a
    // match that measured none of the three, so `?? 0` here published a hard
    // zero for whichever one was individually missing — and that combination
    // is real, not hypothetical: `suppress_derived_match_stats` nulls
    // `second_serves_in` for every derived match while leaving
    // `first_serve_pct` populated. The only consumer is the home-insight
    // prompt, so it surfaced as the model writing prose about a 0% second
    // serve and a 55-point collapse that never happened.
    matchStatsMap.set(stat.match_id, {
      firstServeIn,
      firstServeWon,
      secondServeWon,
    });
  }

  // Find the two most recent matches that have stats
  let latestStats: (typeof matchStatsMap extends Map<string, infer V> ? V : never) | undefined;
  let previousStats: (typeof matchStatsMap extends Map<string, infer V> ? V : never) | undefined;
  for (const matchId of orderedMatchIds) {
    const s = matchStatsMap.get(matchId);
    if (!s) continue;
    if (!latestStats) {
      latestStats = s;
    } else {
      previousStats = s;
      break;
    }
  }

  if (!latestStats) return DEFAULT_PERFORMANCE.recentPerformance;

  // Per field, not per match. A measure the latest match did not record is
  // omitted; a change is reported only when BOTH matches recorded it, because
  // subtracting from an absent baseline invents a swing.
  const measures = [
    { label: "First Serve In Percentage", key: "firstServeIn" },
    { label: "First Serve Won Percentage", key: "firstServeWon" },
    { label: "Second Serve Won Percentage", key: "secondServeWon" },
  ] as const;

  const out: RecentPerformanceStat[] = [];
  for (const { label, key } of measures) {
    const latest = latestStats[key];
    if (latest === null) continue;
    const previous = previousStats?.[key] ?? null;
    out.push({
      label,
      value: Math.round(latest),
      change: previous === null ? 0 : Math.round((latest - previous) * 10) / 10,
    });
  }

  return out;
}

function calculateForm(
  matches: DbMatch[],
  playerIds: readonly string[],
  viewerId: string,
  count: number
): ("W" | "L")[] {
  const form: ("W" | "L")[] = [];
  for (const match of matches) {
    if (form.length >= count) break;
    if (!match.score?.player1 || !match.score?.player2) continue;

    const p1Sets = match.score.player1.filter(
      (s, i) => s > (match.score?.player2[i] ?? 0)
    ).length;
    const p2Sets = match.score.player2.filter(
      (s, i) => s > (match.score?.player1[i] ?? 0)
    ).length;

    const side = viewerSide(match, playerIds, viewerId);
    if (side === null) continue;

    const player1Won = p1Sets > p2Sets;
    form.push((side === "player1" ? player1Won : !player1Won) ? "W" : "L");
  }
  // Reverse so oldest is first (left) and newest is last (right)
  return form.reverse();
}

function calculateHeatmap(
  matches: DbMatch[],
  playerIds: readonly string[],
  viewerId: string
): HeatmapDay[] {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthPrefix = `${year}-${String(month + 1).padStart(2, "0")}`; // "YYYY-MM"

  // Bucket by the stored calendar-date string (YYYY-MM-DD), NOT new Date(match.date):
  // re-parsing the timestamptz applies the server timezone and can disagree with the
  // day key below, landing the square on the wrong day. The leading date is the day
  // the user picked at upload, so string bucketing is timezone-independent.
  const dayMap = new Map<string, DbMatch[]>();
  for (const match of matches) {
    const key = match.date.slice(0, 10);
    if (key.startsWith(monthPrefix)) {
      const list = dayMap.get(key) ?? [];
      list.push(match);
      dayMap.set(key, list);
    }
  }

  const result: HeatmapDay[] = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const dayMatches = dayMap.get(dateStr) ?? [];
    const summaries: HeatmapMatchSummary[] = dayMatches.map((m) => {
      const isP1 = viewerSide(m, playerIds, viewerId) !== "player2";
      const opponent = isP1 ? (m.player2_name ?? "Opponent") : (m.player1_name ?? "Opponent");
      const p1Sets = m.score?.player1 ?? [];
      const p2Sets = m.score?.player2 ?? [];
      const p1Won = p1Sets.filter((s, i) => s > (p2Sets[i] ?? 0)).length;
      const p2Won = p2Sets.filter((s, i) => s > (p1Sets[i] ?? 0)).length;
      const won = isP1 ? p1Won > p2Won : p2Won > p1Won;
      const scoreStr = p1Sets.map((s, i) => `${s}-${p2Sets[i] ?? 0}`).join(", ");
      return { id: m.id, opponent, won, score: scoreStr || "–" };
    });
    result.push({
      date: dateStr,
      count: dayMatches.length,
      matchIds: dayMatches.map((m) => m.id),
      matches: summaries,
    });
  }
  return result;
}

export type KpiFormat = "percent" | "count" | "decimal";

interface KpiSpec {
  key: string;
  label: string;
  category: KpiCategory;
  format: KpiFormat;
  description: string;
  /**
   * Null when the statistic was not measured for that match. NOT zero — a
   * withheld ace count is not a match in which the player hit no aces, and
   * averaging it as zero corrupts the headline, the sparkline and the delta.
   */
  pick: (s: DbMatchStats) => number | null;
  lowerIsBetter?: boolean;
}

const KPI_SPECS: KpiSpec[] = [
  // Serve
  {
    key: "first-serve-pct",
    label: "1ST SERVE PERCENTAGE",
    category: "Serve",
    format: "percent",
    description: "Percentage of first serves that landed in the service box",
    pick: (s) => pct(s.first_serve_pct),
  },
  {
    key: "first-serve-won",
    label: "1ST SERVE WON",
    category: "Serve",
    format: "percent",
    description: "Percentage of points won on your first serve",
    pick: (s) => pct(s.first_serve_won_pct),
  },
  {
    key: "second-serve-won",
    label: "2ND SERVE WON",
    category: "Serve",
    format: "percent",
    description: "Percentage of points won on your second serve",
    pick: (s) => pct(s.second_serve_won_pct),
  },
  {
    key: "service-games-won",
    label: "SERVICE GAMES WON",
    category: "Serve",
    format: "percent",
    description: "Percentage of service games held",
    pick: (s) => pct(s.service_games_won_pct) ?? pct(s.serve_rating),
  },
  {
    key: "breakpoints-saved",
    label: "BREAKPOINTS SAVED",
    category: "Serve",
    format: "percent",
    description: "Percentage of break points defended on serve",
    pick: (s) => pct(s.break_points_saved_pct),
  },
  {
    key: "aces",
    label: "ACES",
    category: "Serve",
    format: "count",
    description: "Serves the returner doesn't touch",
    pick: (s) => num(s.aces),
  },
  {
    key: "double-faults",
    label: "DOUBLE FAULTS",
    category: "Serve",
    format: "count",
    description: "Missed second serves; point lost",
    pick: (s) => num(s.double_faults),
    lowerIsBetter: true,
  },
  // Return
  {
    key: "first-return-won",
    label: "1ST RETURN WON",
    category: "Return",
    format: "percent",
    description: "Percentage of points won returning first serves",
    pick: (s) => pct(s.first_return_won_pct),
  },
  {
    key: "second-return-won",
    label: "2ND RETURN WON",
    category: "Return",
    format: "percent",
    description: "Percentage of points won returning second serves",
    pick: (s) => pct(s.second_return_won_pct),
  },
  {
    key: "return-games-won",
    label: "RETURN GAMES WON",
    category: "Return",
    format: "percent",
    description: "Percentage of opponent service games broken",
    pick: (s) => pct(s.return_games_won_pct),
  },
  {
    key: "breakpoints-converted",
    label: "BREAKPOINTS CONVERTED",
    category: "Return",
    format: "percent",
    description: "Percentage of break point opportunities converted",
    pick: (s) => pct(s.break_points_converted_pct),
  },
  // Other
  {
    key: "total-points-won",
    label: "TOTAL POINTS WON",
    category: "Other",
    format: "percent",
    description: "Percentage of all points won",
    pick: (s) => pct(s.total_points_won_pct),
  },
  {
    key: "winners",
    label: "WINNERS",
    category: "Other",
    format: "count",
    description: "Point-ending shots not touched",
    pick: (s) => num(s.winners),
  },
  {
    key: "unforced-errors",
    label: "UNFORCED ERRORS",
    category: "Other",
    format: "count",
    description: "Shots into the net or out of bounds",
    pick: (s) => num(s.unforced_errors),
    lowerIsBetter: true,
  },
  {
    key: "avg-rally-length",
    label: "AVG RALLY LENGTH",
    category: "Other",
    format: "decimal",
    description: "Average shots per point",
    pick: (s) => num(s.avg_rally_length),
  },
];

function formatKpiValue(value: number, format: KpiFormat): string {
  if (format === "percent") return `${Math.round(value)}%`;
  if (format === "count") return `${Math.round(value)}`;
  return value.toFixed(1);
}

function calculateKpiCards(
  stats: DbMatchStats[],
  matchPlayerMap: Map<string, boolean>,
  orderedMatchIds: string[],
  matchMetaMap: Map<string, { date: string; opponent: string }>
): KpiCardData[] {
  const statByMatch = new Map<string, DbMatchStats>();
  for (const stat of stats) {
    const isUserPlayer1 = matchPlayerMap.get(stat.match_id);
    if (isUserPlayer1 === undefined) continue;
    if (stat.is_player1 !== isUserPlayer1) continue;
    statByMatch.set(stat.match_id, stat);
  }

  // Keep matchIds parallel to orderedStats so per-point metadata stays aligned.
  const orderedStats: DbMatchStats[] = [];
  const orderedIds: string[] = [];
  for (const matchId of orderedMatchIds) {
    const s = statByMatch.get(matchId);
    if (s) {
      orderedStats.push(s);
      orderedIds.push(matchId);
    }
  }

  // Emit a card for every spec even when stats haven't been computed yet
  // (e.g. first match still processing in the edge function). The placeholder
  // keeps the KPI strip populated so the customizer's 5-tile default stays intact.
  return KPI_SPECS.map((spec) => {
    // Matches that did not measure this statistic are dropped rather than
    // counted as zero. Paired with their ids so the sparkline tooltip cannot
    // shift onto the wrong match — filtering the values alone would offset the
    // metadata by one for every gap.
    const measured = presentPairs(orderedStats.map(spec.pick), orderedIds);
    const hasData = measured.length > 0;
    const window = measured.slice(0, 8);
    const sparkline = window.map((m) => m.value).reverse();
    // Same slice+reverse window as `sparkline` so points[k].value === sparkline[k].
    const points = window
      .map(({ value, meta: id }) => {
        const meta = matchMetaMap.get(id);
        return {
          value,
          date: meta?.date ?? "",
          opponent: meta?.opponent ?? "Opponent",
        };
      })
      .reverse();
    const change =
      measured.length >= 2
        ? Math.round((measured[0].value - measured[1].value) * 10) / 10
        : 0;
    return {
      key: spec.key,
      label: spec.label,
      value: hasData ? formatKpiValue(measured[0].value, spec.format) : "—",
      change,
      changeLabel: "last 30 days",
      sparkline,
      points,
      format: spec.format,
      description: spec.description,
      category: spec.category,
      lowerIsBetter: spec.lowerIsBetter,
    };
  });
}

function calculateWinRateSparkline(
  matches: DbMatch[],
  playerIds: readonly string[],
  viewerId: string
): { value: number; change: number; sparkline: number[] } {
  if (matches.length === 0) return { value: 0, change: 0, sparkline: [] };

  // Calculate running win rate for sparkline (reversed to show chronological order)
  const results: boolean[] = [];
  for (const match of [...matches].reverse()) {
    if (!match.score?.player1 || !match.score?.player2) continue;
    const p1Sets = match.score.player1.filter(
      (s, i) => s > (match.score?.player2[i] ?? 0)
    ).length;
    const p2Sets = match.score.player2.filter(
      (s, i) => s > (match.score?.player1[i] ?? 0)
    ).length;
    const side = viewerSide(match, playerIds, viewerId);
    if (side === null) continue;
    const player1Won = p1Sets > p2Sets;
    results.push(side === "player1" ? player1Won : !player1Won);
  }

  if (results.length === 0) return { value: 0, change: 0, sparkline: [] };

  const sparkline: number[] = [];
  let wins = 0;
  for (let i = 0; i < results.length; i++) {
    if (results[i]) wins++;
    sparkline.push(Math.round((wins / (i + 1)) * 100));
  }

  const currentRate = sparkline[sparkline.length - 1];

  // Calculate change vs 30 days ago
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const recentMatches = matches.filter((m) => new Date(m.date) >= cutoff);
  let recentWins = 0;
  let recentTotal = 0;
  for (const match of recentMatches) {
    if (!match.score?.player1 || !match.score?.player2) continue;
    const side = viewerSide(match, playerIds, viewerId);
    if (side === null) continue;
    recentTotal++;
    const p1Sets = match.score.player1.filter(
      (s, i) => s > (match.score?.player2[i] ?? 0)
    ).length;
    const p2Sets = match.score.player2.filter(
      (s, i) => s > (match.score?.player1[i] ?? 0)
    ).length;
    const player1Won = p1Sets > p2Sets;
    if (side === "player1" ? player1Won : !player1Won) recentWins++;
  }
  const olderMatches = matches.filter((m) => new Date(m.date) < cutoff);
  let olderWins = 0;
  let olderTotal = 0;
  for (const match of olderMatches) {
    if (!match.score?.player1 || !match.score?.player2) continue;
    const side = viewerSide(match, playerIds, viewerId);
    if (side === null) continue;
    olderTotal++;
    const p1Sets = match.score.player1.filter(
      (s, i) => s > (match.score?.player2[i] ?? 0)
    ).length;
    const p2Sets = match.score.player2.filter(
      (s, i) => s > (match.score?.player1[i] ?? 0)
    ).length;
    const player1Won = p1Sets > p2Sets;
    if (side === "player1" ? player1Won : !player1Won) olderWins++;
  }

  const recentRate = recentTotal > 0 ? (recentWins / recentTotal) * 100 : 0;
  const olderRate = olderTotal > 0 ? (olderWins / olderTotal) * 100 : 0;
  const change = olderTotal > 0 ? Math.round((recentRate - olderRate) * 10) / 10 : 0;

  return { value: currentRate, change, sparkline: sparkline.slice(-8) };
}

function calculatePerformanceProfile(
  stats: DbMatchStats[],
  matchPlayerMap: Map<string, boolean>,
  orderedMatchIds: string[]
): PerformanceProfileDimension[] {
  const dimensions = [
    "SERVE",
    "RETURN",
    "FOREHAND",
    "BACKHAND",
    "NET",
    "DEPTH",
    "CLUTCH",
    "FITNESS",
  ];

  const userStats: DbMatchStats[] = [];
  for (const matchId of orderedMatchIds) {
    for (const stat of stats) {
      if (stat.match_id !== matchId) continue;
      const isUserPlayer1 = matchPlayerMap.get(stat.match_id);
      if (isUserPlayer1 === undefined) continue;
      if (stat.is_player1 !== isUserPlayer1) continue;
      userStats.push(stat);
    }
  }

  if (userStats.length === 0) {
    return dimensions.map((label) => ({ label, current: 0, previous: 0 }));
  }

  // Current = average of last 3 matches, previous = average of matches 4-6
  const recentStats = userStats.slice(0, Math.min(3, userStats.length));
  const olderStats = userStats.slice(3, Math.min(6, userStats.length));

  // A match missing the inputs is excluded from the mean rather than scored 0.
  // serve_rating in particular goes NULL for every video-derived match, because
  // its formula contains the ace count.
  const avg = (arr: DbMatchStats[], fn: (s: DbMatchStats) => number | null) =>
    meanOfPresent(arr.map(fn)) ?? 0;

  const serveScore = (s: DbMatchStats) => {
    const rating = pct(s.serve_rating);
    return rating === null ? null : Math.min(100, rating / 2.5);
  };
  // `meanOfPresent`, not a local pair helper. The one that lived here spelled
  // the identical rule -- `(a ?? b) + (b ?? a) / 2` collapses to the present
  // value when one side is null -- in a second place where it could drift.
  const returnScore = (s: DbMatchStats) =>
    meanOfPresent([pct(s.first_return_won_pct), pct(s.second_return_won_pct)]);
  const clutchScore = (s: DbMatchStats) =>
    meanOfPresent([
      pct(s.break_points_saved_pct),
      pct(s.break_points_converted_pct),
    ]);

  const currentServe = Math.round(avg(recentStats, serveScore));
  const previousServe = olderStats.length > 0 ? Math.round(avg(olderStats, serveScore)) : currentServe;
  const currentReturn = Math.round(avg(recentStats, returnScore));
  const previousReturn = olderStats.length > 0 ? Math.round(avg(olderStats, returnScore)) : currentReturn;
  const currentClutch = Math.round(avg(recentStats, clutchScore));
  const previousClutch = olderStats.length > 0 ? Math.round(avg(olderStats, clutchScore)) : currentClutch;

  return [
    { label: "SERVE", current: currentServe, previous: previousServe },
    { label: "RETURN", current: currentReturn, previous: previousReturn },
    { label: "FOREHAND", current: 0, previous: 0 },
    { label: "BACKHAND", current: 0, previous: 0 },
    { label: "NET", current: 0, previous: 0 },
    { label: "DEPTH", current: 0, previous: 0 },
    { label: "CLUTCH", current: currentClutch, previous: previousClutch },
    { label: "FITNESS", current: 0, previous: 0 },
  ];
}

export async function getOverallPerformance(): Promise<OverallPerformanceData> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return DEFAULT_PERFORMANCE;

  // `player2_id` joins the projection because `viewerSide` needs both halves to
  // tell "I was player two" from "this is not my match at all".
  const [{ data: matches }, myPlayerIds] = await Promise.all([
    supabase
      .from("matches")
      .select("id, date, player1_id, player2_id, player1_name, player2_name, score")
      .eq("created_by", user.id)
      .order("date", { ascending: false }),
    getMyPlayerIds(),
  ]);

  if (!matches || matches.length === 0) return DEFAULT_PERFORMANCE;

  const typedMatches = matches as DbMatch[];
  const overall = calculateWinLoss(typedMatches, myPlayerIds, user.id);
  const last30 = calculateWinLoss(typedMatches, myPlayerIds, user.id, 30);
  const last7 = calculateWinLoss(typedMatches, myPlayerIds, user.id, 7);

  const matchIds = matches.map((m) => m.id);
  const matchPlayerMap = new Map<string, boolean>();
  const matchMetaMap = new Map<string, { date: string; opponent: string }>();
  for (const m of matches) {
    // A match that is not the viewer's at all stays out of the map entirely, so
    // the stat loops below skip it rather than reading the wrong side's row.
    const side = viewerSide(m, myPlayerIds, user.id);
    if (side === null) continue;
    const isP1 = side === "player1";
    matchPlayerMap.set(m.id, isP1);
    matchMetaMap.set(m.id, {
      date: m.date,
      opponent: (isP1 ? m.player2_name : m.player1_name) ?? "Opponent",
    });
  }

  const { data: stats } = await supabase
    .from("match_stats_with_percentages")
    .select(
      "match_id, is_player1, first_serve_pct, first_serve_won_pct, second_serve_won_pct, serve_rating, first_return_won_pct, second_return_won_pct, break_points_saved_pct, break_points_converted_pct, service_games_won_pct, return_games_won_pct, total_points_won_pct, aces, double_faults, winners, unforced_errors, avg_rally_length"
    )
    .in("match_id", matchIds);

  const typedStats = (stats as DbMatchStats[]) ?? [];
  const orderedMatchIds = matches.map((m) => m.id);

  const ratings = calculateAverageRating(typedStats, user.id, matchPlayerMap);
  const recentPerf = calculateRecentPerformance(
    typedStats,
    matchPlayerMap,
    orderedMatchIds
  );

  return {
    views: [
      { ...overall, label: "Overall Record" },
      { ...last30, label: "Last 30 Days" },
      { ...last7, label: "Last 7 Days" },
    ],
    performanceRatings: [
      { label: "Serve Rating", value: ratings.serve, barColor: "#666666" },
      { label: "Return Rating", value: ratings.return_, barColor: "#4A90E2" },
      { label: "Under Pressure Rating", value: ratings.pressure, barColor: "#666666" },
    ],
    recentPerformance: recentPerf,
    kpiCards: calculateKpiCards(
      typedStats,
      matchPlayerMap,
      orderedMatchIds,
      matchMetaMap
    ),
    winRate: calculateWinRateSparkline(typedMatches, myPlayerIds, user.id),
    form: calculateForm(typedMatches, myPlayerIds, user.id, 5),
    matchCount: typedMatches.length,
    heatmap: calculateHeatmap(typedMatches, myPlayerIds, user.id),
    performanceProfile: calculatePerformanceProfile(
      typedStats,
      matchPlayerMap,
      orderedMatchIds
    ),
  };
}
