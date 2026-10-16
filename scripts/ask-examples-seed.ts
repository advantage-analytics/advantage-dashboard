/**
 * Fill Ask's example store (`ask_examples`, roadmap 1.6) with (question →
 * planner reply) pairs, embedded for similarity retrieval
 * (`docs/llm-setup.md` §11).
 *
 *   npx tsx scripts/ask-examples-seed.ts [--from-static] [--from-eval] [--from-feedback] [--dry-run]
 *
 *   --from-static    the plan prompts' own worked examples (`prompts.ts`),
 *                    source `seed`, shared (no owner). Always safe to run.
 *   --from-eval      the eval lists (`scripts/ask-eval-season.json` for the
 *                    personal prompt, `scripts/ask-eval-team.json` for the
 *                    team one), source `eval`, shared: a question that
 *                    carries a question-level `plan` object (the reply the
 *                    planner should give), and a review question
 *                    (`expect.shape` "C") whose reply is the review of every
 *                    match — or of the tagged player's. Nothing else in a
 *                    list is a known-good pair, so nothing else is written.
 *   --from-feedback  every thumbs-up in `ask_feedback` whose answer carries
 *                    its plan, source `feedback`, owned by the rater and
 *                    shown to their planner alone. The feedback route adds
 *                    these as they happen; this backfills the ones before.
 *   --dry-run        print the pairs and write nothing; no embedding is made.
 *
 * Shared pairs are anonymised (`anonymiseAskExample`): a name filter and the
 * word it came from become the prompts' placeholders, tagged ids the worked
 * example's. Owned pairs keep their names — their owner is the only reader.
 *
 * Needs `LLM_PROVIDER=openai` and `OPENAI_API_KEY` (the embeddings endpoint
 * is Gemini's), and `SUPABASE_SERVICE_ROLE_KEY`: `ask_example_upsert` is
 * executable by service_role only, and the feedback rows are read with it.
 * Nothing else is done with the key. Re-running is safe: a pair is one row
 * per (scope, source, owner, question), updated in place.
 */
import { readFileSync } from "node:fs";
import { loadEnvLocal } from "./lib/env";
import { embedText } from "@/lib/llm/embeddings";
import { isLLMConfigured } from "@/lib/llm/adapter";
import {
  anonymiseAskExample,
  examplePlanReply,
  type AskExample,
  type AskExampleSource,
} from "@/lib/services/ask/examples";
import {
  ASK_PLAN_EXAMPLE_BASELINE,
  ASK_PLAN_EXAMPLE_COMPARE,
  ASK_PLAN_EXAMPLE_NAMES,
  ASK_PLAN_EXAMPLE_PARTS,
  ASK_PLAN_EXAMPLE_QUERY,
  ASK_PLAN_EXAMPLE_REFUSAL,
  ASK_PLAN_EXAMPLE_REVIEW,
  ASK_TEAM_PLAN_EXAMPLE_BREAKDOWN,
  ASK_TEAM_PLAN_EXAMPLE_LINEUP_REFUSAL,
  ASK_TEAM_PLAN_EXAMPLE_OPPONENT,
  ASK_TEAM_PLAN_EXAMPLE_PLAYER,
  ASK_TEAM_PLAN_EXAMPLE_PLAYERS,
  ASK_TEAM_PLAN_EXAMPLE_REFUSAL,
  ASK_TEAM_PLAN_EXAMPLE_REVIEW,
} from "@/lib/services/ask/prompts";
import { createAdminClient } from "@/lib/supabase/admin";

loadEnvLocal();
for (const key of Object.keys(process.env)) {
  if (key.includes("POSTHOG")) delete process.env[key];
}

type Scope = "personal" | "team";

interface Pair extends AskExample {
  scope: Scope;
  source: AskExampleSource;
  quality: number;
  userId: string | null;
  messageId: string | null;
}

