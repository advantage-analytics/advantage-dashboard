import type { SupabaseClient } from "@supabase/supabase-js";
import { isUuid } from "@/lib/admin/validation";

/**
 * The two table reads `/api/mcp` makes as the signed-in user, through the
 * bearer client (`src/lib/supabase/bearer.ts`), under RLS.
 *
 * The page's loaders (`ask-server.ts`, `active-workspace-server.ts`) read
 * through the cookie client, which has no session here; these are the same
 * two questions asked of the bearer client, with the same predicates:
 *
 *   - `program()`: is the caller a member of this program, and what is it
 *     called — `program_members` filtered to the caller's own `user_id`
 *     (the same explicit filter `listProgramWorkspaces()` carries, because a
 *     coach's select policy returns the whole roster).
 *   - `conversation()`: one of the caller's own Ask conversations with its
 *     messages, for a follow-up question — `getAskConversation()`'s read
 *     minus the feedback join, which a tool result has no use for.
 *
 * Nothing here touches the service role: a non-member gets nothing from
 * `program_members`, and a conversation that is not the caller's is not
 * found. Both answer null for "not yours" and throw for a read that failed,
 * as the page's loaders do, so a refusal is never confused with an outage.
 */

export interface McpProgram {
  id: string;
  name: string;
}

export interface McpConversation {
  id: string;
  messages: { role: "user" | "assistant"; content: unknown }[];
}

export interface McpUserReads {
  program(programId: string): Promise<McpProgram | null>;
  conversation(
    conversationId: string,
    programId: string | null,
  ): Promise<McpConversation | null>;
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
  };
}
