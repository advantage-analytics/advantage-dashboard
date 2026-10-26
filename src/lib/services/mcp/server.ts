/**
 * The Ask MCP server: nine tools over the signed-in user's own match data,
 * for a Claude of their own (claude.ai, Claude Desktop, Claude Code) to
 * call (docs/ask-mcp-connector.md; docs/ask-improvement-roadmap.md, slice 3).
 *
 *   list_workspaces   the caller's personal workspace and every program
 *                     they belong to, with their role — where a program_id
 *                     comes from
 *   list_matches      the matches in scope, from `ask.matches` — the rows a
 *                     query can see, which are the rows the Ask page's tag
 *                     menu lists
 *   get_match         one match's report: its `ask.matches` row, both sides
 *                     of `ask.match_stats`, the AI summary and key moments
 *                     the views do not carry, and its links
 *   opponent_scouting the Opponents page's record per opponent — wins,
 *                     losses, form, the four measures with trend, recent
 *                     meetings — from the same loader the page uses
 *   describe_views    the five `ask` views and the rules a query is held to
 *   run_query         one read-only SELECT over the views, checked by the
 *                     SQL guard and run as the caller through the two
 *                     server-only query functions
 *   ask               a whole question through `askQuestion()`, with the
 *                     same reservation and run record as `POST /api/ask`;
 *                     it reads the page's answer cache but never writes it
 *                     (below)
 *   update_match      the Edit dialog's metadata fields on a match the
 *                     caller created — never the score, the format or the
 *                     player — through `normalizeMatchPatch()` and
 *                     `ask_patch_match`
 *   prepare_video_upload
 *                     a wizard draft from a few typed facts and the
 *                     `?draft=` link that resumes it; the wizard asks for
 *                     the file and the three attribution answers itself
 *
 * Three tools write: `ask` saves the exchange to the caller's Ask history and
 * spends a question, as the page does, and the last two write match rows.
 * Each of those two is one `ask_*` function the write guard lists (migration
 * 20261021143857), called as the user, so RLS and `auth.uid()` decide;
 * nothing here creates a match, a job, or touches a score.
 *
 * The security boundary is the one `/api/ask` already has, reused whole:
 * every SQL string — the model's, the caller's, this file's own
 * `list_matches` query — goes through `checkAskSql()` and then
 * `ask_run_query` / `ask_run_team_query` on the database the route built
 * with `createAskDatabase()`, which pins the viewer to the verified user id
 * and sends exactly those functions to the service role. The views and the
 * `ask_reader` role limit what a query may read; nothing a tool argument
 * says can name another viewer. Everything else — the question
 * reservation, the save, the run record, the cache, the membership read,
 * the report columns, the opponents reads — runs as the user, on their
 * bearer client (`user-reads.ts`), under RLS.
 *
 * Refusals are tool results, never thrown at the SDK: `guarded()` turns a
 * `Refusal` into `{ isError: true }` whose text starts with a stable slug —
 * `sql_refused: …` — so a client can branch on it. (A thrown `McpError`
 * would not do: the SDK rewrites its message to `MCP error <code>: …` and
 * drops its data.) Outside a tool (an unknown tool, bad arguments) the SDK
 * answers a JSON-RPC error itself.
 *
 * Takes its collaborators as arguments and imports no client factory, so an
 * offline spec can drive it over an in-memory transport.
 */

import { randomUUID } from "node:crypto";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
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
import { matchPageUrl, matchShareUrl } from "@/lib/data/match-share-url";
import { roundKindFor } from "@/lib/matches/round-options";
import { siteUrl } from "@/lib/site-url";
import {
  BACKHANDS,
  HANDS,
  normalizeMatchPatch,
  OPPONENT_SCHOOL_MAX,
} from "@/lib/matches/patch-match";
import {
  draftRowSummary,
  matchDraftFromPrefill,
  parseScoreHint,
  PREFILL_PROVIDERS,
  type PrefillProvider,
} from "@/lib/wizard/draft-from-prefill";
import type {
  PersonalOpponent,
  PersonalOpponentRecentMatch,
} from "@/lib/data/personal-opponents";
import type { TeamOpponent } from "@/lib/data/team-opponents";
import type { McpUserReads } from "@/lib/services/mcp/user-reads";
import type { LLMTool } from "@/lib/llm/adapter";
import type { AskAgentToolbox } from "@/lib/services/ask/agent";

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
  /** Count one call for today and answer the day's count; null when it could not be counted, which refuses the call. */
  countCall: () => Promise<number | null>;
  dailyCap?: number;
  /** A product event: `mcp_tool_call` per call, `ask_run` per question. Never the SQL or the question's text. */
  capture?: (
    event: string,
    properties: Record<string, string | number | boolean | null>,
  ) => void;
  now?: () => Date;
}

