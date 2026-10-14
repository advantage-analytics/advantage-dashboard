import {
  ASK_VISUAL_FIELD_SEPARATOR,
  ASK_VISUAL_LINE_PREFIX,
  type AskRow,
} from "@/lib/services/ask/answer-render";
import { MAX_ASK_TABLE_ROWS } from "@/lib/services/ask/events";
import { ASK_SHOT_ROLE_CTES } from "@/lib/services/ask/pattern";
import {
  count,
  sentenceCase,
  type AskPlaysSubject,
  type AskPlaysVoice,
} from "@/lib/services/ask/plays";
import type { AskPromptTag } from "@/lib/services/ask/prompts";

/**
 * The serve +1 breakdown: "What are Rudy's serve +1 patterns?", "show me
 * his serve plus one, what stroke and placement, winning and losing".
 *
 * Every serve +1 the subject played, grouped by where the serve went and
 * what their next shot was — the server's first stroke after the return,
 * by stroke and direction — with how many of those points they won. The
 * pattern form (`pattern.ts`) answers ONE named pattern ("serve wide then
 * down the line"); this answers "all of them, side by side", which the form
 * cannot hold and the model kept writing wrong: a 2026-10-14 conversation
 * read the return (shot 2) as the server's +1, and counted the other
 * player's serves with the subject's.
 *
 * The server's own query and answer, like the losing plays: the planner only
 * picks the scope. The return is `pattern.ts`'s (`ASK_SHOT_ROLE_CTES`), so a
 * +1 here is the same shot the Video filter's "Then" would select.
 *
 * It states what happened. It never says which pattern to play more.
 */

/** A pattern played fewer times than this is shown but never called best or worst. */
export const MIN_ASK_PLUS_ONE_POINTS = 5;

/** Most-played first, at most this many rows. */
export const MAX_ASK_PLUS_ONE_ROWS = MAX_ASK_TABLE_ROWS;

export type AskServeType = "first" | "second";

export interface AskServePlusOne {
  /** Whose serve: the viewer's side (the program's player, in a team) or the opponent's. */
  subject: AskPlaysSubject;
  /** Only first or only second serves; null for both. */
  serveType: AskServeType | null;
}

const SERVE_PLUS_ONE =
  /\bserve\s*(?:and\s*)?(?:\+|plus)\s*(?:1|one)\b|\b(?:\+|plus)\s*(?:1|one)\b[^?.!]*\bserves?\b/i;
const SPECIFIC_SHOT =
  /\b(?:forehands?|backhands?|volleys?|overheads?|smash(?:es)?|cross ?court|cross\b|down the line|dtl|inside[- ]out|inside[- ]in|middle|wide|body|(?:to|down) the t)\b/i;

/**
 * Whether the question asks for the serve +1 patterns in general: it names
 * serve +1 and no particular stroke or direction. "Serve wide then a
 * forehand down the line" is one pattern, and the pattern form's.
 */
export function asksForServePlusOne(question: string): boolean {
  return SERVE_PLUS_ONE.test(question) && !SPECIFIC_SHOT.test(question);
}

// Words that ask for more of the same table, never a new subject: "which",
// "all", "won" and the like also open "which matches did he lose?", which is
// a question of its own.
const CONTINUES =
  /\b(?:table|compar\w*|detail\w*|break ?down|winning|losing|patterns?|plays?)\b/i;

/**
 * Whether a follow-up to a serve +1 answer asks for more of the same — "Can
 * I see a table of all the plays compared?" — rather than something new. It
 * names nothing specific and nothing that another fixed answer owns.
 */
export function continuesServePlusOne(question: string): boolean {
  return CONTINUES.test(question) && !SPECIFIC_SHOT.test(question);
}

const OPPONENT_SERVE =
  /\b(?:opponents?'?s?|their|the other player'?s?)\s+(?:first |second )?serv(?:e|es|ing)\b/i;
const THIRD_PERSON_SERVE = /\b(?:his|her)\s+(?:first |second )?serv/i;

/**
 * Whose serve. The viewer's unless the question names the opponent's. In a
 * team, "his serve" is the program's player's — the one the question is
 * about — and only "the opponent's serve" is the other side's; on the
 * personal page "his serve" with an opponent tagged is that opponent's.
 */
export function servePlusOneRequest(
  question: string,
  _tags: readonly AskPromptTag[],
  team: boolean,
): AskServePlusOne {
  // On the personal page "his serve" is the opponent's, as in the losing
  // plays (`losingPlaysSubject`); in a team it is the program's player's.
  const opponent =
    OPPONENT_SERVE.test(question) ||
    (!team && THIRD_PERSON_SERVE.test(question));
  const serveType = /\bfirst serves?\b/i.test(question)
    ? "first"
    : /\bsecond serves?\b/i.test(question)
      ? "second"
      : null;
  return { subject: opponent ? "opponent" : "mine", serveType };
}

