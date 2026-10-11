import { meanOfPresent } from "@/lib/data/aggregate";
import { matchOutcome, type MatchScore } from "@/lib/data/match-utils";
import { normalizedPersonName } from "@/lib/data/person-name";
import { PLAYER_MEASURES } from "@/lib/data/player-measures";
import { academicSeason } from "@/lib/schedule/format";
import { scoreSetsFrom, type ScoreLineSet } from "@/lib/ui/score-format";

/**
 * The personal workspace's opponents: one player's own matches, grouped by who
 * was on the other side of the net.
 *
 * Pure — no Supabase, no clock, no `cache()`. `personal-opponents-server.ts`
 * does the reading and decides which seat the viewer sat in; everything that
 * turns those rows into a page lives here, where a spec can call it.
 *
 * Not to be confused with `opponents-server.ts`, which is the TEAM product's
 * opponents: program-keyed, a conference directory and pooled public-record
 * views. Nothing in that file takes a user id, and nothing here takes a
 * program.
 *
 * ── Who "the same opponent" is ──────────────────────────────────────────────
 * `opponent_player_id` when the match carries one, otherwise the opponent's
 * name under `normalizedPersonName` — the app's one definition of "the same
 * name", so `Ana  Castillo` and `ana castillo ` are one row here exactly as
 * they are on the roster. The name is the real path, not a fallback for an
 * edge case: as of 2026-10-10 `opponent_player_id` is null on every live row.
 *
 * The two key spaces are kept apart (`id:` / `name:`), so an id never collides
 * with somebody whose name happens to spell it, and an id always wins: two
 * matches with one id are one opponent whatever was typed in the name field.
 *
 * A match with neither an id nor a name is left out. `normalizedPersonName`
 * returns `""` for a blank name, which compares equal to every other blank —
 * grouping on it would invent one opponent out of every match nobody labelled.
 */

/** The four figures the drawer shows, in the order it shows them. */
export const PERSONAL_OPPONENT_MEASURE_KEYS = [
  "total_points_won_pct",
  "first_serve_won_pct",
  "first_return_won_pct",
  "break_points_converted_pct",
] as const;

export type PersonalOpponentMeasureKey =
  (typeof PERSONAL_OPPONENT_MEASURE_KEYS)[number];

/** How many recent matches the form ticks look at. */
const FORM_WINDOW = 5;

/** How many matches the drawer plots, lists from, and averages over. */
const RECENT_WINDOW = 6;

/**
 * One personal match, already read from the viewer's seat.
 *
 * `isUserPlayer1` is decided by the loader (`playerSide`), never here and never
 * by normalising `player1_id` — that column holds two id spaces.
 */
export interface PersonalOpponentMatchInput {
  id: string;
  /** `matches.date`, as stored. Null sorts last and belongs to no season. */
  date: string | null;
  isUserPlayer1: boolean;
  player1_name: string | null;
  player2_name: string | null;
  opponent_player_id: string | null;
  opponent_hand: string | null;
  opponent_backhand: string | null;
  /**
   * `matches.tournament_name` — what the drawer's recent-match row is called.
   * Optional so a caller with no use for it need not spell it.
   */
  tournament_name?: string | null;
  score: MatchScore | null;
  /**
   * The viewer's side of the stats row, keyed by
   * `PERSONAL_OPPONENT_MEASURE_KEYS`. Null when the match has no stats row for
   * that side — a video still in analysis, a hand-entered result.
   */
  values: Record<string, number | null> | null;
}

export type PersonalOpponentForm = "win" | "loss" | "pending";

/** The most recent meeting, as the table's "Last match" cell draws it. */
export interface PersonalOpponentLastMatch {
  id: string;
  /** `matches.date`, as stored — the caller formats it. */
  date: string | null;
  won: boolean | null;
  /** Oriented so `player1` is the viewer. */
  sets: ScoreLineSet[];
}

/**
 * One of the last six meetings, as the drawer draws it — the shape of
 * `RosterRecentMatch` minus the opponent's name, which is the group's.
 */
export interface PersonalOpponentRecentMatch extends PersonalOpponentLastMatch {
  /** The event or tournament it was played at, trimmed; null when unnamed. */
  event: string | null;
  /** Whether this match falls in the current academic season. */
  inSeason: boolean;
  /**
   * The viewer's side of each drawer measure for this match. Null where the
   * match carries no stats; the sparkline skips the point rather than drawing
   * a zero.
   */
  values: Record<PersonalOpponentMeasureKey, number | null>;
}

