"use server";

import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import {
  getRecentMatchesForSupport,
  getSupportThread,
  type SupportMatchOption,
} from "@/lib/data/support-server";
import {
  SUPPORT_MESSAGE_MAX,
  isSupportOrigin,
  isSupportTopic,
  sendErrorMessage,
  type SupportMessage,
  type SupportOrigin,
  type SupportThread,
  type SupportTopic,
} from "@/lib/data/support-view";

/**
 * The player's two writes in "Message Advantage". Both run on the session
 * client and go through the security-definer RPCs from
 * `20261103055820_support_messaging` — the player has no INSERT or UPDATE
 * policy on either table, and the RPC takes the author from `auth.uid()`,
 * never from the caller.
 *
 * Neither sends mail. The internal alert for a new player message comes from
 * the `support_messages` trigger (`notifySupportMessage`), and the player
 * never gets a receipt for their own message.
 */

export type SupportActionResult =
  { ok: true; messageId?: string } | { ok: false; error: string };

export interface SendPlayerMessageInput {
  body: string;
  topic: SupportTopic | null;
  matchId: string | null;
  origin: SupportOrigin;
}

export async function sendPlayerMessage(
  input: SendPlayerMessageInput,
): Promise<SupportActionResult> {
  // A server action's argument is whatever the network sent: re-check the
  // shape here, and leave the real rules (blank, length, match visibility,
  // rate limit) to the RPC so there is one copy of each.
  const body = typeof input?.body === "string" ? input.body : "";
  if (body.trim() === "") {
    return {
      ok: false,
      error: sendErrorMessage({ code: "22023", message: "blank" }),
    };
  }
  if (body.trim().length > SUPPORT_MESSAGE_MAX) {
    return {
      ok: false,
      error: sendErrorMessage({ code: "22023", message: "over 4000" }),
    };
  }
  if (!isSupportOrigin(input.origin)) {
    return { ok: false, error: sendErrorMessage(null) };
  }
  const topic = input.topic == null ? null : input.topic;
  if (topic !== null && !isSupportTopic(topic)) {
    return { ok: false, error: sendErrorMessage(null) };
  }
  const matchId =
    typeof input.matchId === "string" && input.matchId !== ""
      ? input.matchId
      : null;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("send_support_message", {
      p_body: body,
      p_topic: topic,
      p_match_id: matchId,
      p_origin: input.origin,
    });
    if (error) {
      console.error("[support] send_support_message refused", {
        code: error.code,
        message: error.message,
      });
      return { ok: false, error: sendErrorMessage(error) };
    }
    return { ok: true, messageId: (data as string | null) ?? undefined };
  } catch (cause) {
    console.error("[support] send_support_message threw", cause);
    return { ok: false, error: sendErrorMessage(null) };
  }
}

/** The player opened the thread: stamp `player_read_at`. */
export async function markPlayerThreadRead(): Promise<SupportActionResult> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("mark_support_thread_read");
    if (error) {
      console.error("[support] mark_support_thread_read failed", {
        code: error.code,
        message: error.message,
      });
      return { ok: false, error: "Could not mark your messages as read." };
    }
    return { ok: true };
  } catch (cause) {
    console.error("[support] mark_support_thread_read threw", cause);
    return { ok: false, error: "Could not mark your messages as read." };
  }
}

export interface SupportDialogData {
  thread: SupportThread | null;
  messages: SupportMessage[];
  /** The composer's "Your matches" group; empty when the read failed. */
  matches: SupportMatchOption[];
}

export type SupportDialogLoad =
  { ok: true; data: SupportDialogData } | { ok: false; error: string };

/**
 * What "Message Advantage" needs, read when the dialog opens rather than on
 * every dashboard render: the dialog is closed on nearly every page view, and
 * the recent-matches read alone is three round trips. Session client, RLS as
 * the player. A failed matches read only empties the picker; a failed thread
 * read fails the load, since without it the dialog cannot tell a reply from a
 * first message.
 */
export async function loadSupportDialog(): Promise<SupportDialogLoad> {
  try {
    const [supabase, workspace] = await Promise.all([
      createClient(),
      getWorkspaceContext(),
    ]);
    const [thread, matches] = await Promise.allSettled([
      getSupportThread(supabase),
      // The thread is the person's; the match picker is the workspace's.
      workspace
        ? getRecentMatchesForSupport(supabase, workspace.active)
        : Promise.resolve([]),
    ]);
    if (thread.status === "rejected") {
      console.error("[support] thread read failed", thread.reason);
      return {
        ok: false,
        error: "Your messages didn't load. Please try again.",
      };
    }
    if (matches.status === "rejected") {
      console.error("[support] recent matches read failed", matches.reason);
    }
    return {
      ok: true,
      data: {
        thread: thread.value?.thread ?? null,
        messages: thread.value?.messages ?? [],
        matches: matches.status === "fulfilled" ? matches.value : [],
      },
    };
  } catch (cause) {
    console.error("[support] loadSupportDialog threw", cause);
    return { ok: false, error: "Your messages didn't load. Please try again." };
  }
}
