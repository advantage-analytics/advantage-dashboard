/**
 * What an Ask conversation is called in the rail.
 *
 * `ask_save_exchange()` names a new conversation after the question's whole
 * text, so a rail of earlier questions was a column of sentences cut off by
 * their row. A title is the question's first clause, held to about 48
 * characters — "Why do I lose to Marek Dvorsky" from "Why do I lose to Marek
 * Dvorsky, and what should I work on?" — and the answer's headline stands in
 * when the question has no words of its own (a tag and nothing typed). The
 * page saves it right after a first answer (`renameAskConversation`), and a
 * player can rename a conversation to anything up to the column's limit.
 *
 * A model-written title would read better still; it needs the orchestrator
 * (`ask.ts`), which this module does not own. Pure: no React, no database.
 */

/** About how long a title the rail shows. */
export const ASK_TITLE_MAX = 48;

/** `ask_conversations.title`'s check: 1–120 characters. */
export const MAX_ASK_CONVERSATION_TITLE = 120;

/** A first clause shorter than this ("Hi.") is a greeting, not a title. */
const MIN_CLAUSE = 12;

/**
 * Where a first clause ends: sentence punctuation, a spaced dash, or a comma
 * followed by a conjunction. A comma alone is kept — "Against Marek, how did
 * my serve go" is one clause with a name in it.
 */
const CLAUSE_BOUNDARY = /[?!.;:]|\s[—–-]\s|,\s+(?:and|but|or|so|then)\b/i;

const FALLBACK_TITLE = "New question";

function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** The text up to the first boundary, and whether that was all of it. */
function firstClause(text: string): { clause: string; whole: boolean } {
  const match = CLAUSE_BOUNDARY.exec(text);
  if (!match) return { clause: text, whole: true };
  const clause = text.slice(0, match.index).trim();
  const rest = text.slice(match.index + match[0].length).trim();
  return { clause, whole: rest === "" };
}

/**
 * `text` held to `max` characters at a word boundary, with an ellipsis when
 * anything was cut. The cut never lands in the first half of the text: a
 * long first word is cut mid-word rather than reduced to nothing.
 */
function fit(text: string, max: number): string {
  if (text.length <= max) return text;
  const space = text.lastIndexOf(" ", max - 1);
  const head = (
    space >= Math.floor(max / 2) ? text.slice(0, space) : text.slice(0, max - 1)
  ).replace(/[\s,;:—–-]+$/, "");
  return `${head}…`;
}

/** The first clause of `text` as a title, or "" when `text` has no words. */
function clauseTitle(text: string): string {
  const whole = collapse(text);
  if (whole === "") return "";
  const first = firstClause(whole);
  // A whole question keeps its question mark — it IS the question — and
  // drops a full stop, which a title does not carry.
  const chosen =
    first.whole || first.clause.length < MIN_CLAUSE
      ? whole.replace(/[.;:]+$/, "").trim()
      : first.clause;
  return fit(chosen === "" ? whole : chosen, ASK_TITLE_MAX);
}

/**
 * The title for a conversation that opened with `question` and was answered
 * with `headline`: the question's first clause; the headline's when the
 * question had no words; "New question" when neither did.
 */
export function askTitle(question: string, headline?: string | null): string {
  return clauseTitle(question) || clauseTitle(headline ?? "") || FALLBACK_TITLE;
}

/**
 * A title a player typed, as the column takes it: one line, trimmed, 1–120
 * characters. Null for an empty or over-long one, so the caller refuses
 * rather than saves something the database would refuse anyway.
 */
export function normalizeAskTitle(raw: string): string | null {
  const title = collapse(raw);
  if (title === "" || title.length > MAX_ASK_CONVERSATION_TITLE) return null;
  return title;
}
