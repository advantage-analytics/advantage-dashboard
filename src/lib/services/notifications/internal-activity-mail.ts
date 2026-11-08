import type { SupabaseClient } from "@supabase/supabase-js";
import {
  feedbackInternalEmail,
  sendEmail,
  signupInternalEmail,
  supportMessageInternalEmail,
  uploadInternalEmail,
  vendorDeletionUnrecordedEmail,
  INTERNAL_ALERTS_ADDRESS,
} from "@/lib/services/email";
import { isSupportTopic } from "@/lib/data/support-view";
import { isUuid } from "@/lib/admin/validation";
import { isFirstMatchFeedbackRating } from "@/lib/feedback/first-match-feedback";
import { emailOrigin } from "@/lib/site-url";
import { describeContext } from "./analysis-mail";
import { claimSend } from "./should-notify";

/**
 * New signups, new uploads, first-match feedback answers and player messages,
 * mailed to the internal alerts inbox.
 *
 * Postgres decides WHEN (the `internal_activity_alerts` migration's triggers,
 * `internal_alert_feedback`'s and the `support_messages` one, post
 * `{ kind, id }` to
 * `/api/webhooks/internal-events`); this file decides WHAT. It never trusts
 * more than the id: every fact in the email is read
 * back from the row with the service role, so a forged or replayed body can
 * at most re-announce a row that exists, and `claimSend` makes that a no-op.
 *
 * Test accounts are dropped here rather than in the trigger. The live-DB
 * specs create real logins and matches against production
 * (`tests/fixtures/live-db.ts`, `<mark>-<label>@example.com`), and without
 * this every gate run would mail the inbox a dozen times.
 */

const LOG = "[notifications:internal-activity]";

export type InternalEventKind =
  | "signup"
  | "video_upload"
  | "swingvision_upload"
  | "feedback"
  | "support_message"
  | "vendor_deletion_unrecorded";

export interface InternalEvent {
  kind: InternalEventKind;
  /**
   * `users.id`, `processing_jobs.id`, `match_files.id`, `product_feedback.id`
   * `support_messages.id`, or the deleted `matches.id` for
   * `vendor_deletion_unrecorded`, by kind.
   */
  id: string;
}

export type InternalEventOutcome =
  "sent" | "duplicate" | "test_account" | "not_found" | "failed";

const KINDS: readonly InternalEventKind[] = [
  "signup",
  "video_upload",
  "swingvision_upload",
  "feedback",
  "support_message",
  "vendor_deletion_unrecorded",
];

/** The trigger's body, or null for anything else. Pure, so tested offline. */
export function parseInternalEvent(body: unknown): InternalEvent | null {
  if (!body || typeof body !== "object") return null;
  const { kind, id } = body as Record<string, unknown>;
  if (typeof kind !== "string" || !KINDS.includes(kind as InternalEventKind)) {
    return null;
  }
  if (!isUuid(id)) return null;
  return { kind: kind as InternalEventKind, id };
}

/**
 * A login the test suites made. `example.com` / `.org` / `.net` are reserved
 * (RFC 2606), so no real person signs up with one.
 */
export function isTestAccountEmail(email: string | null | undefined): boolean {
  return /@example\.(com|org|net)$/i.test(email?.trim() ?? "");
}

function fullName(
  row: {
    first_name?: string | null;
    last_name?: string | null;
  } | null,
): string | null {
  return (
    [row?.first_name?.trim(), row?.last_name?.trim()]
      .filter(Boolean)
      .join(" ") || null
  );
}

/**
 * Mail `INTERNAL_ALERTS_ADDRESS` about one event. Never throws: the route
 * answers 200 whatever happens here, because `pg_net` does not retry and a
 * 500 would only add noise to `net._http_response`.
 */
export async function notifyInternalEvent(
  supabase: SupabaseClient,
  event: InternalEvent,
): Promise<InternalEventOutcome> {
  try {
    switch (event.kind) {
      case "signup":
        return await notifySignup(supabase, event.id);
      case "feedback":
        return await notifyFeedback(supabase, event.id);
      case "support_message":
        return await notifySupportMessage(supabase, event.id);
      case "vendor_deletion_unrecorded":
        return await notifyVendorDeletionUnrecorded(event.id);
      default:
        return await notifyUpload(supabase, event);
    }
  } catch (error) {
    console.error(`${LOG} threw`, {
      ...event,
      reason: error instanceof Error ? error.message : String(error),
    });
    return "failed";
  }
}

