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

export interface McpUserReads {
  program(programId: string): Promise<McpProgram | null>;
  programs(): Promise<McpProgramMembership[]>;
  conversation(
    conversationId: string,
    programId: string | null,
  ): Promise<McpConversation | null>;
  matchReport(matchId: string): Promise<McpMatchReport | null>;
  personalOpponents(): Promise<PersonalOpponentsData>;
  teamOpponents(programId: string): Promise<TeamOpponentsData>;
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
        program_id: string;
        programs:
          | { id: string; school_name: string }
          | { id: string; school_name: string }[]
          | null;
      };
      if (!row) return null;
      const program = Array.isArray(row.programs)
        ? row.programs[0]
        : row.programs;
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
      type Embedded = {
        id: string;
        school_name: string;
        team: string | null;
        status: string;
      };
      const rows = (Array.isArray(data) ? data : []) as {
        role: string;
        programs: Embedded | Embedded[] | null;
      }[];
      return rows.flatMap((row): McpProgramMembership[] => {
        const program = Array.isArray(row.programs)
          ? row.programs[0]
          : row.programs;
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
