import { requireAdminOrNotFound } from "@/lib/services/programs/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  askerName,
  posthogAppOrigin,
  readAdminAskFeedback,
  sortAdminAskFeedback,
  type AdminAskFeedbackRow,
  type DbAdminAskFeedback,
} from "@/lib/data/ask-admin-view";

export type { AdminAskFeedbackRow } from "@/lib/data/ask-admin-view";

/**
 * Admin › Ask — every thumb a player has put on an Ask answer
 * (`ask_feedback`), down-votes first, with the copy of the question and the
 * answer each row keeps (`20261014205215_ask_feedback_keep`).
 *
 * Service role, as the other admin loaders: `ask_feedback` is owner-only
 * under RLS, and the reader is a platform admin reading everyone's. The
 * gate is re-run here rather than trusted from the layout
 * (`requireAdminOrNotFound()`). The asker is named from `users`, by name
 * and id — the page prints no email.
 *
 * Capped at the newest `MAX_ADMIN_ASK_FEEDBACK` by last change; the page
 * is a reading queue, not an archive.
 */
export const MAX_ADMIN_ASK_FEEDBACK = 200;

export async function listAdminAskFeedback(): Promise<AdminAskFeedbackRow[]> {
  await requireAdminOrNotFound();
  const db = createAdminClient();

  const { data: rows, error } = await db
    .from("ask_feedback")
    .select(
      "id, message_id, user_id, program_id, rating, reasons, note, created_at, updated_at, question, answer",
    )
    .order("updated_at", { ascending: false })
    .limit(MAX_ADMIN_ASK_FEEDBACK);
  if (error) throw new Error(`Could not read Ask feedback: ${error.message}`);
  const feedback = (rows ?? []) as DbAdminAskFeedback[];
  if (feedback.length === 0) return [];

  const userIds = [...new Set(feedback.map((row) => row.user_id))];
  const programIds = [
    ...new Set(
      feedback.flatMap((row) => (row.program_id ? [row.program_id] : [])),
    ),
  ];
  const [users, programs] = await Promise.all([
    db.from("users").select("id, first_name, last_name").in("id", userIds),
    programIds.length > 0
      ? db.from("programs").select("id, school_name").in("id", programIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (users.error) {
    throw new Error(`Could not read askers: ${users.error.message}`);
  }
  if (programs.error) {
    throw new Error(`Could not read programs: ${programs.error.message}`);
  }

  const names = new Map<string, string>();
  for (const user of (users.data ?? []) as {
    id: string;
    first_name: string | null;
    last_name: string | null;
  }[]) {
    names.set(user.id, askerName(user.id, user.first_name, user.last_name));
  }
  const programNames = new Map<string, string>();
  for (const program of (programs.data ?? []) as {
    id: string;
    school_name: string | null;
  }[]) {
    programNames.set(program.id, program.school_name ?? "A program");
  }

  const origin = posthogAppOrigin(process.env.NEXT_PUBLIC_POSTHOG_HOST);
  const read = feedback.flatMap((row) => {
    const mapped = readAdminAskFeedback(
      row,
      { names, programs: programNames },
      origin,
    );
    return mapped ? [mapped] : [];
  });
  return sortAdminAskFeedback(read);
}
