"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DialogProblem,
  RosterDialog,
} from "@/components/dashboard/team/dialog-shell";
import { SettingsButton } from "@/components/dashboard/settings/settings-button";
import { SettingsUnderlineInput } from "@/components/dashboard/settings/settings-card";
import { StatePill } from "@/components/ui/state-pill";
import { YouPill } from "@/components/ui/new-pill";
import { transferProgramOwnership } from "@/components/dashboard/settings/team-actions";
import { getInitials } from "@/lib/data/match-utils";
import type { TeamMember } from "@/lib/data/team-settings-server";

/**
 * Two beats: confirm, done. No picker — "Make owner" on a member's row already
 * named the person, and a step that asks again is a step that should not
 * exist.
 *
 * Confirm is typed, not clicked: ownership carries billing and every athlete's
 * data, and it is the one act on the page the new owner alone can reverse.
 * Done shows the swap in the members card's own vocabulary rather than a
 * green tick — `--success` is fenced to match outcomes, and two rows saying
 * "was Coach → Owner" is what actually happened, shown instead of asserted.
 */
export function TransferOwnershipDialog({
  open,
  onOpenChange,
  programId,
  programName,
  target,
  viewerName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  programId: string;
  programName: string;
  /** The coach or staff member the row named. Null while closed. */
  target: TeamMember | null;
  viewerName: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState<"confirm" | "done">("confirm");
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // No reset effect: the parent remounts this component with a fresh `key`
  // on every open, so each transfer starts at Confirm with an empty field and
  // the Done step never flashes back to Confirm while the dialog fades out.

  const armed = typed.trim().toLowerCase() === programName.trim().toLowerCase();

  const transfer = () => {
    if (!target || !armed) return;
    setError(null);
    startTransition(async () => {
      const result = await transferProgramOwnership({
        programId,
        newOwnerUserId: target.userId,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setWarning(result.warning ?? null);
      setStep("done");
      // The page behind the dialog is now stale — the caller is a coach, the
      // target is the owner, and the footer card changed shape.
      router.refresh();
    });
  };

  if (!target) return null;

  if (step === "done") {
    return (
      <RosterDialog
        open={open}
        onOpenChange={onOpenChange}
        width={480}
        title="Ownership transferred"
        description={
          warning ?? `We emailed ${target.name} so they know it happened.`
        }
        footer={
          <>
            <span className="flex-1" />
            <SettingsButton size="sm" onClick={() => onOpenChange(false)}>
              Done
            </SettingsButton>
          </>
        }
      >
        <div className="flex flex-col">
          <SwapRow name={target.name} was="Coach" now="Owner" first />
          <SwapRow name={viewerName} was="Owner" now="Coach" you />
        </div>
      </RosterDialog>
    );
  }

  return (
    <RosterDialog
      open={open}
      onOpenChange={onOpenChange}
      width={480}
      title={`Make ${target.name} the owner?`}
      description="This takes effect immediately, and only the new owner can hand it back."
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
            onClick={transfer}
            disabled={!armed}
            loading={isPending}
          >
            Transfer ownership
          </SettingsButton>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <ul className="flex flex-col gap-[7px] rounded-[8px] bg-[var(--surface-subtle)] px-3.5 py-3 text-[11px] leading-[1.5] text-[var(--ink-700)]">
          <Bullet>
            {target.name} gains the roster, invites, billing and every team
            setting.
          </Bullet>
          <Bullet>
            You become a coach — you keep your matches and stay on the roster.
          </Bullet>
          <Bullet>
            Team hours, uploads and shared reports are unaffected.
          </Bullet>
        </ul>

        <label className="flex flex-col gap-2">
          <span className="text-[11px] text-[var(--ink-600)]">
            Type{" "}
            <span className="mono text-[var(--ink-900)]">{programName}</span> to
            confirm
          </span>
          <SettingsUnderlineInput
            type="text"
            mono
            autoFocus
            value={typed}
            placeholder={programName}
            disabled={isPending}
            onChange={(event) => setTyped(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") transfer();
            }}
          />
        </label>

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

function SwapRow({
  name,
  was,
  now,
  first,
  you,
}: {
  name: string;
  was: string;
  now: string;
  first?: boolean;
  you?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2.5 py-[9px] ${first ? "" : "border-t border-[var(--border-hairline)]"}`}
    >
      <span
        aria-hidden="true"
        className="flex size-[22px] shrink-0 items-center justify-center rounded-full bg-[var(--surface-subtle)] text-[9px] font-medium text-[var(--ink-700)]"
      >
        {getInitials(name)}
      </span>
      <span className="truncate text-[12px] font-medium text-[var(--ink-900)]">
        {name}
      </span>
      {you && <YouPill />}
      <span className="flex-1" />
      <span className="text-[11px] text-[var(--ink-500)]">was {was}</span>
      <StatePill>{now}</StatePill>
    </div>
  );
}
