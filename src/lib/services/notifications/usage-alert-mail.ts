import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, usageAlertEmail } from "@/lib/services/email";
import { programDisplayName } from "@/lib/data/programs-server";
import { hoursSeverity, usageFraction } from "@/lib/data/usage-format";
import { currentBillingMonth } from "@/lib/services/splitstep/config";
import type { Workspace } from "@/lib/workspace/types";
import { displayName } from "@/lib/services/programs/invite-acceptance";
import { alreadySent, claimSend, getNotificationPrefs } from "./should-notify";

const LOG = "[notifications:usage]";

/**
 * After a reservation: did it push a team past 80% or 100%, and has anybody
 * been told yet this month?
 *
 * One mail per threshold per program per billing month — the dedupe key is
 * `usage_<severity>:<account_id>:<billing_month>`, so the eighth upload of a
 * month already past the line is silent, and next month starts clean. Owner
 * and coaches receive it, each behind their own "Analysis allowance alerts"
 * switch. Personal workspaces are skipped: the wizard's meter is already in
 * front of the one person who can do anything about it.
 *
 * Never throws — it runs in `after()` behind a submission the vendor has
 * already accepted.
 */
export async function notifyUsageThreshold(params: {
  workspace: Workspace;
  usedSeconds: number;
  capSeconds: number;
  now?: Date;
}): Promise<void> {
  const { workspace, usedSeconds, capSeconds, now } = params;
  if (workspace.kind !== "team" || capSeconds <= 0) return;

  const severity = hoursSeverity(usageFraction(usedSeconds, capSeconds));
  if (severity === "ok") return;

  try {
    const billingMonth = currentBillingMonth(now);
    const dedupeKey = `usage_${severity}:${workspace.id}:${billingMonth}`;
    // Every upload past the line lands here; once the month is told, stop
    // before the staff and preference reads.
    if (await alreadySent(dedupeKey)) return;

    // Straight off the tables, not `program_roster`: that RPC answers only a
    // member (`user_program_ids()` keys on `auth.uid()`), and the admin client
    // has no uid, so it returned nobody.
    const db = createAdminClient();
    const { data: members, error } = await db
      .from("program_members")
      .select(
        "user_id, users!program_members_user_id_fkey(first_name, last_name, email)",
      )
      .eq("program_id", workspace.id)
      .in("role", ["owner", "coach"]);
    if (error) {
      console.error(`${LOG} could not read the staff`, {
        programId: workspace.id,
        error: error.message,
      });
      return;
    }

    const staff = (members ?? []) as unknown as {
      user_id: string;
      users: {
        first_name: string | null;
        last_name: string | null;
        email: string | null;
      } | null;
    }[];

    const prefs = await getNotificationPrefs(staff.map((row) => row.user_id));
    const recipients = staff.flatMap(({ user_id, users }) => {
      const to = users?.email?.trim();
      return users && to && prefs.get(user_id)?.notifyUsageAlerts
        ? [{ to, name: displayName(users.first_name, users.last_name) }]
        : [];
    });
    if (recipients.length === 0) return;

    // Claimed only once there is somebody to tell. Claimed first, a failed
    // lookup — or a program whose staff all had the switch off — spent the
    // month's key with nothing sent, and every later upload stayed silent.
    // A redelivery or concurrent submission still races on the primary key.
    if (!(await claimSend(dedupeKey))) return;

    const programName = programDisplayName(workspace.name, workspace.team);

    let sent = 0;
    for (const { to, name } of recipients) {
      const result = await sendEmail(
        usageAlertEmail({
          to,
          recipientName: name,
          programName,
          severity,
          usedSeconds,
          capSeconds,
          billingMonth,
        }),
      );
      if (result.ok) sent += 1;
    }

    console.log(`${LOG} ${severity} alert`, {
      programId: workspace.id,
      billingMonth,
      recipients: sent,
    });
  } catch (error) {
    console.error(`${LOG} threw`, {
      programId: workspace.id,
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}
