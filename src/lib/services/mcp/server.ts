/**
 * The Ask MCP server: four tools over the signed-in user's own match data,
 * for a Claude of their own (claude.ai, Claude Desktop, Claude Code) to
 * call (docs/ask-mcp-connector.md; docs/ask-improvement-roadmap.md, slice 3).
 *
 *   list_matches    the matches in scope, from `ask.matches` — the rows a
 *                   query can see, which are the rows the Ask page's tag
 *                   menu lists
 *   describe_views  the five `ask` views and the rules a query is held to
 *   run_query       one read-only SELECT over the views, checked by the
 *                   SQL guard and run as the caller through the two
 *                   server-only query functions
 *   ask             a whole question through `askQuestion()`, with the same
 *                   reservation, cache and run record as `POST /api/ask`
 *
 * The security boundary is the one `/api/ask` already has, reused whole:
 * every SQL string — the model's, the caller's, this file's own
 * `list_matches` query — goes through `checkAskSql()` and then
 * `ask_run_query` / `ask_run_team_query` on the database the route built
 * with `createAskDatabase()`, which pins the viewer to the verified user id
 * and sends exactly those functions to the service role. The views and the
 * `ask_reader` role limit what a query may read; nothing a tool argument
 * says can name another viewer. Everything else — the question
 * reservation, the save, the run record, the cache, the membership read —
 * runs as the user, on their bearer client.
 *
 * Refusals are `McpError`s. Inside a tool the SDK shapes one into the
 * tool result's `isError` form (`createToolError`), with the message
 * carrying a stable slug first — `sql_refused: …` — so a client can branch
 * on it; outside a tool (an unknown tool, bad arguments) the SDK answers a
 * JSON-RPC error itself. The two limits (`rate-limit.ts`) and the question
 * allowance use codes of their own in the server-defined range.
 *
 * Takes its collaborators as arguments and imports no client factory, so an
 * offline spec can drive it over an in-memory transport.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  ErrorCode,
  McpError,
  type CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { isUuid } from "@/lib/admin/validation";
import type { AskMatchOption, AskTagOptions } from "@/lib/data/ask-tags";
import {
  ASK_ALL_MATCHES_SCOPE,
  conversationTurnsFromMessages,
  databaseHint,
  previousPlanFromMessages,
  reserveAskQuestion,
  type AskDatabase,
  type AskModel,
  type AskQuestionInput,
} from "@/lib/services/ask/ask";
import {
  askCacheKey,
  captureAskAnswer,
  readAskCache,
  readAskDataVersion,
  replayCachedAnswer,
} from "@/lib/services/ask/cache";
import {
  MAX_ASK_QUESTION_LENGTH,
  type AskEvent,
  type AskFigureEvent,
  type AskSourceMatch,
  type AskVisual,
} from "@/lib/services/ask/events";
import {
  askRunProperties,
  askRunRow,
  recordAskRun,
  type AskRunRecord,
} from "@/lib/services/ask/runs";
import { PERSONAL_ASK_SCOPE, type AskScope } from "@/lib/services/ask/scope";
import { checkAskSql } from "@/lib/services/ask/sql-guard";
import { MAX_ASK_TAGS, resolveAskTags } from "@/lib/services/ask/tags";
import { assertAskAllowed, type McpCaller } from "@/lib/services/mcp/auth";
import {
  describeAskViews,
  MCP_QUERY_ROW_CAP,
} from "@/lib/services/mcp/describe";
import {
  MCP_DAILY_CALL_CAP,
  type RateLimiter,
} from "@/lib/services/mcp/rate-limit";
import type { McpUserReads } from "@/lib/services/mcp/user-reads";

/** What the server is handed per request; see the module comment for who owns what. */
export interface AskMcpContext {
  caller: McpCaller;
  /** `createAskDatabase()`'s result: the viewer pinned to the verified user. */
  db: AskDatabase;
  /** The two user-side table reads, as the user. */
  reads: McpUserReads;
  model: AskModel;
  stageModels: { plan: string | null; answer: string | null };
  limiter: RateLimiter;
  /** Count one call for today and answer the day's count; 0 when it could not be counted. */
  countCall: () => Promise<number>;
  dailyCap?: number;
  /** A product event: `mcp_tool_call` per call, `ask_run` per question. Never the SQL or the question's text. */
  capture?: (
    event: string,
    properties: Record<string, string | number | boolean | null>,
  ) => void;
  now?: () => Date;
}

