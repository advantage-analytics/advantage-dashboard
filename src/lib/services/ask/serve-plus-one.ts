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
  /** Whose +1: after their own serve, or after their own return. */
  phase: "serve" | "return";
  /** Whose: the viewer's side (the program's player, in a team) or the opponent's. */
  subject: AskPlaysSubject;
  /** Only points on a first or a second serve; null for both. */
  serveType: AskServeType | null;
  /** Only points from one side; absent for both. */
  court?: "Deuce" | "Ad";
  /** One table row per side as well (deuce and ad apart). */
  bySide?: boolean;
}

const BY_SIDE =
  /\b(?:by|per|each|both|split(?:\s+up)?(?:\s+by)?|divided(?:\s+up)?(?:\s+by)?|broken\s+down\s+by)\s+(?:the\s+)?(?:sides?|courts?)\b|\bdeuce\b[^?.!]*\bad(?:vantage)?\b|\bad(?:vantage)?\b[^?.!]*\bdeuce\b/i;
const DEUCE_SIDE = /\bdeuce(?:\s+(?:side|court))?\b/i;
const AD_SIDE = /\b(?:ad|advantage)\s+(?:side|court)\b/i;

/** A previous request with a follow-up's sides: a split replaces one side, one side replaces a split. */
export function plusOneWithSides(
  previous: AskServePlusOne,
  sides: Pick<AskServePlusOne, "court" | "bySide">,
): AskServePlusOne {
  if (sides.bySide) {
    const { court: _court, ...rest } = previous;
    return { ...rest, bySide: true };
  }
  if (sides.court) {
    const { bySide: _bySide, ...rest } = previous;
    return { ...rest, court: sides.court };
  }
  return previous;
}

/** The sides a question asks for: split, one of them, or neither. */
export function plusOneSides(
  question: string,
): Pick<AskServePlusOne, "court" | "bySide"> {
  if (BY_SIDE.test(question)) return { bySide: true };
  const deuce = DEUCE_SIDE.test(question);
  const ad = AD_SIDE.test(question);
  if (deuce && !ad) return { court: "Deuce" };
  if (ad && !deuce) return { court: "Ad" };
  return {};
}

const SERVE_PLUS_ONE =
  /\bserve\s*(?:and\s*)?(?:\+|plus)\s*(?:1|one)\b|\b(?:\+|plus)\s*(?:1|one)\b[^?.!]*\bserves?\b/i;
const RETURN_PLUS_ONE =
  /\breturn\s*(?:and\s*)?(?:\+|plus)\s*(?:1|one)\b|\b(?:\+|plus)\s*(?:1|one)\b[^?.!]*\breturns?\b/i;
const SPECIFIC_SHOT =
  /\b(?:forehands?|backhands?|volleys?|overheads?|smash(?:es)?|cross ?court|cross\b|down the line|dtl|inside[- ]out|inside[- ]in|middle|wide|body|(?:to|down) the t)\b/i;

/**
 * Which +1 breakdown the question asks for, or null: it names serve +1 or
 * return +1 and no particular stroke or direction. "Return down the middle,
 * then the +1 crosscourt" is one pattern, and the pattern form's.
 */
export function plusOneBreakdownAsked(
  question: string,
): "serve" | "return" | null {
  if (SPECIFIC_SHOT.test(question)) return null;
  if (RETURN_PLUS_ONE.test(question)) return "return";
  if (SERVE_PLUS_ONE.test(question)) return "serve";
  return null;
}

/** Whether the question asks for the serve +1 breakdown. */
export function asksForServePlusOne(question: string): boolean {
  return plusOneBreakdownAsked(question) !== null;
}

// Words that ask for more of the same table, never a new subject: "which",
// "all", "won" and the like also open "which matches did he lose?", which is
// a question of its own.
const CONTINUES =
  /\b(?:table|compar\w*|detail\w*|break ?down|winning|losing|patterns?|plays?|sides?|courts?|deuce|divid\w*|split)\b/i;

