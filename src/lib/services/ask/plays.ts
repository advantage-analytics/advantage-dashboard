import {
  ASK_VISUAL_FIELD_SEPARATOR,
  ASK_VISUAL_LINE_PREFIX,
  type AskRow,
} from "@/lib/services/ask/answer-render";
import { ASK_TABLE_ROWS, MAX_ASK_TABLE_ROWS } from "@/lib/services/ask/events";
import type { AskPromptTag } from "@/lib/services/ask/prompts";

/**
 * Losing plays: "What are Eli's losing plays?", "which of my shots miss the
 * most?", "where does he miss?".
 *
 * Read from the shots, never from the match totals. The fixed comparisons in
 * `compare.ts` know how many winners and errors a side had, not which stroke
 * or which direction they came off — so a question about losing plays sent
 * there came back as break points and aces. This is the server's own query
 * and the server's own answer, like the review (`review.ts`): the planner
 * only chooses the scope.
 *
 * Three things, for ONE side of the court — the subject:
 *
 *   - rally shots by stroke and direction, most often missed first (a miss is
 *     a ball out or in the net, which ends the point);
 *   - serves by stroke and direction, with how many were faults;
 *   - how the points the subject lost ended: the subject's own last shot
 *     missing, or the other side's last shot landing in.
 *
 * It states what happened. It never says what to do about it: "his backhand
 * down the line missed 8 of 48" is the answer, "so hit to his backhand" is
 * not.
 */

/** Groups smaller than this are left out: one miss in three is not a pattern. */
export const MIN_ASK_PLAYS_SHOTS = 8;

/** At most this many rows per section. */
export const MAX_ASK_PLAYS_ROWS = 6;

/** Whose plays: the opponent's side of the court, or the viewer's (the program's player, in a team). */
export type AskPlaysSubject = "opponent" | "mine";

const LOSING_PLAYS =
  /\b(?:losing|worst|weakest|bad|weak) (?:plays?|patterns?|shots?|strokes?)\b|\b(?:shots?|strokes?|plays?|patterns?)\b[^?.!]*\b(?:los(?:e|es|ing|t)|miss(?:es|ed|ing)?|errors?|bad|worst|weak(?:est|ness(?:es)?)?|break(?:s|ing)? down|struggl\w*|fail\w*)\b|\bwhere\b[^?.!]*\bmiss(?:es|ed|ing)?\b|\bwhich (?:shots?|strokes?)\b|\b(?:errors?|misses) by (?:stroke|shot|direction|placement)\b/i;

/** Whether the question asks for losing plays: misses and errors by stroke and direction. */
export function asksForLosingPlays(question: string): boolean {
  return LOSING_PLAYS.test(question);
}

const OTHER_POSSESSIVE =
  /\b(?:his|her|their|opponent'?s|(?:this|that) player'?s)\b/i;
const OWN_POSSESSIVE = /\b(?:my|our)\b/i;
const ABOUT_THE_OPPONENT =
  /\b(?:opponents?|(?:this|that) players?|he|she|him|they|them)\b/i;
const ABOUT_ME = /\b(?:i|me|mine|we|us)\b/i;
const OPPONENT_WORD = /\bopponents?'?s?\b/i;

/**
 * Whose losing plays the question is about. Whose plays they are is read
 * first from the possessive ("my losing plays against him" is the viewer's,
 * "his against me" the opponent's), then from any word for one side; a
 * question that says neither is the tagged opponent's when there is one.
 * The viewer is, in a team, the program's player.
 */
export function losingPlaysSubject(
  question: string,
  tags: readonly AskPromptTag[],
  team = false,
): AskPlaysSubject {
  // In a team, "his", "her" and "this player" name the program's own player
  // — the one the question is about. Only a word for the opponent, or an
  // opponent tagged with no player beside it, is the other side.
  if (team) {
    if (OPPONENT_WORD.test(question)) return "opponent";
    const opponentTag = tags.some((tag) => tag.kind === "opponent");
    const playerTag = tags.some((tag) => tag.kind === "player");
    return opponentTag && !playerTag ? "opponent" : "mine";
  }
  // Each rule names a side by the word for it that comes FIRST: "which shots
  // do I miss against him" is about me, "where does he beat me" about him.
  const first = (own: RegExp, other: RegExp): AskPlaysSubject | null => {
    const a = question.search(own);
    const b = question.search(other);
    if (a < 0 && b < 0) return null;
    if (b < 0 || (a >= 0 && a < b)) return "mine";
    return "opponent";
  };
  return (
    first(OWN_POSSESSIVE, OTHER_POSSESSIVE) ??
    first(ABOUT_ME, ABOUT_THE_OPPONENT) ??
    (tags.some((tag) => tag.kind === "opponent") ? "opponent" : "mine")
  );
}

