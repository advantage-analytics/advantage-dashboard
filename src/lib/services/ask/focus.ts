import { ASK_SCHEMA, type AskViewName } from "@/lib/services/ask/schema";
import { ASK_VIEWS } from "@/lib/services/ask/sql-guard";

/**
 * Schema routing (roadmap 1.7): which of the five `ask` views a question
 * most likely needs, and which of their columns its words point to.
 *
 * The plan prompt's schema block is 19k characters (`ask.match_stats` alone
 * 7.9k, 86 columns) and sits in the prompt's fixed prefix, which the
 * provider serves from its cache (`docs/llm-setup.md` §7). Moving it into a
 * per-question section would make every call pay for it again, so the block
 * stays where it is and this module adds a SHORTLIST to the dynamic tail
 * instead: one or two views, with the columns whose names or meanings share
 * a word with the question, so a small model finds `second_serves_in` and
 * `second_serve_points_won` without reading all 86. The measurement that
 * decided this is in `prompts.ts` beside `renderAskSchemaFocus()`'s caller.
 *
 * Three signals pick the views, in code and without a model call: keyword
 * rules of the same family as `reroute()`'s in `ask.ts`; the views the
 * retrieved examples' replies read (`examples.ts`); and, for a follow-up,
 * the views the previous turn's query read. Nothing here decides what the
 * planner may read — the full list is above the shortlist, and a question
 * the rules misjudge costs a few hundred characters, not an answer.
 *
 * Pure: no database, no network.
 */

/** At most this many views are shortlisted. */
export const MAX_ASK_FOCUS_VIEWS = 2;
/** At most this many columns are listed for one view; the full list is above. */
export const MAX_ASK_FOCUS_COLUMNS = 24;

export interface AskSchemaFocus {
  /** The shortlisted views, in the schema's order. */
  views: AskViewName[];
  /** For each shortlisted view: its key columns, then the relevant ones, in schema order. */
  columns: Partial<Record<AskViewName, string[]>>;
}

/** The columns a shortlisted view always lists: how its rows are keyed, joined and scoped. */
const KEY_COLUMNS: Record<AskViewName, readonly string[]> = {
  matches: ["match_id", "played_on", "opponent_name", "i_won", "has_stats"],
  match_stats: ["match_id", "side"],
  points: ["match_id", "point_number", "i_won", "i_served"],
  shots: ["match_id", "point_number", "mine", "shot_type", "result"],
  point_plays: ["match_id", "point_number", "i_won", "i_served", "has_shots"],
};

/** One line on each view, for the views left off the shortlist. */
export const ASK_VIEW_ONE_LINERS: Record<AskViewName, string> = {
  matches: "one row per match: date, opponent, result, surface",
  match_stats:
    "two rows per match (side = 'me' and 'opponent'): the counters and _pct columns",
  points:
    "one row per point: set, game, who served, who won, the pressure flags, how it ended",
  shots: "one row per shot: stroke, spin, speed, zone, direction, result",
  point_plays:
    "one row per point with its serve, return, +1 shot and last shot as columns",
};

/**
 * Keyword rules, each naming the views a family of words points to. A rule
 * counts once per question however many of its words match; a view's score
 * is the sum of the weights of the rules that named it. The plays rule
 * weighs two: a serve split by court or a +1 question is exactly where
 * `ask.point_plays` saves a join, and the prompt's own rules say so.
 */
