import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import { getPersonalUsage, getProgramUsage } from "@/lib/data/usage-server";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import {
  extraHoursWord,
  formatHoursLong,
  formatResetDate,
  secondsLeft,
  isUnlimitedCap,
} from "@/lib/data/usage-format";
import {
  currentBillingMonth,
  formatPilotEnd,
  freeHoursReturnOn,
} from "@/lib/services/splitstep/config";
import { formatCreditDate, PLAN_HREF } from "@/lib/services/credits/packs";
import {
  SettingsCard,
  SettingsCardFootnote,
  SettingsCardTitle,
} from "@/components/dashboard/settings/settings-card";
import { TwoBucketMeter } from "@/components/dashboard/credits/two-bucket-meter";
import { ProgramUsageCard } from "@/components/dashboard/settings/program-usage-card";
import { MatchVideosUsageCard } from "@/components/dashboard/settings/match-videos-usage-card";
import {
  getMatchVideoUploaderNames,
  getMatchVideoUsage,
} from "@/lib/data/match-video-usage-server";

export const metadata = { title: "Usage" };

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

  // Always present — `getWorkspaceContext()` puts personal first.
  const personalWorkspace =
    workspace.available.find((candidate) => candidate.kind === "personal") ??
    workspace.active;

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
    getPersonalUsage(personalWorkspace, billingMonth),
    ...teams.map((team) => getProgramUsage(team.id, billingMonth, team)),
  ]);

  // Needs the uploader ids the usage read returned, so it follows it.
  const uploaderNames = await getMatchVideoUploaderNames(
    videos.rows.flatMap((row) => (row.uploadedBy ? [row.uploadedBy] : [])),
  );

  // E1 in the Credit Packs Mockups (docs/plans/2027-player-pricing.md): both buckets on one meter. Usage keeps the
  // ledger; Plan owns buying, so the packs are not repeated here.
  const personalUnlimited = isUnlimitedCap(personal.capSeconds);
  const personalBalance = {
    freeCapSeconds: personal.capSeconds,
    freeLeftSeconds: secondsLeft(personal.usedSeconds, personal.capSeconds),
    creditSeconds: personal.creditSeconds,
  };
  // Free hours with credits behind them: the headline is the TOTAL and the
  // split moves under the meter. Hours an admin added are "added", never
  // "credits" (`extraHoursWord`).
  const extraWord = extraHoursWord(
    personal.creditSeconds,
    personal.grantedSeconds,
  );
  const headlineTotal =
    personalBalance.freeLeftSeconds > 0 && personal.creditSeconds > 0;
  const creditsUntil = personal.nextCreditExpiresAt
    ? formatCreditDate(personal.nextCreditExpiresAt)
    : null;

  return (
    <div className="flex max-w-[640px] flex-col gap-5">
      <SettingsCard className="gap-3 py-5">
        <SettingsCardTitle
          trailing={
            <span className="mono text-[11px] text-[var(--ink-500)]">
              {personalUnlimited ? (
                "Unlimited"
              ) : headlineTotal ? (
                <>
                  {formatHoursLong(
                    personalBalance.freeLeftSeconds + personal.creditSeconds,
                  )}{" "}
                  left
                </>
              ) : (
                <>
                  {formatHoursLong(personalBalance.freeLeftSeconds)} of{" "}
                  {formatHoursLong(personal.capSeconds)} free left
                </>
              )}
            </span>
          }
        >
          Your analysis time
        </SettingsCardTitle>

        {!personalUnlimited && <TwoBucketMeter balance={personalBalance} />}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[var(--ink-500)]">
          <span>
            {personal.creditSeconds <= 0
              ? "Credits: none"
              : `${
                  headlineTotal
                    ? `Free: ${formatHoursLong(personalBalance.freeLeftSeconds)} of ${formatHoursLong(personal.capSeconds)} this month · `
                    : ""
                }${
                  extraWord === "added"
                    ? `Added: ${formatHoursLong(personal.creditSeconds)}${creditsUntil ? `, until ${creditsUntil}` : ""}`
                    : `Credits: ${formatHoursLong(personal.creditSeconds)}${creditsUntil ? ` · Next expire ${creditsUntil}` : ""}`
                }`}
          </span>
          <span className="flex-1" />
          <Link
            href={PLAN_HREF}
            className="inline-flex items-center gap-1 text-[var(--blue)] transition-colors duration-200 hover:text-[var(--blue-hover)]"
          >
            Manage on Plan
            <ArrowRight className="size-3" strokeWidth={1.75} aria-hidden />
          </Link>
        </div>

        <SettingsCardFootnote>
          {personalUnlimited
            ? "Personal uploads only · Admin accounts have no monthly cap"
            : freeHoursReturnOn()
              ? `Personal uploads only · Free hours reset ${formatResetDate(personal.billingMonth)} · Free through ${formatPilotEnd()}`
              : `Personal uploads only · Free hours end ${formatPilotEnd()}`}
        </SettingsCardFootnote>
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