/**
 * Whether a follow-up to a +1 answer asks for more of the same — "Can I see
 * a table of all the plays compared?" — rather than something new. It names
 * nothing specific and nothing that another fixed answer owns.
 */
export function continuesServePlusOne(question: string): boolean {
  return CONTINUES.test(question) && !SPECIFIC_SHOT.test(question);
}

const OPPONENT_SIDE =
  /\b(?:opponents?'?s?|their|the other player'?s?)\s+(?:first |second )?(?:serv(?:e|es|ing)|returns?|returning)\b/i;
const THIRD_PERSON = /\b(?:his|her)\s+(?:first |second )?(?:serv|return)/i;

/**
 * Which +1 and whose. The viewer's unless the question names the
 * opponent's. In a team, "his serve" is the program's player's — the one the
 * question is about — and only "the opponent's" is the other side's; on the
 * personal page "his" with an opponent tagged is that opponent's.
 */
export function servePlusOneRequest(
  question: string,
  _tags: readonly AskPromptTag[],
  team: boolean,
): AskServePlusOne {
  // On the personal page "his serve" is the opponent's, as in the losing
  // plays (`losingPlaysSubject`); in a team it is the program's player's.
  const opponent =
    OPPONENT_SIDE.test(question) || (!team && THIRD_PERSON.test(question));
  const serveType = /\bfirst serves?\b/i.test(question)
    ? "first"
    : /\bsecond serves?\b/i.test(question)
      ? "second"
      : null;
  return {
    phase: plusOneBreakdownAsked(question) ?? "serve",
    subject: opponent ? "opponent" : "mine",
    serveType,
    ...plusOneSides(question),
  };
}

/** The stroke a shot counts as, in the Video filter's order (`strokeOf()`). */
const STROKE_CASE = (label: string) => `case
      when ${label} like '%overhead%' or ${label} like '%smash%' then 'Overhead'
      when ${label} like '%volley%' then 'Volley'
      when ${label} like '%forehand%' then 'Forehand'
      when ${label} like '%backhand%' then 'Backhand'
    end`;

/**
 * The query, over `scope`. Every row has `section`, `zone`, `stroke`,
 * `direction`, `points`, `won`, `won_pct`:
 *
 *   - `total` first: the +1 points, and how many the subject won;
 *   - `opening`: `points` is every point the subject served (or returned),
 *     +1 or not — many end before one — and `won` how many matches have one;
 *   - then one `pattern` row per opening zone (the serve's, or the
 *     return's), +1 stroke and +1 direction, most played first.
 *
 * The +1 is `ASK_SHOT_ROLE_CTES`'s, the Video filter's own: the server's
 * shot 3, the returner's shot 4, hit by the subject.
 */
