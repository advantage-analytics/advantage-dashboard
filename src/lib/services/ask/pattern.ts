import {
  ASK_VISUAL_FIELD_SEPARATOR,
  ASK_VISUAL_LINE_PREFIX,
  type AskRow,
} from "@/lib/services/ask/answer-render";
import { ASK_TABLE_ROWS } from "@/lib/services/ask/events";

/**
 * Shot patterns: "serve wide plus one down the line", "forehand crosscourt
 * then down the line within seven shots", "return down the line then a
 * volley".
 *
 * The model does not write SQL for these. A sequence over shots needs the
 * shots ordered within each point, each pinned to the right player, the
 * serve and return picked by role, and the stored spellings — and a slip in
 * any of them returns believable numbers. So the model only READS the
 * question into an {@link AskPattern} — a few fixed fields, every value from
 * a closed list, refused when it is not — and this module builds the query,
 * the answer and the Video link from it. The answer restates how the
 * question was read, so a misreading shows instead of hiding.
 *
 * The fields are the Video tab's filter sections, one for one: Serve (who
 * served, the zone, first or second), Return (stroke, zone), Custom (one
 * shot: hit by, stroke, direction, by which shot) and Then (a LATER shot in
 * the same point, the same fields). So every pattern answer can open the
 * same points in the Video view, and Ask never counts a pattern the video
 * cannot show. Each rule restates its twin in
 * src/components/dashboard/matches/match-detail/match-filters/model.ts:
 *
 *   - the serve is the serve PLAYED: the second serve when there is one,
 *     else the first (`pickServeShotBy`, serve-return-shots.ts);
 *   - the return is the first shot that is neither a serve nor a feed
 *     (`pickReturnShot`); its stroke is read from the label containing
 *     forehand or backhand, its zone is the stored zone;
 *   - a Custom/Then shot has shot_number >= 1, and its direction is
 *     ask.shots.direction — the Video filter's own (inside out and inside
 *     in apart, migration 20261014164825);
 *   - "within N shots" is shot_number <= N, where 1 is the serve.
 */

export type AskPatternPlayer = "mine" | "opponent";
export const ASK_PATTERN_STROKES = [
  "Forehand",
  "Backhand",
  "Volley",
  "Overhead",
] as const;
export type AskPatternStroke = (typeof ASK_PATTERN_STROKES)[number];
export const ASK_PATTERN_DIRECTIONS = [
  "Crosscourt",
  "Down the Line",
  "Inside Out",
  "Inside In",
  "Middle",
] as const;
export type AskPatternDirection = (typeof ASK_PATTERN_DIRECTIONS)[number];
export const ASK_PATTERN_SERVE_ZONES = ["Wide", "Body", "T"] as const;
export type AskPatternServeZone = (typeof ASK_PATTERN_SERVE_ZONES)[number];
export const ASK_PATTERN_RETURN_STROKES = ["Forehand", "Backhand"] as const;
export type AskPatternReturnStroke =
  (typeof ASK_PATTERN_RETURN_STROKES)[number];
export const ASK_PATTERN_RETURN_ZONES = [
  "Crosscourt",
  "Down the Line",
  "Middle",
] as const;
export type AskPatternReturnZone = (typeof ASK_PATTERN_RETURN_ZONES)[number];

/** The highest shot number "within N shots" may name — the Video filter's last. */
export const MAX_ASK_PATTERN_SHOT = 12;

export interface AskPatternServe {
  server: AskPatternPlayer | null;
  zones: AskPatternServeZone[];
  type: "first" | "second" | null;
}

export interface AskPatternReturn {
  strokes: AskPatternReturnStroke[];
  zones: AskPatternReturnZone[];
}

export interface AskPatternShot {
  player: AskPatternPlayer | null;
  strokes: AskPatternStroke[];
  directions: AskPatternDirection[];
  /** The latest shot number it may be (1 = the serve); null for any. */
  within: number | null;
}

export interface AskPattern {
  serve: AskPatternServe | null;
  returnShot: AskPatternReturn | null;
  /** Up to two shots, in order: the second comes later in the same point. */
  shots: AskPatternShot[];
}

// ── Which questions are patterns ─────────────────────────────────────────────