/** The stroke a shot counts as, in the Video filter's order (`strokeOf()`). */
const STROKE_CASE = (label: string) => `case
      when ${label} like '%overhead%' or ${label} like '%smash%' then 'Overhead'
      when ${label} like '%volley%' then 'Volley'
      when ${label} like '%forehand%' then 'Forehand'
      when ${label} like '%backhand%' then 'Backhand'
    end`;

/**
 * The query, over `scope`. Every row has `section`, `serve_zone`, `stroke`,
 * `direction`, `points`, `won`, `won_pct`:
 *
 *   - `total` first: the serve +1 points, and how many the subject won;
 *   - `served`: `points` is every point the subject served (a serve +1 or
 *     not — aces, missed returns and double faults end before one), `won`
 *     how many matches have a serve recorded;
 *   - then one `pattern` row per serve zone, +1 stroke and +1 direction,
 *     most played first.
 */
export function servePlusOneSql(request: AskServePlusOne): string {
  const side = request.subject === "mine" ? "true" : "false";
  // `i_won` is the viewer's side.
  const won = request.subject === "mine" ? "pt.i_won" : "not pt.i_won";
  const serveType =
    request.serveType === null
      ? ""
      : `\n    and v.shot_type = '${request.serveType === "first" ? "First Serve" : "Second Serve"}'`;
  return `with ${ASK_SHOT_ROLE_CTES},
served as (
  select v.match_id, v.point_number, v.zone as serve_zone
  from sh v
  where v.is_played_serve and v.mine = ${side}${serveType}
),
plus as (
  select s.match_id, s.point_number, s.shot_type, s.direction,
    row_number() over (partition by s.match_id, s.point_number order by s.shot_number) as nth
  from sh s
  join sh r on r.match_id = s.match_id and r.point_number = s.point_number and r.is_return
  where s.is_stroke and s.mine = ${side} and s.shot_number > r.shot_number
),
played as (
  select sv.serve_zone,
    ${STROKE_CASE("lower(coalesce(p.shot_type, ''))")} as stroke,
    p.direction,
    (${won}) as won
  from served sv
  join plus p on p.match_id = sv.match_id and p.point_number = sv.point_number and p.nth = 1
  join ask.points pt on pt.match_id = sv.match_id and pt.point_number = sv.point_number
  where sv.serve_zone is not null and p.direction is not null
),
grouped as (
  select 'pattern' as section, serve_zone, stroke, direction, count(*) as points,
    count(*) filter (where won) as won,
    round(100.0 * count(*) filter (where won) / count(*), 1) as won_pct
  from played
  where stroke is not null
  group by serve_zone, stroke, direction
  union all
  select 'total', null, null, null, count(*), count(*) filter (where won),
    round(100.0 * count(*) filter (where won) / nullif(count(*), 0), 1)
  from played
  where stroke is not null
  union all
  select 'served', null, null, null, count(*), count(distinct match_id), null
  from served
),
ranked as (
  select grouped.*,
    row_number() over (partition by section order by points desc, won_pct desc nulls last) as place
  from grouped
)
select section, serve_zone, stroke, direction, points, won, won_pct
from ranked
where section <> 'pattern' or place <= ${MAX_ASK_PLUS_ONE_ROWS}
order by case section when 'total' then 0 when 'served' then 1 else 2 end, place`;
}

/** The request `sql` is the serve +1 breakdown for, or null when it is some other query. */
export function servePlusOneRequestOfSql(
  sql: string | null,
): AskServePlusOne | null {
  if (!sql) return null;
  for (const subject of ["mine", "opponent"] as const) {
    for (const serveType of [null, "first", "second"] as const) {
      if (sql === servePlusOneSql({ subject, serveType })) {
        return { subject, serveType };
      }
    }
  }
  return null;
}

// ── Writing the answer ───────────────────────────────────────────────────────

const S = ASK_VISUAL_FIELD_SEPARATOR;

const SERVE_PHRASE: Record<string, string> = {
  T: "a serve to the T",
  Body: "a serve into the body",
  Wide: "a serve out wide",
};

const SERVE_LABEL: Record<string, string> = {
  T: "T serve",
  Body: "Body serve",
  Wide: "Wide serve",
};

const DIRECTION_PHRASE: Record<string, string> = {
  "Down the Line": "down the line",
  Crosscourt: "crosscourt",
  Middle: "through the middle",
  "Inside Out": "inside out",
  "Inside In": "inside in",
};