async function notifySignup(
  supabase: SupabaseClient,
  userId: string,
): Promise<InternalEventOutcome> {
  const [{ data: row }, { data: auth }] = await Promise.all([
    supabase
      .from("users")
      .select("email, first_name, last_name")
      .eq("id", userId)
      .maybeSingle(),
    supabase.auth.admin.getUserById(userId),
  ]);

  const email = (row?.email as string | null)?.trim() || auth?.user?.email;
  if (!row || !email) return "not_found";
  if (isTestAccountEmail(email)) return "test_account";

  if (!(await claimSend(`signup_internal:${userId}`))) return "duplicate";

  const provider = auth?.user?.app_metadata?.provider;
  return deliver(
    signupInternalEmail({
      to: INTERNAL_ALERTS_ADDRESS,
      userId,
      email,
      name: fullName(row),
      signInMethod: typeof provider === "string" ? provider : null,
      adminUrl: `${emailOrigin()}/admin`,
    }),
    { kind: "signup", id: userId },
  );
}

async function notifyUpload(
  supabase: SupabaseClient,
  event: InternalEvent,
): Promise<InternalEventOutcome> {
  const video = event.kind === "video_upload";
  const { data: source } = video
    ? await supabase
        .from("processing_jobs")
        .select("match_id, created_by")
        .eq("id", event.id)
        .maybeSingle()
    : await supabase
        .from("match_files")
        .select("match_id, created_by:uploaded_by")
        .eq("id", event.id)
        .maybeSingle();
  if (!source?.match_id) return "not_found";

  const matchId = source.match_id as string;
  const uploaderId = (source.created_by as string | null) ?? null;

  const [{ data: match }, { data: uploader }] = await Promise.all([
    supabase
      .from("matches")
      .select("player1_name, player2_name, program_id, date")
      .eq("id", matchId)
      .maybeSingle(),
    uploaderId
      ? supabase
          .from("users")
          .select("email, first_name, last_name")
          .eq("id", uploaderId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const uploaderEmail = (uploader?.email as string | null)?.trim() || null;
  if (isTestAccountEmail(uploaderEmail)) return "test_account";

  // A video is keyed on its job (a resubmit is a new job, filtered out in
  // the trigger); a SwingVision import on its match, since one import may
  // write more than one `match_files` row.
  const key = video ? event.id : matchId;
  if (!(await claimSend(`upload_internal:${key}`))) return "duplicate";

  return deliver(
    uploadInternalEmail({
      to: INTERNAL_ALERTS_ADDRESS,
      kind: video ? "video" : "swingvision",
      matchId,
      matchTitle: match
        ? `${match.player1_name} vs. ${match.player2_name}`
        : `Match ${matchId}`,
      context: await describeContext(supabase, {
        programId: (match?.program_id as string | null) ?? null,
        date: (match?.date as string | null) ?? null,
      }),
      uploaderName: fullName(uploader),
      uploaderEmail,
      matchUrl: `${emailOrigin()}/dashboard/matches/${matchId}`,
    }),
    event,
  );
}

/**
 * A first-match feedback answer (`product_feedback`, written only by
 * `submit_product_feedback()`). Read back with the service role like the
 * others; the test accounts the walks and live specs create answer too, and
 * stay out of the inbox the same way. The context's hour count is the
 * route's own arithmetic, kept as a number so the template can word it.
 */
async function notifyFeedback(
  supabase: SupabaseClient,
  feedbackId: string,
): Promise<InternalEventOutcome> {
  const { data: row } = await supabase
    .from("product_feedback")
    .select("user_id, rating, note, context")
    .eq("id", feedbackId)
    .maybeSingle();
  if (!row || !isFirstMatchFeedbackRating(row.rating)) return "not_found";

  const userId = row.user_id as string;
  const { data: player } = await supabase
    .from("users")
    .select("email, first_name, last_name")
    .eq("id", userId)
    .maybeSingle();
  const playerEmail = (player?.email as string | null)?.trim() || null;
  if (isTestAccountEmail(playerEmail)) return "test_account";

  if (!(await claimSend(`feedback_internal:${feedbackId}`))) return "duplicate";

  const context = (row.context ?? {}) as Record<string, unknown>;
  const hours = context.hours_since_first_report;
  return deliver(
    feedbackInternalEmail({
      to: INTERNAL_ALERTS_ADDRESS,
      feedbackId,
      userId,
      playerName: fullName(player),
      playerEmail,
      rating: row.rating,
      note: (row.note as string | null) ?? null,
      hoursSinceFirstReport: typeof hours === "number" ? hours : null,
      adminUrl: `${emailOrigin()}/admin`,
    }),
    { kind: "feedback", id: feedbackId },
  );
}

/**
 * A player's message in their support thread (`support_messages`, written by
 * `send_support_message()` or a feedback note opening the thread). Shaped like
 * `notifyFeedback`: only the id is trusted, the row, its thread's player and
 * any match it names are read back with the service role. A staff reply or an
 * event row answers `not_found` — the trigger posts player rows only, so one
 * of those arriving here is a forged or mistaken body, not an alert.
 */
async function notifySupportMessage(
  supabase: SupabaseClient,
  messageId: string,
): Promise<InternalEventOutcome> {
  const { data: row } = await supabase
    .from("support_messages")
    .select("thread_id, author_role, body, topic, match_id")
    .eq("id", messageId)
    .maybeSingle();
  if (!row || row.author_role !== "player") return "not_found";

  const threadId = row.thread_id as string;
  const { data: thread } = await supabase
    .from("support_threads")
    .select("user_id")
    .eq("id", threadId)
    .maybeSingle();
  if (!thread) return "not_found";

  const userId = thread.user_id as string;
  const matchId = (row.match_id as string | null) ?? null;
  const [{ data: player }, { data: match }] = await Promise.all([
    supabase
      .from("users")
      .select("email, first_name, last_name")
      .eq("id", userId)
      .maybeSingle(),
    matchId
      ? supabase
          .from("matches")
          .select("player1_name, player2_name")
          .eq("id", matchId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const playerEmail = (player?.email as string | null)?.trim() || null;
  if (isTestAccountEmail(playerEmail)) return "test_account";

  if (!(await claimSend(`support_message_internal:${messageId}`))) {
    return "duplicate";
  }

  const topic = isSupportTopic(row.topic) ? row.topic : null;
  return deliver(
    supportMessageInternalEmail({
      to: INTERNAL_ALERTS_ADDRESS,
      messageId,
      userId,
      playerName: fullName(player),
      playerEmail,
      topic,
      matchTitle: matchId
        ? match
          ? `${match.player1_name} vs. ${match.player2_name}`
          : `Match ${matchId}`
        : null,
      body: (row.body as string | null) ?? "",
      adminUrl: `${emailOrigin()}/admin/messages?id=${threadId}`,
    }),
    { kind: "support_message", id: messageId },
  );
}

/**
 * The match is already deleted when this arrives, so there is no row to read
 * back: the id is the whole fact. A forged body can at most mail the inbox
 * one id once, which `claimSend` holds to.
 */
async function notifyVendorDeletionUnrecorded(
  matchId: string,
): Promise<InternalEventOutcome> {
  if (!(await claimSend(`vendor_deletion_unrecorded:${matchId}`))) {
    return "duplicate";
  }
  return deliver(
    vendorDeletionUnrecordedEmail({ to: INTERNAL_ALERTS_ADDRESS, matchId }),
    { kind: "vendor_deletion_unrecorded", id: matchId },
  );
}

async function deliver(
  message: Parameters<typeof sendEmail>[0],
  event: InternalEvent,
): Promise<InternalEventOutcome> {
  const sent = await sendEmail(message);
  if (sent.ok) return "sent";
  console.warn(`${LOG} not delivered`, { ...event, error: sent.error });
  return "failed";
}
