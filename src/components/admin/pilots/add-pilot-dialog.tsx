"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Field } from "@/components/admin/create-team-dialog";
import {
  AccountEmailField,
  useAccountPreview,
} from "@/components/admin/pilots/account-preview";
import { PilotDialog } from "@/components/admin/pilots/pilot-dialog";
import { PILOT_DEFAULT_HOURS, parseHours } from "@/lib/data/admin-pilots-view";
import { addIndividualPilot } from "@/lib/services/programs/admin-pilot-actions";
import { advField } from "@/lib/ui/adv-field";
import { cn } from "@/lib/utils";

/**
 * Add pilot: put an existing account on the individual pilot, with its
 * monthly hours. The pilot's own figure (10) is the default and leaves the
 * account on the pilot figure; any other number is written as the account's
 * override (`admin_set_video_hours`), exactly as Set hours would.
 *
 * Mounted only while open, so each open starts clean.
 */
export function AddPilotDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [hoursText, setHoursText] = useState(String(PILOT_DEFAULT_HOURS));
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, startAdding] = useTransition();

  const preview = useAccountPreview(email);
  const account = preview.status === "found" ? preview.account : null;
  const parsed = parseHours(hoursText);
  const already = account?.isPilot === true;
  const canSubmit = account !== null && !already && parsed.ok;

  const submit = () => {
    if (!parsed.ok) return;
    setProblem(null);
    startAdding(async () => {
      const result = await addIndividualPilot(email, parsed.hours);
      if (!result.ok) {
        setProblem(result.error);
        // A partial add (flag set, hours not) still changed the list.
        router.refresh();
        return;
      }
      onClose();
      router.refresh();
    });
  };

  return (
    <PilotDialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      pending={pending}
      title="Add a pilot individual"
      description="Their personal workspace gets this many hours of video a month. They need an Advantage account first."
      problem={
        problem ??
        (already ? "That player is already a pilot." : null) ??
        (parsed.ok ? null : parsed.error)
      }
      submitLabel="Add pilot"
      pendingLabel="Adding…"
      canSubmit={canSubmit}
      onSubmit={submit}
    >
      <AccountEmailField
        email={email}
        onEmailChange={(next) => {
          setEmail(next);
          setProblem(null);
        }}
        preview={preview}
        autoFocus
      />

      <Field
        label="Hours a month"
        hint={`${PILOT_DEFAULT_HOURS} is the pilot's figure. Any other number becomes their own allowance until you clear it.`}
      >
        <input
          type="text"
          inputMode="decimal"
          value={hoursText}
          autoComplete="off"
          data-focus-ring="none"
          onChange={(event) => {
            setHoursText(event.target.value);
            setProblem(null);
          }}
          className={cn(
            advField("underline"),
            "w-full tabular-nums outline-none",
          )}
        />
      </Field>
    </PilotDialog>
  );
}
