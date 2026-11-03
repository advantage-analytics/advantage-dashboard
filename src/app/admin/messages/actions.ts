"use server";

import { requireAdminOrNotFound } from "@/lib/services/programs/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, supportReplyEmail } from "@/lib/services/email";
import { claimSend } from "@/lib/services/notifications/should-notify";
import {
  getSupportThreadForAdmin,
  markStaffRead,
  type AdminSupportThreadDetail,
} from "@/lib/data/support-admin-server";
import {
  STAFF_NAME_FALLBACK,
  SUPPORT_MESSAGE_MAX,
} from "@/lib/data/support-view";

/**
 * A staff reply in a player's support thread.
 *
 * Gated by `requireAdminOrNotFound()` (re-checked here: every server action
 * is its own request), then written with the service role — staff have no
 * policy on `support_messages` by design. `author_role = 'staff'`,
 * `author_id` = the admin, `author_name` = the admin's `users.first_name`
 * snapshotted now (the player's loader runs as the player and could not
 * read a staff `users` row later). A null first name signs as
 * `STAFF_NAME_FALLBACK` ("Advantage").
 *
 * With `emailCopy` (the composer's default) the reply also goes to the
 * player's address as `supportReplyEmail`, once per message
 * (`claimSend("support_reply:<message_id>")`). `email_copy_sent_at` is
 * stamped only after `sendEmail` answered `ok: true`; any failure leaves it
 * null and answers `{ ok: true, emailed: false }` — the reply stands, the
 * player still sees it in the app.
 */

export type SendStaffMessageResult =
  | { ok: true; messageId: string; emailed: boolean }
  | { ok: false; error: string };

export interface SendStaffMessageInput {
  threadId: string;
  body: string;
  emailCopy: boolean;
}

export async function sendStaffMessage(
  input: SendStaffMessageInput,
): Promise<SendStaffMessageResult> {
  const admin = await requireAdminOrNotFound();

  const threadId = typeof input?.threadId === "string" ? input.threadId : "";
  const body = typeof input?.body === "string" ? input.body.trim() : "";
  if (!threadId) return { ok: false, error: "That thread does not exist." };
  if (body === "") return { ok: false, error: "Write a reply before sending." };
  if (body.length > SUPPORT_MESSAGE_MAX) {
    return {
      ok: false,
      error: "That reply is too long. Keep it under 4,000 characters.",
    };
  }
  const emailCopy = input.emailCopy !== false;

  const db = createAdminClient();
  const [{ data: thread, error: threadError }, { data: me }] =
    await Promise.all([
      db
        .from("support_threads")
        .select("id, user_id")
        .eq("id", threadId)
        .maybeSingle(),
      db.from("users").select("first_name").eq("id", admin.id).maybeSingle(),
    ]);
  if (threadError || !thread) {
    return { ok: false, error: "That thread does not exist." };
  }
  const adminFirstName =
    (me?.first_name as string | null)?.trim() || STAFF_NAME_FALLBACK;

  const { data: inserted, error: insertError } = await db
    .from("support_messages")
    .insert({
      thread_id: threadId,
      author_id: admin.id,
      author_role: "staff",
      author_name: adminFirstName,
      body,
    })
    .select("id, created_at")
    .single();
  if (insertError || !inserted) {
    console.error("[support] staff reply insert failed", {
      threadId,
      error: insertError?.message,
    });
    return { ok: false, error: "Your reply didn't send. Please try again." };
  }
  const messageId = inserted.id as string;

  if (!emailCopy) return { ok: true, messageId, emailed: false };

  const emailed = await emailReply(db, {
    messageId,
    playerId: thread.user_id as string,
    adminFirstName,
    body,
    sentAt: inserted.created_at as string,
  });
  return { ok: true, messageId, emailed };
}

async function emailReply(
  db: ReturnType<typeof createAdminClient>,
  reply: {
    messageId: string;
    playerId: string;
    adminFirstName: string;
    body: string;
    sentAt: string;
  },
): Promise<boolean> {
  const { data: player } = await db
    .from("users")
    .select("email, first_name")
    .eq("id", reply.playerId)
    .maybeSingle();
  const to = (player?.email as string | null)?.trim();
  if (!to) return false;

  if (!(await claimSend(`support_reply:${reply.messageId}`))) return false;

  const result = await sendEmail(
    supportReplyEmail({
      to,
      playerFirstName: (player?.first_name as string | null)?.trim() || null,
      adminFirstName: reply.adminFirstName,
      body: reply.body,
      sentAt: reply.sentAt,
    }),
  );
  if (!result.ok) {
    console.error("[support] reply email failed", {
      messageId: reply.messageId,
      error: result.error,
    });
    return false;
  }

  const { error } = await db
    .from("support_messages")
    .update({ email_copy_sent_at: new Date().toISOString() })
    .eq("id", reply.messageId);
  if (error) {
    // The mail went; only the record of it did not. Say it was emailed.
    console.error("[support] could not stamp email_copy_sent_at", {
      messageId: reply.messageId,
      error: error.message,
    });
  }
  return true;
}

export type OpenSupportThreadResult =
  { ok: true; detail: AdminSupportThreadDetail } | { ok: false; error: string };

/**
 * The thread drawer opened: read the whole thread and stamp
 * `staff_read_at` in one round trip. Both loaders re-run
 * `requireAdminOrNotFound()`. A failed stamp does not keep the thread from
 * showing — the read is what the admin came for.
 */
export async function openSupportThread(
  threadId: string,
): Promise<OpenSupportThreadResult> {
  // First, outside the catches below: a non-admin gets the 404, not a
  // swallowed error.
  await requireAdminOrNotFound();
  if (typeof threadId !== "string" || threadId === "") {
    return { ok: false, error: "That thread does not exist." };
  }
  const [detail] = await Promise.all([
    getSupportThreadForAdmin(threadId).catch((error: unknown) => {
      console.error("[support] admin thread read failed", {
        threadId,
        error: error instanceof Error ? error.message : String(error),
      });
      return undefined;
    }),
    markStaffRead(threadId).catch((error: unknown) => {
      console.error("[support] could not mark the thread read", {
        threadId,
        error: error instanceof Error ? error.message : String(error),
      });
    }),
  ]);
  if (detail === undefined) {
    return { ok: false, error: "This thread didn't load. Please try again." };
  }
  if (detail === null)
    return { ok: false, error: "That thread does not exist." };
  return { ok: true, detail };
}
