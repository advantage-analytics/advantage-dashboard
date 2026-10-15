import { isUuid } from "@/lib/admin/validation";
import { compareKindOfSql } from "@/lib/services/ask/compare";
import type { AskRpcClient } from "@/lib/services/ask/database";
import { ASK_PLAN_EXAMPLE_NAMES } from "@/lib/services/ask/prompts";
import { ASK_REVIEW_SQL } from "@/lib/services/ask/review";
import type { AskScope } from "@/lib/services/ask/scope";

/**
 * Dynamic few-shot from rated answers (roadmap 1.6).
 *
 * A thumbs-up on an answer, a pair from the eval lists or one of the
 * prompt's own worked examples is a (question → planner reply) pair. Each
 * is embedded (`src/lib/llm/embeddings.ts`) and kept in `ask_examples`
 * (`20261015094614_ask_examples.sql`); for a new question the route embeds
 * the question, retrieves the nearest three and `buildPlanPrompt()` shows
 * them in the prompt's dynamic tail, after the fixed worked examples, as the
 * nearest guide.
 *
 * THE SERVICE ROLE, A FOURTH CALL. `ask_similar_examples` is executable by
 * `service_role` only, like the three calls `database.ts` makes, and for
 * the same reason: it is reached only from the server, with the session
 * user's id pinned as `p_viewer` by the server and never read from a
 * request. It is called here rather than through `database.ts`'s closed
 * list because it runs BEFORE the orchestrator — in parallel with the other
 * pre-stream reads, from the route — and reads no table of the viewer's:
 * the function returns shared rows (eval and seed pairs whose names are
 * placeholders) and the viewer's own thumbs-ups, nothing of anyone else's.
 * `retrieveAskExamples()` is the one caller and binds the viewer the way
 * `createAskDatabase()` does: from the argument the route took off its own
 * `auth.getUser()`, dropped and rewritten if anything upstream named one.
 *
 * The feedback route's ingest runs as the signed-in user: `ask_feedback_pair`
 * reads their own thumbs-up, `ask_example_from_feedback` writes it under
 * their id. Best effort, after the rating is saved: it never fails a rating.
 *
 * Shared rows are anonymised before they are written (`anonymiseAskExample`):
 * an `ilike` name filter and the word it was read from become the prompt's
 * own placeholders, and tagged match ids become the worked example's.
 * `foreignScopeName()` in `ask.ts` already treats those placeholders as
 * nobody's, so a planner that copies one is sent back and then corrected.
 */

/** How many examples the route asks for. */
export const MAX_ASK_RETRIEVED_EXAMPLES = 3;
/** The table's limits on a pair. */
export const MAX_ASK_EXAMPLE_QUESTION_LENGTH = 1000;
export const MAX_ASK_EXAMPLE_SQL_LENGTH = 8000;

export type AskExampleSource = "feedback" | "eval" | "seed";

/** One pair as the prompt prints it: the question and the planner reply, as JSON text. */
export interface AskExample {
  question: string;
  /** The planner reply the question got: `{"scope_sql", "sql"}`, or the compare / review form. */
  sql: string;
  source?: AskExampleSource;
}

/** The match id the prompt's worked comparison example uses; a tagged id in a shared pair becomes it. */
export const ASK_EXAMPLE_MATCH_ID = "9b1e5d2c-2f6a-4e0b-8a3c-5d7e9f1a2b3c";

/**
 * The planner reply a saved plan stands for, as the JSON text the prompt
 * prints: a comparison's constant query names its kind, the review's names
 * the review, and anything else is shape A with both queries. The advice
 * flag is left out — a pair does not record it, and the reply schema makes
 * the planner write its own.
 */
export function examplePlanReply(plan: {
  scopeSql: string;
  sql: string;
}): string {
  const scopeSql = oneLine(plan.scopeSql);
  const compare = compareKindOfSql(plan.sql);
  if (compare) return JSON.stringify({ compare, scope_sql: scopeSql });
  if (plan.sql === ASK_REVIEW_SQL) {
    return JSON.stringify({ review: true, scope_sql: scopeSql });
  }
  return JSON.stringify({ scope_sql: scopeSql, sql: oneLine(plan.sql) });
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

const NAME_FILTER =
  /\b(player_name|opponent_name)\s+ilike\s+'%([^%']{1,40})%'/gi;