function shotPhrase(row: AskRow): string {
  const direction = String(row.direction ?? "");
  return `${String(row.stroke ?? "").toLowerCase()} ${DIRECTION_PHRASE[direction] ?? direction.toLowerCase()}`;
}

function patternPhrase(row: AskRow): string {
  const zone = String(row.serve_zone ?? "");
  return `${SERVE_PHRASE[zone] ?? `a ${zone.toLowerCase()} serve`} then a ${shotPhrase(row)}`;
}

function patternLabel(row: AskRow): string {
  const zone = String(row.serve_zone ?? "");
  return `${SERVE_LABEL[zone] ?? zone} → ${shotPhrase(row)}`;
}

/**
 * The answer, in the renderer's syntax, from `servePlusOneSql()`'s rows, or
 * null when there is no serve +1 to show — the caller says "no shot data".
 * Every figure is a cell reference.
 */
export function buildServePlusOneAnswer(
  rows: readonly AskRow[],
  voice: AskPlaysVoice,
  request: AskServePlusOne,
): string | null {
  const indexed = rows.map((row, index) => ({ row, ref: `r${index + 1}` }));
  const total = indexed.find((entry) => entry.row.section === "total");
  const served = indexed.find((entry) => entry.row.section === "served");
  const patterns = indexed.filter((entry) => entry.row.section === "pattern");
  if (!total || count(total.row.points) === 0 || patterns.length === 0) {
    return null;
  }
  const cell = (ref: string, column: string) => `{{${ref}.${column}}}`;
  const record = (entry: { ref: string }) =>
    `won ${cell(entry.ref, "won")} of ${cell(entry.ref, "points")}, ${cell(entry.ref, "won_pct")}`;
  const serves =
    request.serveType === null ? "serve" : `${request.serveType} serve`;
  const their = voice.second ? "your" : "their";

  // ── Headline: the pattern played most ──
  const top = patterns[0];
  const headline = `${sentenceCase(voice.possessive)} most-played ${serves} plus one was ${patternPhrase(top.row)}: ${cell(top.ref, "points")} points, ${cell(top.ref, "won_pct")} of them won.`;

  // ── Table: every pattern, most played first ──
  const table = [
    `${ASK_VISUAL_LINE_PREFIX} table ${S} ${sentenceCase(voice.possessive)} ${serves}-plus-one patterns: where the serve went, then ${their} next shot. Most played first.`,
    `COLUMNS: Points ${S} Won ${S} Won %`,
    ...patterns.map(
      (entry) =>
        `ROW: ${patternLabel(entry.row)} ${S} ${cell(entry.ref, "points")} ${S} ${cell(entry.ref, "won")} ${S} ${cell(entry.ref, "won_pct")}`,
    ),
  ];

  // ── Winning and losing: best and worst among the ones played enough ──
  const paragraphs: string[] = [];
  paragraphs.push(
    `Across ${cell(total.ref, "points")} serve-plus-one points, ${voice.name} won ${cell(total.ref, "won")} (${cell(total.ref, "won_pct")}).`,
  );
  const enough = patterns.filter(
    (entry) =>
      count(entry.row.points) >= MIN_ASK_PLUS_ONE_POINTS &&
      typeof entry.row.won_pct === "number",
  );
  if (enough.length >= 2) {
    const byWin = [...enough].sort(
      (a, b) =>
        count(b.row.won_pct) - count(a.row.won_pct) ||
        count(b.row.points) - count(a.row.points),
    );
    const best = byWin[0];
    const worst = byWin[byWin.length - 1];
    if (count(best.row.won_pct) !== count(worst.row.won_pct)) {
      paragraphs.push(
        `The pattern that won most often was ${patternPhrase(best.row)} (${record(best)}); the one that lost most often was ${patternPhrase(worst.row)} (${record(worst)}).`,
      );
    }
  }

  // ── What it was counted from ──
  const from: string[] = [];
  if (served && count(served.row.points) > count(total.row.points)) {
    from.push(
      `${voice.second ? "You" : sentenceCase(voice.name)} served ${cell(served.ref, "points")} points in all; the rest ended before a plus one — an ace, a missed return or a double fault — or the shot was not placed.`,
    );
  }
  from.push(
    `The plus one is ${their} first shot after the return. A pattern played fewer than five times is listed but never called best or worst.`,
  );
  paragraphs.push(from.join(" "));

  return [headline, ...table, "", ...paragraphs.flatMap((p) => [p, ""])]
    .join("\n")
    .trimEnd();
}