const SEQUENCE =
  /\b(?:then|followed by|after (?:a|the|my|his|her|their)|plus one|\+ ?1|serve \+|next shot|in a row|within (?:the first )?(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve) shots?)\b|\+\s?1\b/i;
const STROKE_WORD =
  /\b(?:forehands?|backhands?|volleys?|overheads?|smash(?:es)?|serves?|returns?)\b/i;
const DIRECTION_WORD =
  /\b(?:cross ?court|cross\b|down the line|dtl|inside[- ]out|inside[- ]in|middle|wide|body|(?:to|down) the t)\b/i;

/**
 * Whether the question names a shot pattern: a sequence ("then", "+1",
 * "within seven shots"), or a stroke with a direction ("forehand
 * crosscourt"). Losing plays — misses by stroke, with no sequence — are
 * `plays.ts`'s, and the caller asks that first.
 */
export function namesSequence(question: string): boolean {
  return SEQUENCE.test(question);
}

export function asksForPattern(question: string): boolean {
  if (SEQUENCE.test(question) && STROKE_WORD.test(question)) return true;
  return STROKE_WORD.test(question) && DIRECTION_WORD.test(question);
}

// ── Reading the model's reply ────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function player(value: unknown): AskPatternPlayer | null | undefined {
  if (value === null || value === undefined) return null;
  return value === "mine" || value === "opponent" ? value : undefined;
}

/** A list drawn from `allowed`, or undefined for anything else (refused). */
function listOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T[] | undefined {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) return undefined;
  const out: T[] = [];
  for (const item of value) {
    if (typeof item !== "string" || !allowed.includes(item as T)) {
      return undefined;
    }
    if (!out.includes(item as T)) out.push(item as T);
  }
  return out;
}

function readShot(value: unknown): AskPatternShot | undefined {
  if (!isRecord(value)) return undefined;
  const who = player(value.player);
  const strokes = listOf(value.strokes, ASK_PATTERN_STROKES);
  const directions = listOf(value.directions, ASK_PATTERN_DIRECTIONS);
  const within =
    value.within === null || value.within === undefined
      ? null
      : Number.isInteger(value.within) &&
          (value.within as number) >= 1 &&
          (value.within as number) <= MAX_ASK_PATTERN_SHOT
        ? (value.within as number)
        : undefined;
  if (
    who === undefined ||
    strokes === undefined ||
    directions === undefined ||
    within === undefined
  ) {
    return undefined;
  }
  return { player: who, strokes, directions, within };
}

function shotIsEmpty(shot: AskPatternShot): boolean {
  return (
    shot.player === null &&
    shot.strokes.length === 0 &&
    shot.directions.length === 0 &&
    shot.within === null
  );
}

/**
 * The model's `pattern` object as an {@link AskPattern}, or null when any
 * field is outside its list, a part is malformed, or nothing at all is
 * constrained. Never repaired: a value this does not know is a misreading.
 */
export function readAskPattern(value: unknown): AskPattern | null {
  if (!isRecord(value)) return null;

  let serve: AskPatternServe | null = null;
  if (value.serve !== null && value.serve !== undefined) {
    if (!isRecord(value.serve)) return null;
    const server = player(value.serve.server);
    const zones = listOf(value.serve.zones, ASK_PATTERN_SERVE_ZONES);
    const type =
      value.serve.type === null || value.serve.type === undefined
        ? null
        : value.serve.type === "first" || value.serve.type === "second"
          ? value.serve.type
          : undefined;
    if (server === undefined || zones === undefined || type === undefined) {
      return null;
    }
    if (server !== null || zones.length > 0 || type !== null) {
      serve = { server, zones, type };
    }
  }

  let returnShot: AskPatternReturn | null = null;
  if (value.return !== null && value.return !== undefined) {
    if (!isRecord(value.return)) return null;
    const strokes = listOf(value.return.strokes, ASK_PATTERN_RETURN_STROKES);
    const zones = listOf(value.return.zones, ASK_PATTERN_RETURN_ZONES);
    if (strokes === undefined || zones === undefined) return null;
    if (strokes.length > 0 || zones.length > 0) {
      returnShot = { strokes, zones };
    }
  }

  const rawShots = value.shots ?? [];
  if (!Array.isArray(rawShots) || rawShots.length > 2) return null;
  const shots: AskPatternShot[] = [];
  for (const raw of rawShots) {
    const shot = readShot(raw);
    if (shot === undefined) return null;
    if (!shotIsEmpty(shot)) shots.push(shot);
  }

  if (serve === null && returnShot === null && shots.length === 0) return null;
  // Two rules the reading prompt states, held here whatever the model wrote:
  // "then X" with no player named is the same player's next shot, and every
  // stroke listed is no stroke constraint at all.
  const [first, second] = shots;
  if (first && second && second.player === null) {
    shots[1] = { ...second, player: first.player };
  }
  for (const [index, shot] of shots.entries()) {
    if (shot.strokes.length === ASK_PATTERN_STROKES.length) {
      shots[index] = { ...shot, strokes: [] };
    }
  }
  return { serve, returnShot, shots };
}

