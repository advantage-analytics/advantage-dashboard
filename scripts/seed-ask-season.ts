/**
 * Seed the eyes-on verifier account with one varied season of personal
 * matches, so `scripts/ask-eval.ts` has a full season to ask about.
 *
 *   npx tsx scripts/seed-ask-season.ts             # dry run (the default): build, validate, print
 *   npx tsx scripts/seed-ask-season.ts --dry-run   # the same, said out loud
 *   npx tsx scripts/seed-ask-season.ts --apply     # remove the previous seed, then insert this one
 *   npx tsx scripts/seed-ask-season.ts --remove    # delete only the seeded matches and their rows
 *
 * `--apply` AND `--remove` WRITE TO WHATEVER PROJECT `.env.local` NAMES —
 * normally production. A dry run reads no environment and opens no client.
 *
 * What it writes: 14 personal `matches` from February to September 2026
 * (`created_by` = the verifier, `program_id` null), every point of each, every
 * shot of every point, and both `match_stats` rows. The verifier's four
 * existing matches are never selected by anything here.
 *
 * Marker: the row id. Every seeded match id is `fixtureId("match:<slot>")` in
 * the namespace SEED_NS, for slots 1..MAX_SLOTS; no other row can carry one.
 * The delete predicate lives in ONE function, `seededMatches()`:
 *
 *   id in (<the MAX_SLOTS deterministic ids>)
 *   and created_by = '<verifier id>'
 *   and program_id is null
 *
 * and child rows are only ever deleted by a `match_id` that predicate
 * returned. The tournament names stay realistic on purpose: `ask.matches`
 * shows them to the model.
 *
 * Deterministic: a seeded PRNG per match (no Math.random, no clock), so two
 * runs build byte-identical rows — the dry run prints a digest to prove it.
 *
 * Consistency with a recompute. Nothing recomputes `match_stats` on insert
 * (no trigger on points or shots, verified live 2026-10-12), but the stats
 * here are a TypeScript port of `public.calculate_match_stats` and
 * `public.backfill_returns_in_and_net_points` run over the seeded points and
 * shots, so a manual recompute would land on the same numbers. Three
 * deliberate differences, each because the truthful value is the better
 * fixture: the four set-point counters (the SQL counts "faced" as set points
 * lost, which lets saved exceed faced), `forced_errors` (the SQL writes NULL;
 * here it is the count of forced-error points), and the three
 * `return_contact_*` counters, which need shot coordinates this seed does not
 * invent — they are 0, so their percentages read null.
 *
 * What the season is built to show (the dry run prints each):
 *   (a) first-serve percentage rises through the season, about 54% → 68%;
 *   (b) far fewer second-serve points won against left-handers;
 *   (c) three losses to Marek Dvorsky with one shared cause — break points
 *       not converted and short rallies lost;
 *   (d) better results on hard courts than on clay;
 *   (e) long rallies (10+ shots) won more often than short ones (1–4).
 */

import { createHash } from "node:crypto";
import { loadEnvLocal } from "./lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// Target and marker
// ---------------------------------------------------------------------------

type Db = ReturnType<typeof createAdminClient>;

/** The eyes-on verifier (Giacomo Revelli, an example.com address). */
const VERIFIER_USER_ID = "18c34090-1857-422e-b207-b4850bef3c32";
/** Whose season this is. Anything but the verifier is refused. */
const TARGET_USER_ID: string = VERIFIER_USER_ID;
const ME_NAME = "Giacomo Revelli";

/** Bump only with a matching `--remove` run first: ids change with it. */
const SEED_NS = "advantage-ask-season-v1";
/** Slots the marker covers; a redesign may use fewer or more of them. */
const MAX_SLOTS = 40;