export function servePlusOneSql(request: AskServePlusOne): string {
  const side = request.subject === "mine" ? "true" : "false";
  // `i_won` is the viewer's side.
  const won = request.subject === "mine" ? "pt.i_won" : "not pt.i_won";
  const serveType =
    request.serveType === null
      ? ""
      : `\n      and v.shot_type = '${request.serveType === "first" ? "First Serve" : "Second Serve"}'`;
  const onCourt = request.court
    ? `\n    and pc.court = '${request.court}'`
    : "";
  const opening =
    request.phase === "serve"
      ? `select v.match_id, v.point_number, v.zone, pc.court
  from sh v
  join ask.points pc on pc.match_id = v.match_id and pc.point_number = v.point_number
  where v.is_played_serve and v.mine = ${side}${serveType}${onCourt}`
      : `select r.match_id, r.point_number, r.zone, pc.court
  from sh r
  join ask.points pc on pc.match_id = r.match_id and pc.point_number = r.point_number
  where r.is_return and r.mine = ${side}${onCourt}${
    serveType === ""
      ? ""
      : `
    and exists (select 1 from sh v where v.match_id = r.match_id and v.point_number = r.point_number
      and v.is_played_serve${serveType})`
  }`;
  const plus =
    request.phase === "serve" ? "q.is_serve_plus_one" : "q.is_return_plus_one";
  return `with ${ASK_SHOT_ROLE_CTES},
opening as (
  ${opening}
),
played as (
  select ${request.bySide ? "o.court" : "null::text as court"}, o.zone,
    ${STROKE_CASE("lower(coalesce(q.shot_type, ''))")} as stroke,
    q.direction,
    (${won}) as won
  from opening o
  join sh q on q.match_id = o.match_id and q.point_number = o.point_number
    and ${plus} and q.mine = ${side}
  join ask.points pt on pt.match_id = o.match_id and pt.point_number = o.point_number
  where o.zone is not null and q.direction is not null
),
grouped as (
  select 'pattern' as section, court, zone, stroke, direction, count(*) as points,
    count(*) filter (where won) as won,
    round(100.0 * count(*) filter (where won) / count(*), 1) as won_pct
  from played
  where stroke is not null
  group by court, zone, stroke, direction
  union all
  select 'total', null, null, null, null, count(*), count(*) filter (where won),
    round(100.0 * count(*) filter (where won) / nullif(count(*), 0), 1)
  from played
  where stroke is not null
  union all
  select 'opening', null, null, null, null, count(*), count(distinct match_id), null
  from opening
),
ranked as (
  select grouped.*,
    row_number() over (partition by section order by points desc, won_pct desc nulls last) as place
  from grouped
)
select section, court, zone, stroke, direction, points, won, won_pct
from ranked
where section <> 'pattern' or place <= ${MAX_ASK_PLUS_ONE_ROWS}
order by case section when 'total' then 0 when 'opening' then 1 else 2 end, place`;
}

/** The request `sql` is a +1 breakdown for, or null when it is some other query. */
export function servePlusOneRequestOfSql(
  sql: string | null,
): AskServePlusOne | null {
  if (!sql) return null;
  const sides: Pick<AskServePlusOne, "court" | "bySide">[] = [
    {},
    { bySide: true },
    { court: "Deuce" },
    { court: "Ad" },
  ];
  for (const phase of ["serve", "return"] as const) {
    for (const subject of ["mine", "opponent"] as const) {
      for (const serveType of [null, "first", "second"] as const) {
        for (const sideRule of sides) {
          const request = { phase, subject, serveType, ...sideRule };
          if (sql === servePlusOneSql(request)) return request;
        }
      }
    }
  }
  return null;
}

// ── Writing the answer ───────────────────────────────────────────────────────

const S = ASK_VISUAL_FIELD_SEPARATOR;

const RETURN_PHRASE: Record<string, string> = {
  Crosscourt: "a return crosscourt",
  "Down the Line": "a return down the line",
  Middle: "a return through the middle",
};

const RETURN_LABEL: Record<string, string> = {
  Crosscourt: "Crosscourt return",
  "Down the Line": "Down-the-line return",
  Middle: "Middle return",
};

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

function patternPhrase(row: AskRow, phase: AskServePlusOne["phase"]): string {
  const court =
    typeof row.court === "string"
      ? `on the ${row.court.toLowerCase()} side, `
      : "";
  return court + openingPhrase(row, phase);
}

function openingPhrase(row: AskRow, phase: AskServePlusOne["phase"]): string {
  const zone = String(row.zone ?? "");
  const opening =
    phase === "serve"
      ? (SERVE_PHRASE[zone] ?? `a ${zone.toLowerCase()} serve`)
      : (RETURN_PHRASE[zone] ?? `a ${zone.toLowerCase()} return`);
  return `${opening} then a ${shotPhrase(row)}`;
}

