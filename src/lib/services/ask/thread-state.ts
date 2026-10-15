/**
 * Thread memory as a state object (roadmap 4.5).
 *
 * A follow-up used to be understood from six 600-character turns of raw
 * prose. Now the planner writes, with every reply, four short strings saying
 * what the conversation is about once the question is answered — the scope,
 * the measure, the period and the subject — and the next turn's plan prompt
 * shows that state ahead of a much shorter tail of the raw turns. The answer
 * step is given the previous headline for the same reason: a follow-up
 * should read as one.
 *
 * The state is saved inside the answer's jsonb (`AskSavedAnswer.state`) and
 * read back by `previousPlanFromMessages()`; nothing else stores it. It is
 * the model's own words about the conversation and is shown to the model as
 * data, never as instructions.
 *
 * A leaf: no imports.
 */

/** What the conversation is about, as the planner last described it. */
export interface AskThreadState {
  /** Whose matches, in words: "all matches", "matches against OpponentX", "PlayerA's matches since August". */
  scope: string;
  /** What is measured: "second-serve points won". Empty for a refusal. */
  measure: string;
  /** The time span the question names: "this season", "August". Empty when none. */
  period: string;
  /** The part of the game or the thing asked about: "the second serve", "the record against left-handers". */
  subject: string;
}

export const ASK_THREAD_STATE_FIELDS = [
  "scope",
  "measure",
  "period",
  "subject",
] as const;

/** A field longer than this is cut when read: the state is a note, not a transcript. */
export const MAX_ASK_THREAD_STATE_FIELD_LENGTH = 120;

/** Every field empty: what the schema asks the planner to write when a field does not apply. */
export function emptyAskThreadState(): AskThreadState {
  return { scope: "", measure: "", period: "", subject: "" };
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * A state object read from a plan reply or a saved answer: each field a
 * string, flattened to one line and cut to its limit; a missing field is
 * empty. Null when the value is not an object, or when every field is
 * empty — an empty state says nothing and is not worth showing.
 */
export function readAskThreadState(value: unknown): AskThreadState | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const state = emptyAskThreadState();
  let any = false;
  for (const field of ASK_THREAD_STATE_FIELDS) {
    const raw = record[field];
    if (typeof raw !== "string") continue;
    const text = oneLine(raw).slice(0, MAX_ASK_THREAD_STATE_FIELD_LENGTH);
    if (text === "") continue;
    state[field] = text;
    any = true;
  }
  return any ? state : null;
}

/** The state as the plan prompt prints it: one `field: value` line each, "(none)" for an empty field. */
export function renderAskThreadState(state: AskThreadState): string {
  return ASK_THREAD_STATE_FIELDS.map(
    (field) => `${field}: ${state[field] === "" ? "(none)" : state[field]}`,
  ).join("\n");
}

/**
 * The state the last answer of a conversation carried, from its saved
 * messages; null when there is no answer or it has none.
 */
export function threadStateFromMessages(
  messages: readonly { role: "user" | "assistant"; content: unknown }[],
): AskThreadState | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== "assistant") continue;
    const content = message.content;
    if (typeof content !== "object" || content === null) return null;
    return readAskThreadState((content as Record<string, unknown>).state);
  }
  return null;
}

/**
 * The headline of the previous answer, from the conversation's turns as the
 * plan prompt receives them (`conversationTurnsFromMessages()` joins an
 * answer's headline and body with a blank line, headline first). Null when
 * there is no earlier answer.
 */
export function previousHeadlineFromTurns(
  turns: readonly { role: "user" | "assistant"; content: string }[],
): string | null {
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index];
    if (turn.role !== "assistant") continue;
    const headline = oneLine(turn.content.split(/\n\s*\n/)[0] ?? "");
    return headline === "" ? null : headline;
  }
  return null;
}