/** A uuid anywhere in a text (`UUID_RE` in validation.ts is anchored to a whole value). */
const UUID_ANYWHERE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/**
 * A shared pair with its names replaced by the prompt's placeholders. Each
 * `player_name ilike '%core%'` becomes PlayerA (a second player PlayerB),
 * each `opponent_name ilike` OpponentX; in the question, the word the core
 * was read from — and the capitalised words right after it, a surname —
 * become the same placeholder. A uuid in the reply becomes the worked
 * example's match id. A pair with no name filter and no id is returned as
 * it is: a question that names nobody has nothing to hide.
 */
export function anonymiseAskExample(example: AskExample): AskExample {
  const [playerA, playerB, opponentX] = ASK_PLAN_EXAMPLE_NAMES;
  let sql = example.sql;
  let question = example.question;
  const players: string[] = [];
  const replacements: { core: string; placeholder: string }[] = [];
  for (const match of example.sql.matchAll(NAME_FILTER)) {
    const column = match[1].toLowerCase();
    const core = match[2].trim();
    if (core === "" || replacements.some((entry) => entry.core === core)) {
      continue;
    }
    let placeholder: string;
    if (column === "player_name") {
      if (!players.includes(core)) players.push(core);
      placeholder = players.indexOf(core) === 0 ? playerA : playerB;
    } else {
      placeholder = opponentX;
    }
    replacements.push({ core, placeholder });
  }
  for (const { core, placeholder } of replacements) {
    const escaped = core.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    sql = sql.replace(
      new RegExp(`'%${escaped}%'`, "gi"),
      `'%${placeholder.toLowerCase()}%'`,
    );
    // The word the core came from, in any case, then the capitalised words
    // that follow it — a surname, with its lowercase particles ("van",
    // "de") — and a possessive at the end: one placeholder. Only the core is
    // matched case-insensitively; a following word must be capitalised, or
    // the rest of the sentence would be eaten.
    const anyCase = [...core]
      .map((char) =>
        /[a-z]/i.test(char)
          ? `[${char.toLowerCase()}${char.toUpperCase()}]`
          : char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      )
      .join("");
    question = question.replace(
      new RegExp(
        `\\b${anyCase}[\\w-]*(?:\\s+(?:(?:van|von|de|da|del|della|di|la|le|du|der)\\s+)*[A-Z][\\w-]+)*('s)?`,
        "g",
      ),
      (_whole, possessive: string | undefined) =>
        `${placeholder}${possessive ?? ""}`,
    );
  }
  sql = sql.replace(UUID_ANYWHERE, ASK_EXAMPLE_MATCH_ID);
  // Several ids collapsed to one: list it once.
  sql = sql.replace(
    new RegExp(
      `'${ASK_EXAMPLE_MATCH_ID}'(?:\\s*,\\s*'${ASK_EXAMPLE_MATCH_ID}')+`,
      "g",
    ),
    `'${ASK_EXAMPLE_MATCH_ID}'`,
  );
  return { ...example, question, sql };
}

/** Rows as `ask_similar_examples` returns them, each checked for shape and size; anything else is left out. */
export function readAskExampleRows(data: unknown): AskExample[] {
  if (!Array.isArray(data)) return [];
  const examples: AskExample[] = [];
  for (const row of data) {
    if (typeof row !== "object" || row === null) continue;
    const { question, sql, source } = row as Record<string, unknown>;
    if (typeof question !== "string" || typeof sql !== "string") continue;
    const q = oneLine(question);
    const s = oneLine(sql);
    if (
      q === "" ||
      s === "" ||
      q.length > MAX_ASK_EXAMPLE_QUESTION_LENGTH ||
      s.length > MAX_ASK_EXAMPLE_SQL_LENGTH
    ) {
      continue;
    }
    examples.push({
      question: q,
      sql: s,
      ...(source === "feedback" || source === "eval" || source === "seed"
        ? { source }
        : {}),
    });
  }
  return examples;
}

