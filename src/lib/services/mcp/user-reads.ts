import type { SupabaseClient } from "@supabase/supabase-js";
import { isUuid } from "@/lib/admin/validation";
import {
  loadPersonalOpponents,
  loadTeamOpponents,
  readMyPlayerIds,
  type PersonalOpponentsData,
  type TeamOpponentsData,
} from "@/lib/data/opponents-load";
import { toSquad, type Squad } from "@/lib/data/squad";
import { playerSeat, viewerSide } from "@/lib/data/viewer-side";
import { resolveAnalysisStatus } from "@/lib/data/match-analysis";
import type {
  MatchFormat,
  MatchScore,
  StoredMatchForPatch,
} from "@/lib/matches/patch-match";

/**
 * The table reads `/api/mcp` makes as the signed-in user, through the
 * bearer client (`src/lib/supabase/bearer.ts`), under RLS.
 *
 * The page's loaders (`ask-server.ts`, `active-workspace-server.ts`) read
 * through the cookie client, which has no session here; these are the same
 * questions asked of the bearer client, with the same predicates:
 *
 *   - `program()`: is the caller a member of this program, and what is it
 *     called — `program_members` filtered to the caller's own `user_id`
 *     (the same explicit filter `listProgramWorkspaces()` carries, because a
 *     coach's select policy returns the whole roster).
 *   - `programs()`: every program the caller is a member of, with their
 *     role — `listProgramWorkspaces()`'s read, minus the columns only the
 *     dashboard chrome draws. What `list_workspaces` answers.
 *   - `conversation()`: one of the caller's own Ask conversations with its
 *     messages, for a follow-up question — `getAskConversation()`'s read
 *     minus the feedback join, which a tool result has no use for.
 *   - `matchReport()`: the two `matches` columns the ask views do not carry
 *     (`insights`, `key_moments`), which seat is the caller's so they can be
 *     turned to them, and the match's share token when one exists. `matches`
 *     RLS answers "may they see it"; `match_share_links` RLS
 *     (`can_share_match`) answers "may they share it".
 *   - `personalOpponents()` / `teamOpponents()`: the two Opponents pages'
 *     reads (`opponents-load.ts`), as the user.
 *   - `ownMatch()`: what `normalizeMatchPatch()` decides from — the stored
 *     row the caller CREATED (`loadOwnMatch`'s `created_by` filter in
 *     `PATCH /api/matches/[id]`: a coach cannot edit a player's match from
 *     the connector either) and whether it was analysed, from its newest
 *     processing job as `analysisFor()` reads it.
 *
 * Nothing here touches the service role: a non-member gets nothing from
 * `program_members`, and a conversation or match that is not the caller's
 * is not found. All answer null for "not yours" and throw for a read that
 * failed, as the page's loaders do, so a refusal is never confused with an
 * outage.
 */

export interface McpProgram {
  id: string;
  name: string;
}

export interface McpProgramMembership extends McpProgram {
  role: string;
  /** The squad, or null for a custom org that never said. */
  team: Squad | null;
  /** `programs.status` — `active` once the claim settled. */
  status: string;
}

export interface McpConversation {
  id: string;
  messages: { role: "user" | "assistant"; content: unknown }[];
}

export interface McpMatchReport {
  /** The seat the caller (or their program's player) sits in. */
  seat: "player1" | "player2";
  /** `matches.insights`, raw: `{ player1?, player2? }` as `generate-insights` wrote it. */
  insights: unknown;
  /** `matches.key_moments`, raw — never the page's filler. */
  keyMoments: unknown;
  /** The share link's token, when the match has one the caller may see. */
  shareToken: string | null;
}

/** The stored row `update_match` normalises against, plus the program it is filed under. */
export interface McpOwnMatch extends StoredMatchForPatch {
  id: string;
  programId: string | null;
}

export interface McpUserReads {
  program(programId: string): Promise<McpProgram | null>;
  ownMatch(matchId: string): Promise<McpOwnMatch | null>;
  programs(): Promise<McpProgramMembership[]>;
  conversation(
    conversationId: string,
    programId: string | null,
  ): Promise<McpConversation | null>;
  matchReport(matchId: string): Promise<McpMatchReport | null>;
  personalOpponents(): Promise<PersonalOpponentsData>;
  teamOpponents(programId: string): Promise<TeamOpponentsData>;
}

/** A PostgREST embed arrives as an object or a one-element array. */
type Embedded<T> = T | T[] | null;
function one<T>(embed: Embedded<T>): T | null {
  return (Array.isArray(embed) ? embed[0] : embed) ?? null;
}

/**
 * `client` is the bearer client. Typed as the library's own class rather
 * than a structural stand-in: a spec fakes `from().select().eq()…` and casts,
 * because a hand-written shape makes TypeScript compare PostgREST's generic
 * builders and give up (TS2589).
 */