/**
 * The query, over `scope`. One row per group, every section the same
 * columns: `section` (total, rally, serve, lost_error, lost_winner),
 * `stroke`, `direction`, `shots`, `missed`, `miss_pct`, `place`.
 *
 * The `total` row comes first: `shots` is how many points the subject lost,
 * `missed` how many matches in scope have any shot recorded. `lost_error`
 * and `lost_winner` count points: the subject's own miss that ended a point
 * they lost, and the other side's ball that landed in to end one.
 */
export function losingPlaysSql(subject: AskPlaysSubject): string {
  // `mine` is the viewer's side; `i_won` is too.
  const theirs = subject === "mine" ? "true" : "false";
  const lost = subject === "mine" ? "false" : "true";
  return `with sh as (
  select s.match_id, s.shot_number, s.mine, s.shot_type, s.direction, s.result, p.i_won,
    s.shot_number = max(s.shot_number) over (partition by s.match_id, s.point_number) as last_shot
  from ask.shots s
  join ask.points p on p.match_id = s.match_id and p.point_number = s.point_number
  where s.match_id in (select match_id from scope)
),
grouped as (
  select case when shot_type in ('First Serve', 'Second Serve') then 'serve' else 'rally' end as section,
    shot_type as stroke, direction, count(*) as shots,
    count(*) filter (where result in ('Out', 'Net')) as missed,
    round(100.0 * count(*) filter (where result in ('Out', 'Net')) / count(*), 1) as miss_pct
  from sh
  where mine = ${theirs} and direction is not null
    and shot_type in ('Forehand', 'Backhand', 'Volley', 'Overhead', 'First Serve', 'Second Serve')
  group by shot_type, direction
  having count(*) >= ${MIN_ASK_PLAYS_SHOTS}
  union all
  select case when mine = ${theirs} then 'lost_error' else 'lost_winner' end,
    shot_type, direction, count(*), null, null
  from sh
  where last_shot and i_won = ${lost} and shot_type is not null and direction is not null
    and ((mine = ${theirs} and result in ('Out', 'Net')) or (mine <> ${theirs} and result = 'In'))
  group by 1, shot_type, direction
  union all
  select 'total', null, null,
    count(*) filter (where last_shot and i_won = ${lost}),
    count(distinct match_id), null
  from sh
),
ranked as (
  select section, stroke, direction, shots, missed, miss_pct,
    row_number() over (partition by section order by miss_pct desc nulls last, shots desc) as place
  from grouped
)
select section, stroke, direction, shots, missed, miss_pct, place
from ranked
where place <= ${MAX_ASK_PLAYS_ROWS}
order by case section when 'total' then 0 when 'rally' then 1 when 'serve' then 2 when 'lost_error' then 3 else 4 end, place`;
}

/** Whether `sql` is one of the two losing-plays queries. */
export function isLosingPlaysSql(sql: string): boolean {
  return sql === losingPlaysSql("mine") || sql === losingPlaysSql("opponent");
}

// ── Writing the answer ───────────────────────────────────────────────────────

/** Who the sentences are about. */
export interface AskPlaysVoice {
  /** "Eli Stephenson", "Emon van Loben Sels", or "you". */
  name: string;
  /** "Eli Stephenson's", "your". */
  possessive: string;
  /** True when `name` is "you": the verbs agree with it. */
  second: boolean;
}

/** The voice for a subject: the one name the matches agree on, or a plain word for the side. */
export function losingPlaysVoice(
  subject: AskPlaysSubject,
  name: string | null,
): AskPlaysVoice {
  if (name) return { name, possessive: `${name}'s`, second: false };
  if (subject === "mine") {
    return { name: "you", possessive: "your", second: true };
  }
  return { name: "the opponent", possessive: "the opponent's", second: false };
}

const S = ASK_VISUAL_FIELD_SEPARATOR;

const DIRECTION_PHRASE: Record<string, string> = {
  "Down the Line": "down the line",
  Crosscourt: "crosscourt",
  Middle: "through the middle",
  "Inside Out": "inside out",
  "Inside In": "inside in",
  T: "to the T",
  Wide: "out wide",
  Body: "into the body",
};

function phrase(row: AskRow): string {
  const stroke = String(row.stroke ?? "").toLowerCase();
  const direction = String(row.direction ?? "");
  return `${stroke} ${DIRECTION_PHRASE[direction] ?? direction.toLowerCase()}`;
}