function patternLabel(row: AskRow, phase: AskServePlusOne["phase"]): string {
  const zone = String(row.zone ?? "");
  const opening =
    phase === "serve"
      ? (SERVE_LABEL[zone] ?? zone)
      : (RETURN_LABEL[zone] ?? zone);
  const court = typeof row.court === "string" ? `${row.court} · ` : "";
  return `${court}${opening} → ${shotPhrase(row)}`;
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
  const opening = indexed.find((entry) => entry.row.section === "opening");
  const patterns = indexed.filter((entry) => entry.row.section === "pattern");
  if (!total || count(total.row.points) === 0 || patterns.length === 0) {
    return null;
  }
  const { phase } = request;
  const cell = (ref: string, column: string) => `{{${ref}.${column}}}`;
  const record = (entry: { ref: string }) =>
    `won ${cell(entry.ref, "won")} of ${cell(entry.ref, "points")}, ${cell(entry.ref, "won_pct")}`;
  const firstOrSecond = `${
    request.serveType === null ? "" : ` on ${request.serveType} serves`
  }${request.court ? ` on the ${request.court.toLowerCase()} side` : ""}`;
  const kind = phase === "serve" ? "serve" : "return";
  const their = voice.second ? "your" : "their";

  // ── Headline: the pattern played most ──
  const top = patterns[0];
  const headline = `${sentenceCase(voice.possessive)} most-played ${kind} plus one${firstOrSecond} was ${patternPhrase(top.row, phase)}: ${cell(top.ref, "points")} points, ${cell(top.ref, "won_pct")} of them won.`;

  // ── Table: every pattern, most played first ──
  const table = [
    `${ASK_VISUAL_LINE_PREFIX} table ${S} ${sentenceCase(voice.possessive)} ${kind}-plus-one patterns${firstOrSecond}${request.bySide ? ", deuce and ad sides apart" : ""}: where the ${kind} went, then ${their} next shot. Most played first.`,
    `COLUMNS: Points ${S} Won ${S} Won %`,
    ...patterns.map(
      (entry) =>
        `ROW: ${patternLabel(entry.row, phase)} ${S} ${cell(entry.ref, "points")} ${S} ${cell(entry.ref, "won")} ${S} ${cell(entry.ref, "won_pct")}`,
    ),
  ];

  // ── Winning and losing: best and worst among the ones played enough ──
  const paragraphs: string[] = [];
  paragraphs.push(
    `Across ${cell(total.ref, "points")} ${kind}-plus-one points, ${voice.name} won ${cell(total.ref, "won")} (${cell(total.ref, "won_pct")}).`,
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
        `The pattern that won most often was ${patternPhrase(best.row, phase)} (${record(best)}); the one that lost most often was ${patternPhrase(worst.row, phase)} (${record(worst)}).`,
      );
    }
  }

  // ── What it was counted from ──
  const from: string[] = [];
  if (opening && count(opening.row.points) > count(total.row.points)) {
    const subject = voice.second ? "You" : sentenceCase(voice.name);
    from.push(
      phase === "serve"
        ? `${subject} served ${cell(opening.ref, "points")} points in all; the rest ended before a plus one — an ace, a missed return or a double fault — or the shot was not placed.`
        : `${subject} returned ${cell(opening.ref, "points")} points in all; the rest ended before a plus one — on the return or the server's next ball — or the shot was not placed.`,
    );
  }
  from.push(
    phase === "serve"
      ? `The plus one is ${their} ball after the return: the third shot of the point, as the Video filter numbers it. A pattern played fewer than five times is listed but never called best or worst.`
      : `The plus one is ${their} ball after the server's reply: the fourth shot of the point, as the Video filter numbers it. A pattern played fewer than five times is listed but never called best or worst.`,
  );
  paragraphs.push(from.join(" "));

  return [headline, ...table, "", ...paragraphs.flatMap((p) => [p, ""])]
    .join("\n")
    .trimEnd();
}
