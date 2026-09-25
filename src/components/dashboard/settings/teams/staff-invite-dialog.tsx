"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import {
  SettingsField,
  SettingsUnderlineInput,
} from "@/components/dashboard/settings/settings-card";
import { inviteMember } from "@/components/dashboard/settings/team-actions";
import {
  DialogProblem,
  LOOKS_LIKE_EMAIL,
  RoleCard,
  RoleChoice,
  RosterDialog,
} from "@/components/dashboard/team/dialog-shell";
import { advButton } from "@/lib/ui/adv-button";
import posthog from "posthog-js";

const isPostHogConfigured = Boolean(
  process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN &&
  process.env.NEXT_PUBLIC_POSTHOG_HOST,
);

type StaffRole = "staff" | "coach";

/**
 * Invite someone onto the coaching side of a program, from Settings › Teams.
 *
 * Players are not invited here, on purpose: a player invitation can bind a
 * login to a roster row that already exists, and only the Roster's dialog has
 * those rows loaded. Staff and coaches are never roster rows and hold no seat,
 * so this is the whole question for them — an address and a standing.
 *
 * Coach is drawn for the owner only; `create_program_invite` refuses anyone
 * else, and it stays the authority on both rules whatever this shows.
 */
export function StaffInviteDialog({
  open,
  onOpenChange,
  programId,
  programName,
  canInviteCoach,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  programId: string;
  programName: string;
  canInviteCoach: boolean;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<StaffRole>("staff");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{
    address: string;
    warning?: string;
  } | null>(null);
  const [pending, start] = useTransition();

  const address = email.trim();
  const ready = LOOKS_LIKE_EMAIL.test(address) && !pending;

  function close() {
    setEmail("");
    setRole("staff");
    setError(null);
    setSent(null);
    onOpenChange(false);
  }

  function submit() {
    if (!ready) return;
    setError(null);
    start(async () => {
      const result = await inviteMember({ email: address, role, programId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (isPostHogConfigured) {
        posthog.capture("staff_invite_sent", { role });
      }
      setSent({ address, warning: result.warning });
      // The Invited row belongs in the Members list behind the dialog now.
      router.refresh();
    });
  }

  return (
    <RosterDialog
      open={open}
      // Not dismissible mid-send: the result would land on a closed dialog and
      // greet the next open with this invite's receipt instead of a form.
      onOpenChange={(next) =>
        next ? onOpenChange(next) : pending ? undefined : close()
      }
      title={`Invite to ${programName}`}
      // What this dialog is for, then where the other kind of invite lives.
      // The seat question folds in here: staff and coaches never hold one, so
      // a tinted note saying "no seat used" answered something nobody asked.
      description="Staff and coaches help run the team and don't take a roster seat. Invite players from the Roster."
      footer={
        sent ? (
          <>
            <div className="flex-1" />
            <button
              type="button"
              className={advButton("primary")}
              onClick={close}
            >
              Done
            </button>
          </>
        ) : (
          <>
            <div className="flex-1" />
            <button
              type="button"
              className={advButton("outline")}
              disabled={pending}
              onClick={close}
            >
              Cancel
            </button>
            <button
              type="button"
              className={advButton("primary")}
              disabled={!ready}
              onClick={submit}
            >
              {pending && (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              )}
              Send invite
            </button>
          </>
        )
      }
    >
      {sent ? (
        sent.warning ? (
          <DialogProblem message={`${sent.address} — ${sent.warning}`} />
        ) : (
          <p className="text-[12px] leading-[1.6] text-[var(--ink-700)]">
            Invitation sent to {sent.address}. It lasts 14 days.
          </p>
        )
      ) : (
        <>
          <SettingsField label="Email" required>
            <SettingsUnderlineInput
              type="email"
              autoComplete="off"
              autoFocus
              placeholder="name@school.edu"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  submit();
                }
              }}
            />
          </SettingsField>

          {canInviteCoach ? (
            <RoleChoice columns={2}>
              <RoleCard
                checked={role === "staff"}
                onSelect={() => setRole("staff")}
                title="Staff"
                detail="Works the roster and uploads for any player"
              />
              <RoleCard
                checked={role === "coach"}
                onSelect={() => setRole("coach")}
                title="Coach"
                detail="Staff access, plus the schedule and roles"
              />
            </RoleChoice>
          ) : (
            /* One option is not a choice: the role is stated, the way the
               Roster's dialog states it for an invitation bound to a player. */
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] text-[var(--ink-600)]">Role</span>
              <div className="flex items-center gap-2">
                <span className="inline-flex h-[22px] items-center rounded-[var(--radius-pill)] bg-[var(--surface-subtle)] px-2.5 text-[11px] font-medium text-[var(--ink-700)]">
                  Staff
                </span>
                <span className="text-[11px] text-[var(--ink-400)]">
                  only the owner invites coaches
                </span>
              </div>
            </div>
          )}

          {error && <DialogProblem message={error} />}
        </>
      )}
    </RosterDialog>
  );
}