// ── The query ────────────────────────────────────────────────────────────────

function quoted(values: readonly string[]): string {
  return values.map((value) => `'${value.replace(/'/g, "''")}'`).join(", ");
}

/**
 * The stroke test on a shot row `alias`: the Video filter's Stroke group,
 * which is `strokeOf()` in match-filters/model.ts — overhead (or smash)
 * first, then volley, then forehand, then backhand, so "Forehand Volley" is
 * a volley and nothing else.
 */
function strokeTest(alias: string, strokes: readonly AskPatternStroke[]) {
  const label = `lower(coalesce(${alias}.shot_type, ''))`;
  const overhead = `(${label} like '%overhead%' or ${label} like '%smash%')`;
  const volley = `${label} like '%volley%'`;
  const forehand = `${label} like '%forehand%'`;
  const one = (stroke: AskPatternStroke) => {
    switch (stroke) {
      case "Overhead":
        return overhead;
      case "Volley":
        return `(${volley} and not ${overhead})`;
      case "Forehand":
        return `(${forehand} and not ${volley} and not ${overhead})`;
      case "Backhand":
        return `(${label} like '%backhand%' and not ${forehand} and not ${volley} and not ${overhead})`;
    }
  };
  return `(${strokes.map(one).join(" or ")})`;
}

function shotConditions(alias: string, shot: AskPatternShot): string[] {
  const parts = [`${alias}.shot_number >= 1`];
  if (shot.player !== null) {
    parts.push(`${alias}.mine = ${shot.player === "mine" ? "true" : "false"}`);
  }
  if (shot.strokes.length > 0) parts.push(strokeTest(alias, shot.strokes));
  if (shot.directions.length > 0) {
    parts.push(`${alias}.direction in (${quoted(shot.directions)})`);
  }
  if (shot.within !== null)
    parts.push(`${alias}.shot_number <= ${shot.within}`);
  return parts;
}

const SAME_POINT = (alias: string) =>
  `${alias}.match_id = pt.match_id and ${alias}.point_number = pt.point_number`;

/**
 * The query for `pattern`, over `scope`: one row per match in scope that has
 * any shot recorded — `match_id`, `points` (how many of its points the
 * pattern came up on), `won` (how many of those the viewer's side won),
 * `won_pct`. A match with shots where the pattern never came up is a row of
 * zeros; a match with no shots is no row.
 */
export function patternSql(pattern: AskPattern): string {
  return `${patternCtes(pattern)},
covered as (select distinct match_id from sh)
select c.match_id,
  count(h.match_id) as points,
  count(h.match_id) filter (where h.i_won) as won,
  round(100.0 * count(h.match_id) filter (where h.i_won) / nullif(count(h.match_id), 0), 1) as won_pct
from covered c
left join hit h on h.match_id = c.match_id
group by c.match_id
order by points desc`;
}

/**
 * The points the pattern came up on, one row each (`match_id`,
 * `point_number`) — what the parity check (`scripts/ask-pattern-parity.ts`)
 * holds against the Video filter's own list. Never sent to the planner.
 */
export function patternPointsSql(pattern: AskPattern): string {
  return `${patternCtes(pattern)}
select match_id, point_number from hit order by match_id, point_number`;
}