/** The retry `rate_limited` names when the daily counter could not be read. */
export const COUNT_UNAVAILABLE_RETRY_SECONDS = 30;

export const MCP_SERVER_NAME = "advantage-ask";
export const MCP_SERVER_VERSION = "1.0.0";

/** The most characters one SQL string may carry: a bound on parser work, well above any real query. */
const MAX_SQL_LENGTH = 20_000;
/** How many of the scope's matches a query result lists back. */
const MAX_LISTED_SOURCES = 100;

const INSTRUCTIONS = `Advantage Ask: the signed-in player's own tennis match data (or one program's, with program_id). When a team or program is mentioned, call list_workspaces first: it is where a program_id comes from. Call list_matches to see what is in scope, get_match before summarising one match (its statistics, the AI summary and key moments, and links to open or share it), opponent_scouting for a record against an opponent, describe_views once to learn the five ask views and the query rules, run_query for a read-only SELECT over the views, and ask to have Advantage answer a whole question (it saves the exchange to the player's Ask history and spends one of their monthly questions). Two more tools write: update_match fixes a match's details (never its score), and prepare_video_upload saves a draft and returns the link where the player picks the video and finishes — confirm what the player wants before calling either. Every number you report must come from a tool result; the views hold nobody else's data, except the matches of teams the player belongs to.`;

/** A refusal a tool throws; `guarded()` answers it as the tool result `refusalResult()` shapes. */
class Refusal extends Error {
  readonly slug: string;
  readonly sentence: string;
  constructor(slug: string, sentence: string) {
    super(`${slug}: ${sentence}`);
    this.slug = slug;
    this.sentence = sentence;
  }
}

function refusal(slug: string, sentence: string): Refusal {
  return new Refusal(slug, sentence);
}