/**
 * One of the drawer's four figures — `RosterMeasure`'s shape.
 *
 * `value` is the mean over `recent`'s non-null points, null when nothing
 * measured it. `trend` is that mean against the mean of every earlier meeting,
 * in points; null where either side of the comparison is missing.
 */
export interface PersonalOpponentMeasure {
  key: PersonalOpponentMeasureKey;
  label: string;
  value: number | null;
  trend: number | null;
}

export interface PersonalOpponent {
  /** The grouping key: `id:<opponent_player_id>` or `name:<normalized name>`. */
  key: string;
  opponentPlayerId: string | null;
  /** As spelled on the most recent match that names them. */
  name: string;
  /** Most recent non-null `opponent_hand`, else null. */
  hand: string | null;
  /** Most recent non-null `opponent_backhand`, else null. */
  backhand: string | null;
  /** Every meeting, decided or not. */
  played: number;
  /** Meetings that carry a stats row for the viewer's side. */
  analyzed: number;
  wins: number;
  losses: number;
  /** Meetings in the current academic season — zero hides the row under "This season". */
  playedThisSeason: number;
  /** The last five meetings, oldest first. */
  form: PersonalOpponentForm[];
  lastMatch: PersonalOpponentLastMatch;
  /** Newest first, at most six. */
  recent: PersonalOpponentRecentMatch[];
  /** Always the four in `PERSONAL_OPPONENT_MEASURE_KEYS`, in that order. */
  measures: PersonalOpponentMeasure[];
}

/** The page's headline counts. */
export interface PersonalOpponentTotals {
  opponents: number;
  matches: number;
  won: number;
  analyzed: number;
  /**
   * The viewer's matches that name no opponent — in none of the figures
   * above, and counted here so the page can say they exist rather than
   * quietly disagreeing with the Matches list.
   */
  unnamed: number;
}

/**
 * The academic season `now` falls in — `"2026–27"`.
 *
 * Read in UTC, which is the server's zone on Vercel: a season turns over once
 * a year, so the hours either side of midnight on Aug 1 are the whole error.
 */
export function currentSeason(now: Date): string {
  return academicSeason(now.toISOString());
}

/**
 * Whether a match date falls in `season` — the "This season" chip's test.
 * An undated match belongs to no season.
 */
export function isInSeason(date: string | null, season: string): boolean {
  return Boolean(date) && academicSeason(date as string) === season;
}

/**
 * The key two matches share when they are against the same opponent, or null
 * for a match that names nobody.
 */
export function personalOpponentKey(
  match: Pick<
    PersonalOpponentMatchInput,
    "isUserPlayer1" | "player1_name" | "player2_name" | "opponent_player_id"
  >,
): string | null {
  if (match.opponent_player_id) return `id:${match.opponent_player_id}`;
  // A personal match is entered with its uploader as player one, so this is
  // `normalizedPersonName(player2_name)` on every row the wizard writes; the
  // other branch only keeps a viewer seated as player two from being grouped
  // under their own name.
  const name = match.isUserPlayer1
    ? normalizedPersonName(match.player2_name)
    : normalizedPersonName(match.player1_name);
  return name ? `name:${name}` : null;
}

/** What an id-keyed group is called when none of its matches carries a name. */
export const UNKNOWN_OPPONENT_NAME = "Unknown opponent";

/** How many matches `groupPersonalOpponents` leaves out for naming nobody. */
export function countUnnamedMatches(
  matches: readonly Parameters<typeof personalOpponentKey>[0][],
): number {
  return matches.filter((match) => personalOpponentKey(match) === null).length;
}

/** The opponent's name as typed, with the whitespace noise taken out. */
function opponentDisplayName(match: PersonalOpponentMatchInput): string {
  const raw = match.isUserPlayer1 ? match.player2_name : match.player1_name;
  return (raw ?? "").trim().replace(/\s+/g, " ");
}

/** Newest first; undated last, so a missing date never reads as "most recent". */
function byDateDescending(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? 1 : -1;
}

function emptyValues(): Record<PersonalOpponentMeasureKey, number | null> {
  return {
    total_points_won_pct: null,
    first_serve_won_pct: null,
    first_return_won_pct: null,
    break_points_converted_pct: null,
  };
}

const MEASURE_LABELS = new Map(PLAYER_MEASURES.map((m) => [m.key, m.label]));