export function createMcpUserReads(
  client: SupabaseClient,
  userId: string,
): McpUserReads {
  return {
    async program(programId) {
      if (!isUuid(programId)) return null;
      const { data, error } = await client
        .from("program_members")
        .select("program_id, programs!inner(id, school_name)")
        .eq("user_id", userId)
        .eq("program_id", programId)
        .limit(1);
      if (error) {
        throw new Error("Could not read the caller's programs", {
          cause: error,
        });
      }
      const row = (Array.isArray(data) ? (data[0] ?? null) : null) as null | {
        programs: Embedded<{ id: string; school_name: string }>;
      };
      const program = row ? one(row.programs) : null;
      if (!program) return null;
      return { id: program.id, name: program.school_name };
    },

    async programs() {
      const { data, error } = await client
        .from("program_members")
        .select("role, programs!inner(id, school_name, team, status)")
        .eq("user_id", userId)
        .order("joined_at");
      if (error) {
        throw new Error("Could not read the caller's programs", {
          cause: error,
        });
      }
      const rows = (Array.isArray(data) ? data : []) as {
        role: string;
        programs: Embedded<{
          id: string;
          school_name: string;
          team: string | null;
          status: string;
        }>;
      }[];
      return rows.flatMap((row): McpProgramMembership[] => {
        const program = one(row.programs);
        if (!program) return [];
        return [
          {
            id: program.id,
            name: program.school_name,
            role: row.role,
            team: toSquad(program.team),
            status: program.status,
          },
        ];
      });
    },

    async conversation(conversationId, programId) {
      if (!isUuid(conversationId)) return null;
      if (programId !== null && !isUuid(programId)) return null;
      const owned = client
        .from("ask_conversations")
        .select("id")
        .eq("id", conversationId)
        .eq("user_id", userId);
      const [conversationRead, messagesRead] = await Promise.all([
        (programId === null
          ? owned.is("program_id", null)
          : owned.eq("program_id", programId)
        ).maybeSingle(),
        client
          .from("ask_messages")
          .select("role, content")
          .eq("conversation_id", conversationId)
          .eq("user_id", userId)
          .order("created_at", { ascending: true })
          // A question and its answer share a `created_at`; "user" sorts
          // after "assistant", so descending puts the question first.
          .order("role", { ascending: false }),
      ]);
      if (conversationRead.error || messagesRead.error) {
        throw new Error("Could not load the conversation", {
          cause: conversationRead.error ?? messagesRead.error,
        });
      }
      const conversation = conversationRead.data as { id: string } | null;
      if (!conversation) return null;
      const messages = (
        Array.isArray(messagesRead.data) ? messagesRead.data : []
      ) as { role: "user" | "assistant"; content: unknown }[];
      return {
        id: conversation.id,
        messages: messages
          .filter((row) => row.role === "user" || row.role === "assistant")
          .map((row) => ({ role: row.role, content: row.content })),
      };
    },

    async matchReport(matchId) {
      if (!isUuid(matchId)) return null;
      const [matchRead, shareRead, myPlayerIds] = await Promise.all([
        client
          .from("matches")
          .select(
            "id, program_id, player1_id, player2_id, created_by, insights, key_moments",
          )
          .eq("id", matchId)
          .maybeSingle(),
        client
          .from("match_share_links")
          .select("token")
          .eq("match_id", matchId)
          .maybeSingle(),
        readMyPlayerIds(client),
      ]);
      if (matchRead.error || shareRead.error) {
        throw new Error("Could not load the match", {
          cause: matchRead.error ?? shareRead.error,
        });
      }
      const match = matchRead.data as {
        id: string;
        program_id: string | null;
        player1_id: string | null;
        player2_id: string | null;
        created_by: string | null;
        insights: unknown;
        key_moments: unknown;
      } | null;
      if (!match) return null;

      // The caller's own seat first (`viewerSide`, the rule every personal
      // reader uses); on a program match they are not seated in — a coach
      // reading an athlete's match — the seat a roster player holds, as the
      // match page's `youSeat` does; a row naming neither reads as seat one,
      // the uploader's.
      let seat = viewerSide(match, myPlayerIds, userId, match.created_by);
      if (!seat && match.program_id) {
        const roster = await client.rpc(
          "program_roster_full",
          { p_program_id: match.program_id },
          { get: true },
        );
        if (roster.error) {
          throw new Error("Could not load the roster", {
            cause: roster.error,
          });
        }
        const rosterIds = ((roster.data ?? []) as { player_id?: unknown }[])
          .map((row) => row.player_id)
          .filter((id): id is string => typeof id === "string");
        seat = playerSeat(match, rosterIds);
      }
      const share = shareRead.data as { token?: unknown } | null;
      return {
        seat: seat ?? "player1",
        insights: match.insights ?? null,
        keyMoments: match.key_moments ?? null,
        shareToken: typeof share?.token === "string" ? share.token : null,
      };
    },

    async ownMatch(matchId) {
      if (!isUuid(matchId)) return null;
      const [matchRead, jobRead] = await Promise.all([
        client
          .from("matches")
          .select(
            "id, program_id, event_entry_id, source_provider, score, format, match_type, round",
          )
          .eq("id", matchId)
          .eq("created_by", userId)
          .maybeSingle(),
        client
          .from("processing_jobs")
          .select("status, derivation_version")
          .eq("match_id", matchId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (matchRead.error || jobRead.error) {
        throw new Error("Could not load the match", {
          cause: matchRead.error ?? jobRead.error,
        });
      }
      const match = matchRead.data as {
        id: string;
        program_id: string | null;
        event_entry_id: string | null;
        source_provider: string | null;
        score: MatchScore | null;
        format: MatchFormat | null;
        match_type: string | null;
        round: string | null;
      } | null;
      if (!match) return null;
      const job = jobRead.data as {
        status: string;
        derivation_version: string | null;
      } | null;
      const analysis = job
        ? resolveAnalysisStatus(job.status, job.derivation_version)
        : null;
      return {
        id: match.id,
        programId: match.program_id,
        score: match.score,
        format: match.format,
        linked: match.event_entry_id !== null,
        analyzed: analysis !== null || match.source_provider !== null,
        teamMatch: match.program_id !== null,
        matchType: match.match_type,
        round: match.round,
      };
    },

    async personalOpponents() {
      const myPlayerIds = await readMyPlayerIds(client);
      return loadPersonalOpponents(client, userId, myPlayerIds);
    },

    async teamOpponents(programId) {
      // No photos: a tool result lists names, and `program_member_avatars`
      // is one more call for nothing.
      return loadTeamOpponents(client, programId, userId, new Map());
    },
  };
}
