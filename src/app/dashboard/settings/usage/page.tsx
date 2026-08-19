import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import { getPersonalUsage, getProgramUsage } from "@/lib/data/usage-server";
import {
  formatAnalysisTime,
  formatResetDate,
  usageFraction,
} from "@/lib/data/usage-format";
import { currentBillingMonth } from "@/lib/services/splitstep/config";
import {
  SettingsCard,
  SettingsCardTitle,
} from "@/components/dashboard/settings/settings-card";
import { ProgramUsageCard } from "@/components/dashboard/settings/program-usage-card";

/**
 * Settings › Usage & quota.
 *
 * Two allowances, never added together. A player in a program has a personal
 * 2-hour cap for their own uploads AND a share of the program's 75; presenting
 * one number would mean a coach's team upload silently eating a player's
 * personal allowance, which is not what the ledger does.
 *
 * The personal card is always here. The program card only exists inside a team
 * workspace, because outside one there is no program to meter.
 */
export default async function UsagePage() {
  const billingMonth = currentBillingMonth();
  const workspace = await getWorkspaceContext();
  if (!workspace) return null;

  // Both reads are independent of each other, so they go together rather than
  // one after the other; the workspace has to land first because it decides
  // whether the program card exists at all.
  const [personal, program] = await Promise.all([
    getPersonalUsage(workspace.viewer.id, billingMonth),
    workspace.active.kind === "team"
      ? getProgramUsage(workspace.active.id, billingMonth)
      : null,
  ]);

  const personalFraction = usageFraction(
    personal.usedSeconds,
    personal.capSeconds
  );

  return (
    <div className="flex max-w-[640px] flex-col gap-5">
      <SettingsCard className="gap-3 py-5">
        <SettingsCardTitle
          trailing={
            <span className="mono text-[11px] text-[var(--ink-700)]">
              {formatAnalysisTime(personal.usedSeconds)} /{" "}
              {formatAnalysisTime(personal.capSeconds)}
            </span>
          }
        >
          Your analysis time
        </SettingsCardTitle>

        <div className="h-1.5 overflow-hidden rounded-[3px] bg-[var(--ink-100)]">
          <div
            className="h-1.5 rounded-[3px] bg-[var(--blue)]"
            style={{ width: `${personalFraction * 100}%` }}
          />
        </div>

        <span className="text-[11px] text-[var(--ink-500)]">
          Personal uploads only · resets{" "}
          {formatResetDate(personal.billingMonth)} · free through Dec 31, 2026
        </span>
      </SettingsCard>

      {program && (
        <ProgramUsageCard
          programName={workspace.active.name}
          initial={program}
          currentMonth={billingMonth}
        />
      )}
    </div>
  );
}