/**
 * The nearest examples to a question, for its plan prompt. Empty — never a
 * failure — when there is no embedding (the provider is not Gemini, or the
 * call failed), when the function refused, or when nothing is stored yet.
 *
 * `service` is the service-role client's `.rpc()` and `viewerId` the
 * route's own `auth.getUser()` id; it is written into `p_viewer` here and
 * nowhere else. Throws when `viewerId` is not a uuid, as `createAskDatabase()`
 * does: a missing viewer must stop here, not reach the function as null.
 */
export async function retrieveAskExamples(input: {
  service: AskRpcClient;
  viewerId: string;
  scope: AskScope;
  embedding: number[] | null | Promise<number[] | null>;
  limit?: number;
}): Promise<AskExample[]> {
  if (!isUuid(input.viewerId)) {
    throw new Error(
      "retrieveAskExamples: viewerId must be the session user id.",
    );
  }
  let embedding: number[] | null;
  try {
    embedding = await input.embedding;
  } catch {
    embedding = null;
  }
  if (!embedding) return [];
  try {
    const result = await input.service.rpc("ask_similar_examples", {
      p_embedding: embedding,
      p_scope: input.scope.kind,
      p_limit: input.limit ?? MAX_ASK_RETRIEVED_EXAMPLES,
      p_viewer: input.viewerId,
    });
    if (result.error) {
      console.warn("[ask] could not retrieve examples", {
        sqlstate: result.error.code,
      });
      return [];
    }
    return readAskExampleRows(result.data).slice(
      0,
      input.limit ?? MAX_ASK_RETRIEVED_EXAMPLES,
    );
  } catch (error) {
    console.warn("[ask] could not retrieve examples", {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

/** What `ask_feedback_pair` answers for a thumbs-up worth learning from. */
export function readAskFeedbackPair(data: unknown): {
  question: string;
  scopeSql: string;
  sql: string;
} | null {
  if (typeof data !== "object" || data === null) return null;
  const record = data as Record<string, unknown>;
  const question =
    typeof record.question === "string" ? oneLine(record.question) : "";
  const sql = typeof record.sql === "string" ? record.sql : "";
  const scopeSql = typeof record.scope_sql === "string" ? record.scope_sql : "";
  if (question === "" || sql.trim() === "" || scopeSql.trim() === "") {
    return null;
  }
  return { question, scopeSql, sql };
}

/**
 * After a thumbs-up was saved: read the pair back as the user, embed the
 * question, store it as the user's own example. Every outcome is a word for
 * the log; nothing here throws, and nothing here can fail the rating.
 */
export async function addAskFeedbackExample(input: {
  user: AskRpcClient;
  messageId: string;
  embed: (text: string) => Promise<number[] | null>;
}): Promise<"added" | "skipped" | "failed"> {
  try {
    const read = await input.user.rpc("ask_feedback_pair", {
      p_message_id: input.messageId,
    });
    if (read.error) {
      console.warn("[ask] could not read a thumbs-up pair", {
        sqlstate: read.error.code,
      });
      return "failed";
    }
    const pair = readAskFeedbackPair(read.data);
    if (!pair) return "skipped";
    const reply = examplePlanReply(pair);
    if (reply.length > MAX_ASK_EXAMPLE_SQL_LENGTH) return "skipped";
    const embedding = await input.embed(pair.question);
    if (!embedding) return "skipped";
    const written = await input.user.rpc("ask_example_from_feedback", {
      p_message_id: input.messageId,
      p_sql: reply,
      p_embedding: embedding,
    });
    if (written.error) {
      console.warn("[ask] could not store a thumbs-up example", {
        sqlstate: written.error.code,
      });
      return "failed";
    }
    return "added";
  } catch (error) {
    console.warn("[ask] could not store a thumbs-up example", {
      error: error instanceof Error ? error.message : String(error),
    });
    return "failed";
  }
}