/** The query's shared head: the shots read once, the points, and the points the pattern holds on (`hit`). */
/**
 * `raw`, `numbered` and `sh`: every shot in scope, with which serve was the
 * one played (`is_played_serve`: the second serve when there was one, else
 * the first), whether it is a stroke (`is_stroke`: not a serve or a feed),
 * and which stroke was the return (`is_return`). Shared by the pattern query
 * and the serve +1 breakdown (`serve-plus-one.ts`), so the two can never
 * disagree on what a return is.
 *
 * ask.shots is read once: the serve played and the return are picked with
 * window functions over each point, not with subqueries that would read the
 * view again per row.
 */
export const ASK_SHOT_ROLE_CTES = `raw as (
  select s.match_id, s.point_number, s.shot_number, s.mine, s.shot_type, s.zone, s.direction,
    coalesce(s.shot_type, '') not in ('First Serve', 'Second Serve', 'Feed') as is_stroke,
    bool_or(s.shot_type = 'Second Serve') over (partition by s.match_id, s.point_number) as had_second
  from ask.shots s
  where s.match_id in (select match_id from scope)
),
numbered as (
  select raw.*,
    min(case when raw.is_stroke then raw.shot_number end)
      over (partition by raw.match_id, raw.point_number) as first_stroke,
    count(*) filter (where raw.is_stroke)
      over (partition by raw.match_id, raw.point_number, raw.shot_number) as strokes_here
  from raw
),
sh as (
  -- The return is the first stroke, and only when one stroke alone holds
  -- that shot number: a point with several strokes stored at the same
  -- number (rally rows before the serve at 0) has no return that can be
  -- told apart, and is never read as having one.
  select numbered.*,
    numbered.shot_type = 'Second Serve'
      or (numbered.shot_type = 'First Serve' and not numbered.had_second) as is_played_serve,
    numbered.is_stroke and numbered.shot_number = numbered.first_stroke
      and numbered.strokes_here = 1 as is_return
  from numbered
)`;

function patternCtes(pattern: AskPattern): string {
  const where: string[] = [];
  const { serve, returnShot } = pattern;

  if (serve?.server) {
    where.push(`pt.i_served = ${serve.server === "mine" ? "true" : "false"}`);
  }
  if (serve && (serve.zones.length > 0 || serve.type !== null)) {
    const tests = [SAME_POINT("v"), "v.is_played_serve"];
    if (serve.zones.length > 0)
      tests.push(`v.zone in (${quoted(serve.zones)})`);
    if (serve.type !== null) {
      tests.push(
        `v.shot_type = '${serve.type === "first" ? "First Serve" : "Second Serve"}'`,
      );
    }
    where.push(`exists (select 1 from sh v where ${tests.join(" and ")})`);
  }
  if (returnShot) {
    const tests = [SAME_POINT("r"), "r.is_return"];
    if (returnShot.strokes.length > 0) {
      tests.push(
        `(${returnShot.strokes
          .map(
            (stroke) =>
              `lower(coalesce(r.shot_type, '')) like '%${stroke.toLowerCase()}%'`,
          )
          .join(" or ")})`,
      );
    }
    if (returnShot.zones.length > 0) {
      tests.push(`r.zone in (${quoted(returnShot.zones)})`);
    }
    where.push(`exists (select 1 from sh r where ${tests.join(" and ")})`);
  }
  const [first, second] = pattern.shots;
  if (first && second) {
    const inner = [
      SAME_POINT("b"),
      "b.shot_number > a.shot_number",
      ...shotConditions("b", second),
    ];
    where.push(
      `exists (select 1 from sh a where ${[
        SAME_POINT("a"),
        ...shotConditions("a", first),
      ].join(
        " and ",
      )} and exists (select 1 from sh b where ${inner.join(" and ")}))`,
    );
  } else if (first) {
    where.push(
      `exists (select 1 from sh a where ${[SAME_POINT("a"), ...shotConditions("a", first)].join(" and ")})`,
    );
  }

  return `with ${ASK_SHOT_ROLE_CTES},
pt as (
  select p.match_id, p.point_number, p.i_served, p.i_won
  from ask.points p
  where p.match_id in (select match_id from sh)
),
hit as (
  select pt.match_id, pt.point_number, pt.i_won from pt
  where ${where.length > 0 ? where.join("\n    and ") : "true"}
)`;
}