/** A refusal as the tool result a client reads: `slug: sentence`. */
function refusalResult(slug: string, sentence: string): CallToolResult {
  return {
    isError: true,
    content: [{ type: "text", text: `${slug}: ${sentence}` }],
  };
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

/** `ask.matches`'s columns as the schema block lists them — what `get_match` reads for the match row. */
const MATCH_ROW_COLUMNS = [
  "match_id",
  "played_on",
  "opponent_name",
  "opponent_hand",
  "opponent_backhand",
  "tournament",
  "round",
  "court_type",
  "match_type",
  "i_won",
  "score_text",
  "source",
  "duration_seconds",
  "has_stats",
] as const;

/** `scope_sql` for one match: the view decides whether the caller may see it. */
function oneMatchScope(matchId: string): string {
  // `matchId` is a uuid by the time it gets here (`z.string().uuid()`), so
  // the literal cannot carry anything but a uuid.
  return `select match_id from ask.matches where match_id = '${matchId}'`;
}

function matchRowSql(team: boolean): string {
  const columns = [
    ...MATCH_ROW_COLUMNS.map((column) => `m.${column}`),
    ...(team ? ["m.player_name"] : []),
  ];
  return `select ${columns.join(", ")} from ask.matches m join scope on scope.match_id = m.match_id`;
}

/** Both sides of the match's stats row, `me` first; `side` named so the guard's rule holds. */
const MATCH_STATS_SQL =
  "select s.* from ask.match_stats s join scope on scope.match_id = s.match_id order by s.side";

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

/** One recent meeting as the tool states it. */
function recentMeeting(match: PersonalOpponentRecentMatch): Row {
  return {
    match_id: match.id,
    played_on: match.date,
    won: match.won,
    sets: match.sets.map((set) => ({ me: set.player1, opponent: set.player2 })),
    event: match.event,
    in_season: match.inSeason,
    values: match.values,
  };
}

/** The Opponents page's row for one opponent, as the tool states it. */
function scoutedOpponent(opponent: PersonalOpponent | TeamOpponent): Row {
  const team = "facedBy" in opponent;
  return {
    name: opponent.name,
    hand: opponent.hand,
    backhand: opponent.backhand,
    played: opponent.played,
    analyzed: opponent.analyzed,
    wins: opponent.wins,
    losses: opponent.losses,
    played_this_season: opponent.playedThisSeason,
    form: opponent.form,
    last_match: {
      match_id: opponent.lastMatch.id,
      played_on: opponent.lastMatch.date,
      won: opponent.lastMatch.won,
      sets: opponent.lastMatch.sets.map((set) => ({
        me: set.player1,
        opponent: set.player2,
      })),
    },
    recent: opponent.recent.map((match) => ({
      ...recentMeeting(match),
      ...("rosterPlayerId" in match ? { player_id: match.rosterPlayerId } : {}),
    })),
    measures: opponent.measures.map((measure) => ({
      key: measure.key,
      label: measure.label,
      value: measure.value,
      trend: measure.trend,
    })),
    ...(team
      ? {
          program: opponent.program
            ? {
                id: opponent.program.id,
                school: opponent.program.schoolName,
                conference: opponent.program.conference,
                division: opponent.program.division,
              }
            : null,
          school: opponent.school,
          match_ids: opponent.matchIds,
          faced_by: opponent.facedBy.map((player) => ({
            player_id: player.playerId,
            name: player.name,
            wins: player.wins,
            losses: player.losses,
          })),
        }
      : {}),
  };
}

/** `insights.player1` / `.player2` turned to the caller: `me` and `opponent`. */
function orientInsights(
  insights: unknown,
  seat: "player1" | "player2",
): { me: unknown; opponent: unknown } | null {
  const record = asRecord(insights);
  if (!record) return null;
  const other = seat === "player1" ? "player2" : "player1";
  return { me: record[seat] ?? null, opponent: record[other] ?? null };
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

/** The read tools' descriptions, shared by the connector and Ask's agent mode. */
const READ_TOOL_DESCRIPTIONS = {
  list_matches:
    "The matches in scope — the signed-in player's own, or one program's with program_id — newest first, with each match's id, date (played_on, UTC), opponent, score from the player's seat, result (i_won), source (video, swingvision, or null when entered by hand), tournament, match type and whether statistics exist for it. These are exactly the rows a query can read.",
  get_match:
    "One match in full, with no SQL: its ask.matches row (date, opponent, score from the player's seat, result, source, tournament), both sides of ask.match_stats (me and opponent — every count, percentage and rating the views carry), the AI summary with strengths and weaknesses for each side and the key moments where analysis produced them, the match page's URL, and its public share link when one has been created in the app. Call it before summarising a match.",
  opponent_scouting:
    "The Opponents page's record, one entry per opponent the player (or the program, with program_id) has faced: hand and backhand, matches played, wins and losses, the last five results as form, the most recent meeting, up to six recent meetings with the player's side of four measures (total points won, first-serve points won, first-return points won, break points converted), and each measure's recent average with its trend against earlier meetings. In a program scope each entry also says which roster players faced them. Pass opponent to filter by name. Tendencies beyond these four measures — serve zones, rally lengths, return depth against one opponent — are a run_query away.",
  describe_views:
    "The five read-only views a query may read (ask.matches, ask.match_stats, ask.points, ask.shots, ask.point_plays), every column with its meaning, the percentage definitions, and the rules run_query holds a query to. Call it once before writing SQL.",
  run_query: `One read-only SELECT over the ask views, as the signed-in player (or a program, with program_id). sql must read its matches from scope — "join scope on match_id" or "where match_id in (select match_id from scope)" — where scope holds the match ids scope_sql returns (default: every match in scope). Refused before it runs when it reads anything but the five views, calls a function off the allowlist, or sums ask.match_stats without mentioning side. At most ${MCP_QUERY_ROW_CAP} rows.`,
} as const;

/** What the read tools need: the question's database, the user-side reads, and whose they are. */
export interface AskReadDeps {
  db: AskDatabase;
  reads: McpUserReads;
  userId: string;
}

/**
 * The read tools' handlers, outside the MCP server so Ask's agent mode
 * (`createAskAgentToolbox()` below) runs the very same code. Each throws a
 * `Refusal` for what the caller can fix; `guarded()` (the connector) and the
 * toolbox (agent mode) each turn it into a tool result.
 */
export function askReadHandlers(deps: AskReadDeps) {
  // ── Scope ──────────────────────────────────────────────────────────────
  // A program id names a workspace; whether the caller is in it is read
  // here, as the user, before a row of the program is.
  async function resolveScope(
    programId: string | undefined,
  ): Promise<AskScope> {
    if (programId === undefined) return PERSONAL_ASK_SCOPE;
    if (!isUuid(programId)) {
      throw refusal("invalid_program_id", "program_id must be a uuid.");
    }
    const program = await deps.reads.program(programId);
    if (!program) {
      throw refusal("not_a_member", "You are not a member of this program.");
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
      throw refusal("sql_refused", checked.reason);
    }
    const team = scope.kind === "team";
    const { data, error } = team
      ? await deps.db.rpc("ask_run_team_query", {
          p_program_id: scope.programId,
          scope_sql: scopeSql,
          sql,
        })
      : await deps.db.rpc("ask_run_query", { scope_sql: scopeSql, sql });
    if (error) {
      throw refusal("query_failed", databaseHint(error.message));
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
  async function listMatches({
    program_id,
  }: {
    program_id?: string;
  }): Promise<CallToolResult> {
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
  }

  // ── list_workspaces ────────────────────────────────────────────────────
  async function listWorkspaces(): Promise<CallToolResult> {
    const programs = await deps.reads.programs();
    return json({
      personal: {
        id: deps.userId,
        label: "Your own matches (no program_id)",
      },
      programs: programs.map((program) => ({
        program_id: program.id,
        name: program.name,
        team: program.team,
        role: program.role,
        status: program.status,
      })),
    });
  }

  // ── get_match ──────────────────────────────────────────────────────────
  async function getMatch({
    match_id,
    program_id,
  }: {
    match_id: string;
    program_id?: string;
  }): Promise<CallToolResult> {
    const scope = await resolveScope(program_id);
    const team = scope.kind === "team";
    // The view decides visibility: a match outside the scope has no row.
    const { rows } = await runAskQuery(
      scope,
      oneMatchScope(match_id),
      matchRowSql(team),
    );
    const row = rows[0];
    if (!row) {
      throw refusal(
        "match_not_found",
        team
          ? "This match is not in the program's matches."
          : "This match is not in your matches.",
      );
    }
    const [{ rows: statRows }, report] = await Promise.all([
      row.has_stats === true
        ? runAskQuery(scope, oneMatchScope(match_id), MATCH_STATS_SQL)
        : Promise.resolve({ rows: [] as Row[] }),
      deps.reads.matchReport(match_id),
    ]);
    const side = (name: "me" | "opponent") =>
      statRows.find((stat) => stat.side === name) ?? null;
    return json({
      scope: scope.kind,
      program_id: team ? scope.programId : null,
      match: {
        ...listedMatch(row, team),
        opponent_hand: row.opponent_hand ?? null,
        opponent_backhand: row.opponent_backhand ?? null,
        round: row.round ?? null,
        court_type: row.court_type ?? null,
        duration_seconds: row.duration_seconds ?? null,
      },
      stats:
        statRows.length > 0
          ? { me: side("me"), opponent: side("opponent") }
          : null,
      insights: report ? orientInsights(report.insights, report.seat) : null,
      key_moments: report?.keyMoments ?? null,
      match_url: matchPageUrl(match_id),
      share_url: report?.shareToken ? matchShareUrl(report.shareToken) : null,
    });
  }

  // ── opponent_scouting ──────────────────────────────────────────────────
  async function opponentScouting({
    opponent,
    program_id,
  }: {
    opponent?: string;
    program_id?: string;
  }): Promise<CallToolResult> {
    const scope = await resolveScope(program_id);
    const team = scope.kind === "team";
    const data = team
      ? await deps.reads.teamOpponents(scope.programId)
      : await deps.reads.personalOpponents();
    const needle = opponent?.toLowerCase() ?? null;
    const listed = (data.opponents as (PersonalOpponent | TeamOpponent)[])
      .filter(
        (entry) => needle === null || entry.name.toLowerCase().includes(needle),
      )
      .slice(0, MCP_QUERY_ROW_CAP);
    return json({
      scope: scope.kind,
      program_id: team ? scope.programId : null,
      season: data.season,
      totals: data.totals,
      count: listed.length,
      opponents: listed.map(scoutedOpponent),
    });
  }

  // ── describe_views ─────────────────────────────────────────────────────
  async function describeViews({
    scope,
  }: {
    scope?: "personal" | "team";
  }): Promise<CallToolResult> {
    return text(describeAskViews(scope ?? "personal"));
  }

  // ── run_query ──────────────────────────────────────────────────────────
  async function runQuery({
    sql,
    scope_sql,
    program_id,
  }: {
    sql: string;
    scope_sql?: string;
    program_id?: string;
  }): Promise<CallToolResult> {
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
  }

  return {
    resolveScope,
    runAskQuery,
    listMatches,
    listWorkspaces,
    getMatch,
    opponentScouting,
    describeViews,
    runQuery,
  };
}

export function createAskMcpServer(context: AskMcpContext): McpServer {
  const dailyCap = context.dailyCap ?? MCP_DAILY_CALL_CAP;
  const now = context.now ?? (() => new Date());
  const server = new McpServer(
    { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION },
    { instructions: INSTRUCTIONS },
  );
  const read = askReadHandlers({
    db: context.db,
    reads: context.reads,
    userId: context.caller.userId,
  });
  const { resolveScope, runAskQuery } = read;

  // ── The guard every tool runs under ────────────────────────────────────
  // The two limits first, then the tool; one `mcp_tool_call` event however
  // it ended. A refusal becomes the `isError` result naming it; anything
  // else is logged and becomes a fixed sentence, as `errorResponse()` would.
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
            "rate_limited",
            `Too many calls. Try again in ${window.retryAfterSeconds} seconds.`,
          );
        }
        const count = await context.countCall();
        // A count that could not be taken refuses the call: the daily cap
        // fails closed (`usage.ts`).
        if (count === null) {
          throw refusal(
            "rate_limited",
            `Too many calls. Try again in ${COUNT_UNAVAILABLE_RETRY_SECONDS} seconds.`,
          );
        }
        if (count > dailyCap) {
          throw refusal(
            "daily_cap_reached",
            `You have used today's ${dailyCap} connector calls. The cap resets at midnight UTC.`,
          );
        }
        const result = await run(args);
        ok = true;
        return result;
      } catch (error) {
        if (error instanceof Refusal) {
          code = error.slug;
          return refusalResult(error.slug, error.sentence);
        }
        console.error(`[mcp] ${name} failed`, {
          error: error instanceof Error ? error.message : String(error),
        });
        code = "internal_error";
        return refusalResult(
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

  // ── list_matches ───────────────────────────────────────────────────────
  server.registerTool(
    "list_matches",
    {
      title: "List matches",
      description: READ_TOOL_DESCRIPTIONS.list_matches,
      inputSchema: { program_id: PROGRAM_ID },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    guarded("list_matches", read.listMatches),
  );

  // ── list_workspaces ────────────────────────────────────────────────────
  server.registerTool(
    "list_workspaces",
    {
      title: "List workspaces",
      description:
        "The caller's workspaces: their personal one (their own matches, the default scope) and every program they belong to, with their role in it (owner, coach, staff or player). A program's id is the program_id the other tools take; call this first when a team or program is mentioned.",
      inputSchema: {},
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    guarded("list_workspaces", read.listWorkspaces),
  );

  // ── get_match ──────────────────────────────────────────────────────────
  server.registerTool(
    "get_match",
    {
      title: "Get a match report",
      description: READ_TOOL_DESCRIPTIONS.get_match,
      inputSchema: {
        match_id: z.string().uuid().describe("A match id from list_matches."),
        program_id: PROGRAM_ID,
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    guarded("get_match", read.getMatch),
  );

  // ── opponent_scouting ──────────────────────────────────────────────────
  server.registerTool(
    "opponent_scouting",
    {
      title: "Scout an opponent",
      description: READ_TOOL_DESCRIPTIONS.opponent_scouting,
      inputSchema: {
        opponent: z
          .string()
          .trim()
          .min(1)
          .max(120)
          .optional()
          .describe(
            "Part of an opponent's name, matched case-insensitively. Omit for every opponent.",
          ),
        program_id: PROGRAM_ID,
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    guarded("opponent_scouting", read.opponentScouting),
  );

  // ── update_match ───────────────────────────────────────────────────────
  server.registerTool(
    "update_match",
    {
      title: "Update a match's details",
      description:
        "Change the details of a match the player created: the opponent's name, tournament, round, date (YYYY-MM-DD), match type, court surface, the opponent's school, hand and backhand. Only the fields passed change; pass null to clear one. The score, the format and who played are never changed here — they are edited on the match page, where a score change can rebuild the statistics. A match on a scheduled event takes its tournament, date, round, type and surface from the event and refuses them (field_locked).",
      inputSchema: {
        match_id: z.string().uuid().describe("A match id from list_matches."),
        program_id: PROGRAM_ID,
        opponent_name: z.string().trim().min(1).max(120).optional(),
        tournament_name: z.string().trim().max(120).nullable().optional(),
        round: z.string().trim().max(40).nullable().optional(),
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe("The day the match was played, YYYY-MM-DD."),
        match_type: z.string().trim().max(60).nullable().optional(),
        court_type: z.string().trim().max(60).nullable().optional(),
        opponent_school: z
          .string()
          .trim()
          .max(OPPONENT_SCHOOL_MAX)
          .nullable()
          .optional(),
        opponent_hand: z.enum(HANDS).nullable().optional(),
        opponent_backhand: z.enum(BACKHANDS).nullable().optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    guarded("update_match", async ({ match_id, program_id, ...fields }) => {
      const scope = await resolveScope(program_id);
      const team = scope.kind === "team";
      const stored = await context.reads.ownMatch(match_id);
      if (
        !stored ||
        (team
          ? stored.programId !== scope.programId
          : stored.programId !== null)
      ) {
        throw refusal(
          "match_not_found",
          "This match is not one you created in this workspace.",
        );
      }

      // The dialog's body, in its column names; `opponent_name` is the
      // other seat's name, which the Edit dialog labels the same way.
      const body: Record<string, unknown> = {};
      const sent = fields as Record<string, unknown>;
      for (const [key, value] of Object.entries(sent)) {
        if (value === undefined) continue;
        body[key === "opponent_name" ? "player2_name" : key] = value;
      }
      if (Object.keys(body).length === 0) {
        throw refusal(
          "nothing_to_change",
          "Pass at least one field to change.",
        );
      }
      // A round only means something against a Tournament or Dual Match
      // type; `normalizeMatchPatch` clears it for any other, which would be
      // reported here as a change the caller asked for. Refuse instead.
      const typeForRound =
        "match_type" in body
          ? (body.match_type as string | null)
          : (stored.matchType ?? null);
      if (
        typeof body.round === "string" &&
        body.round.trim() !== "" &&
        roundKindFor(typeForRound) === null
      ) {
        throw refusal(
          "invalid_field",
          "A round needs the match type to be Tournament or Dual Match. (round)",
        );
      }
      const normalised = normalizeMatchPatch(body, stored);
      if (!normalised.ok) {
        const slug =
          stored.linked && normalised.field && !normalised.code
            ? "field_locked"
            : "invalid_field";
        throw refusal(
          slug,
          normalised.field
            ? `${normalised.error} (${normalised.field === "player2_name" ? "opponent_name" : normalised.field})`
            : normalised.error,
        );
      }

      const patched = await context.db.rpc("ask_patch_match", {
        p_match_id: match_id,
        p_update: normalised.update,
      });
      if (patched.error) {
        if (patched.error.code === "P0002") {
          throw refusal(
            "match_not_found",
            "This match is not one you created in this workspace.",
          );
        }
        throw new Error(`ask_patch_match failed: ${patched.error.message}`);
      }

      // Read back as the view states it, so the person sees the oriented row.
      const { rows } = await runAskQuery(
        scope,
        oneMatchScope(match_id),
        matchRowSql(team),
      );
      const row = rows[0];
      return json({
        scope: scope.kind,
        program_id: team ? scope.programId : null,
        changed: Object.keys(normalised.update).map((key) =>
          key === "player2_name" ? "opponent_name" : key,
        ),
        match: row ? listedMatch(row, team) : null,
        match_url: matchPageUrl(match_id),
      });
    }),
  );

  // ── prepare_video_upload ───────────────────────────────────────────────
  server.registerTool(
    "prepare_video_upload",
    {
      title: "Prepare a video upload",
      description:
        "Start a new match from what the player tells you, and hand them the link to finish it: this saves an upload-wizard draft with the opponent, date, score and event filled in, and returns a URL to /dashboard/matches/new that resumes it. The player opens the link, picks the video file (or the SwingVision export), and answers the questions only they can — which player was at the top of the frame, ad scoring, a fixed camera — before the match is created and analysis is spent. Nothing is created or charged by this call. The score is a hint the wizard shows for confirmation, not a result.",
      inputSchema: {
        program_id: PROGRAM_ID,
        provider: z
          .enum(
            Object.keys(PREFILL_PROVIDERS) as [
              PrefillProvider,
              ...PrefillProvider[],
            ],
          )
          .default("advantage_intelligence")
          .describe(
            "advantage_intelligence (default): a video to analyse. swingvision: a SwingVision .xlsx export.",
          ),
        opponent_name: z.string().trim().min(1).max(120),
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .describe("The day the match was played, YYYY-MM-DD."),
        score: z
          .string()
          .trim()
          .max(60)
          .optional()
          .describe(
            "Sets as the player says them, their games first: 6-4 3-6 7-5.",
          ),
        tournament_name: z.string().trim().max(120).optional(),
        round: z.string().trim().max(40).optional(),
        match_type: z.string().trim().max(60).optional(),
        court_type: z.string().trim().max(60).optional(),
        player_name: z
          .string()
          .trim()
          .max(120)
          .optional()
          .describe("In a program scope, the roster player's name."),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    guarded(
      "prepare_video_upload",
      async ({
        program_id,
        provider,
        opponent_name,
        date,
        score,
        tournament_name,
        round,
        match_type,
        court_type,
        player_name,
      }) => {
        const scope = await resolveScope(program_id);
        const team = scope.kind === "team";
        const day = new Date(`${date}T12:00:00Z`);
        if (
          Number.isNaN(day.getTime()) ||
          day.toISOString().slice(0, 10) !== date
        ) {
          throw refusal("invalid_field", "That date doesn't exist. (date)");
        }
        let sets: { player: number[]; opponent: number[] } | null = null;
        if (score !== undefined && score !== "") {
          const parsed = parseScoreHint(score);
          if (!parsed.ok) throw refusal("invalid_score", parsed.reason);
          sets = { player: parsed.player, opponent: parsed.opponent };
        }
        const draft = matchDraftFromPrefill(
          {
            id: randomUUID(),
            provider,
            opponentName: opponent_name,
            date,
            tournamentName: tournament_name ?? null,
            round: round ?? null,
            matchType: match_type ?? null,
            courtType: court_type ?? null,
            playerName: team ? (player_name ?? null) : null,
          },
          sets,
        );
        const summary = draftRowSummary(draft);
        const seeded = await context.db.rpc("ask_seed_match_draft", {
          p_id: draft.id,
          p_program_id: team ? scope.programId : null,
          p_payload: draft,
          p_step: draft.step,
          p_step_index: draft.stepIndex,
          p_step_count: draft.stepCount,
          p_provider: draft.provider,
          p_player_name: summary.playerName,
          p_event_label: summary.eventLabel,
        });
        if (seeded.error) {
          // 42501 is also what the write guard raises for a refused POST
          // (hint oauth_client_read_only): only the function's own refusal
          // is a membership answer.
          if (
            seeded.error.code === "42501" &&
            /not a member/.test(seeded.error.message)
          ) {
            throw refusal(
              "not_a_member",
              "You are not a member of this program.",
            );
          }
          throw new Error(
            `ask_seed_match_draft failed: ${seeded.error.message}`,
          );
        }
        const url = `${siteUrl()}/dashboard/matches/new?draft=${encodeURIComponent(draft.id)}&return=ask`;
        return json(
          {
            scope: scope.kind,
            program_id: team ? scope.programId : null,
            draft_id: draft.id,
            provider,
            url,
            next_steps: [
              team
                ? `Open the link in the ${scope.programName} workspace.`
                : "Open the link.",
              provider === "swingvision"
                ? "Choose the SwingVision export."
                : "Choose the video file; the wizard checks its resolution and frame rate.",
              provider === "swingvision"
                ? "Check the details and save."
                : "Answer which player was at the top of the frame at the start, whether it was ad scoring, and whether the camera was fixed, then confirm the score and save.",
            ],
          },
          `Draft saved. Finish the upload here: ${url}`,
        );
      },
    ),
  );

  // ── describe_views ─────────────────────────────────────────────────────
  server.registerTool(
    "describe_views",
    {
      title: "Describe the ask views",
      description: READ_TOOL_DESCRIPTIONS.describe_views,
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
    guarded("describe_views", read.describeViews),
  );

  // ── run_query ──────────────────────────────────────────────────────────
  server.registerTool(
    "run_query",
    {
      title: "Run a query",
      description: READ_TOOL_DESCRIPTIONS.run_query,
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
    guarded("run_query", read.runQuery),
  );

  // ── ask ────────────────────────────────────────────────────────────────
  server.registerTool(
    "ask",
    {
      title: "Ask a question",
      description: `Ask Advantage a whole question about the player's matches (or a program's, with program_id) and get its answer: a headline, the figures it rests on, the explanation, an optional visual block and the matches it was computed from. Spends one of the player's monthly questions, as asking on the Ask page does; a question the Ask page already answered over unchanged data is replayed from its cache and spends nothing (never a follow-up). Pass conversation_id to ask a follow-up in a saved conversation, and match_ids to pin the question to particular matches.`,
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
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    guarded(
      "ask",
      async ({ question, program_id, conversation_id, match_ids }) => {
        const allowed = assertAskAllowed(context.caller);
        if (!allowed.ok) {
          throw refusal("needs_session", allowed.reason);
        }
        const asked = question.trim();
        if (asked === "") {
          throw refusal("question_empty", "Type a question first.");
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
          throw refusal("tag_not_resolved", resolved.reason);
        }

        const conversation = conversation_id
          ? await context.reads.conversation(
              conversation_id,
              team ? scope.programId : null,
            )
          : null;
        if (conversation_id && !conversation) {
          throw refusal(
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

        // The answer cache, read as the route reads it: a hit spends nothing.
        // Never for a follow-up — its meaning rests on the conversation, which
        // the key does not carry. Nor is an answer written from here: an
        // entry the page replays must carry its Watch links, and those need
        // the page's seat loader (`getAskPageSeats`), which reads the cookie
        // session this request does not have.
        const cacheKey = askCacheKey({
          question: asked,
          tags: resolved.tags,
          scope,
        });
        const dataVersion =
          context.model.configured && !conversation_id
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
          events = recordAskRun(input, {
            planModel: context.stageModels.plan,
            answerModel: context.stageModels.answer,
            onRun,
          });
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

// ── Ask's agent mode ─────────────────────────────────────────────────────

const AGENT_SQL_SCHEMA = {
  type: "string",
  maxLength: MAX_SQL_LENGTH,
} as const;

/**
 * The read tools as Ask's agent mode calls them (`src/lib/services/ask/agent.ts`):
 * the connector's handlers above, bound to the question's scope — the model
 * passes no program_id, the route already checked membership — and to the
 * question's database, so every query is checked by `checkAskSql()` and
 * runs through `ask_run_query` / `ask_run_team_query` as the route's own
 * do, counted in the run record. No rate limit or daily cap: the question
 * itself is what is metered. A refusal is answered as `slug: sentence`, as
 * the connector answers it.
 */
export function createAskAgentToolbox(
  deps: AskReadDeps & { scope: AskScope },
): AskAgentToolbox {
  const read = askReadHandlers(deps);
  const programId =
    deps.scope.kind === "team" ? deps.scope.programId : undefined;
  const definitions: LLMTool[] = [
    {
      name: "list_matches",
      description: READ_TOOL_DESCRIPTIONS.list_matches,
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "get_match",
      description: READ_TOOL_DESCRIPTIONS.get_match,
      inputSchema: {
        type: "object",
        properties: {
          match_id: { type: "string", description: "A match id." },
        },
        required: ["match_id"],
      },
    },
    {
      name: "opponent_scouting",
      description: READ_TOOL_DESCRIPTIONS.opponent_scouting,
      inputSchema: {
        type: "object",
        properties: {
          opponent: {
            type: "string",
            description:
              "Part of an opponent's name, matched case-insensitively. Omit for every opponent.",
          },
        },
      },
    },
    {
      name: "describe_views",
      description: READ_TOOL_DESCRIPTIONS.describe_views,
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "run_query",
      description: READ_TOOL_DESCRIPTIONS.run_query,
      inputSchema: {
        type: "object",
        properties: {
          scope_sql: {
            ...AGENT_SQL_SCHEMA,
            description: `A SELECT returning the single column match_id: the matches the question is about. Default: ${ASK_ALL_MATCHES_SCOPE}.`,
          },
          sql: {
            ...AGENT_SQL_SCHEMA,
            description:
              "The SELECT that computes the answer; it must read scope.",
          },
        },
        required: ["sql"],
      },
    },
  ];

  const string = (value: unknown) =>
    typeof value === "string" && value.trim() !== "" ? value : undefined;
  const run = (name: string, args: Record<string, unknown>) => {
    switch (name) {
      case "list_matches":
        return read.listMatches({ program_id: programId });
      case "get_match": {
        const matchId = string(args.match_id);
        if (!matchId || !isUuid(matchId)) {
          throw refusal("invalid_match_id", "match_id must be a match's uuid.");
        }
        return read.getMatch({ match_id: matchId, program_id: programId });
      }
      case "opponent_scouting":
        return read.opponentScouting({
          opponent: string(args.opponent)?.trim().slice(0, 120),
          program_id: programId,
        });
      case "describe_views":
        return read.describeViews({ scope: deps.scope.kind });
      case "run_query": {
        const sql = string(args.sql);
        const scopeSql = string(args.scope_sql);
        if (
          !sql ||
          sql.length > MAX_SQL_LENGTH ||
          (scopeSql?.length ?? 0) > MAX_SQL_LENGTH
        ) {
          throw refusal("invalid_sql", "sql must be one SELECT.");
        }
        return read.runQuery({
          sql,
          scope_sql: scopeSql,
          program_id: programId,
        });
      }
      default:
        throw refusal("unknown_tool", `There is no tool named ${name}.`);
    }
  };

  return {
    definitions,
    async call(name, args) {
      try {
        const result = await run(name, args);
        const first = result.content[0];
        return {
          ok: result.isError !== true,
          text: first && first.type === "text" ? first.text : "",
          ...(result.structuredContent
            ? { structured: result.structuredContent as Row }
            : {}),
        };
      } catch (error) {
        if (error instanceof Refusal) {
          return { ok: false, text: `${error.slug}: ${error.sentence}` };
        }
        console.error(`[ask] agent tool ${name} failed`, {
          error: error instanceof Error ? error.message : String(error),
        });
        return {
          ok: false,
          text: "internal_error: Something went wrong on our side. Try another way.",
        };
      }
    },
  };
}
