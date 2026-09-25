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
import { MatchVideosUsageCard } from "@/components/dashboard/settings/match-videos-usage-card";
import {
  getMatchVideoUploaderNames,
  getMatchVideoUsage,
} from "@/lib/data/match-video-usage-server";

/**
 * Settings › Usage & quota.
 *
 * Two allowances, never added together. A player in a program has a personal
 * 2-hour cap for their own uploads AND a share of the program's 75; presenting
 * one number would mean a coach's team upload silently eating a player's
 * personal allowance, which is not what the ledger does.
 *
 * The personal card is always here, followed by one program card per team the
 * viewer belongs to — every team, not only the active workspace, so a coach
 * or player on two programs sees both ledgers without switching. The active
 * team leads; the rest keep the switcher's order.
 *
 * Match videos are the exception: that card follows the ACTIVE workspace
 * only, because the video cap is per workspace and Remove acts on it.
 */
export default async function UsagePage() {
  const billingMonth = currentBillingMonth();
  const workspace = await getWorkspaceContext();
  if (!workspace) return null;

  const teams = workspace.available
    .filter((candidate) => candidate.kind === "team")
    .sort(
      (a, b) =>
        Number(b.id === workspace.active.id) -
        Number(a.id === workspace.active.id),
    );

  // Every read is independent of the others, so they go together rather than
  // one after the other; the workspace has to land first because it decides
  // which program cards exist at all.
  const [videos, personal, ...programs] = await Promise.all([
    getMatchVideoUsage(workspace.active),
    getPersonalUsage(workspace.viewer.id, billingMonth),
    ...teams.map((team) =>
      getProgramUsage(team.id, billingMonth, team.orgType),
    ),
  ]);

  // Needs the uploader ids the usage read returned, so it follows it.
  const uploaderNames = await getMatchVideoUploaderNames(
    videos.rows.flatMap((row) => (row.uploadedBy ? [row.uploadedBy] : [])),
  );

  const personalFraction = usageFraction(
    personal.usedSeconds,
    personal.capSeconds,
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

      {teams.map((team, index) => (
        <ProgramUsageCard
          key={team.id}
          program={team}
          initial={programs[index]}
          currentMonth={billingMonth}
        />
      ))}

      <MatchVideosUsageCard
        key={workspace.active.id}
        workspace={workspace.active}
        viewerId={workspace.viewer.id}
        initial={videos}
        names={uploaderNames}
        now={new Date().toISOString()}
      />
    </div>
  );
}