// ── Saying how the question was read ─────────────────────────────────────────

/** Who the sentences call each side. */
export interface AskPatternNames {
  /** "Emon van Loben Sels", or "you". */
  mine: string;
  /** "Eli Stephenson", or "the opponent". */
  opponent: string;
}

const DIRECTION_WORDS: Record<string, string> = {
  Crosscourt: "crosscourt",
  "Down the Line": "down the line",
  "Inside Out": "inside out",
  "Inside In": "inside in",
  Middle: "through the middle",
  Wide: "wide",
  Body: "into the body",
  T: "down the T",
};

function orList(words: readonly string[]): string {
  return words.length <= 1
    ? (words[0] ?? "")
    : `${words.slice(0, -1).join(", ")} or ${words[words.length - 1]}`;
}

const NUMBER_WORDS = [
  "",
  "first",
  "first two",
  "first three",
  "first four",
  "first five",
  "first six",
  "first seven",
  "first eight",
  "first nine",
  "first ten",
  "first eleven",
  "first twelve",
];

function who(side: AskPatternPlayer | null, names: AskPatternNames): string {
  return side === null ? "either player" : names[side];
}

function shotWords(shot: AskPatternShot, names: AskPatternNames): string {
  const stroke =
    shot.strokes.length > 0
      ? orList(shot.strokes.map((s) => s.toLowerCase()))
      : "shot";
  const direction =
    shot.directions.length > 0
      ? ` ${orList(shot.directions.map((d) => DIRECTION_WORDS[d] ?? d))}`
      : "";
  const within =
    shot.within === null
      ? ""
      : shot.within === 1
        ? " as the serve"
        : ` within the ${NUMBER_WORDS[shot.within]} shots`;
  const article = /^[aeiou]/.test(stroke) ? "an" : "a";
  return `${who(shot.player, names)} hit ${article} ${stroke}${direction}${within}`;
}

/**
 * The pattern in plain words, for the answer's first lines: "Emon van Loben
 * Sels served wide, then Emon van Loben Sels hit a forehand down the line".
 * Numbers in it are words — the answer renderer drops a digit it did not
 * substitute from a cell.
 */
export function describePattern(
  pattern: AskPattern,
  names: AskPatternNames,
): string {
  const parts: string[] = [];
  const { serve, returnShot, shots } = pattern;
  if (serve) {
    const kind =
      serve.type === "first"
        ? "a first serve"
        : serve.type === "second"
          ? "a second serve"
          : "a serve";
    const zone =
      serve.zones.length > 0
        ? ` ${orList(serve.zones.map((z) => DIRECTION_WORDS[z] ?? z))}`
        : "";
    parts.push(
      serve.server === null
        ? `${kind}${zone}`
        : `${who(serve.server, names)} hit ${kind}${zone}`,
    );
  }
  if (returnShot) {
    const stroke =
      returnShot.strokes.length > 0
        ? `${orList(returnShot.strokes.map((s) => s.toLowerCase()))} return`
        : "return";
    const zone =
      returnShot.zones.length > 0
        ? ` ${orList(returnShot.zones.map((z) => DIRECTION_WORDS[z] ?? z))}`
        : "";
    const returner =
      serve?.server === "mine"
        ? names.opponent
        : serve?.server === "opponent"
          ? names.mine
          : null;
    parts.push(
      returner
        ? `${returner} hit a ${stroke}${zone}`
        : `the ${stroke} went${zone || " in"}`,
    );
  }
  shots.forEach((shot, index) => {
    const text = shotWords(shot, names);
    parts.push(index === 1 ? `later in the point ${text}` : text);
  });
  return parts.join(", then ");
}

// ── The answer ───────────────────────────────────────────────────────────────

/** Fewer points than this and the answer says the sample is small. */
export const ASK_PATTERN_SMALL_SAMPLE = 10;