/** JSON-RPC codes in the server-defined range, beside the SDK's own. */
export const MCP_ERROR_CODES = {
  rateLimited: -32029,
  dailyCapReached: -32030,
  askLimitReached: -32031,
} as const;

export const MCP_SERVER_NAME = "advantage-ask";
export const MCP_SERVER_VERSION = "1.0.0";

/** The most characters one SQL string may carry: a bound on parser work, well above any real query. */
const MAX_SQL_LENGTH = 20_000;
/** How many of the scope's matches a query result lists back. */
const MAX_LISTED_SOURCES = 100;

const INSTRUCTIONS = `Advantage Ask: the signed-in player's own tennis match data (or one program's, with program_id). Call describe_views once to learn the five ask views and the query rules, list_matches to see what is in scope, run_query for a read-only SELECT over the views, and ask to have Advantage answer a whole question (it spends one of the player's monthly questions). Every number you report must come from a tool result; the views hold nobody else's data.`;

/** A refusal: `slug: sentence`, with the slug kept on `data` as well. */
function refusal(code: number, slug: string, sentence: string): McpError {
  return new McpError(code, `${slug}: ${sentence}`, { code: slug });
}

function slugOf(error: McpError): string {
  const data = error.data as { code?: unknown } | undefined;
  return typeof data?.code === "string" ? data.code : String(error.code);
}

/** The column list `list_matches` reads; `player_name` only where it names a roster player. */
function listMatchesSql(team: boolean): string {
  const columns = [
    "m.match_id",
    "m.played_on",
    "m.opponent_name",
    "m.score_text",
    "m.i_won",
    "m.source",
    "m.tournament",
    "m.match_type",
    "m.has_stats",
    ...(team ? ["m.player_name"] : []),
  ];
  return `select ${columns.join(", ")} from ask.matches m join scope on scope.match_id = m.match_id order by m.played_on desc nulls last, m.match_id`;
}

type Row = Record<string, unknown>;

