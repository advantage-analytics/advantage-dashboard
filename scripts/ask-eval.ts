/**
 * Run a list of realistic questions through the real Ask pipeline and write
 * what came back, so prompt changes are judged on output and not on hope.
 *
 *   npx tsx scripts/ask-eval.ts --out <file.md> [--only 3,7] [--questions <file.json>] [--program <uuid>] [--sub "Placeholder=Real Name" ...] [--grade] [--no-examples] [--retries 1]
 *
 * A question may carry an `expect` block (`AskEvalExpect` in
 * `scripts/lib/ask-eval-grade.ts`): the error code or `none`, the planner's
 * shape, the visual's kind, the notice, ceilings on model calls, queries and
 * seconds, patterns the answer must and must not match, patterns the final
 * query must match. Each question's progress line ends `PASS`, `FAIL` with
 * the reasons, or `unscored` when it has no block; the report opens with a
 * `## Score` section. `--grade` exits 1 when any scored question failed —
 * the nightly workflow (`.github/workflows/ask-eval.yml`) runs the season
 * list that way. `scripts/ask-eval-season.json` is graded against the values
 * `scripts/seed-ask-season.ts` derives; the verifier also has matches the
 * seed did not write, so its blocks pin exact figures only where the question
 * is scoped to seeded opponents, and each says so in a `note`.
 *
 * `--program` runs every question in TEAM scope for that program: the tag
 * options are the program's matches and roster, the plan and answer prompts
 * are the team ones, and the query runs through `ask_run_team_query`. The
 * account must be a member of the program (the verifier is a coach on the ZZ
 * Test Program). `scripts/ask-eval-team.json` is the coach's question list.
 * The names in it are placeholders — players Sokolov and Reyes, opponents
 * Okafor and Lindqvist — because a roster is not something to commit. A
 * `players` or `opponents` tag that names nobody on the roster is reported as
 * `TAG REFUSED` and its question skipped, so a straight run of that file
 * refuses every tagged question. Put the program's own names in at run time
 * with `--sub`, and leave the file as it is:
 *
 *   npx tsx scripts/ask-eval.ts --out report.md --program <uuid> \
 *     --questions scripts/ask-eval-team.json \
 *     --sub "Sokolov=Rudy Quan" --sub "Reyes=Emon van Loben Sels"
 *
 * `--sub "From=To"` is repeatable. Each replaces the whole word `From`
 * (case-sensitive; "Sokolov's" becomes "Rudy Quan's") in the question's
 * text, in every name it tags (`players`, `opponents`, `matches`) BEFORE the
 * tags are resolved, and in its `want` note. It works on any question list,
 * the built-in one included. The report then carries the real names — keep
 * it out of the repo. `scripts/lib/ask-eval-subs.ts` is the function.
 *
 * It signs in as the eyes-on verifier account (EYES_ON_EMAIL /
 * EYES_ON_PASSWORD), builds that account's tag options, and for each question
 * calls `askQuestion()` — the same orchestration `/api/ask` runs — with the
 * configured model and the account's own Supabase session, so the plan, the
 * SQL guard, `ask_run_query`, the renderer and the chart blocks are all the
 * real ones. The retrieved examples are real too: as the route does, each
 * question is embedded and the nearest rated pairs (`ask_examples`,
 * roadmap 1.6) go into the plan prompt's tail, with the verifier's id pinned
 * as the viewer; each block names what was retrieved. `--no-examples` skips
 * that read, so a run can judge the prompt on its own.
 *
 * `--retries N` runs a scored question that failed up to N more times and
 * scores its last run; each retry is its own block, marked. The planner is
 * not deterministic at temperature 0 — on 2026-10-15 five graded runs of the
 * season list failed five different sets of one to three questions, a shape
 * or a refusal flipping on a question that passed the run before — so a
 * failure that holds twice is a finding and one that does not is noise. The
 * nightly workflow passes 1.
 *
 * The query functions are executable by `service_role` only, so — exactly as
 * the route does — the database it hands `askQuestion()` comes from
 * `createAskDatabase()` (`src/lib/services/ask/database.ts`): those calls go
 * to a service-role client with the signed-in verifier's id as the viewer,
 * everything else to the verifier's own session. SUPABASE_SERVICE_ROLE_KEY is
 * therefore required, and is used for nothing but those function calls.
 *
 * Two things are NOT real, on purpose:
 *   - nothing is reserved against the month's questions (`reservation: null`);
 *   - `ask_save_exchange_ids` is intercepted, so no conversation is written.
 *
 * The report holds the model's raw replies, the SQL and the rows — a player's
 * statistics. The verifier's matches are fixtures; if you point this at
 * another account, keep the report out of the repo.
 *
 * PostHog LLM analytics are switched off for the run so evaluation calls do
 * not land in product metrics.
 */
import { writeFileSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type { AskEvalExpect, AskEvalGrade } from "./lib/ask-eval-grade";
import { parseSubs, subArgs, substituteQuestion } from "./lib/ask-eval-subs";
import { loadEnvLocal } from "./lib/env";
import type { AskModelCall } from "@/lib/services/ask/ask";

loadEnvLocal();
for (const key of Object.keys(process.env)) {
  if (key.includes("POSTHOG")) delete process.env[key];
}

interface EvalQuestion {
  /** What the player types. */
  q: string;
  /** Opponent names to tag (matched against the account's opponents). */
  opponents?: string[];
  /** Opponent names whose most recent match to tag as a match. */
  matches?: string[];
  /** Roster player names to tag (team scope only; matched against the roster). */
  players?: string[];
  /** Index of an earlier question whose exchange is the conversation so far. */
  after?: number;
  /** What a good answer does; printed beside the output for the reader. */
  want?: string;
  /** What the run must satisfy to pass; graded by `scripts/lib/ask-eval-grade.ts`. Absent: unscored. */
  expect?: AskEvalExpect;
}

const DEFAULT_QUESTIONS: EvalQuestion[] = [
  {
    q: "Tell me how to beat this opponent",
    opponents: ["Timofey Stepanov"],
    want: "what the match data shows about where points were won and lost against him; no advice; notice",
  },
  {
    q: "What did I do to win this match?",
    matches: ["Riley Marsh"],
    want: "me vs opponent in that match: the measures with the biggest gap",
  },
  {
    q: "Why did I lose to Timofey?",
    opponents: ["Timofey Stepanov"],
    want: "the measures where I trailed him most, me vs him",
  },
  {
    q: "How did I serve against Timofey?",
    opponents: ["Timofey Stepanov"],
    want: "serve numbers vs my other matches or vs his",
  },
  {
    q: "How was my return against Timofey?",
    opponents: ["Timofey Stepanov"],
    want: "return numbers with a comparison",
  },
  {
    q: "Where did I lose the most points against Timofey?",
    opponents: ["Timofey Stepanov"],
    want: "a breakdown of lost points (by ending or by serve/return)",
  },
  {
    q: "How did I do on break points against Timofey?",
    opponents: ["Timofey Stepanov"],
    want: "converted and saved, me vs him",
  },
  {
    q: "What happened in long rallies against Timofey?",
    opponents: ["Timofey Stepanov"],
    want: "rally-length bands won/total",
  },
  {
    q: "Did I play better in the first or second set against Timofey?",
    opponents: ["Timofey Stepanov"],
    want: "points won by set from ask.points",
  },
  { q: "What is my record?", want: "wins and losses; form strip" },
  {
    q: "How has my first serve percentage changed over my matches?",
    want: "trend block, one row per match",
  },
  {
    q: "Which match was my best serving performance?",
    want: "ranked matches, names the best",
  },
  {
    q: "What are my strengths?",
    want: "measures where I beat my opponents across matches",
  },
  {
    q: "What should I work on?",
    want: "factual: the measures where I trail most; no advice; notice",
  },
  {
    q: "How do I do under pressure?",
    want: "break points saved/converted across matches",
  },
  { q: "Where do I serve most?", want: "serve block: T/Body/Wide" },
  {
    q: "How many winners and unforced errors do I hit per match?",
    want: "per-match table or averages",
  },
  {
    q: "Forehand or backhand: which wins me more points?",
    want: "forehand vs backhand winners and errors",
  },
  { q: "How did I do at the net?", want: "net points won / appearances" },
  {
    q: "Compare my match against Jordan Vale with my match against Sam Okafor",
    matches: ["Jordan Vale", "Sam Okafor"],
    want: "two-column table",
  },
  {
    q: "What's my win rate on clay?",
    want: "court_type filter; thin sample said once",
  },
  {
    q: "How fast is my serve?",
    want: "speed_mph from ask.shots, or says it is not recorded",
  },
  {
    q: "Summarize my last match",
    want: "the most recent match: result plus the standout numbers vs opponent",
  },
  {
    q: "Who is the best player on my team?",
    want: "cannot answer: Ask covers your own matches",
  },
  {
    q: "And on second serves?",
    after: 3,
    want: "follow-up understood from the conversation: second-serve numbers against Timofey, one match",
  },
  {
    q: "What about my return?",
    after: 2,
    want: "follow-up keeps Timofey: return numbers me vs him, one match",
  },
  {
    q: "And in the second set?",
    after: 8,
    want: "follow-up keeps the match: second-set points from ask.points",
  },
  {
    q: "How did I do against Timofey Stepanov?",
    want: "untagged name in text: opponent_name ilike; diagnostic me vs him",
  },
  {
    q: "Why did I loose to Timofy?",
    want: "typo: still matches the opponent (ilike on a distinctive part), diagnostic",
  },
  {
    q: "serve?",
    want: "one word: serve numbers across all matches, with a baseline or a block",
  },
  {
    q: "How many matches did I play in September?",
    want: "period: played_on in September 2026; count is matches_in_scope",
  },
  { q: "What's my record this year?", want: "period: this year; form strip" },
  {
    q: "How did I play last month?",
    want: "period: last month; diagnostic or summary across those matches",
  },
  {
    q: "How do I beat Sam Okafor?",
    opponents: ["Sam Okafor"],
    want: "advice-shaped: diagnostic me vs Sam, table, notice",
  },
  {
    q: "Summarize my match against Timofey",
    opponents: ["Timofey Stepanov"],
    want: "result plus me vs him on the measures that differed most",
  },
  { q: "What is the weather like today?", want: "cannot answer: off-topic" },
  {
    q: "How does Roger Federer serve?",
    want: "cannot answer: another person's matches",
  },
];

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name} (set it in .env.local or the shell).`);
    process.exit(2);
  }
  return value;
}

/** The plan of the last query that ran without a database error, as a saved answer records it. */
function lastPlan(
  queries: readonly { scope: unknown; sql: unknown; error: unknown }[],
): { sql?: string; scopeSql?: string } {
  const ran = [...queries].reverse().find((query) => !query.error);
  return ran && typeof ran.sql === "string" && typeof ran.scope === "string"
    ? { sql: ran.sql, scopeSql: ran.scope }
    : {};
}

async function main() {
  const out = arg("out");
  if (!out) {
    console.error(
      'Usage: npx tsx scripts/ask-eval.ts --out <file.md> [--only 1,4] [--questions <file.json>] [--program <uuid>] [--sub "Placeholder=Real Name" ...] [--grade] [--no-examples] [--retries 1]',
    );
    process.exit(2);
  }
  let subs: Map<string, string>;
  try {
    subs = parseSubs(subArgs(process.argv));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
  }
  const questionsFile = arg("questions");
  // Names are substituted here, once, before anything reads the list: the
  // tags are resolved from the substituted names and the model is asked the
  // substituted question.
  const questions: EvalQuestion[] = (
    questionsFile
      ? (JSON.parse(readFileSync(questionsFile, "utf8")) as EvalQuestion[])
      : DEFAULT_QUESTIONS
  ).map((question) => substituteQuestion(question, subs));
  const only = arg("only")
    ?.split(",")
    .map((part) => Number(part.trim()) - 1);

  // Imported after the environment is settled: the adapter reads it.
  const {
    askQuestion,
    conversationTurnsFromMessages,
    previousPlanFromMessages,
  } = await import("@/lib/services/ask/ask");
  const { resolveAskTags } = await import("@/lib/services/ask/tags");
  const { buildAskTagOptions, buildTeamAskTagOptions } =
    await import("@/lib/data/ask-tags");
  const { PERSONAL_ASK_SCOPE } = await import("@/lib/services/ask/scope");
  type AskScope = import("@/lib/services/ask/scope").AskScope;
  type AskTagOptions = import("@/lib/data/ask-tags").AskTagOptions;
  const { getLLMStream, isLLMConfigured, createLLMObservabilityContext } =
    await import("@/lib/llm/adapter");
  const { createAskDatabase } = await import("@/lib/services/ask/database");
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const { embedText } = await import("@/lib/llm/embeddings");
  const { retrieveAskExamples } = await import("@/lib/services/ask/examples");
  // The grader imports `parsePlanReply` from the same module as the pipeline.
  const { gradeTranscript, refusedGrade, gradeLabel, failedReasons, tally } =
    await import("./lib/ask-eval-grade");
  const grading = process.argv.includes("--grade");
  const withExamples = !process.argv.includes("--no-examples");
  const retries = Math.max(0, Math.floor(Number(arg("retries") ?? 0)) || 0);

  if (!isLLMConfigured()) {
    console.error(
      "No LLM provider is configured; this run would only test mock mode.",
    );
    process.exit(2);
  }

  const supabase = createClient(
    required("NEXT_PUBLIC_SUPABASE_URL"),
    required("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    { auth: { persistSession: false } },
  );
  // The verifier's credentials first — without them there is no run — then
  // the service key, both before a sign-in is spent on a run that cannot
  // finish: without the key the server-only functions cannot be called.
  const email = required("EYES_ON_EMAIL");
  const password = required("EYES_ON_PASSWORD");
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error(
      "Missing SUPABASE_SERVICE_ROLE_KEY (set it in .env.local or the shell): ask_run_query and ask_run_team_query are executable by the service role only.",
    );
    process.exit(2);
  }
  const serviceRole = createAdminClient();
  const signIn = await supabase.auth.signInWithPassword({ email, password });
  if (signIn.error || !signIn.data.user) {
    console.error(`Sign-in failed: ${signIn.error?.message ?? "no user"}`);
    process.exit(2);
  }
  const viewerId = signIn.data.user.id;

  // The one database every question below runs through — the route's own
  // routing, with the verifier's signed-in id as the viewer.
  const askDatabase = createAskDatabase({
    user: { rpc: (fn, args) => supabase.rpc(fn, args) },
    service: { rpc: (fn, args) => serviceRole.rpc(fn, args) },
    viewerId,
  });

  const MATCH_COLUMNS =
    "id, date, player1_id, player2_id, player1_name, player2_name, created_by, score, tournament_name, round, result, match_type, court_type, verified, duration, opponent_hand, opponent_backhand";
  const programId = arg("program") ?? null;
  let scope: AskScope = PERSONAL_ASK_SCOPE;
  let options: AskTagOptions;
  if (programId) {
    // What `getAskTagOptions(programId)` reads (src/lib/data/ask-server.ts),
    // restated because that module imports the cookie client.
    const [program, teamRows, roster] = await Promise.all([
      supabase
        .from("programs")
        .select("school_name")
        .eq("id", programId)
        .maybeSingle(),
      supabase
        .from("matches")
        .select(`${MATCH_COLUMNS}, event_entry_id`)
        .eq("program_id", programId)
        .order("date", { ascending: false, nullsFirst: false }),
      supabase.rpc("program_roster_full", { p_program_id: programId }),
    ]);
    const failed = program.error ?? teamRows.error ?? roster.error;
    if (failed) throw new Error(failed.message);
    const programName = (program.data as { school_name?: string } | null)
      ?.school_name;
    if (!programName) {
      console.error(`Program ${programId} is not readable by this account.`);
      process.exit(2);
    }
    scope = { kind: "team", programId, programName };
    options = buildTeamAskTagOptions(
      teamRows.data as never,
      (roster.data ?? []) as never,
    );
  } else {
    options = await personalOptions();
  }

  async function personalOptions(): Promise<AskTagOptions> {
    const matchRows = await supabase
      .from("matches")
      .select(MATCH_COLUMNS)
      .eq("created_by", viewerId)
      .is("program_id", null)
      .order("date", { ascending: false, nullsFirst: false });
    if (matchRows.error) throw new Error(matchRows.error.message);
    const ids = await supabase.rpc("my_player_ids");
    const mine: string[] = (ids.data ?? []).map((row: unknown) =>
      typeof row === "string"
        ? row
        : (row as { my_player_ids: string }).my_player_ids,
    );
    // playerSide()'s three steps (src/lib/data/player-identity-server.ts),
    // restated because that module imports the cookie client.
    return buildAskTagOptions(matchRows.data as never, (match) => {
      const row = match as {
        player1_id: string | null;
        player2_id: string | null;
        created_by: string | null;
      };
      if (row.player1_id && mine.includes(row.player1_id)) return "player1";
      if (row.player2_id && mine.includes(row.player2_id)) return "player2";
      if (!row.player1_id && !row.player2_id && row.created_by === viewerId)
        return "player1";
      return null;
    });
  }

  const report: string[] = [
    `# Ask evaluation — ${new Date().toISOString()}`,
    "",
    scope.kind === "team"
      ? `Program: ${scope.programName} · ${options.matches.length} matches · ${options.players.length} players · ${options.opponents.length} opponents`
      : `Account: verifier · ${options.matches.length} personal matches · ${options.opponents.length} opponents`,
    "",
  ];
  // The `## Score` section goes in here, once every question has run.
  const headerLines = report.length;
  /** Every question that ran (or whose tags were refused), with its grade. */
  const grades: { index: number; q: string; grade: AskEvalGrade }[] = [];
  /**
   * Each earlier exchange in the shape `ask_save_exchange()` stores it — the
   * question with its saved tags, the answer with its headline and body — so
   * a follow-up's conversation goes through the same
   * `conversationTurnsFromMessages()` the route uses. Null when the question
   * was skipped (`--only`) or produced no answer.
   */
  const transcripts: ({
    question: { text: string; tags: unknown };
    answer: { headline: string; body: string; sql?: string; scopeSql?: string };
  } | null)[] = [];

  /**
   * One run of one question: its report block, its transcript slot, its
   * stdout line, and the grade it earned. `attempt` above 0 is a retry
   * (`--retries`), marked in the block and the line.
   */
  const runQuestion = async (
    index: number,
    entry: EvalQuestion,
    attempt: number,
  ): Promise<AskEvalGrade> => {
    const retryMark = attempt > 0 ? ` (retry ${attempt})` : "";
    const requested = [
      ...(entry.opponents ?? []).map((name) => {
        const found = options.opponents.find(
          (o) => o.name.toLowerCase() === name.toLowerCase(),
        );
        return { kind: "opponent" as const, id: found?.id ?? name };
      }),
      ...(entry.matches ?? []).map((name) => {
        const found = options.matches.find(
          (m) => (m.opponentName ?? "").toLowerCase() === name.toLowerCase(),
        );
        return { kind: "match" as const, id: found?.matchId ?? name };
      }),
      ...(entry.players ?? []).map((name) => {
        const found = options.players.find(
          (p) => p.name.toLowerCase() === name.toLowerCase(),
        );
        return { kind: "player" as const, id: found?.id ?? name };
      }),
    ];
    const resolved = resolveAskTags(requested, options, scope);
    const lines: string[] = [`## ${index + 1}. ${entry.q}${retryMark}`, ""];
    if (requested.length > 0)
      lines.push(
        `Tags: ${JSON.stringify(requested.map((t) => t.kind))} ${(entry.opponents ?? []).concat(entry.matches ?? [], entry.players ?? []).join(", ")}`,
      );
    if (entry.want) lines.push(`Want: ${entry.want}`, "");
    if (!resolved.ok) {
      // Never ran, so a graded question fails here rather than vanishing
      // from the score.
      const grade = refusedGrade(entry.expect, resolved.reason);
      lines.push(`TAG REFUSED: ${resolved.reason}`, "");
      if (grade.scored) lines.push(`**Score:** ${gradeLabel(grade)}`, "");
      report.push(...lines);
      transcripts.push(null);
      process.stdout.write(
        `${index + 1}/${questions.length} TAG REFUSED ${entry.q}${retryMark} · ${gradeLabel(grade)}\n`,
      );
      return grade;
    }

    const modelReplies: string[] = [];
    const queries: {
      scope: unknown;
      sql: unknown;
      rows: unknown;
      error: unknown;
    }[] = [];
    const warnings: string[] = [];
    const warn = console.warn;
    const error = console.error;
    console.warn = (...args: unknown[]) =>
      void warnings.push(
        args
          .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
          .join(" "),
      );
    console.error = console.warn;

    const db = {
      async rpc(fn: string, args?: Record<string, unknown>) {
        if (fn === "ask_save_exchange_ids") {
          return {
            data: {
              conversation_id: "00000000-0000-4000-8000-00000000e7a1",
              answer_id: "00000000-0000-4000-8000-00000000e7a2",
            },
            error: null,
          };
        }
        const result = await askDatabase.rpc(fn, args);
        if (fn === "ask_run_query" || fn === "ask_run_team_query") {
          queries.push({
            scope: args?.scope_sql,
            sql: args?.sql,
            rows: (result.data as { rows?: unknown } | null)?.rows ?? null,
            error: result.error
              ? `${result.error.code} ${result.error.message}`
              : null,
          });
        }
        return { data: result.data, error: result.error };
      },
    };
    const context = createLLMObservabilityContext(`ask-eval:${viewerId}`);
    const model = {
      configured: true,
      async stream(
        system: string,
        messages: { role: "user" | "assistant"; content: string }[],
        call?: AskModelCall,
      ) {
        // The same options the route sends (src/app/api/ask/route.ts), so an
        // eval plans under the schema and settings production uses.
        const source = await getLLMStream(system, messages, context, {
          span: call ? `ask.${call.stage}` : "ask",
          temperature: call?.temperature,
          maxTokens: call?.maxTokens,
          jsonSchema: call?.jsonSchema,
          staticPrefixLength: call?.staticPrefixLength,
        });
        const slot = modelReplies.push("") - 1;
        return (async function* () {
          for await (const chunk of source) {
            modelReplies[slot] += chunk;
            yield chunk;
          }
        })();
      },
    };

    const prior = entry.after === undefined ? null : transcripts[entry.after];
    const conversation = prior
      ? conversationTurnsFromMessages([
          { role: "user", content: prior.question },
          { role: "assistant", content: prior.answer },
        ])
      : [];
    if (entry.after !== undefined) {
      lines.push(
        prior
          ? `Conversation: ${conversation.length} turn(s) from question ${entry.after + 1}`
          : `Conversation: question ${entry.after + 1} has no answer to follow`,
        "",
      );
    }

    // The nearest rated pairs, read as the route reads them: the question
    // embedded, `ask_similar_examples` through the service client with the
    // verifier pinned as the viewer. An embedding that fails is null and
    // the prompt keeps its fixed examples — never a failed question.
    let examples: import("@/lib/services/ask/examples").AskExample[] = [];
    if (withExamples) {
      const embedStarted = Date.now();
      examples = await retrieveAskExamples({
        service: { rpc: (fn, args) => serviceRole.rpc(fn, args) },
        viewerId,
        scope,
        embedding: embedText(entry.q).catch(() => null),
      });
      lines.push(
        examples.length === 0
          ? `Examples: none retrieved (${((Date.now() - embedStarted) / 1000).toFixed(1)}s)`
          : `Examples (${examples.length}, ${((Date.now() - embedStarted) / 1000).toFixed(1)}s): ${examples
              .map(
                (example) =>
                  `“${example.question}”${example.source ? ` [${example.source}]` : ""}`,
              )
              .join(" · ")}`,
        "",
      );
    } else {
      lines.push("Examples: skipped (--no-examples)", "");
    }

    const events: Record<string, unknown>[] = [];
    const started = Date.now();
    try {
      for await (const event of askQuestion({
        db,
        model,
        now: () => new Date(),
        question: entry.q,
        tags: resolved.tags,
        conversation,
        previousPlan: prior
          ? previousPlanFromMessages([
              { role: "assistant", content: prior.answer },
            ])
          : null,
        conversationId: null,
        reservation: null,
        scope,
        examples,
      })) {
        events.push(event as unknown as Record<string, unknown>);
      }
    } catch (thrown) {
      events.push({ type: "THROWN", message: String(thrown) });
    } finally {
      console.warn = warn;
      console.error = error;
    }
    const elapsed = (Date.now() - started) / 1000;
    const seconds = elapsed.toFixed(1);

    const headline = events.find((e) => e.type === "headline")?.text as
      string | undefined;
    const figures = events.filter((e) => e.type === "figure");
    const visual = events.find((e) => e.type === "visual")?.visual as
      Record<string, unknown> | undefined;
    const body = events
      .filter((e) => e.type === "text")
      .map((e) => e.delta)
      .join("");
    const failure = events.find(
      (e) => e.type === "error" || e.type === "THROWN",
    );
    const notice = events.some((e) => e.type === "notice");
    const sources = events.find((e) => e.type === "sources")?.matches as
      unknown[] | undefined;

    // What the grader reads: the same events and queries the report prints.
    const grade = gradeTranscript(entry.expect, {
      seconds: elapsed,
      modelReplies,
      queries: queries.map((query) => ({
        scope: typeof query.scope === "string" ? query.scope : null,
        sql: typeof query.sql === "string" ? query.sql : null,
        error: query.error === null ? null : String(query.error),
      })),
      headline: headline ?? null,
      figures: figures.map((figure) => ({
        label: String(figure.label),
        value: String(figure.value),
      })),
      visual:
        visual && typeof visual.kind === "string"
          ? { kind: visual.kind }
          : null,
      body: body.trim(),
      error: failure ? String(failure.code ?? failure.type) : null,
      notice,
    });

    lines.push(
      `_${seconds}s · ${queries.length} quer${queries.length === 1 ? "y" : "ies"} · ${modelReplies.length} model calls_`,
      "",
    );
    if (grade.scored) lines.push(`**Score:** ${gradeLabel(grade)}`, "");
    if (entry.expect?.note) lines.push(`Note: ${entry.expect.note}`, "");
    lines.push("**Answer as the player sees it**", "");
    if (failure)
      lines.push(
        `ERROR \`${String(failure.code ?? failure.type)}\`: ${String(failure.error ?? failure.message)}`,
        "",
      );
    if (headline) lines.push(`> ${headline}`, "");
    if (figures.length)
      lines.push(
        figures
          .map((f) => `- ${String(f.label)}: **${String(f.value)}**`)
          .join("\n"),
        "",
      );
    if (visual) lines.push("```json", JSON.stringify(visual), "```", "");
    if (body.trim()) lines.push(body.trim(), "");
    if (notice) lines.push("_(no-advice notice in the footer)_", "");
    if (sources) lines.push(`Sources: ${sources.length} match(es)`, "");
    for (const [n, query] of queries.entries()) {
      lines.push(
        `**Query ${n + 1}**${query.error ? ` — DB ERROR ${String(query.error)}` : ""}`,
        "",
        "```sql",
        `-- scope\n${String(query.scope)}\n-- sql\n${String(query.sql)}`,
        "```",
        "",
      );
      const rows = JSON.stringify(query.rows);
      lines.push(
        "Rows: `" +
          (rows.length > 1800 ? rows.slice(0, 1800) + " …" : rows) +
          "`",
        "",
      );
    }
    lines.push(
      "<details><summary>Raw model replies</summary>",
      "",
      ...modelReplies.map(
        (reply, n) => "```\n" + `[${n + 1}] ${reply.trim()}` + "\n```",
      ),
      "",
      "</details>",
      "",
    );
    if (warnings.length) lines.push(`Warnings: ${warnings.join(" | ")}`, "");
    report.push(...lines);
    transcripts.push(
      headline
        ? {
            question: { text: entry.q, tags: resolved.tags.saved },
            answer: {
              headline,
              body: body.trim(),
              ...lastPlan(queries),
            },
          }
        : null,
    );
    process.stdout.write(
      `${index + 1}/${questions.length} ${failure ? "ERR " + String(failure.code ?? "") : visual ? "ok +" + String(visual.kind) : "ok"} (${seconds}s) ${entry.q}${retryMark} · ${gradeLabel(grade)}\n`,
    );
    return grade;
  };

  for (const [index, entry] of questions.entries()) {
    if (only && !only.includes(index)) {
      transcripts.push(null);
      continue;
    }
    let grade = await runQuestion(index, entry, 0);
    // A scored failure is run again, up to `--retries` times, and the last
    // run is what the score counts; the earlier blocks stay in the report.
    for (
      let attempt = 1;
      attempt <= retries && grade.scored && !grade.pass;
      attempt++
    ) {
      transcripts.pop();
      grade = await runQuestion(index, entry, attempt);
    }
    grades.push({ index, q: entry.q, grade });
  }

  // ── Score ──────────────────────────────────────────────────────────────
  const score = tally(grades.map((entry) => entry.grade));
  const scoreLine = `${score.passed} passed · ${score.failed} failed · ${score.unscored} unscored`;
  const failing = grades.filter(
    (entry) => entry.grade.scored && !entry.grade.pass,
  );
  report.splice(
    headerLines,
    0,
    "## Score",
    "",
    `**${scoreLine}** of ${grades.length} run.`,
    "",
    ...(grades.length === 0
      ? ["No question ran."]
      : score.passed + score.failed === 0
        ? ["No question that ran carries an `expect` block."]
        : failing.length === 0
          ? ["Every scored question passed."]
          : failing.map(
              (entry) =>
                `- ${entry.index + 1}. ${entry.q} — ${failedReasons(entry.grade).join("; ")}`,
            )),
    "",
  );

  writeFileSync(out, report.join("\n"));
  await supabase.auth.signOut();
  process.stdout.write(`\nScore: ${scoreLine}\nReport: ${out}\n`);
  // `--grade`: the exit code is the verdict, for a workflow to fail on.
  if (grading && score.failed > 0) process.exit(1);
}

main().catch((thrown) => {
  console.error(thrown);
  process.exit(1);
});
