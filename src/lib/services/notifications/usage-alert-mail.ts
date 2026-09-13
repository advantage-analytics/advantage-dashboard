import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, usageAlertEmail } from "@/lib/services/email";
import { programDisplayName } from "@/lib/data/programs-server";
import { hoursSeverity, usageFraction } from "@/lib/data/usage-format";
import { currentBillingMonth } from "@/lib/services/splitstep/config";
import type { Workspace } from "@/lib/workspace/types";
import { claimSend, getNotificationPrefs } from "./should-notify";

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
    if (
      !(await claimSend(`usage_${severity}:${workspace.id}:${billingMonth}`))
    ) {
      return;
    }

    const db = createAdminClient();
    const { data: roster, error } = await db.rpc("program_roster", {
      p_program_id: workspace.id,
    });
    if (error) {
      console.error(`${LOG} could not read the roster`, {
        programId: workspace.id,
        error: error.message,
      });
      return;
    }

    const staff = (
      (roster ?? []) as {
        user_id: string;
        display_name: string | null;
        email: string | null;
        role: string;
      }[]
    ).filter((row) => row.role === "owner" || row.role === "coach");

    const prefs = await getNotificationPrefs(staff.map((row) => row.user_id));
    const programName = programDisplayName(workspace.name, workspace.team);

    let sent = 0;
    for (const person of staff) {
      const to = person.email?.trim();
      if (!to || !prefs.get(person.user_id)?.notifyUsageAlerts) continue;
      const result = await sendEmail(
        usageAlertEmail({
          to,
          recipientName: person.display_name,
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
