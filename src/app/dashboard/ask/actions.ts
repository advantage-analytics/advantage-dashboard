"use server";

/**
 * Server actions for the Ask page, personal and team.
 *
 * The caller is whoever the session cookie says, never an id from the
 * client, and every call goes through the cookie-authenticated server client
 * — never `admin.ts`. `ask_conversations` has no delete policy on purpose:
 * `ask_delete_conversation` is the only way a row goes, and it removes only
 * a conversation `auth.uid()` owns. Rename and pin go through the table's
 * owner-only UPDATE policy (`20261015094801_ask_conversation_pins_rename`),
 * which lets `authenticated` change `title` and `pinned_at` and nothing
 * else. A pinned visual is copied by `ask_pin_answer()` from the caller's own
 * answer row (`20261015094823_ask_pins`): nothing the browser sends becomes
 * a block on Home.
 */

import { revalidatePath } from "next/cache";
import { isUuid } from "@/lib/admin/validation";
import type { AskScope, askBasePath } from "@/lib/services/ask/scope";
import { normalizeAskTitle } from "@/lib/services/ask/titles";
import { createClient } from "@/lib/supabase/server";

/**
 * The two pages a write can have been made from. Spelled out here rather
 * than taken from the caller: a server action's arguments are whatever the
 * client sent, and `revalidatePath` must never be handed one of them. The
 * type ties the two strings to `askBasePath()`, so a renamed route is a type
 * error here rather than a list that quietly stops refreshing.
 */
const ASK_PATH: Record<AskScope["kind"], ReturnType<typeof askBasePath>> = {
  personal: "/dashboard/ask",
  team: "/dashboard/team/ask",
};

/** Where the personal Home draws pins. */
const HOME_PATH = "/dashboard";
const TEAM_HOME_PATH = "/dashboard/team";

export type AskActionResult =
  { ok: true } | { ok: false; error: "invalid" | "forbidden" | "failed" };

function askPath(scopeKind: AskScope["kind"]) {
  return scopeKind === "team" ? ASK_PATH.team : ASK_PATH.personal;
}
/** The Home a pin lands on: the team's for a team answer, else the player's. */
function homePath(scopeKind: AskScope["kind"]) {
  return scopeKind === "team" ? TEAM_HOME_PATH : HOME_PATH;
}

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

  revalidatePath(askPath(scopeKind));
  return { ok: true };
}

/**
 * Rename one of the viewer's conversations. The title is normalised here
 * (`normalizeAskTitle`: one line, 1–120 characters) and refused as `invalid`
 * otherwise; RLS answers an id that is not the caller's with zero rows,
 * which reads back as `forbidden`.
 *
 * `revalidate: false` is for the page's own rename right after a first
 * answer — the short title from `askTitle()` — where a re-render would
 * rebuild the thread under the answer just shown; the list carries the new
 * title on its next read anyway. A rename the player makes revalidates.
 */
export async function renameAskConversation(
  conversationId: string,
  title: string,
  scopeKind: AskScope["kind"] = "personal",
  options: { revalidate?: boolean } = {},
): Promise<AskActionResult> {
  if (!isUuid(conversationId)) return { ok: false, error: "invalid" };
  const normalized = normalizeAskTitle(title);
  if (!normalized) return { ok: false, error: "invalid" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "forbidden" };

  const { data, error } = await supabase
    .from("ask_conversations")
    .update({ title: normalized })
    .eq("id", conversationId)
    .eq("user_id", user.id)
    .select("id");
  if (error) {
    console.error("[ask] could not rename a conversation", {
      error: error.message,
    });
    return { ok: false, error: "failed" };
  }
  if (!data || data.length === 0) return { ok: false, error: "forbidden" };

  if (options.revalidate !== false) revalidatePath(askPath(scopeKind));
  return { ok: true };
}

/**
 * Pin one of the viewer's conversations to the top of the rail, or take the
 * pin off. `pinned_at` is set to now or to null; the row's `updated_at` —
 * the last exchange — is untouched, so the months beneath keep their order.
 */
export async function setAskConversationPinned(
  conversationId: string,
  pinned: boolean,
  scopeKind: AskScope["kind"] = "personal",
): Promise<AskActionResult> {
  if (!isUuid(conversationId)) return { ok: false, error: "invalid" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "forbidden" };

  const { data, error } = await supabase
    .from("ask_conversations")
    .update({ pinned_at: pinned ? new Date().toISOString() : null })
    .eq("id", conversationId)
    .eq("user_id", user.id)
    .select("id");
  if (error) {
    console.error("[ask] could not pin a conversation", {
      error: error.message,
    });
    return { ok: false, error: "failed" };
  }
  if (!data || data.length === 0) return { ok: false, error: "forbidden" };

  revalidatePath(askPath(scopeKind));
  return { ok: true };
}

export type AskPinResult =
  | { ok: true; pinId: string }
  | { ok: false; error: "invalid" | "forbidden" | "no_visual" | "failed" };

/**
 * Keep an answer's visual block on Home. `ask_pin_answer()` copies the block
 * from the caller's own answer row and refuses anyone else's (42501), an
 * answer with no block (22023), and a team answer once the caller has left
 * the program. Pinning the same answer twice answers the existing pin.
 *
 * Revalidates Home, where the card is, and the Ask page, whose saved
 * conversation now carries the pin id on that answer.
 */
export async function pinAskAnswer(
  answerId: string,
  scopeKind: AskScope["kind"] = "personal",
): Promise<AskPinResult> {
  if (!isUuid(answerId)) return { ok: false, error: "invalid" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "forbidden" };

  const { data, error } = await supabase.rpc("ask_pin_answer", {
    p_answer_id: answerId,
  });
  if (error) {
    if (error.code === "42501") return { ok: false, error: "forbidden" };
    if (error.code === "22023") return { ok: false, error: "no_visual" };
    console.error("[ask] could not pin an answer", { error: error.message });
    return { ok: false, error: "failed" };
  }
  if (typeof data !== "string" || !isUuid(data)) {
    console.error("[ask] ask_pin_answer() answered an unexpected shape");
    return { ok: false, error: "failed" };
  }

  revalidatePath(homePath(scopeKind));
  revalidatePath(askPath(scopeKind));
  return { ok: true, pinId: data };
}

/**
 * Take a pin off Home. Owner-only through `ask_pins`' delete policy: an id
 * that is not the caller's deletes nothing, which — as with a delete — is
 * still `ok`: the pin is not on the caller's Home, which is what was asked.
 */
export async function unpinAskAnswer(
  pinId: string,
  scopeKind: AskScope["kind"] = "personal",
): Promise<AskActionResult> {
  if (!isUuid(pinId)) return { ok: false, error: "invalid" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "forbidden" };

  const { error } = await supabase
    .from("ask_pins")
    .delete()
    .eq("id", pinId)
    .eq("user_id", user.id);
  if (error) {
    console.error("[ask] could not unpin an answer", { error: error.message });
    return { ok: false, error: "failed" };
  }

  revalidatePath(homePath(scopeKind));
  revalidatePath(askPath(scopeKind));
  return { ok: true };
}
