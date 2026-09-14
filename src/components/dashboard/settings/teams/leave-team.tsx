"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { EyeOff, Upload, UserRound } from "lucide-react";
import {
  DialogProblem,
  RosterDialog,
} from "@/components/dashboard/team/dialog-shell";
import { SettingsCard } from "@/components/dashboard/settings/settings-card";
import { SettingsButton } from "@/components/dashboard/settings/settings-button";
import { StatePill } from "@/components/ui/state-pill";
import { ProgramCrest } from "@/components/dashboard/settings/teams/program-crest";
import { leaveProgram } from "@/components/dashboard/settings/team-actions";
import { teamLabel } from "@/lib/workspace/types";
import { useWorkspace } from "@/components/dashboard/workspace-provider";

const TEAMS_PATH = "/dashboard/settings/teams";

/**
 * A player leaving the program they are looking at.
 *
 * The entry is the player's counterpart to the owner's "Delete program" row:
 * the last card on the page, the destructive word in `--danger`, an outline
 * danger button that only opens the confirm. Staff never see it — a coach
 * steps down by transfer or is removed on the Roster.
 *
 * The dialog has two beats, like the transfer's. Confirm puts the one thing
 * that cannot be undone from this side in the contract line under the title,
 * then lists what leaving costs and what it leaves alone. Red is the only
 * warning colour on it — the danger button — with no amber notice beside it:
 * two alarm registers read as two levels of alarm, and a red-tinted box is
 * the shape `DialogProblem` uses for a failed action. Done shows the changed
 * state — the program row with "was Player · Left" and the three promises as
 * facts — never a green tick, which is fenced to match outcomes.
 *
 * Leaving does not refresh the page behind the dialog: the viewer is no longer
 * a member, so the program page would redirect and unmount the Done step.
 * Closing the dialog, by Done, the X or Esc, is what navigates away.
 */
export function LeaveTeamCard({
  programId,
  programName,
  team,
  conference,
  crestUrl,
  ownerName,
}: {
  programId: string;
  programName: string;
  team: "mens" | "womens";
  conference: string | null;
  crestUrl: string | null;
  ownerName: string | null;
}) {
  const [open, setOpen] = useState(false);
  // Bumped on every open so the dialog remounts at Confirm with no stale error.
  const [session, setSession] = useState(0);

  return (
    <>
      <SettingsCard className="gap-0 py-4">
        <div className="flex items-center gap-6">
          <div className="min-w-0 flex-1">
            <div className="text-[12px] text-[var(--danger)]">Leave team</div>
            <div className="mt-0.5 text-[11px] leading-[1.5] text-[var(--ink-500)]">
              You&apos;ll lose access to {programName}&apos;s matches and
              reports. Your own uploads stay in your personal workspace.
            </div>
          </div>
          <SettingsButton
            variant="danger"
            size="sm"
            onClick={() => {
              setSession((value) => value + 1);
              setOpen(true);
            }}
          >
            Leave team
          </SettingsButton>
        </div>
      </SettingsCard>

      <LeaveTeamDialog
        key={session}
        open={open}
        onOpenChange={setOpen}
        programId={programId}
        programName={programName}
        team={team}
        conference={conference}
        crestUrl={crestUrl}
        ownerName={ownerName}
      />
    </>
  );
}