function formOf(won: boolean | null): PersonalOpponentForm {
  if (won === null) return "pending";
  return won ? "win" : "loss";
}

/**
 * Group one player's matches by opponent, most recently played first.
 *
 * `season` is the current academic season (`currentSeason(now)`), passed in so
 * this stays free of the clock.
 */
export function groupPersonalOpponents(
  matches: readonly PersonalOpponentMatchInput[],
  season: string,
): PersonalOpponent[] {
  const byKey = new Map<string, PersonalOpponentMatchInput[]>();
  for (const match of matches) {
    const key = personalOpponentKey(match);
    if (key === null) continue;
    const group = byKey.get(key);
    if (group) group.push(match);
    else byKey.set(key, [match]);
  }

  const opponents: PersonalOpponent[] = [];
  for (const [key, unsorted] of byKey) {
    // Newest first, so every window below is a slice from the front.
    const group = [...unsorted].sort((a, b) =>
      byDateDescending(a.date, b.date),
    );

    const results = group.map((match) => ({
      match,
      won: matchOutcome(match.score, match.isUserPlayer1),
      inSeason: isInSeason(match.date, season),
      values: { ...emptyValues(), ...(match.values ?? {}) },
    }));

    let wins = 0;
    let losses = 0;
    for (const result of results) {
      // A null outcome — no score, or level sets — is a meeting that was
      // played and that nobody is yet known to have won. It counts in
      // `played` and in neither column.
      if (result.won === true) wins++;
      else if (result.won === false) losses++;
    }

    const recentResults = results.slice(0, RECENT_WINDOW);
    const earlierResults = results.slice(RECENT_WINDOW);

    const recent: PersonalOpponentRecentMatch[] = recentResults.map(
      ({ match, won, inSeason, values }) => ({
        id: match.id,
        date: match.date,
        won,
        sets: scoreSetsFrom(match.score, { swap: !match.isUserPlayer1 }),
        event: match.tournament_name?.trim() || null,
        inSeason,
        values,
      }),
    );

    const measures: PersonalOpponentMeasure[] =
      PERSONAL_OPPONENT_MEASURE_KEYS.map((measureKey) => {
        // Whole points, as on the roster drawer: "63.4%" claims a precision a
        // six-match window does not have.
        const value = meanOfPresent(
          recentResults.map((r) => r.values[measureKey]),
          0,
        );
        const earlier = meanOfPresent(
          earlierResults.map((r) => r.values[measureKey]),
          0,
        );
        return {
          key: measureKey,
          label: MEASURE_LABELS.get(measureKey) ?? measureKey,
          value,
          trend: value === null || earlier === null ? null : value - earlier,
        };
      });

    const latest = results[0];
    opponents.push({
      key,
      opponentPlayerId:
        group.find((m) => m.opponent_player_id)?.opponent_player_id ?? null,
      name:
        group.map(opponentDisplayName).find((name) => name !== "") ??
        UNKNOWN_OPPONENT_NAME,
      hand: group.find((m) => m.opponent_hand)?.opponent_hand ?? null,
      backhand:
        group.find((m) => m.opponent_backhand)?.opponent_backhand ?? null,
      played: results.length,
      analyzed: group.filter((m) => m.values !== null).length,
      wins,
      losses,
      playedThisSeason: results.filter((r) => r.inSeason).length,
      form: results
        .slice(0, FORM_WINDOW)
        .map((r) => formOf(r.won))
        .reverse(),
      lastMatch: {
        id: latest.match.id,
        date: latest.match.date,
        won: latest.won,
        sets: recent[0].sets,
      },
      recent,
      measures,
    });
  }

  return opponents.sort(
    (a, b) =>
      byDateDescending(a.lastMatch.date, b.lastMatch.date) ||
      a.name.localeCompare(b.name),
  );
}

/** The page totals, over exactly the rows the table lists. */
export function personalOpponentTotals(
  opponents: readonly PersonalOpponent[],
  unnamed = 0,
): PersonalOpponentTotals {
  return opponents.reduce<PersonalOpponentTotals>(
    (totals, opponent) => ({
      opponents: totals.opponents + 1,
      matches: totals.matches + opponent.played,
      won: totals.won + opponent.wins,
      analyzed: totals.analyzed + opponent.analyzed,
      unnamed,
    }),
    { opponents: 0, matches: 0, won: 0, analyzed: 0, unnamed },
  );
}