const VIEW_RULES: readonly {
  pattern: RegExp;
  views: readonly AskViewName[];
  weight?: number;
}[] = [
  {
    // How points were played: pressure, sets and games, the run of a match.
    pattern:
      /\b(?:rall(?:y|ies)|break[- ]?points?|set[- ]?points?|match[- ]?points?|pressure|clutch|big points?|first set|second set|third set|tie-?breaks?|momentum|turning points?|point[- ]by[- ]point|how (?:the )?points? (?:ended|were (?:won|lost))|points? (?:won|lost)|games? (?:won|lost)|per set|by set|each set)\b/i,
    views: ["points"],
  },
  {
    // Strokes, direction, speed, placement.
    pattern:
      /\b(?:forehands?|backhands?|volleys?|overheads?|smash(?:es)?|drop ?shots?|slices?|topspin|spin|speeds?|mph|fastest|slowest|direction|cross[- ]?court|down the line|placement|zones?|wide|body|the t|depth|deep|short balls?|shots?|strokes?|where (?:do|did|does) (?:my|his|her|their|the) (?:serves?|returns?) (?:go|land))\b/i,
    views: ["shots"],
  },
  {
    // The serve +1, patterns and sequences, and which court a point was
    // played from: the prompt points a serve split by court at this view.
    pattern:
      /\b(?:plays?|patterns?|serve ?\+ ?1|plus[- ]one|sequences?|next shot|after (?:the|my|his|her|their) serve|combinations?|deuce (?:side|court)|ad (?:side|court))\b/i,
    views: ["point_plays"],
    weight: 2,
  },
  {
    // Whose matches, when, where: the record, a period, an opponent's traits, the surface.
    pattern:
      /\b(?:record|streaks?|wins?|losses|loss|lost|won|beat|results?|last (?:five|ten|few|\d+) matches|this (?:year|season|month)|since|in (?:january|february|march|april|may|june|july|august|september|october|november|december)|left[- ]?hand(?:ed|ers?)?|right[- ]?hand(?:ed|ers?)?|lefty|clay|hard courts?|grass|indoors?|surfaces?|tournaments?|duals?|doubles|scores?|how many matches|which matches?|opponents?|against)\b/i,
    views: ["matches"],
  },
  {
    // The match statistics.
    pattern:
      /\b(?:serves?|serving|server|returns?|returning|aces?|double[- ]?faults?|breaks?|winners?|unforced|errors?|net points?|at the net|holds?|held|first serves?|second serves?|percentages?|percent|share|rate|rall(?:y|ies)|total points|points won|forehand|backhand|volley)\b/i,
    views: ["match_stats"],
  },
];

const VIEW_IN_SQL = /\bask\.(matches|match_stats|points|shots|point_plays)\b/g;

/** The `ask` views a query text reads, once each, in the schema's order. */
export function viewsReadBySql(sql: string | null | undefined): AskViewName[] {
  if (!sql) return [];
  const found = new Set<string>();
  for (const match of sql.matchAll(VIEW_IN_SQL)) found.add(match[1]);
  return ASK_VIEWS.filter((view) => found.has(view));
}

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "are",
  "was",
  "were",
  "did",
  "does",
  "has",
  "have",
  "had",
  "how",
  "what",
  "when",
  "where",
  "which",
  "who",
  "why",
  "that",
  "this",
  "these",
  "those",
  "with",
  "from",
  "into",
  "than",
  "then",
  "them",
  "they",
  "their",
  "his",
  "her",
  "our",
  "your",
  "you",
  "can",
  "could",
  "should",
  "would",
  "about",
  "against",
  "versus",
  "compared",
  "compare",
  "more",
  "most",
  "less",
  "least",
  "better",
  "worse",
  "best",
  "worst",
  "any",
  "all",
  "each",
  "every",
  "some",
  "tell",
  "show",
  "give",
  "much",
  "many",
  "over",
  "under",
  "between",
  "during",
  "across",
  "team",
  "player",
  "players",
  "matches",
  "match",
  "season",
  "year",
  "month",
  "week",
  "last",
  "recent",
  "recently",
  "been",
  "being",
  "doing",
  "going",
  "get",
  "got",
  "keep",
  "keeps",
  "lose",
  "losing",
  "win",
  "winning",
  "well",
  "good",
  "bad",
]);

/** A word of the question as a stem: lowercase, a few English endings removed. */
function stem(word: string): string {
  let w = word.toLowerCase();
  if (w.endsWith("ies") && w.length > 4) w = `${w.slice(0, -3)}y`;
  else if (w.endsWith("ing") && w.length > 5) w = w.slice(0, -3);
  else if (w.endsWith("ed") && w.length > 4) w = w.slice(0, -2);
  else if (w.endsWith("es") && w.length > 4) w = w.slice(0, -2);
  else if (w.endsWith("s") && w.length > 3) w = w.slice(0, -1);
  return w;
}

/** The question's words that may name a column: stemmed, stopwords out, three letters or more. */
export function focusTokens(question: string): string[] {
  const tokens = new Set<string>();
  for (const word of question.toLowerCase().split(/[^a-z0-9+]+/)) {
    if (word === "" || STOPWORDS.has(word)) continue;
    const s = stem(word);
    if (s.length >= 3 && !STOPWORDS.has(s)) tokens.add(s);
  }
  return [...tokens];
}

interface ColumnWords {
  nameParts: string[];
  meaningWords: Set<string>;
}

/** Each column's stemmed name parts and meaning words, worked out once. */
const COLUMN_WORDS = new Map<string, ColumnWords>();