const S = ASK_VISUAL_FIELD_SEPARATOR;

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * The rows the answer is written over: a total first (server-summed from the
 * per-match rows, as `matches_in_scope` is server-counted), then the matches
 * the pattern came up in, most points first. Null when no match in scope has
 * a shot recorded — that is "no data", said by the caller.
 */
export function patternAnswerRows(
  rows: readonly AskRow[],
  matchesInScope: number,
): AskRow[] | null {
  if (rows.length === 0) return null;
  const points = rows.reduce((sum, row) => sum + count(row.points), 0);
  const won = rows.reduce((sum, row) => sum + count(row.won), 0);
  const total: AskRow = {
    match_id: null,
    points,
    won,
    won_pct: points === 0 ? null : Math.round((1000 * won) / points) / 10,
    matches_with_shots: rows.length,
    matches_in_scope: matchesInScope,
  };
  return [
    total,
    ...rows
      .filter((row) => count(row.points) > 0)
      .map((row) => ({ ...row, matches_in_scope: matchesInScope })),
  ];
}

/**
 * The answer in the renderer's syntax over {@link patternAnswerRows}' rows.
 * `labels` names each match row (by match id) for the table — opponent
 * names, never dates (a digit in a row label is dropped).
 */
export function buildPatternAnswer(
  rows: readonly AskRow[],
  pattern: AskPattern,
  names: AskPatternNames,
  labels: ReadonlyMap<string, string>,
): string {
  const total = rows[0];
  const points = count(total?.points);
  const description = describePattern(pattern, names);
  const lines: string[] = [];
  const winner = names.mine === "you" ? "you" : names.mine;
  if (points === 0) {
    lines.push(
      `That pattern did not come up in the {{r1.matches_with_shots}} matches with shot data.`,
    );
  } else {
    lines.push(
      `That pattern came up on {{r1.points}} points, and ${winner} won {{r1.won}} of them ({{r1.won_pct}}).`,
    );
  }

  const matchRows = rows.slice(1);
  if (matchRows.length > 1) {
    lines.push(
      `${ASK_VISUAL_LINE_PREFIX} table ${S} The points the pattern came up on, by match.`,
      `COLUMNS: Points ${S} Won ${S} Won rate`,
      ...matchRows.slice(0, ASK_TABLE_ROWS).map((row, index) => {
        const ref = `r${index + 2}`;
        const label = labels.get(String(row.match_id)) ?? "Match";
        return `ROW: ${label.replace(/\d/g, "").trim() || "Match"} ${S} {{${ref}.points}} ${S} {{${ref}.won}} ${S} {{${ref}.won_pct}}`;
      }),
    );
  }

  const paragraphs = [
    `Read as: points where ${description}.`,
    points > 0 && points < ASK_PATTERN_SMALL_SAMPLE
      ? "That is a small sample, so one or two points either way would move the rate a long way."
      : null,
    count(total?.matches_with_shots) < count(total?.matches_in_scope)
      ? "Counted from the {{r1.matches_with_shots}} of the {{r1.matches_in_scope}} matches here that have shot-by-shot data."
      : null,
  ].filter((p): p is string => p !== null);

  return [...lines, "", ...paragraphs.flatMap((p) => [p, ""])]
    .join("\n")
    .trimEnd();
}

// ── Asking the model to read the question ────────────────────────────────────

/** What the reading step may answer. */
export type AskPatternReading =
  | { kind: "pattern"; pattern: AskPattern }
  | { kind: "clarify"; question: string; options: string[] }
  | { kind: "none" };

/** Choices a clarifying question may offer. */
export const MIN_ASK_CLARIFY_OPTIONS = 2;
export const MAX_ASK_CLARIFY_OPTIONS = 4;

/**
 * The reading step's system prompt. `names` are the two sides as the scope
 * knows them; `roster` the program's players a team question may mean.
 */