function fixtureId(name: string): string {
  const digest = createHash("sha256").update(`${SEED_NS}:${name}`).digest();
  const b = Buffer.from(digest.subarray(0, 16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = b.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const SEEDED_MATCH_IDS: readonly string[] = Array.from(
  { length: MAX_SLOTS },
  (_, i) => fixtureId(`match:${i + 1}`),
);

/**
 * THE predicate. Every read and every delete of a seeded `matches` row goes
 * through here, so a query can only ever touch rows that carry a seeded id
 * AND belong to the verifier AND are personal.
 */
function seededMatches(db: Db, action: "select" | "delete") {
  const table = db.from("matches");
  const query =
    action === "select" ? table.select("id") : table.delete({ count: "exact" });
  return query
    .in("id", SEEDED_MATCH_IDS)
    .eq("created_by", VERIFIER_USER_ID)
    .is("program_id", null);
}

function assertVerifierTarget(): void {
  if (TARGET_USER_ID !== VERIFIER_USER_ID) {
    throw new Error(
      `Refusing to run: the target user ${TARGET_USER_ID} is not the eyes-on verifier.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Seeded randomness
// ---------------------------------------------------------------------------

type Rng = () => number;

function makeRng(name: string): Rng {
  let a = createHash("sha256")
    .update(`${SEED_NS}:rng:${name}`)
    .digest()
    .readUInt32LE(0);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: Rng, options: readonly (readonly [T, number])[]): T {
  const total = options.reduce((sum, [, w]) => sum + w, 0);
  let roll = rng() * total;
  for (const [value, weight] of options) {
    roll -= weight;
    if (roll < 0) return value;
  }
  return options[options.length - 1][0];
}

function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function between(rng: Rng, low: number, high: number): number {
  return Math.round((low + rng() * (high - low)) * 10) / 10;
}

// ---------------------------------------------------------------------------
// The season
// ---------------------------------------------------------------------------

type Hand = "right" | "left";
/** The exact `court_type` strings the live rows use. */
type Court = "Outdoor Hard Court" | "Indoor Hard Court" | "Clay Court";

interface Opponent {
  name: string;
  hand: Hand;
  backhand: "two-handed" | "one-handed";
}

/** Invented names; none appears in the database (checked 2026-10-12). */
const OPPONENTS = {
  brandt: { name: "Ilya Brandt", hand: "left", backhand: "two-handed" },
  dvorsky: { name: "Marek Dvorsky", hand: "right", backhand: "two-handed" },
  castellane: {
    name: "Owen Castellane",
    hand: "right",
    backhand: "two-handed",
  },
  verhoeven: { name: "Tomas Verhoeven", hand: "left", backhand: "one-handed" },
  penhallow: { name: "Dario Penhallow", hand: "right", backhand: "two-handed" },
  aumont: { name: "Felix Aumont", hand: "right", backhand: "one-handed" },
  santoro: { name: "Luca Santoro", hand: "right", backhand: "two-handed" },
  arlotta: { name: "Kenji Arlotta", hand: "left", backhand: "two-handed" },
  okonjo: { name: "Nils Okonjo", hand: "right", backhand: "two-handed" },
} as const satisfies Record<string, Opponent>;

type OpponentKey = keyof typeof OPPONENTS;
const NEMESIS: OpponentKey = "dvorsky";

/** One set from my seat: games, and tiebreak points when it went to one. */
interface SetSpec {
  me: number;
  opp: number;
  tbMe?: number;
  tbOpp?: number;
}

interface MatchSpec {
  slot: number;
  /** Stored as-is in `matches.date`; `ask.matches.played_on` is its UTC date. */
  date: string;
  opponent: OpponentKey;
  court: Court;
  tournament: string;
  round: string | null;
  matchType: "Tournament" | "Dual Match" | "Practice";
  sets: SetSpec[];
  /** False puts the verifier in the player-2 seat. */
  meIsP1: boolean;
  /** My first-serve percentage, the season's rising line. */
  firstServePct: number;
  /** Share of my second serves in play that I win the point behind. */
  secondServeWon: number;
}

const s = (me: number, opp: number, tbMe?: number, tbOpp?: number): SetSpec =>
  tbMe === undefined ? { me, opp } : { me, opp, tbMe, tbOpp };

const SEASON: MatchSpec[] = [
  {
    slot: 1,
    date: "2026-02-07T18:00:00+00:00",
    opponent: "brandt",
    court: "Indoor Hard Court",
    tournament: "Winter Indoor Classic",
    round: "Round of 16",
    matchType: "Tournament",
    sets: [s(6, 4), s(7, 5)],
    meIsP1: true,
    firstServePct: 0.54,
    secondServeWon: 0.42,
  },
  {
    slot: 2,
    date: "2026-02-21T18:00:00+00:00",
    opponent: "dvorsky",
    court: "Clay Court",
    tournament: "Canyon Ridge Clay Open",
    round: "Quarterfinals",
    matchType: "Tournament",
    sets: [s(4, 6), s(3, 6)],
    meIsP1: true,
    firstServePct: 0.55,
    secondServeWon: 0.52,
  },
  {
    slot: 3,
    date: "2026-03-07T18:00:00+00:00",
    opponent: "castellane",
    court: "Outdoor Hard Court",
    tournament: "Harbor Point Spring Open",
    round: "Round of 16",
    matchType: "Tournament",
    sets: [s(6, 3), s(6, 4)],
    meIsP1: false,
    firstServePct: 0.56,
    secondServeWon: 0.58,
  },
  {
    slot: 4,
    date: "2026-03-21T18:00:00+00:00",
    opponent: "verhoeven",
    court: "Clay Court",
    tournament: "Mesa Verde Clay Championships",
    round: "Round of 16",
    matchType: "Tournament",
    sets: [s(6, 7, 5, 7), s(4, 6)],
    meIsP1: true,
    firstServePct: 0.57,
    secondServeWon: 0.38,
  },
  {
    slot: 5,
    date: "2026-04-11T18:00:00+00:00",
    opponent: "penhallow",
    court: "Outdoor Hard Court",
    tournament: "Bayside League · Week 2",
    round: null,
    matchType: "Dual Match",
    sets: [s(3, 6), s(6, 4), s(6, 3)],
    meIsP1: true,
    firstServePct: 0.58,
    secondServeWon: 0.56,
  },
  {
    slot: 6,
    date: "2026-04-25T18:00:00+00:00",
    opponent: "dvorsky",
    court: "Outdoor Hard Court",
    tournament: "Bayside League · Week 4",
    round: null,
    matchType: "Dual Match",
    sets: [s(6, 4), s(4, 6), s(3, 6)],
    meIsP1: false,
    firstServePct: 0.59,
    secondServeWon: 0.53,
  },
  {
    slot: 7,
    date: "2026-05-09T18:00:00+00:00",
    opponent: "brandt",
    court: "Clay Court",
    tournament: "Red Bluff Clay Invitational",
    round: "Quarterfinals",
    matchType: "Tournament",
    sets: [s(5, 7), s(6, 3), s(4, 6)],
    meIsP1: true,
    firstServePct: 0.6,
    secondServeWon: 0.39,
  },
  {
    slot: 8,
    date: "2026-05-30T18:00:00+00:00",
    opponent: "aumont",
    court: "Indoor Hard Court",
    tournament: "Northgate Indoor Series",
    round: "Round of 16",
    matchType: "Tournament",
    sets: [s(6, 2), s(6, 4)],
    meIsP1: true,
    firstServePct: 0.61,
    secondServeWon: 0.6,
  },
  {
    slot: 9,
    date: "2026-06-13T18:00:00+00:00",
    opponent: "santoro",
    court: "Clay Court",
    tournament: "Summer Clay Cup",
    round: "Round of 16",
    matchType: "Tournament",
    sets: [s(7, 6, 7, 4), s(6, 4)],
    meIsP1: false,
    firstServePct: 0.62,
    secondServeWon: 0.55,
  },
  {
    slot: 10,
    date: "2026-06-27T18:00:00+00:00",
    opponent: "arlotta",
    court: "Outdoor Hard Court",
    tournament: "Summer Hard Court Open",
    round: "Quarterfinals",
    matchType: "Tournament",
    sets: [s(3, 6), s(6, 4), s(4, 6)],
    meIsP1: true,
    firstServePct: 0.63,
    secondServeWon: 0.4,
  },
  {
    slot: 11,
    date: "2026-07-18T18:00:00+00:00",
    opponent: "penhallow",
    court: "Outdoor Hard Court",
    tournament: "Bayside League · Playoffs",
    round: null,
    matchType: "Dual Match",
    sets: [s(6, 4), s(6, 2)],
    meIsP1: true,
    firstServePct: 0.64,
    secondServeWon: 0.59,
  },
  {
    slot: 12,
    date: "2026-08-01T18:00:00+00:00",
    opponent: "dvorsky",
    court: "Clay Court",
    tournament: "Canyon Ridge Clay Masters",
    round: "Finals",
    matchType: "Tournament",
    sets: [s(5, 7), s(4, 6)],
    meIsP1: true,
    firstServePct: 0.65,
    secondServeWon: 0.54,
  },
  {
    slot: 13,
    date: "2026-08-22T18:00:00+00:00",
    opponent: "brandt",
    court: "Outdoor Hard Court",
    tournament: "Harbor Point Summer Open",
    round: "Quarterfinals",
    matchType: "Tournament",
    sets: [s(6, 3), s(3, 6), s(6, 4)],
    meIsP1: false,
    firstServePct: 0.66,
    secondServeWon: 0.41,
  },
  {
    slot: 14,
    date: "2026-09-12T18:00:00+00:00",
    opponent: "okonjo",
    court: "Indoor Hard Court",
    tournament: "Northgate Indoor Series · Fall",
    round: "Round of 16",
    matchType: "Tournament",
    sets: [s(7, 5), s(6, 3)],
    meIsP1: true,
    firstServePct: 0.68,
    secondServeWon: 0.6,
  },
];

const setsWon = (spec: MatchSpec) =>
  spec.sets.filter((set) => set.me > set.opp).length;
const iWon = (spec: MatchSpec) => setsWon(spec) * 2 > spec.sets.length;

// ---------------------------------------------------------------------------
// Rows (the exact columns the live tables carry)
// ---------------------------------------------------------------------------

interface MatchRow {
  id: string;
  player1_name: string;
  player2_name: string;
  player1_id: string | null;
  player2_id: string | null;
  date: string;
  round: string | null;
  score: {
    player1: number[];
    player2: number[];
    player1_tiebreaks: number[];
    player2_tiebreaks: number[];
  };
  tournament_name: string;
  format: { best_of: number; ad_scoring: boolean; play_on_lets: boolean };
  result: "won" | "lost";
  created_by: string;
  program_id: null;
  source_provider: "swing-vision";
  analysis_method: null;
  match_type: string;
  court_type: Court;
  verified: false;
  duration: number;
  opponent_hand: Hand;
  opponent_backhand: string;
  player_hand: Hand;
  player_backhand: string;
}

interface PointRow {
  id: string;
  match_id: string;
  point_number: number;
  set_number: number;
  game_number: number;
  set_score: string;
  game_score: string;
  point_score: string;
  server_is_player1: boolean;
  won_by_player1: boolean;
  is_break_point: boolean;
  is_set_point: boolean;
  is_match_point: boolean;
  rally_length: number;
  result_type: string;
  created_at: string;
}

interface ShotRow {
  id: string;
  point_id: string;
  shot_number: number;
  is_player1: boolean;
  shot_type: string;
  spin_type: string;
  speed_mph: number;
  zone: string;
  result: "In" | "Out" | "Net";
  created_at: string;
}

interface StatsRow {
  id: string;
  match_id: string;
  is_player1: boolean;
  aces: number;
  double_faults: number;
  winners: number;
  unforced_errors: number;
  forced_errors: number;
  avg_rally_length: number;
  first_serves: number;
  first_serves_in: number;
  first_serve_points_won: number;
  second_serves: number;
  second_serves_in: number;
  second_serve_points_won: number;
  service_games: number;
  service_games_won: number;
  first_returns: number;
  first_returns_in: number;
  first_return_points_won: number;
  second_returns: number;
  second_returns_in: number;
  second_return_points_won: number;
  return_games: number;
  return_games_won: number;
  break_points_faced: number;
  break_points_saved: number;
  break_point_opportunities: number;
  break_points_converted: number;
  set_points_faced: number;
  set_points_saved: number;
  set_point_opportunities: number;
  set_points_converted: number;
  total_points: number;
  total_points_won: number;
  service_winners: number;
  forehand_winners: number;
  backhand_winners: number;
  forehand_unforced_errors: number;
  backhand_unforced_errors: number;
  volley_winners: number;
  net_points_appearances: number;
  net_points_won: number;
  serve_wide: number;
  serve_body: number;
  serve_t: number;
  return_cross_court: number;
  return_down_the_line: number;
  return_middle: number;
  return_contact_inside: number;
  return_contact_middle: number;
  return_contact_deep: number;
  created_at: string;
  updated_at: string;
}

interface BuiltMatch {
  spec: MatchSpec;
  opponent: Opponent;
  match: MatchRow;
  points: PointRow[];
  shots: ShotRow[];
  stats: [StatsRow, StatsRow];
  /** Whose set point each point was, by point number; absent when neither. */
  setPointFor: Map<number, "p1" | "p2">;
}

// ---------------------------------------------------------------------------
// Score generation: games, then the points inside them
// ---------------------------------------------------------------------------

interface GameDraft {
  serverIsMe: boolean;
  wonByMe: boolean;
  tiebreak: boolean;
}

/** A game-by-game path to the set's score, holds weighted over breaks. */
function buildSetGames(
  rng: Rng,
  target: SetSpec,
  firstServerIsMe: boolean,
  holdMe: number,
  holdOpp: number,
): GameDraft[] {
  for (let attempt = 0; attempt < 200_000; attempt++) {
    const games: GameDraft[] = [];
    let me = 0;
    let opp = 0;
    let serverIsMe = firstServerIsMe;
    for (;;) {
      if (me === 6 && opp === 6) {
        const wonByMe = target.me > target.opp;
        games.push({ serverIsMe, wonByMe, tiebreak: true });
        if (wonByMe) me++;
        else opp++;
        break;
      }
      const held = rng() < (serverIsMe ? holdMe : holdOpp);
      const wonByMe = serverIsMe ? held : !held;
      games.push({ serverIsMe, wonByMe, tiebreak: false });
      if (wonByMe) me++;
      else opp++;
      serverIsMe = !serverIsMe;
      if ((me >= 6 || opp >= 6) && Math.abs(me - opp) >= 2) break;
    }
    if (me === target.me && opp === target.opp) return games;
  }
  throw new Error(`No game path found for a ${target.me}-${target.opp} set`);
}

/** Server-won flags for one ad-scoring game with the wanted winner. */
function buildGamePoints(
  rng: Rng,
  serverWins: boolean,
  minBreakPoints: number,
): boolean[] {
  const p = serverWins ? 0.58 : 0.42;
  for (let attempt = 0; attempt < 200_000; attempt++) {
    const flags: boolean[] = [];
    let server = 0;
    let returner = 0;
    let breakPoints = 0;
    while (!(
      (server >= 4 || returner >= 4) &&
      Math.abs(server - returner) >= 2
    )) {
      if (returner >= 3 && returner - server >= 1) breakPoints++;
      const serverWon = rng() < p;
      flags.push(serverWon);
      if (serverWon) server++;
      else returner++;
    }
    if (
      server > returner === serverWins &&
      breakPoints >= minBreakPoints &&
      flags.length <= 14
    ) {
      return flags;
    }
  }
  throw new Error("No point path found for a game");
}

/** Me-won flags for a tiebreak ending exactly `tbMe`-`tbOpp` (7-x, x ≤ 5). */
function buildTiebreakPoints(rng: Rng, tbMe: number, tbOpp: number): boolean[] {
  const high = Math.max(tbMe, tbOpp);
  const low = Math.min(tbMe, tbOpp);
  if (high !== 7 || low > 5) {
    throw new Error(`Unsupported tiebreak score ${tbMe}-${tbOpp}`);
  }
  const meWins = tbMe > tbOpp;
  const body = shuffle(rng, [
    ...Array<boolean>(high - 1).fill(meWins),
    ...Array<boolean>(low).fill(!meWins),
  ]);
  return [...body, meWins];
}

const POINT_NAMES = ["0", "15", "30", "40"];

function gameScoreLabel(first: number, second: number): string {
  if (first >= 3 && second >= 3) {
    if (first === second) return "40-40";
    return first > second ? "AD-40" : "40-AD";
  }
  return `${POINT_NAMES[first]}-${POINT_NAMES[second]}`;
}

type ServeClass = "first" | "second" | "double-fault";
type Band = "short" | "medium" | "long";

/** One point while it is being built, from my seat. */
interface PointDraft {
  n: number;
  set: number;
  game: number;
  tiebreak: boolean;
  serverIsMe: boolean;
  wonByMe: boolean;
  breakPoint: boolean;
  setPointFor: "me" | "opp" | null;
  matchPoint: boolean;
  setScore: string;
  gameScore: string;
  pointScore: string;
  serve: ServeClass;
  rally: number;
  resultType: string;
  /** Shot number of an extra trip to the net, by whoever hit that shot. */
  netShot: number | null;
}

interface MatchParams {
  holdMe: number;
  holdOpp: number;
  oppFirstServePct: number;
  oppSecondServeWon: number;
  longShare: number;
  mediumShare: number;
  longWin: number;
  mediumWin: number;
  /** Of the rally points I lose, the share that end on my unforced error. */
  myUnforcedShare: number;
  /** Share of his held service games in which I must hold a break point. */
  wastedBreakPointGames: number;
}

function paramsFor(spec: MatchSpec): MatchParams {
  const won = iWon(spec);
  const clay = spec.court === "Clay Court";
  const nemesis = spec.opponent === NEMESIS;
  // A weak second serve costs holds: against a left-hander the wins come from
  // breaking back, not from serving the match out.
  const lefty = OPPONENTS[spec.opponent].hand === "left";
  return {
    holdMe: nemesis ? 0.68 : lefty ? (won ? 0.7 : 0.62) : won ? 0.84 : 0.7,
    holdOpp: nemesis ? 0.9 : lefty ? (won ? 0.58 : 0.8) : won ? 0.68 : 0.84,
    oppFirstServePct: nemesis ? 0.66 : 0.61,
    oppSecondServeWon: won ? 0.46 : 0.56,
    longShare: clay ? 0.18 : 0.14,
    mediumShare: 0.3,
    longWin: nemesis ? 0.66 : 0.62,
    mediumWin: nemesis ? 0.57 : won ? 0.55 : 0.5,
    myUnforcedShare: nemesis ? 0.66 : clay ? 0.62 : 0.52,
    wastedBreakPointGames: nemesis ? 0.45 : 0,
  };
}

/** Lay out every point of the match with its score context and flags. */
function buildPointSkeleton(
  rng: Rng,
  spec: MatchSpec,
  params: MatchParams,
): PointDraft[] {
  const oriented = (me: number, opp: number) =>
    spec.meIsP1 ? `${me}-${opp}` : `${opp}-${me}`;
  const points: PointDraft[] = [];
  let setsMe = 0;
  let setsOpp = 0;
  let gameNumber = 0;
  let nextServerIsMe = rng() < 0.5;

  spec.sets.forEach((target, setIndex) => {
    const games = buildSetGames(
      rng,
      target,
      nextServerIsMe,
      params.holdMe,
      params.holdOpp,
    );
    let gamesMe = 0;
    let gamesOpp = 0;
    for (const game of games) {
      gameNumber++;
      const base = {
        set: setIndex + 1,
        game: gameNumber,
        tiebreak: game.tiebreak,
        setScore: oriented(setsMe, setsOpp),
        gameScore: oriented(gamesMe, gamesOpp),
        serve: "first" as ServeClass,
        rally: 0,
        resultType: "",
        netShot: null,
      };
      if (game.tiebreak) {
        const flags = buildTiebreakPoints(
          rng,
          target.tbMe ?? 0,
          target.tbOpp ?? 0,
        );
        let me = 0;
        let opp = 0;
        flags.forEach((wonByMe, i) => {
          const firstServer = i === 0 || Math.floor((i + 1) / 2) % 2 === 0;
          const mine = me >= 6 && me - opp >= 1;
          const theirs = opp >= 6 && opp - me >= 1;
          const setPointFor = mine ? "me" : theirs ? "opp" : null;
          points.push({
            ...base,
            n: points.length + 1,
            serverIsMe: firstServer ? game.serverIsMe : !game.serverIsMe,
            wonByMe,
            breakPoint: false,
            setPointFor,
            matchPoint:
              (setPointFor === "me" && setsMe === 1) ||
              (setPointFor === "opp" && setsOpp === 1),
            pointScore: oriented(me, opp),
          });
          if (wonByMe) me++;
          else opp++;
        });
      } else {
        const serverWins = game.serverIsMe === game.wonByMe;
        const wasted =
          serverWins &&
          !game.serverIsMe &&
          rng() < params.wastedBreakPointGames;
        const flags = buildGamePoints(
          rng,
          serverWins,
          wasted ? (rng() < 0.3 ? 2 : 1) : 0,
        );
        let server = 0;
        let returner = 0;
        for (const serverWon of flags) {
          const serverGamePoint = server >= 3 && server - returner >= 1;
          const returnerGamePoint = returner >= 3 && returner - server >= 1;
          const closer = serverGamePoint
            ? game.serverIsMe
            : returnerGamePoint
              ? !game.serverIsMe
              : null;
          let setPointFor: "me" | "opp" | null = null;
          if (closer !== null) {
            const mine = (closer ? gamesMe : gamesOpp) + 1;
            const other = closer ? gamesOpp : gamesMe;
            if ((mine >= 6 && mine - other >= 2) || mine === 7) {
              setPointFor = closer ? "me" : "opp";
            }
          }
          const mePoints = game.serverIsMe ? server : returner;
          const oppPoints = game.serverIsMe ? returner : server;
          points.push({
            ...base,
            n: points.length + 1,
            serverIsMe: game.serverIsMe,
            wonByMe: game.serverIsMe === serverWon,
            breakPoint: returnerGamePoint,
            setPointFor,
            matchPoint:
              (setPointFor === "me" && setsMe === 1) ||
              (setPointFor === "opp" && setsOpp === 1),
            pointScore: spec.meIsP1
              ? gameScoreLabel(mePoints, oppPoints)
              : gameScoreLabel(oppPoints, mePoints),
          });
          if (serverWon) server++;
          else returner++;
        }
      }
      if (game.wonByMe) gamesMe++;
      else gamesOpp++;
      // A tiebreak counts as one game served by whoever opened it, so the
      // opener of the next set is the player who received its first point.
      nextServerIsMe = !game.serverIsMe;
    }
    if (target.me > target.opp) setsMe++;
    else setsOpp++;
  });
  return points;
}

/**
 * Decide, for one player's service points, which were first serves in, second
 * serves in and double faults — by quota, so the percentages are the designed
 * ones and not a sample that happens to land near them.
 */
function assignServes(
  rng: Rng,
  servicePoints: PointDraft[],
  serverIsMe: boolean,
  firstServePct: number,
  secondServeWon: number,
): void {
  const won = shuffle(
    rng,
    servicePoints.filter((p) => p.wonByMe === serverIsMe),
  );
  const lost = shuffle(
    rng,
    servicePoints.filter((p) => p.wonByMe !== serverIsMe),
  );
  const firstIn = Math.round(servicePoints.length * firstServePct);
  const second = servicePoints.length - firstIn;
  const doubleFaults = Math.min(Math.round(second * 0.12), lost.length);
  const secondIn = second - doubleFaults;
  const floor = Math.max(
    0,
    secondIn - (lost.length - doubleFaults),
    won.length - firstIn,
  );
  const ceiling = Math.min(secondIn, won.length);
  const secondWon = Math.min(
    ceiling,
    Math.max(floor, Math.round(secondIn * secondServeWon)),
  );
  won.forEach((p, i) => (p.serve = i < secondWon ? "second" : "first"));
  lost.forEach((p, i) => {
    if (i < doubleFaults) p.serve = "double-fault";
    else if (i < doubleFaults + (secondIn - secondWon)) p.serve = "second";
    else p.serve = "first";
  });
}

const RALLY_LENGTHS: Record<
  Band,
  {
    server: (readonly [number, number])[];
    returner: (readonly [number, number])[];
  }
> = {
  short: {
    server: [[3, 1]],
    returner: [
      [2, 0.45],
      [4, 0.55],
    ],
  },
  medium: {
    server: [
      [5, 0.5],
      [7, 0.3],
      [9, 0.2],
    ],
    returner: [
      [6, 0.6],
      [8, 0.4],
    ],
  },
  long: {
    server: [
      [11, 0.45],
      [13, 0.3],
      [15, 0.15],
      [17, 0.1],
    ],
    returner: [
      [10, 0.4],
      [12, 0.25],
      [14, 0.2],
      [16, 0.1],
      [18, 0.05],
    ],
  },
};

/** How each point ended, and how long it ran. */
function assignEndings(
  rng: Rng,
  points: PointDraft[],
  params: MatchParams,
): void {
  const open: PointDraft[] = [];
  for (const p of points) {
    const serverWon = p.serverIsMe === p.wonByMe;
    if (p.serve === "double-fault") {
      p.resultType = "Double Fault";
      p.rally = 1;
    } else if (serverWon && rng() < (p.serve === "first" ? 0.08 : 0.01)) {
      p.resultType = "Ace";
      p.rally = 1;
    } else if (serverWon && rng() < (p.serve === "first" ? 0.11 : 0.04)) {
      p.resultType = "Service Winner";
      p.rally = 2;
    } else {
      open.push(p);
    }
  }

  // Rally-length bands by quota, counted over the whole match the way the
  // percentages view counts them. Serve-ended points are already short.
  const openWon = shuffle(
    rng,
    open.filter((p) => p.wonByMe),
  );
  const openLost = shuffle(
    rng,
    open.filter((p) => !p.wonByMe),
  );
  const bandOf = new Map<PointDraft, Band>();
  const take = (band: Band, share: number, winShare: number) => {
    const total = Math.round(points.length * share);
    const wins = Math.min(Math.round(total * winShare), openWon.length);
    const losses = Math.min(total - wins, openLost.length);
    for (const p of openWon.splice(0, wins)) bandOf.set(p, band);
    for (const p of openLost.splice(0, losses)) bandOf.set(p, band);
  };
  take("long", params.longShare, params.longWin);
  take("medium", params.mediumShare, params.mediumWin);

  for (const p of open) {
    const band = bandOf.get(p) ?? "short";
    const serverWon = p.serverIsMe === p.wonByMe;
    const kind = p.wonByMe
      ? pick(rng, [
          ["winner", 0.38],
          ["forced", 0.12],
          ["unforced", 0.5],
        ] as const)
      : pick(rng, [
          ["winner", 0.88 - params.myUnforcedShare],
          ["forced", 0.12],
          ["unforced", params.myUnforcedShare],
        ] as const);
    // A winner is struck by the point's winner, an error by its loser; the
    // server hits the odd-numbered shots.
    const lastByServer = kind === "winner" ? serverWon : !serverWon;
    p.rally = pick(
      rng,
      RALLY_LENGTHS[band][lastByServer ? "server" : "returner"],
    );
    const atNet =
      kind === "winner" && p.rally >= (lastByServer ? 3 : 4) && rng() < 0.14;
    if (atNet) {
      p.resultType = rng() < 0.7 ? "Volley Winner" : "Overhead Winner";
    } else {
      const stroke =
        rng() < (kind === "winner" ? 0.6 : 0.52) ? "Forehand" : "Backhand";
      const ending =
        kind === "winner"
          ? "Winner"
          : kind === "forced"
            ? "Forced Error"
            : "Unforced Error";
      p.resultType = `${stroke} ${ending}`;
    }
    // Now and then the other player came in on the shot before the last one.
    if (p.rally >= 5 && rng() < 0.09) p.netShot = p.rally - 1;
  }
}

const FAULT: readonly (readonly ["Out" | "Net", number])[] = [
  ["Out", 0.6],
  ["Net", 0.4],
];
const SERVE_ZONE: readonly (readonly [string, number])[] = [
  ["T", 0.36],
  ["Body", 0.26],
  ["Wide", 0.38],
];
const RALLY_ZONE: readonly (readonly [string, number])[] = [
  ["Crosscourt", 0.46],
  ["Middle", 0.24],
  ["Down the Line", 0.3],
];

/** Every shot of one point, in order, from my seat. */
function buildShots(
  rng: Rng,
  spec: MatchSpec,
  p: PointDraft,
  pointId: string,
  createdAt: (shotIndex: number) => string,
): ShotRow[] {
  const shots: ShotRow[] = [];
  const serverIsP1 = p.serverIsMe === spec.meIsP1;
  const add = (
    shotNumber: number,
    byServer: boolean,
    shotType: string,
    spinType: string,
    speed: number,
    zone: string,
    result: "In" | "Out" | "Net",
  ) => {
    const index = shots.length;
    shots.push({
      id: fixtureId(`m${spec.slot}:p${p.n}:s${index}`),
      point_id: pointId,
      shot_number: shotNumber,
      is_player1: byServer ? serverIsP1 : !serverIsP1,
      shot_type: shotType,
      spin_type: spinType,
      speed_mph: speed,
      zone,
      result,
      created_at: createdAt(index),
    });
  };

  // Both serves are shot 1, as SwingVision imports number them.
  add(
    1,
    true,
    "First Serve",
    pick(rng, [
      ["Flat", 0.6],
      ["Slice", 0.3],
      ["Kick", 0.1],
    ]),
    between(rng, 96, 116),
    pick(rng, SERVE_ZONE),
    p.serve === "first" ? "In" : pick(rng, FAULT),
  );
  if (p.serve !== "first") {
    add(
      1,
      true,
      "Second Serve",
      pick(rng, [
        ["Kick", 0.6],
        ["Slice", 0.4],
      ]),
      between(rng, 72, 90),
      pick(rng, SERVE_ZONE),
      p.serve === "second" ? "In" : pick(rng, FAULT),
    );
  }

  const [endStroke] = p.resultType.split(" ");
  const endsOnError = p.resultType.endsWith("Error");
  for (let shot = 2; shot <= p.rally; shot++) {
    const byServer = shot % 2 === 1;
    const last = shot === p.rally;
    const groundstroke = rng() < 0.56 ? "Forehand" : "Backhand";
    let shotType = groundstroke;
    if (last && p.resultType !== "Service Winner") shotType = endStroke;
    else if (shot === p.netShot)
      shotType = rng() < 0.85 ? "Volley" : "Overhead";
    const atNet = shotType === "Volley" || shotType === "Overhead";
    const missed = last && (endsOnError || p.resultType === "Service Winner");
    add(
      shot,
      byServer,
      shotType,
      atNet
        ? "Flat"
        : pick(rng, [
            ["Topspin", 0.7],
            ["Slice", 0.2],
            ["Flat", 0.1],
          ]),
      atNet ? between(rng, 48, 78) : between(rng, 56, 82),
      pick(rng, RALLY_ZONE),
      missed ? pick(rng, FAULT) : "In",
    );
  }
  return shots;
}

// ---------------------------------------------------------------------------
// Statistics: a port of calculate_match_stats + backfill_returns_in_and_net_points
// ---------------------------------------------------------------------------

function computeStats(
  slot: number,
  matchId: string,
  stamp: string,
  points: PointRow[],
  shots: ShotRow[],
  setPointFor: Map<number, "p1" | "p2">,
  isP1: boolean,
): StatsRow {
  const shotsByPoint = new Map<string, ShotRow[]>();
  for (const shot of shots) {
    const list = shotsByPoint.get(shot.point_id) ?? [];
    list.push(shot);
    shotsByPoint.set(shot.point_id, list);
  }
  const pointById = new Map(points.map((p) => [p.id, p]));
  const wonBy = (p: PointRow) => p.won_by_player1 === isP1;
  const count = (test: (p: PointRow) => boolean) => points.filter(test).length;
  const countShots = (test: (shot: ShotRow, p: PointRow) => boolean) =>
    shots.filter((shot) => {
      const p = pointById.get(shot.point_id);
      return p !== undefined && test(shot, p);
    }).length;
  const serves = (
    type: string,
    mine: boolean,
    extra?: (shot: ShotRow, p: PointRow) => boolean,
  ) =>
    countShots(
      (shot, p) =>
        shot.shot_type === type &&
        (shot.is_player1 === isP1) === mine &&
        (extra ? extra(shot, p) : true),
    );
  const isIn = (shot: ShotRow) => shot.result === "In";

  /** Games (by set and game number) the given seat served, and how each ended for it. */
  const games = (serverIsMine: boolean) => {
    const last = new Map<string, PointRow>();
    for (const p of points) {
      if ((p.server_is_player1 === isP1) !== serverIsMine) continue;
      last.set(`${p.set_number}:${p.game_number}`, p);
    }
    return [...last.values()];
  };
  const serviceGames = games(true);
  const returnGames = games(false);

  const returnsOf = (zone: string) =>
    countShots(
      (shot, p) =>
        shot.shot_number === 2 &&
        shot.is_player1 === isP1 &&
        shot.is_player1 !== p.server_is_player1 &&
        shot.zone === zone,
    );
  const returnsIn = (serveType: string) =>
    countShots((shot, p) => {
      if (shot.shot_number !== 2 || shot.is_player1 !== isP1) return false;
      if (shot.is_player1 === p.server_is_player1 || !isIn(shot)) return false;
      return (shotsByPoint.get(p.id) ?? []).some(
        (serve) =>
          serve.shot_number === 1 &&
          serve.shot_type === serveType &&
          isIn(serve),
      );
    });
  // `public.net_attempt_shot` with no measured position, which is every shot
  // here: a volley or an overhead counts, and a groundstroke cannot.
  const cameToNet = (p: PointRow) =>
    (shotsByPoint.get(p.id) ?? []).some((shot) => {
      if (shot.is_player1 !== isP1) return false;
      if (["First Serve", "Second Serve", "Feed"].includes(shot.shot_type)) {
        return false;
      }
      const type = shot.shot_type.trim().toLowerCase();
      return type.includes("volley") || type === "overhead";
    });
  const volleyed = (p: PointRow) =>
    (shotsByPoint.get(p.id) ?? []).some(
      (shot) => shot.is_player1 === isP1 && shot.shot_type === "Volley",
    );
  const mySeat = isP1 ? "p1" : "p2";
  const setPoints = (mine: boolean, won?: boolean) =>
    count((p) => {
      const holder = setPointFor.get(p.point_number);
      if (holder === undefined || (holder === mySeat) !== mine) return false;
      return won === undefined || wonBy(p) === won;
    });
  const rallyTotal = points.reduce((sum, p) => sum + p.rally_length, 0);

  return {
    id: fixtureId(`m${slot}:stats:${isP1 ? "p1" : "p2"}`),
    match_id: matchId,
    is_player1: isP1,
    aces: count((p) => p.result_type === "Ace" && wonBy(p)),
    double_faults: count(
      (p) => p.result_type === "Double Fault" && p.server_is_player1 === isP1,
    ),
    winners: count((p) => p.result_type.includes("Winner") && wonBy(p)),
    unforced_errors: count(
      (p) => p.result_type.includes("Unforced Error") && !wonBy(p),
    ),
    forced_errors: count(
      (p) => p.result_type.includes("Forced Error") && !wonBy(p),
    ),
    avg_rally_length: Math.round((rallyTotal / points.length) * 10) / 10,
    first_serves: serves("First Serve", true),
    first_serves_in: serves("First Serve", true, isIn),
    first_serve_points_won: serves(
      "First Serve",
      true,
      (shot, p) => isIn(shot) && wonBy(p),
    ),
    second_serves: serves("Second Serve", true),
    second_serves_in: serves("Second Serve", true, isIn),
    second_serve_points_won: serves(
      "Second Serve",
      true,
      (shot, p) => isIn(shot) && wonBy(p),
    ),
    service_games: serviceGames.length,
    service_games_won: serviceGames.filter(wonBy).length,
    first_returns: serves("First Serve", false, isIn),
    first_returns_in: returnsIn("First Serve"),
    first_return_points_won: serves(
      "First Serve",
      false,
      (shot, p) => isIn(shot) && wonBy(p),
    ),
    second_returns: serves("Second Serve", false, isIn),
    second_returns_in: returnsIn("Second Serve"),
    second_return_points_won: serves(
      "Second Serve",
      false,
      (shot, p) => isIn(shot) && wonBy(p),
    ),
    return_games: returnGames.length,
    return_games_won: returnGames.filter(wonBy).length,
    break_points_faced: count(
      (p) => p.is_break_point && p.server_is_player1 === isP1,
    ),
    break_points_saved: count(
      (p) => p.is_break_point && p.server_is_player1 === isP1 && wonBy(p),
    ),
    break_point_opportunities: count(
      (p) => p.is_break_point && p.server_is_player1 !== isP1,
    ),
    break_points_converted: count(
      (p) => p.is_break_point && p.server_is_player1 !== isP1 && wonBy(p),
    ),
    set_points_faced: setPoints(false),
    set_points_saved: setPoints(false, true),
    set_point_opportunities: setPoints(true),
    set_points_converted: setPoints(true, true),
    total_points: points.length,
    total_points_won: count(wonBy),
    service_winners: count(
      (p) => p.result_type === "Service Winner" && wonBy(p),
    ),
    forehand_winners: count(
      (p) => p.result_type === "Forehand Winner" && wonBy(p),
    ),
    backhand_winners: count(
      (p) => p.result_type === "Backhand Winner" && wonBy(p),
    ),
    forehand_unforced_errors: count(
      (p) => p.result_type === "Forehand Unforced Error" && !wonBy(p),
    ),
    backhand_unforced_errors: count(
      (p) => p.result_type === "Backhand Unforced Error" && !wonBy(p),
    ),
    volley_winners: count(
      (p) => wonBy(p) && p.result_type.includes("Winner") && volleyed(p),
    ),
    net_points_appearances: count(cameToNet),
    net_points_won: count((p) => wonBy(p) && cameToNet(p)),
    serve_wide: countShots(
      (shot) =>
        shot.shot_type.endsWith("Serve") &&
        shot.is_player1 === isP1 &&
        shot.zone === "Wide",
    ),
    serve_body: countShots(
      (shot) =>
        shot.shot_type.endsWith("Serve") &&
        shot.is_player1 === isP1 &&
        shot.zone === "Body",
    ),
    serve_t: countShots(
      (shot) =>
        shot.shot_type.endsWith("Serve") &&
        shot.is_player1 === isP1 &&
        shot.zone === "T",
    ),
    return_cross_court: returnsOf("Crosscourt"),
    return_down_the_line: returnsOf("Down the Line"),
    return_middle: returnsOf("Middle"),
    return_contact_inside: 0,
    return_contact_middle: 0,
    return_contact_deep: 0,
    created_at: stamp,
    updated_at: stamp,
  };
}

// ---------------------------------------------------------------------------
// One match, start to finish
// ---------------------------------------------------------------------------

function buildMatch(spec: MatchSpec): BuiltMatch {
  const rng = makeRng(`match:${spec.slot}`);
  const opponent: Opponent = OPPONENTS[spec.opponent];
  const params = paramsFor(spec);
  const matchId = fixtureId(`match:${spec.slot}`);
  const start = Date.parse(spec.date);

  const drafts = buildPointSkeleton(rng, spec, params);
  assignServes(
    rng,
    drafts.filter((p) => p.serverIsMe),
    true,
    spec.firstServePct,
    spec.secondServeWon,
  );
  assignServes(
    rng,
    drafts.filter((p) => !p.serverIsMe),
    false,
    params.oppFirstServePct,
    params.oppSecondServeWon,
  );
  assignEndings(rng, drafts, params);

  const points: PointRow[] = [];
  const shots: ShotRow[] = [];
  const setPointFor = new Map<number, "p1" | "p2">();
  for (const p of drafts) {
    const id = fixtureId(`m${spec.slot}:p${p.n}`);
    const at = start + p.n * 40_000;
    points.push({
      id,
      match_id: matchId,
      point_number: p.n,
      set_number: p.set,
      game_number: p.game,
      set_score: p.setScore,
      game_score: p.gameScore,
      point_score: p.pointScore,
      server_is_player1: p.serverIsMe === spec.meIsP1,
      won_by_player1: p.wonByMe === spec.meIsP1,
      is_break_point: p.breakPoint,
      is_set_point: p.setPointFor !== null,
      is_match_point: p.matchPoint,
      rally_length: p.rally,
      result_type: p.resultType,
      created_at: new Date(at).toISOString(),
    });
    if (p.setPointFor !== null) {
      setPointFor.set(
        p.n,
        (p.setPointFor === "me") === spec.meIsP1 ? "p1" : "p2",
      );
    }
    shots.push(
      ...buildShots(rng, spec, p, id, (index) =>
        new Date(at + index * 1_000).toISOString(),
      ),
    );
  }

  const mine = (pick_: (set: SetSpec) => number) => spec.sets.map(pick_);
  const meGames = mine((set) => set.me);
  const oppGames = mine((set) => set.opp);
  const meTiebreaks = mine((set) => set.tbMe ?? 0);
  const oppTiebreaks = mine((set) => set.tbOpp ?? 0);
  const lastGame = points[points.length - 1].game_number;

  const match: MatchRow = {
    id: matchId,
    player1_name: spec.meIsP1 ? ME_NAME : opponent.name,
    player2_name: spec.meIsP1 ? opponent.name : ME_NAME,
    player1_id: spec.meIsP1 ? VERIFIER_USER_ID : null,
    player2_id: spec.meIsP1 ? null : VERIFIER_USER_ID,
    date: spec.date,
    round: spec.round,
    score: {
      player1: spec.meIsP1 ? meGames : oppGames,
      player2: spec.meIsP1 ? oppGames : meGames,
      player1_tiebreaks: spec.meIsP1 ? meTiebreaks : oppTiebreaks,
      player2_tiebreaks: spec.meIsP1 ? oppTiebreaks : meTiebreaks,
    },
    tournament_name: spec.tournament,
    format: { best_of: 3, ad_scoring: true, play_on_lets: false },
    result: iWon(spec) ? "won" : "lost",
    created_by: VERIFIER_USER_ID,
    program_id: null,
    source_provider: "swing-vision",
    analysis_method: null,
    match_type: spec.matchType,
    court_type: spec.court,
    verified: false,
    duration: points.length * 40_000 + lastGame * 30_000,
    opponent_hand: opponent.hand,
    opponent_backhand: opponent.backhand,
    player_hand: "right",
    player_backhand: "two-handed",
  };

  const stamp = new Date(start).toISOString();
  const statsFor = (isP1: boolean) =>
    computeStats(spec.slot, matchId, stamp, points, shots, setPointFor, isP1);
  return {
    spec,
    opponent,
    match,
    points,
    shots,
    stats: [statsFor(true), statsFor(false)],
    setPointFor,
  };
}

// ---------------------------------------------------------------------------
// Validation: fails the run, dry or not
// ---------------------------------------------------------------------------

const pct = (part: number, whole: number): number | null =>
  whole > 0 ? Math.round((1000 * part) / whole) / 10 : null;

interface RallyBands {
  short: [won: number, total: number];
  medium: [won: number, total: number];
  long: [won: number, total: number];
}

/** The rally bands exactly as match_stats_with_percentages counts them. */
function rallyBands(points: PointRow[], isP1: boolean): RallyBands {
  const band = (low: number, high: number): [number, number] => {
    const inBand = points.filter(
      (p) => p.rally_length >= low && p.rally_length <= high,
    );
    return [
      inBand.filter((p) => p.won_by_player1 === isP1).length,
      inBand.length,
    ];
  };
  return { short: band(1, 4), medium: band(5, 9), long: band(10, Infinity) };
}

/** Every `_pct` the view computes that has a numerator and a denominator here. */
function viewPercentages(
  row: StatsRow,
  bands: RallyBands,
): Record<string, number | null> {
  const serves = row.serve_wide + row.serve_body + row.serve_t;
  const returns =
    row.return_cross_court + row.return_down_the_line + row.return_middle;
  const contact =
    row.return_contact_inside +
    row.return_contact_middle +
    row.return_contact_deep;
  return {
    first_serve_pct: pct(row.first_serves_in, row.first_serves),
    first_serve_won_pct: pct(row.first_serve_points_won, row.first_serves_in),
    second_serve_won_pct: pct(
      row.second_serve_points_won,
      row.second_serves_in,
    ),
    service_games_won_pct: pct(row.service_games_won, row.service_games),
    first_return_in_pct: pct(row.first_returns_in, row.first_returns),
    second_return_in_pct: pct(row.second_returns_in, row.second_returns),
    first_return_won_pct: pct(row.first_return_points_won, row.first_returns),
    second_return_won_pct: pct(
      row.second_return_points_won,
      row.second_returns,
    ),
    return_games_won_pct: pct(row.return_games_won, row.return_games),
    break_points_saved_pct: pct(row.break_points_saved, row.break_points_faced),
    break_points_converted_pct: pct(
      row.break_points_converted,
      row.break_point_opportunities,
    ),
    set_points_saved_pct: pct(row.set_points_saved, row.set_points_faced),
    set_points_converted_pct: pct(
      row.set_points_converted,
      row.set_point_opportunities,
    ),
    total_points_won_pct: pct(row.total_points_won, row.total_points),
    short_rally_won_pct: pct(...bands.short),
    medium_rally_won_pct: pct(...bands.medium),
    long_rally_won_pct: pct(...bands.long),
    serve_wide_pct: pct(row.serve_wide, serves),
    serve_body_pct: pct(row.serve_body, serves),
    serve_t_pct: pct(row.serve_t, serves),
    return_cross_court_pct: pct(row.return_cross_court, returns),
    return_down_the_line_pct: pct(row.return_down_the_line, returns),
    return_middle_pct: pct(row.return_middle, returns),
    return_contact_inside_pct: pct(row.return_contact_inside, contact),
    return_contact_middle_pct: pct(row.return_contact_middle, contact),
    return_contact_deep_pct: pct(row.return_contact_deep, contact),
  };
}

function validateMatch(built: BuiltMatch): string[] {
  const { spec, match, points, shots, stats } = built;
  const problems: string[] = [];
  const check = (ok: boolean, message: string) => {
    if (!ok) problems.push(`match ${spec.slot}: ${message}`);
  };

  check(match.created_by === VERIFIER_USER_ID, "not created by the verifier");
  check(match.program_id === null, "has a program");
  check(SEEDED_MATCH_IDS.includes(match.id), "id is outside the seeded slots");
  check(
    (match.player1_id === VERIFIER_USER_ID) !==
      (match.player2_id === VERIFIER_USER_ID),
    "the verifier must sit in exactly one seat",
  );

  // The points replay to the stored score: who won each game and each set.
  points.forEach((p, i) => {
    check(
      p.point_number === i + 1,
      `point ${i + 1} is numbered ${p.point_number}`,
    );
    check(p.rally_length >= 1, `point ${p.point_number} has no rally length`);
  });
  const gameNumbers = [...new Set(points.map((p) => p.game_number))];
  check(
    gameNumbers.every((g, i) => g === i + 1),
    "game numbers are not a cumulative 1..n run",
  );
  let previousOpener: boolean | null = null;
  const tally = match.score.player1.map(() => [0, 0]);
  for (const game of gameNumbers) {
    const inGame = points.filter((p) => p.game_number === game);
    const set = inGame[0].set_number;
    check(
      inGame.every((p) => p.set_number === set),
      `game ${game} spans two sets`,
    );
    const servers = new Set(inGame.map((p) => p.server_is_player1));
    const p1 = inGame.filter((p) => p.won_by_player1).length;
    const p2 = inGame.length - p1;
    const games1 = tally[set - 1][0];
    const games2 = tally[set - 1][1];
    const tiebreak = games1 === 6 && games2 === 6;
    if (tiebreak) {
      check(servers.size === 2, `tiebreak game ${game} has one server`);
      check(
        Math.max(p1, p2) >= 7 && Math.abs(p1 - p2) >= 2,
        `tiebreak game ${game} ends ${p1}-${p2}`,
      );
      check(
        match.score.player1_tiebreaks[set - 1] === p1 &&
          match.score.player2_tiebreaks[set - 1] === p2,
        `tiebreak game ${game} does not match the stored tiebreak score`,
      );
      check(
        inGame.every((p) => !p.is_break_point),
        `tiebreak game ${game} carries a break point`,
      );
    } else {
      check(servers.size === 1, `game ${game} has two servers`);
      check(
        Math.max(p1, p2) >= 4 && Math.abs(p1 - p2) >= 2,
        `game ${game} ends ${p1}-${p2}`,
      );
      let server = 0;
      let returner = 0;
      for (const p of inGame) {
        check(
          p.is_break_point === (returner >= 3 && returner - server >= 1),
          `point ${p.point_number}: break-point flag is wrong`,
        );
        if (p.won_by_player1 === p.server_is_player1) server++;
        else returner++;
      }
    }
    const opener = inGame[0].server_is_player1;
    check(
      previousOpener === null || opener !== previousOpener,
      `game ${game} does not alternate the serve`,
    );
    previousOpener = opener;
    const last = inGame[inGame.length - 1];
    tally[set - 1][last.won_by_player1 ? 0 : 1]++;
  }
  tally.forEach(([games1, games2], i) => {
    check(
      games1 === match.score.player1[i] && games2 === match.score.player2[i],
      `set ${i + 1} replays to ${games1}-${games2}, stored ${match.score.player1[i]}-${match.score.player2[i]}`,
    );
  });
  const sets1 = tally.filter(([a, b]) => a > b).length;
  const p1Won = sets1 * 2 > tally.length;
  check(
    p1Won === (iWon(spec) === spec.meIsP1),
    "the score names the wrong winner",
  );
  const finalPoint = points[points.length - 1];
  check(
    finalPoint.is_match_point && finalPoint.is_set_point,
    "the last point is not flagged match point",
  );
  check(
    finalPoint.won_by_player1 === p1Won,
    "the last point went to the loser",
  );
  for (const p of points) {
    check(
      !p.is_match_point || p.is_set_point,
      `point ${p.point_number}: match point but not set point`,
    );
  }

  // Shots agree with their point.
  const byPoint = new Map<string, ShotRow[]>();
  for (const shot of shots) {
    byPoint.set(shot.point_id, [...(byPoint.get(shot.point_id) ?? []), shot]);
  }
  for (const p of points) {
    const own = byPoint.get(p.id) ?? [];
    const first = own.filter((shot) => shot.shot_type === "First Serve");
    const second = own.filter((shot) => shot.shot_type === "Second Serve");
    const where = `point ${p.point_number}`;
    check(first.length === 1, `${where} has ${first.length} first serves`);
    check(
      second.length === (first[0]?.result === "In" ? 0 : 1),
      `${where}: second serve does not follow the first`,
    );
    check(
      [...first, ...second].every(
        (shot) =>
          shot.is_player1 === p.server_is_player1 && shot.shot_number === 1,
      ),
      `${where}: a serve by the returner`,
    );
    check(
      (p.result_type === "Double Fault") ===
        (second[0] !== undefined && second[0].result !== "In"),
      `${where}: double fault and serves disagree`,
    );
    check(
      own.length - first.length - second.length === p.rally_length - 1,
      `${where}: ${own.length} shots for a rally of ${p.rally_length}`,
    );
    const lastShot = own[own.length - 1];
    const lastByServer = lastShot.is_player1 === p.server_is_player1;
    const serverWon = p.won_by_player1 === p.server_is_player1;
    check(
      (lastShot.result === "In") === (lastByServer === serverWon),
      `${where}: the last shot and the winner disagree`,
    );
  }

  // The identities the percentages view leans on.
  const [a, b] = stats;
  for (const [row, other] of [
    [a, b],
    [b, a],
  ] as const) {
    const who = row.is_player1 ? "player 1" : "player 2";
    const atMost = (part: keyof StatsRow, whole: keyof StatsRow) =>
      check(
        (row[part] as number) <= (row[whole] as number),
        `${who}: ${part} ${String(row[part])} exceeds ${whole} ${String(row[whole])}`,
      );
    atMost("first_serves_in", "first_serves");
    atMost("first_serve_points_won", "first_serves_in");
    atMost("second_serves_in", "second_serves");
    atMost("second_serve_points_won", "second_serves_in");
    atMost("service_games_won", "service_games");
    atMost("return_games_won", "return_games");
    atMost("first_returns_in", "first_returns");
    atMost("second_returns_in", "second_returns");
    atMost("first_return_points_won", "first_returns");
    atMost("second_return_points_won", "second_returns");
    atMost("break_points_saved", "break_points_faced");
    atMost("break_points_converted", "break_point_opportunities");
    atMost("set_points_saved", "set_points_faced");
    atMost("set_points_converted", "set_point_opportunities");
    atMost("total_points_won", "total_points");
    atMost("net_points_won", "net_points_appearances");
    atMost("volley_winners", "winners");
    const served = points.filter((p) => p.server_is_player1 === row.is_player1);
    check(
      row.first_serves === served.length,
      `${who}: first serves ≠ points served`,
    );
    check(
      row.second_serves === row.first_serves - row.first_serves_in,
      `${who}: second serves ≠ first-serve faults`,
    );
    check(
      row.double_faults === row.second_serves - row.second_serves_in,
      `${who}: double faults ≠ second-serve faults`,
    );
    check(
      row.first_serve_points_won + row.second_serve_points_won ===
        served.filter((p) => p.won_by_player1 === row.is_player1).length,
      `${who}: serve points won do not add up to the points`,
    );
    check(row.first_returns === other.first_serves_in, `${who}: first returns`);
    check(
      row.second_returns === other.second_serves_in,
      `${who}: second returns`,
    );
    check(
      row.first_return_points_won + other.first_serve_points_won ===
        row.first_returns,
      `${who}: first-return points`,
    );
    check(
      row.second_return_points_won + other.second_serve_points_won ===
        row.second_returns,
      `${who}: second-return points`,
    );
    check(
      row.break_points_faced === other.break_point_opportunities,
      `${who}: break points faced`,
    );
    check(
      row.break_points_faced - row.break_points_saved ===
        other.break_points_converted,
      `${who}: break points lost`,
    );
    check(
      row.set_points_faced === other.set_point_opportunities,
      `${who}: set points faced`,
    );
    check(
      row.set_points_faced - row.set_points_saved ===
        other.set_points_converted,
      `${who}: set points lost`,
    );
    check(row.return_games === other.service_games, `${who}: return games`);
    check(row.total_points === points.length, `${who}: total points`);
    check(
      row.total_points_won ===
        points.filter((p) => p.won_by_player1 === row.is_player1).length,
      `${who}: total points won`,
    );
    check(
      row.winners >=
        row.forehand_winners + row.backhand_winners + row.service_winners,
      `${who}: winners below their parts`,
    );
    check(
      row.unforced_errors ===
        row.forehand_unforced_errors + row.backhand_unforced_errors,
      `${who}: unforced errors ≠ forehand + backhand`,
    );
    check(
      row.serve_wide + row.serve_body + row.serve_t ===
        row.first_serves + row.second_serves,
      `${who}: serve directions ≠ serves hit`,
    );
    const bands = rallyBands(points, row.is_player1);
    check(
      bands.short[1] + bands.medium[1] + bands.long[1] === points.length,
      `${who}: a point falls outside the rally bands`,
    );
    check(
      bands.short[0] + bands.medium[0] + bands.long[0] === row.total_points_won,
      `${who}: rally-band wins ≠ points won`,
    );
    for (const [name, value] of Object.entries(viewPercentages(row, bands))) {
      check(
        value === null || (value >= 0 && value <= 100),
        `${who}: ${name} is ${String(value)}`,
      );
    }
  }
  check(
    a.total_points_won + b.total_points_won === a.total_points,
    "points won do not sum to total points",
  );
  check(
    a.total_points === b.total_points,
    "the two sides disagree on total points",
  );
  return problems;
}

function validateSeason(season: BuiltMatch[]): string[] {
  const problems = season.flatMap(validateMatch);
  const names = new Set(season.map((m) => m.opponent.name));
  const ids = season.flatMap((m) => [
    m.match.id,
    ...m.points.map((p) => p.id),
    ...m.shots.map((shot) => shot.id),
    ...m.stats.map((row) => row.id),
  ]);
  if (new Set(ids).size !== ids.length)
    problems.push("season: duplicate row ids");
  if (season.length !== 14)
    problems.push(`season: ${season.length} matches, expected 14`);
  if (names.size !== 9)
    problems.push(`season: ${names.size} opponents, expected 9`);
  if (season.filter((m) => !m.spec.meIsP1).length !== 4) {
    problems.push("season: the verifier should be player 2 in four matches");
  }
  return problems;
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

const myStats = (built: BuiltMatch): StatsRow =>
  built.stats[built.spec.meIsP1 ? 0 : 1];

function scoreText(spec: MatchSpec): string {
  return spec.sets
    .map((set) =>
      set.tbMe === undefined
        ? `${set.me}-${set.opp}`
        : `${set.me}-${set.opp}(${Math.min(set.tbMe, set.tbOpp ?? 0)})`,
    )
    .join(" ");
}

const show = (value: number | null): string =>
  value === null ? "  n/a" : `${value.toFixed(1).padStart(5)}`;

function sumPct(
  rows: StatsRow[],
  part: keyof StatsRow,
  whole: keyof StatsRow,
): number | null {
  const total = (key: keyof StatsRow) =>
    rows.reduce((sum, row) => sum + (row[key] as number), 0);
  return pct(total(part), total(whole));
}

function printSummary(season: BuiltMatch[]): void {
  const header = [
    "date".padEnd(10),
    "opponent".padEnd(16),
    "hand".padEnd(5),
    "surface".padEnd(18),
    "seat",
    "score".padEnd(16),
    "res",
    " 1st%",
    "2ndW%",
    "win",
    " ue",
    "pts",
  ].join("  ");
  console.log(header);
  console.log("-".repeat(header.length));
  for (const built of season) {
    const { spec, opponent } = built;
    const mine = myStats(built);
    console.log(
      [
        spec.date.slice(0, 10),
        opponent.name.padEnd(16),
        opponent.hand.padEnd(5),
        spec.court.padEnd(18),
        spec.meIsP1 ? "P1  " : "P2  ",
        scoreText(spec).padEnd(16),
        iWon(spec) ? "W  " : "L  ",
        show(pct(mine.first_serves_in, mine.first_serves)),
        show(pct(mine.second_serve_points_won, mine.second_serves_in)),
        String(mine.winners).padStart(3),
        String(mine.unforced_errors).padStart(3),
        String(mine.total_points).padStart(3),
      ].join("  "),
    );
  }
  const wins = season.filter((m) => iWon(m.spec)).length;
  const count = (rows: (m: BuiltMatch) => number) =>
    season.reduce((sum, m) => sum + rows(m), 0);
  console.log(
    `\nTotals: ${season.length} matches, record ${wins}-${season.length - wins}; ` +
      `${count((m) => m.points.length)} points, ${count((m) => m.shots.length)} shots, ` +
      `${count((m) => m.stats.length)} match_stats rows.`,
  );
  // Verified by Advantage is granted only by Advantage, never by a seed.
  console.log(
    `verified: ${[...new Set(season.map((m) => m.match.verified))].join(", ")}`,
  );
}

function printPatterns(season: BuiltMatch[]): void {
  const record = (matches: BuiltMatch[]) => {
    const wins = matches.filter((m) => iWon(m.spec)).length;
    return `${wins}-${matches.length - wins}`;
  };
  const mine = (matches: BuiltMatch[]) => matches.map(myStats);
  const rallies = (matches: BuiltMatch[], band: keyof RallyBands) => {
    let won = 0;
    let total = 0;
    for (const m of matches) {
      const [w, t] = rallyBands(m.points, m.spec.meIsP1)[band];
      won += w;
      total += t;
    }
    return `${show(pct(won, total)).trim()}% (${won}/${total})`;
  };
  const ratio = (
    matches: BuiltMatch[],
    part: keyof StatsRow,
    whole: keyof StatsRow,
  ) => {
    const total = (key: keyof StatsRow) =>
      mine(matches).reduce((sum, row) => sum + (row[key] as number), 0);
    return `${show(sumPct(mine(matches), part, whole)).trim()}% (${total(part)}/${total(whole)})`;
  };

  console.log("\nPatterns");
  console.log("(a) first-serve % by month:");
  const months = [...new Set(season.map((m) => m.spec.date.slice(0, 7)))];
  for (const month of months) {
    const inMonth = season.filter((m) => m.spec.date.startsWith(month));
    console.log(
      `      ${month}  ${ratio(inMonth, "first_serves_in", "first_serves")}`,
    );
  }

  const lefties = season.filter((m) => m.opponent.hand === "left");
  const righties = season.filter((m) => m.opponent.hand === "right");
  console.log("(b) second-serve points won:");
  console.log(
    `      vs left-handers   ${ratio(lefties, "second_serve_points_won", "second_serves_in")}  over ${lefties.length} matches, record ${record(lefties)}`,
  );
  console.log(
    `      vs right-handers  ${ratio(righties, "second_serve_points_won", "second_serves_in")}  over ${righties.length} matches, record ${record(righties)}`,
  );

  const nemesis = season.filter((m) => m.spec.opponent === NEMESIS);
  const others = season.filter((m) => m.spec.opponent !== NEMESIS);
  console.log(`(c) vs ${OPPONENTS[NEMESIS].name}: record ${record(nemesis)}`);
  console.log(
    `      break points converted  ${ratio(nemesis, "break_points_converted", "break_point_opportunities")}   everyone else ${ratio(others, "break_points_converted", "break_point_opportunities")}`,
  );
  console.log(
    `      short rallies won       ${rallies(nemesis, "short")}   everyone else ${rallies(others, "short")}`,
  );
  for (const m of nemesis) {
    const row = myStats(m);
    const [won, total] = rallyBands(m.points, m.spec.meIsP1).short;
    console.log(
      `      ${m.spec.date.slice(0, 10)}  ${scoreText(m.spec).padEnd(12)} break points ${row.break_points_converted}/${row.break_point_opportunities}, short rallies ${won}/${total}`,
    );
  }

  const clay = season.filter((m) => m.spec.court === "Clay Court");
  const hard = season.filter((m) => m.spec.court !== "Clay Court");
  console.log("(d) record by surface:");
  console.log(`      hard (indoor + outdoor)  ${record(hard)}`);
  console.log(`      clay                     ${record(clay)}`);

  console.log("(e) rallies won by length:");
  console.log(`      short  (1-4)   ${rallies(season, "short")}`);
  console.log(`      medium (5-9)   ${rallies(season, "medium")}`);
  console.log(`      long   (10+)   ${rallies(season, "long")}`);
}

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

interface Counts {
  matches: number;
  match_stats: number;
  points: number;
  shots: number;
}

function printCounts(verb: string, counts: Counts): void {
  console.log(
    `${verb}: matches ${counts.matches}, match_stats ${counts.match_stats}, ` +
      `points ${counts.points}, shots ${counts.shots}`,
  );
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size));
  return out;
}

async function personalMatchCount(db: Db): Promise<number> {
  const { count, error } = await db
    .from("matches")
    .select("id", { count: "exact", head: true })
    .eq("created_by", VERIFIER_USER_ID)
    .is("program_id", null);
  if (error) throw new Error(`count matches: ${error.message}`);
  return count ?? 0;
}

/** Delete the seeded matches and everything under them; nothing else. */
async function removeSeeded(db: Db): Promise<Counts> {
  const counts: Counts = { matches: 0, match_stats: 0, points: 0, shots: 0 };
  const found = await seededMatches(db, "select");
  if (found.error)
    throw new Error(`find seeded matches: ${found.error.message}`);
  const matchIds = (found.data ?? []).map((row) => String(row.id));
  if (matchIds.some((id) => !SEEDED_MATCH_IDS.includes(id))) {
    throw new Error("Refusing to delete: a selected match is not a seeded id.");
  }

  for (const matchId of matchIds) {
    const pointIds: string[] = [];
    for (let from = 0; ; from += 1000) {
      const page = await db
        .from("points")
        .select("id")
        .eq("match_id", matchId)
        .order("point_number")
        .range(from, from + 999);
      if (page.error) throw new Error(`read points: ${page.error.message}`);
      pointIds.push(...(page.data ?? []).map((row) => String(row.id)));
      if ((page.data ?? []).length < 1000) break;
    }
    for (const batch of chunks(pointIds, 100)) {
      const gone = await db
        .from("shots")
        .delete({ count: "exact" })
        .in("point_id", batch);
      if (gone.error) throw new Error(`delete shots: ${gone.error.message}`);
      counts.shots += gone.count ?? 0;
    }
    const points = await db
      .from("points")
      .delete({ count: "exact" })
      .eq("match_id", matchId);
    if (points.error) throw new Error(`delete points: ${points.error.message}`);
    counts.points += points.count ?? 0;
    const stats = await db
      .from("match_stats")
      .delete({ count: "exact" })
      .eq("match_id", matchId);
    if (stats.error)
      throw new Error(`delete match_stats: ${stats.error.message}`);
    counts.match_stats += stats.count ?? 0;
  }

  if (matchIds.length > 0) {
    const gone = await seededMatches(db, "delete");
    if (gone.error) throw new Error(`delete matches: ${gone.error.message}`);
    counts.matches = gone.count ?? 0;
  }
  return counts;
}

async function insertRows(
  db: Db,
  table: string,
  rows: readonly object[],
): Promise<number> {
  for (const batch of chunks(rows, 500)) {
    const { error } = await db.from(table).insert(batch);
    if (error) throw new Error(`insert ${table}: ${error.message}`);
  }
  return rows.length;
}

async function openDatabase(): Promise<Db> {
  loadEnvLocal();
  for (const key of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
    if (!process.env[key])
      throw new Error(`Missing ${key} (set it in .env.local).`);
  }
  const db = createAdminClient();
  const { data, error } = await db.auth.admin.getUserById(VERIFIER_USER_ID);
  if (error) throw new Error(`read the verifier account: ${error.message}`);
  if (!data.user?.email?.endsWith("@example.com")) {
    throw new Error(
      "Refusing to run: the target account is not an example.com fixture.",
    );
  }
  console.log(
    `Project: ${new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").host}`,
  );
  return db;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

type Mode = "dry-run" | "apply" | "remove";

function parseMode(args: string[]): Mode {
  const known = new Map<string, Mode>([
    ["--dry-run", "dry-run"],
    ["--apply", "apply"],
    ["--remove", "remove"],
  ]);
  const unknown = args.filter((arg) => !known.has(arg));
  if (unknown.length > 0)
    throw new Error(`Unknown argument: ${unknown.join(" ")}`);
  const modes = [...new Set(args.map((arg) => known.get(arg)))];
  if (modes.length > 1)
    throw new Error("Pass one of --dry-run, --apply, --remove.");
  return modes[0] ?? "dry-run";
}

async function main(): Promise<void> {
  const mode = parseMode(process.argv.slice(2));
  assertVerifierTarget();

  const season = SEASON.map(buildMatch);
  const problems = validateSeason(season);
  const digest = createHash("sha256")
    .update(
      JSON.stringify(season.map((m) => [m.match, m.points, m.shots, m.stats])),
    )
    .digest("hex");

  if (mode !== "remove") {
    console.log(`Ask season fixture — ${mode}\n`);
    printSummary(season);
    printPatterns(season);
    console.log(
      `\nMarker: match ids in namespace "${SEED_NS}" (slot 1 = ${SEEDED_MATCH_IDS[0]})`,
    );
    console.log(`Digest: ${digest}`);
  }
  if (problems.length > 0) {
    console.error(`\nvalidation FAILED (${problems.length}):`);
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exitCode = 1;
    return;
  }
  console.log("\nvalidation passed");

  if (mode === "dry-run") {
    console.log(
      "Dry run: nothing was written. Pass --apply to seed, --remove to delete.",
    );
    return;
  }

  const db = await openDatabase();
  const before = await personalMatchCount(db);
  printCounts("Deleted (previous seed)", await removeSeeded(db));
  if (mode === "apply") {
    const inserted: Counts = {
      matches: await insertRows(
        db,
        "matches",
        season.map((m) => m.match),
      ),
      points: await insertRows(
        db,
        "points",
        season.flatMap((m) => m.points),
      ),
      shots: await insertRows(
        db,
        "shots",
        season.flatMap((m) => m.shots),
      ),
      match_stats: await insertRows(
        db,
        "match_stats",
        season.flatMap((m) => m.stats),
      ),
    };
    printCounts("Inserted", inserted);
  }
  const after = await personalMatchCount(db);
  console.log(
    `The verifier's personal matches: ${before} before, ${after} after.`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