function label(row: AskRow): string {
  const text = phrase(row);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function sentenceCase(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function joined(parts: readonly string[]): string {
  return parts.length <= 1
    ? (parts[0] ?? "")
    : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

export function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * The answer, in the renderer's syntax, from `losingPlaysSql()`'s rows, or
 * null when no match in scope has a shot recorded — that is "no data", and
 * the caller says so in its own words.
 *
 * Every figure is a cell reference: the rows go to the renderer exactly as
 * given, with the scope count added by the caller.
 */
export function buildLosingPlaysAnswer(
  rows: readonly AskRow[],
  voice: AskPlaysVoice,
  matchCount: number,
): string | null {
  const indexed = rows.map((row, index) => ({ row, ref: `r${index + 1}` }));
  const total = indexed.find((entry) => entry.row.section === "total");
  if (!total || count(total.row.missed) === 0) return null;
  const section = (name: string) =>
    indexed.filter((entry) => entry.row.section === name);
  const rally = section("rally");
  const serve = section("serve");
  const errors = section("lost_error");
  const winners = section("lost_winner");
  if (rally.length === 0 && serve.length === 0 && errors.length === 0) {
    return null;
  }

  const cell = (ref: string, column: string) => `{{${ref}.${column}}}`;
  const missedOf = (entry: { ref: string }) =>
    `${cell(entry.ref, "missed")} of ${cell(entry.ref, "shots")}`;

  // ── Headline: the rally shots missed most often ──
  let headline: string;
  if (rally.length > 0) {
    const top = rally.slice(0, 2);
    headline = `${sentenceCase(voice.possessive)} most-missed rally shots were ${joined(
      top.map(
        (entry) =>
          `the ${phrase(entry.row)} (${missedOf(entry)}, ${cell(entry.ref, "miss_pct")})`,
      ),
    )}.`;
  } else if (serve.length > 0) {
    const top = serve[0];
    headline = `${sentenceCase(voice.possessive)} most-missed serve was the ${phrase(top.row)}: ${missedOf(top)} were faults.`;
  } else {
    const top = errors[0];
    headline = `${sentenceCase(voice.possessive)} most common losing shot was the ${phrase(top.row)}, which missed to end ${cell(top.ref, "shots")} points.`;
  }

  // ── Table: rally shots, most missed first ──
  const table =
    rally.length > 0
      ? [
          `${ASK_VISUAL_LINE_PREFIX} table ${S} ${sentenceCase(voice.possessive)} rally shots by direction, most often missed first.`,
          `COLUMNS: Shots ${S} Missed ${S} Miss rate`,
          ...rally
            .slice(0, ASK_TABLE_ROWS)
            .map(
              (entry) =>
                `ROW: ${label(entry.row)} ${S} ${cell(entry.ref, "shots")} ${S} ${cell(entry.ref, "missed")} ${S} ${cell(entry.ref, "miss_pct")}`,
            ),
        ]
      : [];

  // ── How the points they lost ended ──
  const paragraphs: string[] = [];
  const ended: string[] = [];
  const points = cell(total.ref, "shots");
  if (errors.length > 0) {
    ended.push(
      `Of the ${points} points ${voice.name} lost, the most common finish was ${voice.second ? "your" : "their"} own miss: ${joined(
        errors
          .slice(0, 3)
          .map(
            (entry) => `the ${phrase(entry.row)} (${cell(entry.ref, "shots")})`,
          ),
      )}.`,
    );
  } else {
    ended.push(`${sentenceCase(voice.name)} lost ${points} points.`);
  }
  if (winners.length > 0) {
    ended.push(
      `The balls that won points against ${voice.second ? "you" : voice.name} came most from ${joined(
        winners
          .slice(0, 3)
          .map(
            (entry) => `the ${phrase(entry.row)} (${cell(entry.ref, "shots")})`,
          ),
      )}.`,
    );
  }
  paragraphs.push(ended.join(" "));

  // ── Serve ──
  if (serve.length > 0) {
    const first = serve.filter((entry) => entry.row.stroke === "First Serve");
    const second = serve.filter((entry) => entry.row.stroke === "Second Serve");
    const parts: string[] = [];
    if (first.length > 0) {
      parts.push(
        `first serves were faults on ${joined(
          first.map(
            (entry) =>
              `${missedOf(entry)} ${DIRECTION_PHRASE[String(entry.row.direction)] ?? String(entry.row.direction).toLowerCase()}`,
          ),
        )}`,
      );
    }
    if (second.length > 0) {
      parts.push(
        `second serves were double faults on ${joined(
          second.map(
            (entry) =>
              `${missedOf(entry)} ${DIRECTION_PHRASE[String(entry.row.direction)] ?? String(entry.row.direction).toLowerCase()}`,
          ),
        )}`,
      );
    }
    paragraphs.push(`On serve, ${voice.possessive} ${parts.join("; ")}.`);
  }

  // ── What it was counted from ──
  const withShots = count(total.row.missed);
  paragraphs.push(
    withShots < matchCount
      ? `Counted from the shots of ${cell(total.ref, "missed")} of the ${cell(total.ref, "matches_in_scope")} matches here; the others have no shot-by-shot data. A shot type with fewer than eight balls in one direction is left out.`
      : withShots === 1
        ? "Counted from the shots of this one match. A shot type with fewer than eight balls in one direction is left out."
        : `Counted from the shots of ${cell(total.ref, "missed")} matches. A shot type with fewer than eight balls in one direction is left out.`,
  );

  return [headline, ...table, "", ...paragraphs.flatMap((p) => [p, ""])]
    .join("\n")
    .trimEnd();
}

/** What "no data" says when no match in scope has a shot recorded. */
export const ASK_NO_SHOTS_MESSAGE =
  "None of these matches has shot-by-shot data, so strokes and directions can't be counted. Shots come from Advantage Intelligence video or a SwingVision file; a match entered by hand has only its score and totals.";

// ── Winning plays ────────────────────────────────────────────────────────────

const WINNING_PLAYS =
  /\b(?:best|winning|strongest|good|top|favou?rite)\s+(?:plays?|patterns?|shots?|strokes?|weapons?)\b|\bstrengths?\b|\b(?:shots?|plays?|strokes?)\b[^?.!]*\b(?:win|wins|won|winning)\b/i;

/**
 * Whether the question asks for winning plays: which strokes, in which
 * direction, won the subject points. Losing plays are asked for first, so
 * "winning and losing" is the losing plays' answer, which shows both ends.
 */
export function asksForWinningPlays(question: string): boolean {
  return WINNING_PLAYS.test(question);
}

/**
 * Whose winning plays. In a team, "this player" and "his" are the program's
 * player — the one the conversation is about — and only a word for the
 * opponent, or an opponent tagged with no player, is the other side. On the
 * personal page it is `losingPlaysSubject()`'s rule.
 */
export function winningPlaysSubject(
  question: string,
  tags: readonly AskPromptTag[],
  team: boolean,
): AskPlaysSubject {
  if (!team) return losingPlaysSubject(question, tags);
  if (OPPONENT_WORD.test(question)) return "opponent";
  const opponentTag = tags.some((tag) => tag.kind === "opponent");
  const playerTag = tags.some((tag) => tag.kind === "player");
  return opponentTag && !playerTag ? "opponent" : "mine";
}

/**
 * The query, over `scope`. A `total` row first — `points` the subject won,
 * `winners` how many of those a play below accounts for, `errors_drawn`
 * how many matches have shots — then one `play` row per stroke and
 * direction: the points it won (`points`), as the subject's own winner
 * (`winners`) or as the shot before the other side's miss (`errors_drawn`).
 * Most points first.
 */
export function winningPlaysSql(subject: AskPlaysSubject): string {
  const theirs = subject === "mine" ? "true" : "false";
  const won = subject === "mine" ? "true" : "false";
  return `with sh as (
  select s.match_id, s.point_number, s.shot_number, s.mine, s.shot_type, s.direction, s.result, p.i_won,
    s.shot_number = max(s.shot_number) over (partition by s.match_id, s.point_number) as last_shot,
    lag(s.shot_type) over (partition by s.match_id, s.point_number order by s.shot_number) as prev_type,
    lag(s.direction) over (partition by s.match_id, s.point_number order by s.shot_number) as prev_direction,
    lag(s.mine) over (partition by s.match_id, s.point_number order by s.shot_number) as prev_mine
  from ask.shots s
  join ask.points p on p.match_id = s.match_id and p.point_number = s.point_number
  where s.match_id in (select match_id from scope)
),
ended as (
  select shot_type as stroke, direction, 'winner' as kind
  from sh
  where last_shot and i_won = ${won} and mine = ${theirs} and result = 'In'
  union all
  select prev_type, prev_direction, 'drew'
  from sh
  where last_shot and i_won = ${won} and mine <> ${theirs} and result in ('Out', 'Net')
    and prev_mine = ${theirs}
),
plays as (
  select stroke, direction, count(*) as points,
    count(*) filter (where kind = 'winner') as winners,
    count(*) filter (where kind = 'drew') as errors_drawn
  from ended
  where stroke is not null and direction is not null
    and stroke in ('Forehand', 'Backhand', 'Volley', 'Overhead', 'First Serve', 'Second Serve')
  group by stroke, direction
),
ranked as (
  select 'play' as section, stroke, direction, points, winners, errors_drawn,
    row_number() over (order by points desc, winners desc) as place
  from plays
)
select 'total' as section, null as stroke, null as direction,
  (select count(*) from sh where last_shot and i_won = ${won}) as points,
  (select coalesce(sum(points), 0) from plays) as winners,
  (select count(distinct match_id) from sh) as errors_drawn
union all
select section, stroke, direction, points, winners, errors_drawn
from ranked
where place <= ${MAX_ASK_TABLE_ROWS}`;
}

/** Whether `sql` is one of the two winning-plays queries. */
export function isWinningPlaysSql(sql: string): boolean {
  return sql === winningPlaysSql("mine") || sql === winningPlaysSql("opponent");
}

/**
 * The answer from `winningPlaysSql()`'s rows, or null when no point won in
 * scope ended on a recorded shot — "no data", said by the caller. Every
 * figure is a cell reference.
 */
export function buildWinningPlaysAnswer(
  rows: readonly AskRow[],
  voice: AskPlaysVoice,
  matchCount: number,
): string | null {
  const indexed = rows.map((row, index) => ({ row, ref: `r${index + 1}` }));
  const total = indexed.find((entry) => entry.row.section === "total");
  const plays = indexed.filter((entry) => entry.row.section === "play");
  if (!total || count(total.row.points) === 0 || plays.length === 0) {
    return null;
  }
  const cell = (ref: string, column: string) => `{{${ref}.${column}}}`;
  const top = plays[0];
  const headline = `${sentenceCase(voice.possessive)} best play was the ${phrase(top.row)}: it won ${cell(top.ref, "points")} points — ${cell(top.ref, "winners")} as ${voice.second ? "your" : "their"} own winner and ${cell(top.ref, "errors_drawn")} by drawing an error.`;

  const table = [
    `${ASK_VISUAL_LINE_PREFIX} table ${S} The shots that won ${voice.second ? "you" : voice.name} points, by stroke and direction. Most points first.`,
    `COLUMNS: Points won ${S} Winners ${S} Errors drawn`,
    ...plays.map(
      (entry) =>
        `ROW: ${label(entry.row)} ${S} ${cell(entry.ref, "points")} ${S} ${cell(entry.ref, "winners")} ${S} ${cell(entry.ref, "errors_drawn")}`,
    ),
  ];

  const paragraphs: string[] = [];
  paragraphs.push(
    `${sentenceCase(voice.name)} won ${cell(total.ref, "points")} points; ${cell(total.ref, "winners")} of them ended on a recorded shot of ${voice.second ? "yours" : "theirs"} — ${voice.second ? "your" : "their"} own winner, or the shot before the other side missed. The table lists the plays that won the most.`,
  );
  const withShots = count(total.row.errors_drawn);
  paragraphs.push(
    withShots < matchCount
      ? `Counted from the shots of ${cell(total.ref, "errors_drawn")} of the ${cell(total.ref, "matches_in_scope")} matches here; the others have no shot-by-shot data.`
      : withShots === 1
        ? "Counted from the shots of this one match."
        : `Counted from the shots of ${cell(total.ref, "errors_drawn")} matches.`,
  );
  return [headline, ...table, "", ...paragraphs.flatMap((p) => [p, ""])]
    .join("\n")
    .trimEnd();
}

// ── When the question could be any of them ──────────────────────────────────

const ABOUT_PLAYS =
  /\b(?:plays?|patterns?|shots?|strokes?|weapons?|strengths?|weakness(?:es)?|tendenc(?:y|ies)|game ?plan)\b/i;

/** Whether a question the planner could not place is about shots or plays. */
export function asksAboutPlays(question: string): boolean {
  return ABOUT_PLAYS.test(question);
}

/** What Ask asks back for such a question. */
export const ASK_PLAYS_CLARIFY_QUESTION = "Which of these should I look at?";

/**
 * The answers Ask has for a question about plays. Each choice is re-asked
 * as the question with the choice attached, and each one's words route to
 * its own fixed answer (`asksForWinningPlays`, `asksForLosingPlays`,
 * `plusOneBreakdownAsked`).
 */
export const ASK_PLAYS_CLARIFY_OPTIONS = [
  "Winning plays: the shots that won points",
  "Losing plays: the shots that lost points",
  "Serve +1 patterns",
  "Return +1 patterns",
] as const;