export function buildPatternPrompt(input: {
  names: AskPatternNames;
  roster: readonly string[];
  team: boolean;
}): string {
  const { names, roster, team } = input;
  return [
    "You read one tennis question into a fixed pattern of shots. You never write SQL and never answer the question.",
    "",
    "Reply with ONE JSON object and nothing else, in one of three shapes:",
    '{"pattern": {...}}  — the question names a pattern you can read.',
    '{"clarify": {"question": "...", "options": ["...", "..."]}}  — the answer would change with something the question leaves open. Two to four short options.',
    '{"none": true}  — the question is not about a pattern of shots.',
    "",
    "The pattern object, every field optional:",
    '  "serve":  {"server": "mine"|"opponent"|null, "zones": ["Wide"|"Body"|"T"], "type": "first"|"second"|null}',
    '  "return": {"strokes": ["Forehand"|"Backhand"], "zones": ["Crosscourt"|"Down the Line"|"Middle"]}',
    '  "shots":  up to two, in order — the second is LATER in the same point:',
    '            {"player": "mine"|"opponent"|null, "strokes": ["Forehand"|"Backhand"|"Volley"|"Overhead"], "directions": ["Crosscourt"|"Down the Line"|"Inside Out"|"Inside In"|"Middle"], "within": 1-12|null}',
    "",
    `"mine" is ${names.mine === "you" ? "the person asking" : names.mine}${team ? " (the program's player)" : ""}; "opponent" is ${names.opponent}.`,
    'Shots count from the serve: 1 is the serve, 2 the return, 3 the server\'s next shot. "Serve +1" is the server\'s shot 3: {"player": <server>, "within": 3} with the server in "serve".',
    '"Within seven shots" is "within": 7. Inside out and inside in are their own directions — a forehand from the backhand side — never crosscourt or down the line.',
    'A direction with no stroke is any stroke. "Then X" with no player named is the same player as the shot before it.',
    "Use only the values listed. Leave a field out rather than guess.",
    "",
    "Ask (clarify) only when the answer would change and nothing settles it, at most about:",
    "  - whose shots, when the question could mean either side;",
    team && roster.length > 0
      ? `  - which player, when the question names none and could mean any of: ${roster.slice(0, 8).join(", ")};`
      : "",
    "  - whether a later shot is the same player's or the very next ball.",
    "Never ask about anything the lists above cannot say (spin of a rally shot, footwork, speed).",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

/** The reading step's reply, checked; anything unreadable is `none`. */
export function readPatternReply(reply: string): AskPatternReading {
  const start = reply.indexOf("{");
  const end = reply.lastIndexOf("}");
  if (start < 0 || end <= start) return { kind: "none" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(reply.slice(start, end + 1));
  } catch {
    return { kind: "none" };
  }
  if (!isRecord(parsed)) return { kind: "none" };
  if (isRecord(parsed.clarify)) {
    const question = parsed.clarify.question;
    const options = parsed.clarify.options;
    if (
      typeof question === "string" &&
      question.trim() !== "" &&
      Array.isArray(options)
    ) {
      const choices = options
        .filter((o): o is string => typeof o === "string" && o.trim() !== "")
        .map((o) => o.trim().slice(0, 60));
      if (
        choices.length >= MIN_ASK_CLARIFY_OPTIONS &&
        choices.length <= MAX_ASK_CLARIFY_OPTIONS
      ) {
        return {
          kind: "clarify",
          question: question.trim().slice(0, 200),
          options: choices,
        };
      }
    }
    return { kind: "none" };
  }
  const pattern = readAskPattern(parsed.pattern);
  return pattern ? { kind: "pattern", pattern } : { kind: "none" };
}

/**
 * A server-side clarifying question, asked whatever the model said: a team
 * pattern with more than one roster player in scope, naming none of them and
 * saying "my" or "I", cannot be read as anyone's. Null when nothing needs
 * asking.
 */
export function patternNeedsPlayer(input: {
  team: boolean;
  question: string;
  rosterInScope: readonly string[];
  playerTagged: boolean;
}): { question: string; options: string[] } | null {
  const { team, question, rosterInScope, playerTagged } = input;
  if (!team || playerTagged || rosterInScope.length < 2) return null;
  const lower = question.toLowerCase();
  if (rosterInScope.some((name) => lower.includes(name.toLowerCase()))) {
    return null;
  }
  if (!/\b(?:my|i|me|our|we)\b/i.test(question)) return null;
  return {
    question: "Which player's matches should this count?",
    options: rosterInScope.slice(0, MAX_ASK_CLARIFY_OPTIONS),
  };
}