function asRecord(value: unknown): Row | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Row)
    : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function booleanOrNull(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

/** One `ask.matches` row as the sources list states it (`ask.ts`'s own reading). */
function sourceMatch(value: unknown, team: boolean): AskSourceMatch | null {
  const row = asRecord(value);
  if (!row || typeof row.match_id !== "string") return null;
  return {
    matchId: row.match_id,
    opponentName: stringOrNull(row.opponent_name),
    playedOn: stringOrNull(row.played_on),
    iWon: booleanOrNull(row.i_won),
    scoreText: stringOrNull(row.score_text),
    playerName: team ? stringOrNull(row.player_name) : null,
  };
}

/** A `list_matches` row as the tool states it. */
function listedMatch(row: Row, team: boolean): Row {
  return {
    match_id: row.match_id,
    played_on: row.played_on ?? null,
    opponent: row.opponent_name ?? null,
    score: row.score_text ?? null,
    i_won: row.i_won ?? null,
    source: row.source ?? null,
    tournament: row.tournament ?? null,
    match_type: row.match_type ?? null,
    has_stats: row.has_stats ?? null,
    ...(team ? { player: row.player_name ?? null } : {}),
  };
}

/** The same rows as the Ask page's tag menu, for `resolveAskTags()`: match tags only through the connector. */
function tagOptionsFromRows(
  rows: readonly Row[],
  team: boolean,
): AskTagOptions {
  const matches = rows.flatMap((row): AskMatchOption[] => {
    const source = sourceMatch(row, team);
    return source
      ? [{ ...source, tournamentName: stringOrNull(row.tournament) }]
      : [];
  });
  return { matches, opponents: [], players: [] };
}

function text(content: string): CallToolResult {
  return { content: [{ type: "text", text: content }] };
}

function json(structured: Row, summary?: string): CallToolResult {
  return {
    content: [{ type: "text", text: summary ?? JSON.stringify(structured) }],
    structuredContent: structured,
  };
}

const PROGRAM_ID = z
  .string()
  .uuid()
  .optional()
  .describe(
    "A program's id, to read that program's matches as a member of it. Omit for the player's own matches.",
  );

export function createAskMcpServer(context: AskMcpContext): McpServer {
  const dailyCap = context.dailyCap ?? MCP_DAILY_CALL_CAP;
  const now = context.now ?? (() => new Date());
  const server = new McpServer(
    { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION },
    { instructions: INSTRUCTIONS },
  );

  // ── The guard every tool runs under ────────────────────────────────────
  // The two limits first, then the tool; one `mcp_tool_call` event however
  // it ended. A refusal passes through as the McpError it is; anything else
  // is logged and becomes a fixed sentence, as `errorResponse()` would.
  function guarded<Args>(
    name: string,
    run: (args: Args) => Promise<CallToolResult>,
  ): (args: Args) => Promise<CallToolResult> {
    return async (args) => {
      const started = Date.now();
      let ok = false;
      let code: string | null = null;
      try {
        const window = context.limiter.check(context.caller.userId);
        if (!window.ok) {
          throw refusal(
            MCP_ERROR_CODES.rateLimited,
            "rate_limited",
            `Too many calls. Try again in ${window.retryAfterSeconds} seconds.`,
          );
        }
        const count = await context.countCall();
        if (count > dailyCap) {
          throw refusal(
            MCP_ERROR_CODES.dailyCapReached,
            "daily_cap_reached",
            `You have used today's ${dailyCap} connector calls. The cap resets at midnight UTC.`,
          );
        }
        const result = await run(args);
        ok = true;
        return result;
      } catch (error) {
        if (error instanceof McpError) {
          code = slugOf(error);
          throw error;
        }
        console.error(`[mcp] ${name} failed`, {
          error: error instanceof Error ? error.message : String(error),
        });
        code = "internal_error";
        throw refusal(
          ErrorCode.InternalError,
          "internal_error",
          "Something went wrong on our side. Try again in a moment.",
        );
      } finally {
        context.capture?.("mcp_tool_call", {
          tool: name,
          duration_ms: Date.now() - started,
          ok,
          error_code: code,
          auth: context.caller.kind,
        });
      }
    };
  }

  // ── Scope ──────────────────────────────────────────────────────────────
  // A program id names a workspace; whether the caller is in it is read
  // here, as the user, before a row of the program is.
  async function resolveScope(
    programId: string | undefined,
  ): Promise<AskScope> {
    if (programId === undefined) return PERSONAL_ASK_SCOPE;
    if (!isUuid(programId)) {
      throw refusal(
        ErrorCode.InvalidParams,
        "invalid_program_id",
        "program_id must be a uuid.",
      );
    }
    const program = await context.reads.program(programId);
    if (!program) {
      throw refusal(
        ErrorCode.InvalidParams,
        "not_a_member",
        "You are not a member of this program.",
      );
    }
    return { kind: "team", programId: program.id, programName: program.name };
  }

  // ── The one way to the database ────────────────────────────────────────
  async function runAskQuery(
    scope: AskScope,
    scopeSql: string,
    sql: string,
  ): Promise<{ rows: Row[]; matches: AskSourceMatch[] }> {
    const checked = checkAskSql({ scopeSql, sql });
    if (!checked.ok) {
      throw refusal(ErrorCode.InvalidParams, "sql_refused", checked.reason);
    }
    const team = scope.kind === "team";
    const { data, error } = team
      ? await context.db.rpc("ask_run_team_query", {
          p_program_id: scope.programId,
          scope_sql: scopeSql,
          sql,
        })
      : await context.db.rpc("ask_run_query", { scope_sql: scopeSql, sql });
    if (error) {
      throw refusal(
        ErrorCode.InvalidParams,
        "query_failed",
        databaseHint(error.message),
      );
    }
    const record = asRecord(data);
    if (
      !record ||
      !Array.isArray(record.matches) ||
      !Array.isArray(record.rows)
    ) {
      throw new Error("ask_run_query() answered an unexpected shape");
    }
    return {
      rows: record.rows
        .flatMap((row): Row[] => {
          const cells = asRecord(row);
          return cells ? [cells] : [];
        })
        .slice(0, MCP_QUERY_ROW_CAP),
      matches: record.matches.flatMap((row) => sourceMatch(row, team) ?? []),
    };
  }

  // ── list_matches ───────────────────────────────────────────────────────
  server.registerTool(
    "list_matches",
    {
      title: "List matches",
      description:
        "The matches in scope — the signed-in player's own, or one program's with program_id — newest first, with each match's id, date (played_on, UTC), opponent, score from the player's seat, result (i_won), source (video, swingvision, or null when entered by hand), tournament, match type and whether statistics exist for it. These are exactly the rows a query can read.",
      inputSchema: { program_id: PROGRAM_ID },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    guarded("list_matches", async ({ program_id }) => {
      const scope = await resolveScope(program_id);
      const team = scope.kind === "team";
      const { rows } = await runAskQuery(
        scope,
        ASK_ALL_MATCHES_SCOPE,
        listMatchesSql(team),
      );
      const matches = rows.map((row) => listedMatch(row, team));
      return json({
        scope: scope.kind,
        program_id: team ? scope.programId : null,
        count: matches.length,
        truncated: matches.length >= MCP_QUERY_ROW_CAP,
        matches,
      });
    }),
  );

  // ── describe_views ─────────────────────────────────────────────────────
  server.registerTool(
    "describe_views",
    {
      title: "Describe the ask views",
      description:
        "The five read-only views a query may read (ask.matches, ask.match_stats, ask.points, ask.shots, ask.point_plays), every column with its meaning, the percentage definitions, and the rules run_query holds a query to. Call it once before writing SQL.",
      inputSchema: {
        scope: z
          .enum(["personal", "team"])
          .optional()
          .describe(
            "personal (default) for the player's own matches; team when querying with a program_id, where ask.matches also carries player_name.",
          ),
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    guarded("describe_views", async ({ scope }) =>
      text(describeAskViews(scope ?? "personal")),
    ),
  );

  // ── run_query ──────────────────────────────────────────────────────────
  server.registerTool(
    "run_query",
    {
      title: "Run a query",
      description: `One read-only SELECT over the ask views, as the signed-in player (or a program, with program_id). sql must read its matches from scope — "join scope on match_id" or "where match_id in (select match_id from scope)" — where scope holds the match ids scope_sql returns (default: every match in scope). Refused before it runs when it reads anything but the five views, calls a function off the allowlist, or sums ask.match_stats without mentioning side. At most ${MCP_QUERY_ROW_CAP} rows.`,
      inputSchema: {
        sql: z
          .string()
          .min(1)
          .max(MAX_SQL_LENGTH)
          .describe("The SELECT that computes the answer; it must read scope."),
        scope_sql: z
          .string()
          .min(1)
          .max(MAX_SQL_LENGTH)
          .optional()
          .describe(
            `A SELECT returning the single column match_id: the matches the question is about. Default: ${ASK_ALL_MATCHES_SCOPE}.`,
          ),
        program_id: PROGRAM_ID,
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    guarded("run_query", async ({ sql, scope_sql, program_id }) => {
      const scope = await resolveScope(program_id);
      const { rows, matches } = await runAskQuery(
        scope,
        scope_sql ?? ASK_ALL_MATCHES_SCOPE,
        sql,
      );
      return json({
        scope: scope.kind,
        program_id: scope.kind === "team" ? scope.programId : null,
        row_count: rows.length,
        truncated: rows.length >= MCP_QUERY_ROW_CAP,
        rows,
        matches_in_scope: matches.length,
        matches: matches.slice(0, MAX_LISTED_SOURCES).map((match) => ({
          match_id: match.matchId,
          played_on: match.playedOn,
          opponent: match.opponentName,
          score: match.scoreText,
          i_won: match.iWon,
          ...(scope.kind === "team" ? { player: match.playerName } : {}),
        })),
      });
    }),
  );

  // ── ask ────────────────────────────────────────────────────────────────
  server.registerTool(
    "ask",
    {
      title: "Ask a question",
      description: `Ask Advantage a whole question about the player's matches (or a program's, with program_id) and get its answer: a headline, the figures it rests on, the explanation, an optional visual block and the matches it was computed from. Spends one of the player's monthly questions, as asking on the Ask page does; the same question over unchanged data is answered from the cache and spends nothing. Pass conversation_id to ask a follow-up in a saved conversation, and match_ids to pin the question to particular matches.`,
      inputSchema: {
        question: z
          .string()
          .min(1)
          .max(MAX_ASK_QUESTION_LENGTH)
          .describe("The question, in the player's own words."),
        program_id: PROGRAM_ID,
        conversation_id: z
          .string()
          .uuid()
          .optional()
          .describe(
            "The conversation to continue, from an earlier answer's conversation_id.",
          ),
        match_ids: z
          .array(z.string().uuid())
          .max(MAX_ASK_TAGS)
          .optional()
          .describe(
            "Match ids from list_matches the question is about, as the page's match tags.",
          ),
      },
      annotations: { readOnlyHint: true, idempotentHint: false },
    },
    guarded(
      "ask",
      async ({ question, program_id, conversation_id, match_ids }) => {
        const allowed = assertAskAllowed(context.caller);
        if (!allowed.ok) {
          throw refusal(
            ErrorCode.InvalidRequest,
            "needs_session",
            allowed.reason,
          );
        }
        const asked = question.trim();
        if (asked === "") {
          throw refusal(
            ErrorCode.InvalidParams,
            "question_empty",
            "Type a question first.",
          );
        }

        const scope = await resolveScope(program_id);
        const team = scope.kind === "team";

        // The matches in scope, as the page's tag menu lists them: a tag is
        // re-resolved against them, and none at all is the page's day zero.
        const { rows } = await runAskQuery(
          scope,
          ASK_ALL_MATCHES_SCOPE,
          listMatchesSql(team),
        );
        if (rows.length === 0) {
          throw refusal(
            ErrorCode.InvalidRequest,
            "no_matches",
            team
              ? "Add a team match before you ask a question."
              : "Add a match before you ask a question.",
          );
        }
        const options = tagOptionsFromRows(rows, team);
        const resolved = resolveAskTags(
          (match_ids ?? []).map((id) => ({ kind: "match" as const, id })),
          options,
          scope,
        );
        if (!resolved.ok) {
          throw refusal(
            ErrorCode.InvalidParams,
            "tag_not_resolved",
            resolved.reason,
          );
        }

        const conversation = conversation_id
          ? await context.reads.conversation(
              conversation_id,
              team ? scope.programId : null,
            )
          : null;
        if (conversation_id && !conversation) {
          throw refusal(
            ErrorCode.InvalidParams,
            "conversation_not_found",
            "This conversation is not available.",
          );
        }

        const db = context.db;
        const onRun = async (run: AskRunRecord) => {
          const recorded = await db.rpc("ask_record_run", {
            p_run: askRunRow(run),
          });
          if (recorded.error) {
            console.warn("[mcp] could not record the run", {
              sqlstate: recorded.error.code,
              error: recorded.error.message,
            });
          }
          context.capture?.("ask_run", {
            ...askRunProperties(run, scope),
            trigger: "mcp",
          });
        };

        // The answer cache, as the route keeps it: a hit spends nothing.
        const cacheKey = askCacheKey({
          question: asked,
          tags: resolved.tags,
          scope,
        });
        const dataVersion = context.model.configured
          ? await readAskDataVersion(db, scope)
          : null;
        const cached = dataVersion
          ? await readAskCache(db, {
              key: cacheKey,
              version: dataVersion,
              scope,
            })
          : null;

        let events: AsyncGenerator<AskEvent, void, undefined>;
        if (cached) {
          events = replayCachedAnswer({
            db,
            cached,
            question: asked,
            tags: resolved.tags,
            conversationId: conversation?.id ?? null,
            scope,
            onRun,
          });
        } else {
          const reserved = await reserveAskQuestion(db, context.model);
          if (!reserved.ok) {
            if (reserved.code === "ask_limit_reached") {
              throw refusal(
                MCP_ERROR_CODES.askLimitReached,
                "ask_limit_reached",
                reserved.detail
                  ? `You have used all ${reserved.detail.cap} questions for this month. They reset on ${reserved.detail.resets_on}.`
                  : "You have used all of this month's questions.",
              );
            }
            console.error("[mcp] could not reserve a question", {
              error: reserved.message,
            });
            throw new Error("reserve_failed");
          }
          const input: AskQuestionInput = {
            db,
            model: context.model,
            now,
            question: asked,
            tags: resolved.tags,
            conversation: conversation
              ? conversationTurnsFromMessages(conversation.messages)
              : [],
            previousPlan: conversation
              ? previousPlanFromMessages(conversation.messages)
              : null,
            conversationId: conversation?.id ?? null,
            reservation: reserved.reservation,
            scope,
          };
          const recorded = (run: AskQuestionInput) =>
            recordAskRun(run, {
              planModel: context.stageModels.plan,
              answerModel: context.stageModels.answer,
              onRun,
            });
          events = dataVersion
            ? captureAskAnswer(input, recorded, {
                key: cacheKey,
                version: dataVersion,
              })
            : recorded(input);
        }

        return drainAnswer(events);
      },
    ),
  );

  return server;
}

/**
 * Read the stream to its end and shape the answer as one result: the
 * headline, the figures, the body text, the visual block, the sources and
 * where it was saved. An `error` event is the refusal it names, with the
 * same code the page branches on.
 */
async function drainAnswer(
  events: AsyncGenerator<AskEvent, void, undefined>,
): Promise<CallToolResult> {
  let headline: string | null = null;
  const figures: Pick<AskFigureEvent, "label" | "value">[] = [];
  let visual: AskVisual | null = null;
  let body = "";
  let noAdvice = false;
  let sources: AskSourceMatch[] = [];
  let done: {
    conversationId: string;
    answerId: string | null;
    used: number;
    cap: number | null;
  } | null = null;
  for await (const event of events) {
    switch (event.type) {
      case "headline":
        headline = event.text;
        break;
      case "figure":
        figures.push({ label: event.label, value: event.value });
        break;
      case "visual":
        visual = event.visual;
        break;
      case "text":
        body += event.delta;
        break;
      case "notice":
        // The one notice kind there is: the question asked for advice.
        noAdvice = true;
        break;
      case "sources":
        sources = event.matches;
        break;
      case "done":
        done = {
          conversationId: event.conversationId,
          answerId: event.answerId ?? null,
          used: event.used,
          cap: event.cap,
        };
        break;
      case "error":
        throw refusal(
          event.code === "llm_unavailable" || event.code === "answer_failed"
            ? ErrorCode.InternalError
            : ErrorCode.InvalidParams,
          event.code,
          event.options?.length
            ? `${event.error} Options: ${event.options.join(" | ")}`
            : event.error,
        );
      default:
        break;
    }
  }
  if (!headline || !done) {
    throw new Error("the answer ended without a headline or a done event");
  }

  const summary = [
    headline,
    figures.map((figure) => `${figure.label}: ${figure.value}`).join("\n"),
    body.trim(),
    sources.length > 0
      ? `Computed from ${sources.length} match${sources.length === 1 ? "" : "es"}: ${sources
          .slice(0, 10)
          .map(
            (match) =>
              `${match.playedOn ?? "undated"} vs ${match.opponentName ?? "unknown opponent"}${match.scoreText ? ` (${match.scoreText})` : ""}`,
          )
          .join("; ")}${sources.length > 10 ? "; …" : ""}`
      : "",
  ]
    .filter((part) => part !== "")
    .join("\n\n");

  return json(
    {
      conversation_id: done.conversationId,
      answer_id: done.answerId,
      headline,
      figures,
      body: body.trim(),
      visual,
      no_advice: noAdvice,
      sources: sources.map((match) => ({
        match_id: match.matchId,
        played_on: match.playedOn,
        opponent: match.opponentName,
        score: match.scoreText,
        i_won: match.iWon,
        player: match.playerName,
      })),
      questions_used: done.used,
      questions_cap: done.cap,
    },
    summary,
  );
}