function columnWords(name: string, meaning: string): ColumnWords {
  // Views share column names with different meanings, so the key has both.
  const key = `${name}\u0000${meaning}`;
  const known = COLUMN_WORDS.get(key);
  if (known) return known;
  const words: ColumnWords = {
    nameParts: name.split("_").map(stem),
    meaningWords: new Set(
      meaning
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((word) => word.length >= 4)
        .map(stem),
    ),
  };
  COLUMN_WORDS.set(key, words);
  return words;
}

/** How many of the question's tokens a column's name or meaning carries. */
function columnScore(
  tokens: readonly string[],
  name: string,
  meaning: string,
): number {
  const { nameParts, meaningWords } = columnWords(name, meaning);
  let score = 0;
  for (const token of tokens) {
    if (
      nameParts.some(
        (part) =>
          part === token ||
          (token.length >= 4 && part.startsWith(token)) ||
          (part.length >= 4 && token.startsWith(part)),
      ) ||
      (token.length >= 4 && meaningWords.has(token))
    ) {
      score += 1;
    }
  }
  return score;
}

/**
 * The shortlist for one question: the top views by the three signals, and
 * for each the key columns plus the columns its words score on, best first
 * within the cap, then put back in schema order.
 */
export function askSchemaFocus(input: {
  question: string;
  team: boolean;
  /** The previous turn's query, when this is a follow-up. */
  previousSql?: string | null;
  /** The replies of the retrieved examples, each a text that may read `ask.` views. */
  exampleReplies?: readonly string[];
}): AskSchemaFocus {
  const scores = new Map<AskViewName, number>(
    ASK_VIEWS.map((view) => [view, 0]),
  );
  const bump = (view: AskViewName, by = 1) =>
    scores.set(view, (scores.get(view) ?? 0) + by);
  for (const rule of VIEW_RULES) {
    if (rule.pattern.test(input.question)) {
      for (const view of rule.views) bump(view, rule.weight ?? 1);
    }
  }
  for (const view of viewsReadBySql(input.previousSql)) bump(view);
  for (const reply of input.exampleReplies ?? []) {
    for (const view of viewsReadBySql(reply)) bump(view);
  }
  // Highest score first; ties in the schema's order (matches before
  // match_stats before the per-point views).
  const ranked = [...ASK_VIEWS]
    .map((view, order) => ({ view, order, score: scores.get(view) ?? 0 }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, MAX_ASK_FOCUS_VIEWS)
    .map((entry) => entry.view);
  const views: AskViewName[] =
    ranked.length === 0
      ? ["matches", "match_stats"]
      : ASK_VIEWS.filter((view) => ranked.includes(view));

  const tokens = focusTokens(input.question);
  const columns: Partial<Record<AskViewName, string[]>> = {};
  for (const view of views) {
    const schema = ASK_SCHEMA.find((entry) => entry.view === view);
    if (!schema) continue;
    const keys = new Set<string>(KEY_COLUMNS[view]);
    if (view === "matches" && input.team) keys.add("player_name");
    const scored = schema.columns
      .map((column, order) => ({ column, order }))
      .filter(
        ({ column }) => !column.hidden && (input.team || !column.teamOnly),
      )
      .map((entry) => ({
        ...entry,
        key: keys.has(entry.column.name),
        score: columnScore(tokens, entry.column.name, entry.column.meaning),
      }))
      .filter((entry) => entry.key || entry.score > 0)
      .sort(
        (a, b) =>
          Number(b.key) - Number(a.key) ||
          b.score - a.score ||
          a.order - b.order,
      )
      .slice(0, MAX_ASK_FOCUS_COLUMNS)
      .sort((a, b) => a.order - b.order);
    columns[view] = scored.map((entry) => entry.column.name);
  }
  return { views, columns };
}

/** The shortlist as the plan prompt prints it, under its own heading. */
export function renderAskSchemaFocus(focus: AskSchemaFocus): string {
  const listed = focus.views
    .map((view) => `- ask.${view}: ${(focus.columns[view] ?? []).join(", ")}`)
    .join("\n");
  const rest = ASK_VIEWS.filter((view) => !focus.views.includes(view))
    .map((view) => `ask.${view} (${ASK_VIEW_ONE_LINERS[view]})`)
    .join("; ");
  return `Every column of every view is listed under "The data" above. This is the shortlist the question's words point to — read a column's type and meaning from the full list, and use another view when the question needs it.
${listed}
Not shortlisted: ${rest}.`;
}
