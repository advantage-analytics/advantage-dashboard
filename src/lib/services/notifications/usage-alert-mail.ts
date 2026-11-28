import { createAdminClient } from "@/lib/supabase/admin";
import {
  planUsageAlertEmail,
  sendEmail,
  usageAlertEmail,
} from "@/lib/services/email";
import { programPlanFor } from "@/lib/billing/plans";
import { NO_CREDITS, readCreditBalance } from "@/lib/services/splitstep/quota";
import { planFor } from "@/lib/user/plan";
import { programDisplayName } from "@/lib/data/programs-server";
import { hoursSeverity, usageFraction } from "@/lib/data/usage-format";
import {
  allowanceFor,
  allowanceResetsOn,
  type VideoAllowance,
} from "@/lib/services/splitstep/allowance";
import type { Workspace } from "@/lib/workspace/types";
import { displayName } from "@/lib/services/programs/invite-acceptance";
import {
  alreadySent,
  claimSend,
  getNotificationPrefs,
  wantsNotification,
} from "./should-notify";
import { usageAlertDedupeKey } from "./usage-alert-key";

const LOG = "[notifications:usage]";

/**
 * After a reservation: did it push the account past 80% or 100% of its hours,
 * and has anybody been told yet this period?
 *
 * One mail per threshold per account per hours window — the dedupe key is
 * `usageAlertDedupeKey()`: the billing month for the beta and a pilot, the
 * season's first day for a season, the hours window's start for a player's
 * plan — so the eighth upload of a period already past the line is silent,
 * and the next period starts clean.
 *
 * A TEAM's goes to its owner and coaches, each behind their own "Analysis
 * allowance alerts" switch. A PLAYER's goes to the player, behind the same
 * switch, and only for plan hours (Player, Player Pro): on the beta's free
 * hours, on extra hours alone, or with an admin's allowance, the wizard's
 * meter is already in front of the one person who can do anything about it.
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
  if (capSeconds <= 0) return;

  const severity = hoursSeverity(usageFraction(usedSeconds, capSeconds));
  if (severity === "ok") return;

  if (workspace.kind !== "team") {
    await notifyPlanThreshold({
      workspace,
      severity,
      usedSeconds,
      capSeconds,
      now,
    });
    return;
  }

  try {
    // One mail per threshold per allowance period. That is the billing month
    // until January 1, 2027 and for a pilot after it; a season is one pool,
    // so its key is the day the season starts and the mail goes out once a
    // season, not once a month.
    const allowance = allowanceFor(workspace, now);
    const billingMonth = allowance.billingMonth;
    const dedupeKey = usageAlertDedupeKey(severity, workspace.id, allowance);
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
          resetsOn: allowanceResetsOn(allowance) ?? undefined,
          ...teamAlertPeriod(workspace, allowance),
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

/**
 * What a team's mail says about its window. A season plan is "this season"
 * with the season's last day; and once the allowance is window-keyed (from
 * January 1, 2027) the link is the team's own page, where its hours live.
 */
function teamAlertPeriod(
  workspace: Workspace,
  allowance: VideoAllowance,
): {
  period?: "season";
  seasonEndsOn?: string;
  programId?: string;
} {
  const programId = allowance.windowed ? { programId: workspace.id } : {};
  if (allowance.kind !== "season") return programId;
  return {
    ...programId,
    period: "season",
    seasonEndsOn: programPlanFor(workspace)?.endsOn,
  };
}

/**
 * The player's own mail: plan hours at 80%, or used up. Keyed on the hours
 * window, so a subscription month that straddles two calendar months sends
 * once, and an upgrade's fresh hours get their own.
 */
async function notifyPlanThreshold(params: {
  workspace: Workspace;
  severity: "low" | "spent";
  usedSeconds: number;
  capSeconds: number;
  now?: Date;
}): Promise<void> {
  const { workspace, severity, usedSeconds, capSeconds, now } = params;
  try {
    const allowance = allowanceFor(workspace, now);
    // Plan hours only — see the header.
    if (allowance.kind !== "plan") return;
    const plan = planFor(workspace.plan);
    if (plan.id === "free") return;

    // A personal workspace's id is its owner's user id.
    const userId = workspace.id;
    const dedupeKey = usageAlertDedupeKey(severity, userId, allowance);
    if (await alreadySent(dedupeKey)) return;
    if (!(await wantsNotification(userId, "notifyUsageAlerts"))) return;

    const db = createAdminClient();
    const { data: user, error } = await db
      .from("users")
      .select("email")
      .eq("id", userId)
      .maybeSingle();
    if (error) {
      console.error(`${LOG} could not read the player`, {
        userId,
        error: error.message,
      });
      return;
    }
    const to = (user as { email: string | null } | null)?.email?.trim();
    if (!to) return;

    // Extra hours change what "used up" means, so the mail has to know. A
    // failed read says none: the plan's own figures are still true.
    const credits = await readCreditBalance(db, userId, now).catch(
      () => NO_CREDITS,
    );

    // Claimed only once there is somebody to tell — as for a team.
    if (!(await claimSend(dedupeKey))) return;

    const result = await sendEmail(
      planUsageAlertEmail({
        to,
        planId: plan.id,
        severity,
        usedSeconds,
        capSeconds,
        resetsAt: allowance.windowEnd,
        extraSeconds: credits.seconds,
      }),
    );

    console.log(`${LOG} ${severity} plan alert`, {
      userId,
      window: allowance.windowStart.toISOString(),
      sent: result.ok,
    });
  } catch (error) {
    console.error(`${LOG} threw`, {
      userId: workspace.id,
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}