function LeaveTeamDialog({
  open,
  onOpenChange,
  programId,
  programName,
  team,
  conference,
  crestUrl,
  ownerName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  programId: string;
  programName: string;
  team: "mens" | "womens";
  conference: string | null;
  crestUrl: string | null;
  ownerName: string | null;
}) {
  const router = useRouter();
  const { available } = useWorkspace();
  // Read before leaving: the Teams list redirects to Profile when no team is
  // left, and the done step should name where Done actually goes.
  const [otherTeams] = useState(
    () =>
      available.filter(
        (workspace) => workspace.kind === "team" && workspace.id !== programId,
      ).length,
  );
  const [result, setResult] = useState<{
    ownerNotified: string | null;
    profileKept: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const leave = () => {
    setError(null);
    startTransition(async () => {
      const outcome = await leaveProgram(programId);
      if (!outcome.ok) {
        setError(outcome.error);
        return;
      }
      setResult({
        ownerNotified: outcome.ownerNotified,
        profileKept: outcome.profileKept,
      });
    });
  };

  if (result) {
    // Any way out of the done step leaves the page this person can no longer
    // see. The list redirects to Profile on its own if this was their last team.
    const finish = () => {
      onOpenChange(false);
      router.replace(TEAMS_PATH);
      router.refresh();
    };

    const squad = teamLabel(team);
    const subline = [squad ? `${squad} tennis` : null, conference]
      .filter(Boolean)
      .join(" · ");

    return (
      <RosterDialog
        open={open}
        onOpenChange={(next) => {
          if (!next) finish();
        }}
        width={480}
        title={`You've left ${programName}`}
        description={
          result.ownerNotified
            ? `We let ${result.ownerNotified} know. The coaching staff can invite you back whenever they like.`
            : "The coaching staff can invite you back whenever they like."
        }
        footer={
          <>
            <span className="text-[11px] text-[var(--ink-500)]">
              {otherTeams > 0
                ? "You'll land on Settings › Teams."
                : "You'll land on your Profile settings."}
            </span>
            <span className="flex-1" />
            <SettingsButton size="sm" onClick={finish}>
              Done
            </SettingsButton>
          </>
        }
      >
        <div className="flex flex-col gap-[18px]">
          <div className="flex items-center gap-3 rounded-[var(--radius-element)] bg-[var(--surface-subtle)] px-3.5 py-3">
            <ProgramCrest
              name={programName}
              crestUrl={crestUrl}
              className="bg-[var(--surface-card)]"
            />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-[12px] font-medium text-[var(--ink-900)]">
                {programName}
              </span>
              {subline && (
                <span className="truncate text-[11px] text-[var(--ink-500)]">
                  {subline}
                </span>
              )}
            </div>
            <span className="text-[11px] whitespace-nowrap text-[var(--ink-500)]">
              was Player
            </span>
            <StatePill outline>Left</StatePill>
          </div>

          <div className="flex flex-col">
            <FactRow
              first
              icon={<EyeOff />}
              label="Team matches, video and reports"
              value="No longer visible to you"
            />
            {result.profileKept && (
              <FactRow
                icon={<UserRound />}
                label="Your player profile and its matches"
                value="Stay with the program"
              />
            )}
            <FactRow
              icon={<Upload />}
              label="Your personal uploads"
              value="Unchanged"
            />
          </div>
        </div>
      </RosterDialog>
    );
  }

  return (
    <RosterDialog
      open={open}
      onOpenChange={(next) => {
        if (!isPending) onOpenChange(next);
      }}
      width={480}
      title={`Leave ${programName}?`}
      description={`Are you sure? You'll have to be invited back into ${programName}.`}
      footer={
        <>
          <span className="flex-1" />
          <SettingsButton
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </SettingsButton>
          <SettingsButton
            variant="danger-solid"
            size="sm"
            onClick={leave}
            loading={isPending}
          >
            Leave team
          </SettingsButton>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <ul className="flex flex-col gap-[7px] rounded-[8px] bg-[var(--surface-subtle)] px-3.5 py-3 text-[11px] leading-[1.5] text-[var(--ink-700)]">
          <Bullet>
            You lose access to the team&apos;s matches, video and reports,
            including the ones recorded of you.
          </Bullet>
          <Bullet>
            Your player profile and its matches stay with the program for{" "}
            {ownerName ? `${ownerName} and the coaches` : "the coaches"} to
            manage.
          </Bullet>
          <Bullet>
            Matches you uploaded to your personal workspace are unaffected.
          </Bullet>
        </ul>

        <DialogProblem message={error} />
      </div>
    </RosterDialog>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <span aria-hidden="true" className="text-[var(--ink-400)]">
        ·
      </span>
      <span>{children}</span>
    </li>
  );
}

function FactRow({
  icon,
  label,
  value,
  first,
}: {
  icon: React.ReactElement;
  label: string;
  value: string;
  first?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2.5 py-[9px] ${first ? "" : "border-t border-[var(--border-hairline)]"}`}
    >
      <span
        aria-hidden="true"
        className="flex size-[13px] shrink-0 text-[var(--ink-400)] [&>svg]:size-[13px] [&>svg]:stroke-[1.5]"
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--ink-900)]">
        {label}
      </span>
      <span className="text-[11px] whitespace-nowrap text-[var(--ink-500)]">
        {value}
      </span>
    </div>
  );
}
