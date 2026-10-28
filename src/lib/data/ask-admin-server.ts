import { requireAdminOrNotFound } from "@/lib/services/programs/admin-guard";
import { isFresh, loadNavSeen, lookAtSurface } from "@/lib/admin/seen-server";
import { programDisplayName } from "@/lib/data/programs-server";
import { PROGRAM_CRESTS_BUCKET } from "@/lib/data/teams-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { USER_AVATARS_BUCKET } from "@/lib/user/avatar";
import {
  MAX_ADMIN_ASK_FEEDBACK,
  askSeenKey,
  askerName,
  posthogAppOrigin,
  readAdminAskFeedback,
  shortProgramName,
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
 * is a reading queue, not an archive, and says so when the cap is reached
 * (`adminAskSummary`).
 */
export { MAX_ADMIN_ASK_FEEDBACK } from "@/lib/data/ask-admin-view";

export interface AdminAskFeedbackList {
  rows: AdminAskFeedbackRow[];
  /**
   * The read came back full: there may be older thumbs past the cap, and the
   * page must not print `rows.length` as the total.
   */
  capped: boolean;
}

export async function listAdminAskFeedback(): Promise<AdminAskFeedbackList> {
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
  const capped = feedback.length >= MAX_ADMIN_ASK_FEEDBACK;
  if (feedback.length === 0) return { rows: [], capped };

  const userIds = [...new Set(feedback.map((row) => row.user_id))];
  const programIds = [
    ...new Set(
      feedback.flatMap((row) => (row.program_id ? [row.program_id] : [])),
    ),
  ];
  const [users, programs] = await Promise.all([
    db
      .from("users")
      .select("id, first_name, last_name, avatar_path")
      .in("id", userIds),
    programIds.length > 0
      ? db
          .from("programs")
          .select("id, school_name, team, crest_path")
          .in("id", programIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (users.error) {
    throw new Error(`Could not read askers: ${users.error.message}`);
  }
  if (programs.error) {
    throw new Error(`Could not read programs: ${programs.error.message}`);
  }

  const names = new Map<string, string>();
  const photos = new Map<string, string>();
  for (const user of (users.data ?? []) as {
    id: string;
    first_name: string | null;
    last_name: string | null;
    avatar_path: string | null;
  }[]) {
    names.set(user.id, askerName(user.id, user.first_name, user.last_name));
    if (user.avatar_path) {
      photos.set(
        user.id,
        db.storage.from(USER_AVATARS_BUCKET).getPublicUrl(user.avatar_path).data
          .publicUrl,
      );
    }
  }
  // The full name for the drawer; the short one for the table's Scope
  // column, where every "University of California, …" otherwise reads the
  // same (`shortProgramName`).
  const programNames = new Map<string, string>();
  const shortPrograms = new Map<string, string>();
  const crests = new Map<string, string>();
  for (const program of (programs.data ?? []) as {
    id: string;
    school_name: string | null;
    team: string | null;
    crest_path: string | null;
  }[]) {
    if (program.crest_path) {
      crests.set(
        program.id,
        db.storage.from(PROGRAM_CRESTS_BUCKET).getPublicUrl(program.crest_path)
          .data.publicUrl,
      );
    }
    if (!program.school_name) continue;
    programNames.set(
      program.id,
      programDisplayName(program.school_name, program.team),
    );
    shortPrograms.set(
      program.id,
      shortProgramName(program.school_name, program.team),
    );
  }

  const origin = posthogAppOrigin(process.env.NEXT_PUBLIC_POSTHOG_HOST);
  const read = feedback.flatMap((row) => {
    const mapped = readAdminAskFeedback(
      row,
      { names, programs: programNames, shortPrograms },
      origin,
    );
    if (!mapped) return [];
    return [
      {
        ...mapped,
        askerPhotoUrl: photos.get(row.user_id) ?? null,
        crestUrl: row.program_id ? (crests.get(row.program_id) ?? null) : null,
      },
    ];
  });
  return { rows: sortAdminAskFeedback(read), capped };
}

/**
 * The page's read: the list, plus which rows are New since this admin last
 * looked (`lookAtSurface(…, "ask")`, which also records this look). A row is
 * New by when the thumb was first set (`created_at`), keyed `ask:<id>`.
 */
export async function loadAdminAskPage(): Promise<
  AdminAskFeedbackList & { freshIds: string[] }
> {
  const admin = await requireAdminOrNotFound();
  const [list, seen] = await Promise.all([
    listAdminAskFeedback(),
    lookAtSurface(admin.id, "ask"),
  ]);
  const freshIds = list.rows
    .filter((row) => isFresh(seen, askSeenKey(row.id), row.createdAt))
    .map((row) => row.id);
  return { ...list, freshIds };
}

/**
 * The admin nav's Ask count. `ask_feedback` has no read/handled state — a
 * thumb is the player's word, never marked done — so the count is "New since
 * you last looked": thumbs first set after the admin's latest look at the
 * page and not opened since. Read-only; never moves the watermark.
 */
export async function countAskForNav(adminId: string): Promise<number> {
  const seen = (await loadNavSeen(adminId)).ask;
  const { data, error } = await createAdminClient()
    .from("ask_feedback")
    .select("id, created_at")
    .gt("created_at", seen.since)
    .limit(MAX_ADMIN_ASK_FEEDBACK);
  if (error) return 0;
  return ((data ?? []) as { id: string; created_at: string }[]).filter((row) =>
    isFresh(seen, askSeenKey(row.id), row.created_at),
  ).length;
}
