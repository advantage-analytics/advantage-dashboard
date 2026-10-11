/**
 * Everything the personal Ask page loads before it renders: what can be
 * tagged, how many questions are left, the saved conversations and the one
 * that is open.
 *
 * Every read goes through the cookie-authenticated server client, never
 * `admin.ts`. `ask_conversations` and `ask_messages` are owner-only under RLS
 * (`20261011191453_ask_conversations.sql`) and `ask_quota()` counts for
 * `auth.uid()`, so the session decides whose rows come back; the explicit
 * `user_id` filters below are belt-and-braces, not the boundary.
 *
 * Each loader is `cache()`d, so the page and anything beneath it that asks
 * again in the same request share one round trip.
 */

import { cache } from "react";
import { isUuid } from "@/lib/admin/validation";
import { buildAskTagOptions, type AskTagOptions } from "@/lib/data/ask-tags";
import { getPersonalMatches } from "@/lib/data/personal-matches-server";
import { getMyPlayerIds, playerSide } from "@/lib/data/player-identity-server";
import { createClient } from "@/lib/supabase/server";

export type {
  AskMatchOption,
  AskOpponentHand,
  AskOpponentOption,
  AskTagOptions,
} from "@/lib/data/ask-tags";

/** The signed-in user's id, or null. One auth read per request. */
const getViewerId = cache(async function getViewerId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
});

/**
 * The matches and opponents the viewer can tag — their personal matches, the
 * same rows `ask.matches` exposes to a question. Empty for a signed-out
 * request and for an account with no personal match.
 *
 * Throws when the matches cannot be read (`getPersonalMatches` does): an
 * empty menu would say "you have no matches", which is a different fact.
 */
export const getAskTagOptions = cache(
  async function getAskTagOptions(): Promise<AskTagOptions> {
    const viewerId = await getViewerId();
    if (!viewerId) return { matches: [], opponents: [] };

    const [matches, myPlayerIds] = await Promise.all([
      getPersonalMatches(viewerId),
      getMyPlayerIds(),
    ]);
    return buildAskTagOptions(matches, (match) =>
      playerSide(match, myPlayerIds, viewerId),
    );
  },
);

export interface AskQuota {
  /** Questions spent this UTC month. */
  used: number;
  cap: number;
  /** `YYYY-MM-DD`, the first day of next month. */
  resetsOn: string;
}

/**
 * The viewer's question count for the current month, from `ask_quota()`.
 *
 * Null when it cannot be read — never a made-up `0 / 20`. This is display
 * only: whether a question may be asked is decided by
 * `ask_reserve_question()` when it is sent, not by this number.
 */
export const getAskQuota = cache(
  async function getAskQuota(): Promise<AskQuota | null> {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("ask_quota");

    if (error) {
      console.error("[ask] could not read the question quota", {
        sqlstate: error.code,
        error: error.message,
      });
      return null;
    }

    const row = data as {
      used?: unknown;
      cap?: unknown;
      resets_on?: unknown;
    } | null;
    if (
      typeof row?.used !== "number" ||
      typeof row.cap !== "number" ||
      typeof row.resets_on !== "string"
    ) {
      console.error("[ask] ask_quota() answered an unexpected shape");
      return null;
    }
    return { used: row.used, cap: row.cap, resetsOn: row.resets_on };
  },
);

export interface AskConversationSummary {
  id: string;
  title: string;
  /** ISO timestamp of the last exchange. */
  updatedAt: string;
}

/**
 * The viewer's saved conversations, most recently used first. Empty on a
 * read failure: the list is the rail's "Earlier questions", and losing it
 * should not take the composer down with it.
 */
export const getAskConversations = cache(
  async function getAskConversations(): Promise<AskConversationSummary[]> {
    const viewerId = await getViewerId();
    if (!viewerId) return [];

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("ask_conversations")
      .select("id, title, updated_at")
      .eq("user_id", viewerId)
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("[ask] could not load conversations", {
        error: error.message,
      });
      return [];
    }

    return (
      (data ?? []) as { id: string; title: string; updated_at: string }[]
    ).map((row) => ({
      id: row.id,
      title: row.title,
      updatedAt: row.updated_at,
    }));
  },
);

export interface AskConversationMessage {
  id: string;
  role: "user" | "assistant";
  /**
   * The saved exchange exactly as `ask_save_exchange()` was handed it —
   * opaque jsonb the database does not validate. Narrow it before rendering.
   */
  content: unknown;
  createdAt: string;
}

export interface AskConversation extends AskConversationSummary {
  /** Oldest first; within one exchange, the question before its answer. */
  messages: AskConversationMessage[];
}

/**
 * One conversation with its messages in order, or null when there is none
 * the viewer may read — an id that is not a uuid, does not exist, or belongs
 * to someone else all answer the same, so `?c=` cannot be used to probe.
 */
export const getAskConversation = cache(async function getAskConversation(
  id: string,
): Promise<AskConversation | null> {
  // A malformed `?c=` would otherwise reach Postgres and fail the uuid cast.
  if (!isUuid(id)) return null;

  const viewerId = await getViewerId();
  if (!viewerId) return null;

  const supabase = await createClient();
  const [conversationRead, messagesRead] = await Promise.all([
    supabase
      .from("ask_conversations")
      .select("id, title, updated_at")
      .eq("id", id)
      .eq("user_id", viewerId)
      .maybeSingle(),
    supabase
      .from("ask_messages")
      .select("id, role, content, created_at")
      .eq("conversation_id", id)
      .eq("user_id", viewerId)
      .order("created_at", { ascending: true })
      // `ask_save_exchange()` inserts a question and its answer in one
      // statement, so the pair shares a `created_at` to the microsecond.
      // "user" sorts after "assistant"; descending puts the question first.
      .order("role", { ascending: false }),
  ]);

  if (conversationRead.error || messagesRead.error) {
    console.error("[ask] could not load the conversation", {
      error: (conversationRead.error ?? messagesRead.error)?.message,
    });
    return null;
  }

  const conversation = conversationRead.data as {
    id: string;
    title: string;
    updated_at: string;
  } | null;
  if (!conversation) return null;

  const messages = (messagesRead.data ?? []) as {
    id: string;
    role: "user" | "assistant";
    content: unknown;
    created_at: string;
  }[];

  return {
    id: conversation.id,
    title: conversation.title,
    updatedAt: conversation.updated_at,
    messages: messages.map((row) => ({
      id: row.id,
      role: row.role,
      content: row.content,
      createdAt: row.created_at,
    })),
  };
});
