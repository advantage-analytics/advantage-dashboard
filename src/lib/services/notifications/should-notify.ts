import { createAdminClient } from "@/lib/supabase/admin";
import {
  DEFAULT_PREFERENCES,
  type Preferences,
} from "@/lib/data/preferences-server";

/**
 * The two questions every optional email asks before it sends.
 *
 * SERVER ONLY — this goes through the admin client, because the caller is a
 * webhook, an `after()` block or an anonymous action with no session that RLS
 * could scope, and the recipient is somebody other than whoever is signed in.
 * Do not import it from anything a client component reaches.
 *
 * Neither function wraps `sendEmail()`. That function already checks Resend's
 * suppression list and never throws (see `docs/email-system.md` §5); these run
 * before it, at the call site, so the template is not even rendered for a
 * person who turned the switch off.
 */

export type NotificationPrefs = Pick<
  Preferences,
  | "notifyAnalysisReady"
  | "notifyAnalysisFailed"
  | "weeklyTeamDigest"
  | "notifyTeamActivity"
  | "notifyUsageAlerts"
>;

const NOTIFICATION_DEFAULTS: NotificationPrefs = {
  notifyAnalysisReady: DEFAULT_PREFERENCES.notifyAnalysisReady,
  notifyAnalysisFailed: DEFAULT_PREFERENCES.notifyAnalysisFailed,
  weeklyTeamDigest: DEFAULT_PREFERENCES.weeklyTeamDigest,
  notifyTeamActivity: DEFAULT_PREFERENCES.notifyTeamActivity,
  notifyUsageAlerts: DEFAULT_PREFERENCES.notifyUsageAlerts,
};

/**
 * Notification switches for a set of users, one query.
 *
 * A user with no `user_preferences` row gets the column defaults — "never
 * opened the page" and "opened it and kept the defaults" are the same state by
 * design, which is what lets the analysis emails default ON without a
 * backfill. A read error also answers with the defaults, and logs: a failed
 * lookup must not turn into a silently dropped email, since ON is what every
 * one of these switches is until somebody says otherwise.
 */
export async function getNotificationPrefs(
  userIds: readonly string[],
): Promise<Map<string, NotificationPrefs>> {
  const prefs = new Map<string, NotificationPrefs>();
  for (const id of userIds) prefs.set(id, NOTIFICATION_DEFAULTS);
  if (userIds.length === 0) return prefs;

  const db = createAdminClient();
  const { data, error } = await db
    .from("user_preferences")
    .select(
      "user_id, notify_analysis_ready, notify_analysis_failed, weekly_team_digest, notify_team_activity, notify_usage_alerts",
    )
    .in("user_id", [...userIds]);

  if (error) {
    console.error(
      "[notifications] could not read preferences; using defaults",
      {
        error: error.message,
        users: userIds.length,
      },
    );
    return prefs;
  }

  for (const row of data ?? []) {
    prefs.set(row.user_id as string, {
      notifyAnalysisReady: row.notify_analysis_ready as boolean,
      notifyAnalysisFailed: row.notify_analysis_failed as boolean,
      weeklyTeamDigest: row.weekly_team_digest as boolean,
      notifyTeamActivity: row.notify_team_activity as boolean,
      notifyUsageAlerts: row.notify_usage_alerts as boolean,
    });
  }
  return prefs;
}

/** One user's switches — the common case at an owner-notice call site. */
export async function wantsNotification(
  userId: string,
  key: keyof NotificationPrefs,
): Promise<boolean> {
  const prefs = await getNotificationPrefs([userId]);
  return (prefs.get(userId) ?? NOTIFICATION_DEFAULTS)[key];
}

/**
 * Claim the right to send a one-shot notification.
 *
 * Inserts `dedupeKey` into `notification_sends` and returns true only when
 * this call created the row. A vendor redelivery, a derivation re-run from the
 * CLI, or the fifth upload of a month that is already past 80% all find the
 * row and get false. Claimed BEFORE the send on purpose: two concurrent
 * attempts then race on a primary key rather than on a mailbox, and losing the
 * mail on the rare crash between claim and send is the cheaper failure —
 * the page the email points at still exists.
 *
 * A database error answers false and logs. Refusing to send is the safe side:
 * the alternative is a retrying webhook producing one email per retry.
 */
export async function claimSend(dedupeKey: string): Promise<boolean> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("notification_sends")
    .upsert(
      { dedupe_key: dedupeKey },
      { onConflict: "dedupe_key", ignoreDuplicates: true },
    )
    .select("dedupe_key");

  if (error) {
    console.error("[notifications] could not claim a send", {
      dedupeKey,
      error: error.message,
    });
    return false;
  }
  // `ignoreDuplicates` makes the conflicting insert a no-op, and a no-op
  // returns no row — which is exactly the "somebody already sent this" answer.
  return (data?.length ?? 0) > 0;
}
