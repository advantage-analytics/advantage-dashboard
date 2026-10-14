"use server";

/**
 * Server actions for the Ask page, personal and team.
 *
 * The caller is whoever the session cookie says, never an id from the
 * client, and every call goes through the cookie-authenticated server client
 * — never `admin.ts`. `ask_conversations` has no delete policy on purpose:
 * `ask_delete_conversation` is the only way a row goes, and it removes only
 * a conversation `auth.uid()` owns.
 */

import { revalidatePath } from "next/cache";
import { isUuid } from "@/lib/admin/validation";
import type { AskScope, askBasePath } from "@/lib/services/ask/scope";
import { createClient } from "@/lib/supabase/server";

/**
 * The two pages a delete can have been made from. Spelled out here rather
 * than taken from the caller: a server action's arguments are whatever the
 * client sent, and `revalidatePath` must never be handed one of them. The
 * type ties the two strings to `askBasePath()`, so a renamed route is a type
 * error here rather than a list that quietly stops refreshing.
 */
const ASK_PATH: Record<AskScope["kind"], ReturnType<typeof askBasePath>> = {
  personal: "/dashboard/ask",
  team: "/dashboard/team/ask",
};

export type AskActionResult =
  { ok: true } | { ok: false; error: "invalid" | "forbidden" | "failed" };

/**
 * Delete one of the viewer's saved conversations, with its messages.
 *
 * The function answers false for an id that is unknown, already deleted or
 * someone else's — all three the same, so nothing here says whether an id
 * exists. That is still `ok`: the conversation is not in the viewer's list,
 * which is what was asked for, and a second tab's delete is not an error.
 *
 * It never touches `ask_usage`: a deleted conversation's questions stay
 * counted against the month.
 *
 * `scopeKind` says which page's list to re-read and nothing else — it grants
 * nothing and scopes nothing. The conversation is the caller's own whichever
 * page it was asked from, and anything that is not exactly `"team"` is read
 * as the personal page.
 */
export async function deleteAskConversation(
  conversationId: string,
  scopeKind: AskScope["kind"] = "personal",
): Promise<AskActionResult> {
  if (!isUuid(conversationId)) return { ok: false, error: "invalid" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "forbidden" };

  const { error } = await supabase.rpc("ask_delete_conversation", {
    p_id: conversationId,
  });
  if (error) {
    console.error("[ask] could not delete a conversation", {
      error: error.message,
    });
    return { ok: false, error: "failed" };
  }

  revalidatePath(scopeKind === "team" ? ASK_PATH.team : ASK_PATH.personal);
  return { ok: true };
}
