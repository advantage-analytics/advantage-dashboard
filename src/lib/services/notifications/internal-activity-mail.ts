import type { SupabaseClient } from "@supabase/supabase-js";
import {
  feedbackInternalEmail,
  sendEmail,
  signupInternalEmail,
  uploadInternalEmail,
  INTERNAL_ALERTS_ADDRESS,
} from "@/lib/services/email";
import { isUuid } from "@/lib/admin/validation";
import { isFirstMatchFeedbackRating } from "@/lib/feedback/first-match-feedback";
import { emailOrigin } from "@/lib/site-url";
import { describeContext } from "./analysis-mail";
import { claimSend } from "./should-notify";

/**
 * New signups, new uploads and first-match feedback answers, mailed to the
 * internal alerts inbox.
 *
 * Postgres decides WHEN (the `internal_activity_alerts` migration's triggers,
 * and `internal_alert_feedback`'s, post `{ kind, id }` to
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
  "signup" | "video_upload" | "swingvision_upload" | "feedback";

export interface InternalEvent {
  kind: InternalEventKind;
  /** `users.id`, `processing_jobs.id`, `match_files.id` or `product_feedback.id`, by kind. */
  id: string;
}

export type InternalEventOutcome =
  "sent" | "duplicate" | "test_account" | "not_found" | "failed";

const KINDS: readonly InternalEventKind[] = [
  "signup",
  "video_upload",
  "swingvision_upload",
  "feedback",
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

async function deliver(
  message: Parameters<typeof sendEmail>[0],
  event: InternalEvent,
): Promise<InternalEventOutcome> {
  const sent = await sendEmail(message);
  if (sent.ok) return "sent";
  console.warn(`${LOG} not delivered`, { ...event, error: sent.error });
  return "failed";
}
