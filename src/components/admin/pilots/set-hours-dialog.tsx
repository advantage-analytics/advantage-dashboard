"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Field } from "@/components/admin/create-team-dialog";
import {
  AccountEmailField,
  useAccountPreview,
} from "@/components/admin/pilots/account-preview";
import {
  FooterTextAction,
  PilotDialog,
} from "@/components/admin/pilots/pilot-dialog";
import { capLabel, parseHours } from "@/lib/data/admin-pilots-view";
import { setVideoHours } from "@/lib/services/programs/admin-pilot-actions";
import { advField } from "@/lib/ui/adv-field";
import { cn } from "@/lib/utils";

/**
 * Set hours: give ANY account — pilot or not — a monthly video allowance of
 * its own, or clear it back to the account's normal cap. The email field
 * previews the account as it is typed; the write waits for a found account
 * and a valid figure.
 *
 * Mounted only while open (the caller keys it), so every open starts clean
 * from `initialEmail`.
 */
export function SetHoursDialog({
  initialEmail = "",
  onClose,
}: {
  /** A row's email when opened from that row. */
  initialEmail?: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [email, setEmail] = useState(initialEmail);
  const [hoursText, setHoursText] = useState("");
  const [touched, setTouched] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, startSaving] = useTransition();
  const [acting, setActing] = useState<"set" | "clear" | null>(null);

  const preview = useAccountPreview(email);
  const account = preview.status === "found" ? preview.account : null;
  const parsed = parseHours(hoursText);
  const unchanged =
    parsed.ok && account !== null && account.overrideHours === parsed.hours;
  const canSubmit = account !== null && parsed.ok && !unchanged;

  const save = (hours: number | null) => {
    if (!account) return;
    setProblem(null);
    setActing(hours === null ? "clear" : "set");
    startSaving(async () => {
      const result = await setVideoHours(account.id, hours);
      if (!result.ok) {
        setProblem(result.error);
        setActing(null);
        return;
      }
      onClose();
      router.refresh();
    });
  };

  const fieldError = touched && !parsed.ok ? parsed.error : null;

  return (
    <PilotDialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      pending={pending}
      title="Set video hours"
      description="Any account, any number of hours a month for their personal workspace. It replaces their plan's figure until you clear it."
      problem={problem ?? fieldError}
      submitLabel="Set hours"
      pendingLabel={acting === "clear" ? "Set hours" : "Saving…"}
      canSubmit={canSubmit}
      onSubmit={() => {
        if (parsed.ok) save(parsed.hours);
      }}
      footerLeft={
        account?.overrideHours != null ? (
          <FooterTextAction onClick={() => save(null)} disabled={pending}>
            {acting === "clear" ? "Clearing…" : "Clear override"}
          </FooterTextAction>
        ) : null
      }
    >
      <AccountEmailField
        email={email}
        onEmailChange={(next) => {
          setEmail(next);
          setProblem(null);
        }}
        preview={preview}
        autoFocus={initialEmail === ""}
      />

      <Field
        label="Hours a month"
        hint={
          account
            ? account.overrideHours != null
              ? `Now ${capLabel(account.capSeconds)}, set by admin. Clearing it returns them to their plan's figure.`
              : `Now ${capLabel(account.capSeconds)}, their plan's figure. Decimals and 0 are allowed.`
            : "Decimals and 0 are allowed."
        }
      >
        <input
          type="text"
          inputMode="decimal"
          value={hoursText}
          placeholder={account ? formatPlaceholder(account.capSeconds) : "14"}
          autoComplete="off"
          autoFocus={initialEmail !== ""}
          data-focus-ring="none"
          onChange={(event) => {
            setHoursText(event.target.value);
            setProblem(null);
          }}
          onBlur={() => setTouched(true)}
          className={cn(
            advField("underline"),
            "w-full tabular-nums outline-none",
          )}
        />
      </Field>
    </PilotDialog>
  );
}

/** The current figure as a placeholder — "14" — or "14" for an unlimited one. */
function formatPlaceholder(capSeconds: number): string {
  const label = capLabel(capSeconds);
  return label === "Unlimited" ? "14" : label.replace(" h", "");
}