const args = new Set(process.argv.slice(2));
const fromStatic = args.has("--from-static");
const fromEval = args.has("--from-eval");
const fromFeedback = args.has("--from-feedback");
const dryRun = args.has("--dry-run");
if (!fromStatic && !fromEval && !fromFeedback) {
  console.error(
    "Usage: npx tsx scripts/ask-examples-seed.ts [--from-static] [--from-eval] [--from-feedback] [--dry-run]",
  );
  process.exit(1);
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name} (set it in .env.local or the shell).`);
    process.exit(1);
  }
  return value;
}

// ── The prompts' worked examples ────────────────────────────────────────────

const STATIC: { scope: Scope; question: string; reply: object }[] = [
  {
    scope: "personal",
    question: "How is my second serve against left-handers this year?",
    reply: ASK_PLAN_EXAMPLE_QUERY,
  },
  {
    scope: "personal",
    question: "Do I win more points on my first serve or my second?",
    reply: ASK_PLAN_EXAMPLE_PARTS,
  },
  {
    scope: "personal",
    question: "Why did I lose to OpponentX?",
    reply: ASK_PLAN_EXAMPLE_COMPARE,
  },
  {
    scope: "personal",
    question: "How was my serve in August?",
    reply: ASK_PLAN_EXAMPLE_BASELINE,
  },
  {
    scope: "personal",
    question: "How can I improve for my next match?",
    reply: ASK_PLAN_EXAMPLE_REVIEW,
  },
  {
    scope: "personal",
    question: "How do I fix my footwork?",
    reply: ASK_PLAN_EXAMPLE_REFUSAL,
  },
  {
    scope: "team",
    question: "What is each player's record?",
    reply: ASK_TEAM_PLAN_EXAMPLE_BREAKDOWN,
  },
  {
    scope: "team",
    question: "Compare PlayerA and PlayerB on serve",
    reply: ASK_TEAM_PLAN_EXAMPLE_PLAYERS,
  },
  {
    scope: "team",
    question: "How is PlayerA serving this season?",
    reply: ASK_TEAM_PLAN_EXAMPLE_PLAYER,
  },
  {
    scope: "team",
    question: "How should PlayerA play against OpponentX?",
    reply: ASK_TEAM_PLAN_EXAMPLE_OPPONENT,
  },
  {
    scope: "team",
    question: "How can PlayerA improve for the next match?",
    reply: ASK_TEAM_PLAN_EXAMPLE_REVIEW,
  },
  {
    scope: "team",
    question: "How is our number one player doing?",
    reply: ASK_TEAM_PLAN_EXAMPLE_LINEUP_REFUSAL,
  },
  {
    scope: "team",
    question: "Who has the best footwork on the team?",
    reply: ASK_TEAM_PLAN_EXAMPLE_REFUSAL,
  },
];

function staticPairs(): Pair[] {
  return STATIC.map((entry) => ({
    scope: entry.scope,
    question: entry.question,
    sql: JSON.stringify(entry.reply),
    source: "seed",
    quality: 2,
    userId: null,
    messageId: null,
  }));
}

// ── The eval lists ──────────────────────────────────────────────────────────

interface EvalQuestion {
  q: string;
  players?: string[];
  plan?: Record<string, unknown>;
  expect?: { shape?: string };
}

function evalPairs(): Pair[] {
  const lists: { scope: Scope; file: string }[] = [
    { scope: "personal", file: "scripts/ask-eval-season.json" },
    { scope: "team", file: "scripts/ask-eval-team.json" },
  ];
  const pairs: Pair[] = [];
  for (const { scope, file } of lists) {
    let questions: EvalQuestion[];
    try {
      questions = JSON.parse(readFileSync(file, "utf8")) as EvalQuestion[];
    } catch {
      console.warn(`skipping ${file}: not readable as a question list`);
      continue;
    }
    for (const question of questions) {
      if (typeof question.q !== "string" || question.q.trim() === "") continue;
      let reply: string | null = null;
      if (question.plan && typeof question.plan === "object") {
        reply = JSON.stringify(question.plan);
      } else if (question.expect?.shape === "C") {
        // The tagged player's own name, so the anonymiser below turns it
        // into the placeholder in the question AND the filter together; a
        // placeholder written here alone left the question naming one
        // player and the filter another.
        const tagged = question.players?.[0]?.trim();
        // A team review with no tagged player is the whole program's only
        // when the question says so; one that names a player in its text
        // alone is left out, since its true reply filters by that name.
        if (
          scope === "team" &&
          !tagged &&
          !/\b(we|our|us|team)\b/i.test(question.q)
        ) {
          continue;
        }
        const scopeSql =
          scope === "team" && tagged
            ? `select match_id from ask.matches where player_name ilike '%${tagged.toLowerCase().replace(/'/g, "''")}%'`
            : "select match_id from ask.matches";
        reply = JSON.stringify({ review: true, scope_sql: scopeSql });
      }
      if (reply === null) continue;
      const anonymised = anonymiseAskExample({
        question: question.q,
        sql: reply,
      });
      pairs.push({
        scope,
        question: anonymised.question,
        sql: anonymised.sql,
        source: "eval",
        quality: 2,
        userId: null,
        messageId: null,
      });
    }
  }
  return pairs;
}

// ── Thumbs-ups ──────────────────────────────────────────────────────────────

async function feedbackPairs(
  admin: ReturnType<typeof createAdminClient>,
): Promise<Pair[]> {
  const { data, error } = await admin
    .from("ask_feedback")
    .select("message_id, user_id, program_id, question, answer")
    .eq("rating", "up");
  if (error) {
    console.error(`could not read ask_feedback: ${error.message}`);
    process.exit(1);
  }
  const pairs: Pair[] = [];
  for (const row of data ?? []) {
    const question = row.question as { text?: unknown } | null;
    const answer = row.answer as {
      sql?: unknown;
      scopeSql?: unknown;
      mock?: unknown;
    } | null;
    const text = typeof question?.text === "string" ? question.text : "";
    if (
      !row.message_id ||
      !row.user_id ||
      text.trim() === "" ||
      answer?.mock === true ||
      typeof answer?.sql !== "string" ||
      typeof answer?.scopeSql !== "string"
    ) {
      continue;
    }
    pairs.push({
      scope: row.program_id ? "team" : "personal",
      question: text,
      sql: examplePlanReply({ scopeSql: answer.scopeSql, sql: answer.sql }),
      source: "feedback",
      quality: 1,
      userId: row.user_id as string,
      messageId: row.message_id as string,
    });
  }
  return pairs;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  if (!dryRun) {
    required("NEXT_PUBLIC_SUPABASE_URL");
    required("SUPABASE_SERVICE_ROLE_KEY");
    if (process.env.LLM_PROVIDER !== "openai" || !isLLMConfigured()) {
      console.error(
        "Embeddings need LLM_PROVIDER=openai and OPENAI_API_KEY (Gemini's endpoint).",
      );
      process.exit(1);
    }
  }
  const admin = dryRun && !fromFeedback ? null : createAdminClient();

  const pairs: Pair[] = [];
  if (fromStatic) pairs.push(...staticPairs());
  if (fromEval) pairs.push(...evalPairs());
  if (fromFeedback && admin) pairs.push(...(await feedbackPairs(admin)));
  console.log(`${pairs.length} pair(s) to write`);

  let written = 0;
  let skipped = 0;
  let failed = 0;
  for (const pair of pairs) {
    const label = `${pair.scope}/${pair.source}${pair.userId ? " (owned)" : ""}: ${JSON.stringify(pair.question)}`;
    if (dryRun) {
      console.log(`${label}\n  ${pair.sql}`);
      continue;
    }
    const embedding = await embedText(pair.question);
    if (!embedding) {
      skipped += 1;
      console.warn(`skipped (no embedding) ${label}`);
      continue;
    }
    const { error } = await admin!.rpc("ask_example_upsert", {
      p_scope: pair.scope,
      p_question: pair.question,
      p_sql: pair.sql,
      p_source: pair.source,
      p_quality: pair.quality,
      p_embedding: embedding,
      p_user_id: pair.userId,
      p_message_id: pair.messageId,
    });
    if (error) {
      failed += 1;
      console.warn(`failed (${error.code ?? "?"}) ${label}`);
      continue;
    }
    written += 1;
  }
  if (!dryRun) {
    console.log(`written ${written}, skipped ${skipped}, failed ${failed}`);
    if (failed > 0) process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
