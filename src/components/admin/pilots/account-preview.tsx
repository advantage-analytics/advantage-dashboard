"use client";

import { useEffect, useState } from "react";
import { Field } from "@/components/admin/create-team-dialog";
import {
  AdminAvatar,
  dayLabel,
  useIsClient,
} from "@/components/admin/admin-cells";
import {
  capLabel,
  type AccountPreview,
  type AccountPreviewResult,
} from "@/lib/data/admin-pilots-view";
import { previewAccount } from "@/lib/services/programs/admin-pilot-actions";
import { advField } from "@/lib/ui/adv-field";
import { cn } from "@/lib/utils";

/** Long enough to skip the keystrokes of a word being typed. */
const DEBOUNCE_MS = 300;
const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type PreviewState =
  { status: "idle" } | { status: "looking" } | AccountPreviewResult;

/**
 * Looks the typed email up as the admin types, debounced. The state is
 * derived: an answer counts only while it is for the email in the field, so a
 * slow reply to an earlier keystroke never shows against a newer one.
 */
export function useAccountPreview(email: string): PreviewState {
  const trimmed = email.trim();
  const valid = LOOKS_LIKE_EMAIL.test(trimmed);
  const [answer, setAnswer] = useState<{
    email: string;
    result: AccountPreviewResult;
  } | null>(null);

  useEffect(() => {
    if (!valid) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      previewAccount(trimmed)
        .then((result) => {
          if (!cancelled) setAnswer({ email: trimmed, result });
        })
        .catch(() => {
          if (!cancelled) {
            setAnswer({
              email: trimmed,
              result: {
                status: "error",
                message: "Could not look that email up.",
              },
            });
          }
        });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [trimmed, valid]);

  if (!valid) return { status: "idle" };
  if (answer?.email === trimmed) return answer.result;
  return { status: "looking" };
}

/** The email field, its live preview underneath. */
export function AccountEmailField({
  email,
  onEmailChange,
  preview,
  autoFocus,
}: {
  email: string;
  onEmailChange: (email: string) => void;
  preview: PreviewState;
  autoFocus?: boolean;
}) {
  return (
    <>
      <Field label="Account email">
        <input
          type="email"
          value={email}
          placeholder="player@example.com"
          autoComplete="off"
          spellCheck={false}
          autoFocus={autoFocus}
          data-focus-ring="none"
          onChange={(event) => onEmailChange(event.target.value)}
          className={cn(advField("underline"), "w-full outline-none")}
        />
      </Field>
      <AccountPreviewCard preview={preview} />
    </>
  );
}

/**
 * What the account is now, in one line: workspace, when they joined, their
 * personal matches and the allowance they draw — "Personal · joined Oct 2 ·
 * 3 matches · 2 h a month now".
 */
function previewFacts(account: AccountPreview, isClient: boolean): string {
  const parts: string[] = [];
  if (account.isPilot) parts.push("Pilot");
  else if (account.isAdmin) parts.push("Admin");
  else parts.push("Personal");
  if (account.joinedAt && isClient) {
    parts.push(`joined ${dayLabel(new Date(account.joinedAt))}`);
  }
  parts.push(
    account.matchCount === 1 ? "1 match" : `${account.matchCount} matches`,
  );
  const cap = capLabel(account.capSeconds);
  parts.push(
    cap === "Unlimited"
      ? "unlimited video now"
      : `${cap} a month now${account.overrideHours != null ? ", set by admin" : ""}`,
  );
  return parts.join(" · ");
}

/** The live preview line under the email field. */
export function AccountPreviewCard({ preview }: { preview: PreviewState }) {
  const isClient = useIsClient();

  if (preview.status === "idle") return null;

  if (preview.status === "found") {
    const { account } = preview;
    return (
      <div
        className="flex items-center gap-3 rounded-[10px] bg-[var(--surface-subtle)] p-3"
        aria-live="polite"
      >
        <AdminAvatar name={account.name} photoUrl={account.avatarUrl} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[13px] font-medium text-[var(--ink-900)]">
            {account.name}
          </span>
          <span className="text-[12px] leading-[1.5] text-[var(--ink-600)] tabular-nums">
            {previewFacts(account, isClient)}
          </span>
        </div>
      </div>
    );
  }

  const message =
    preview.status === "looking"
      ? "Looking up that email…"
      : preview.status === "none"
        ? "No account uses that email."
        : preview.message;
  return (
    <p
      aria-live="polite"
      className="text-[12px] leading-[1.5] text-[var(--ink-600)]"
    >
      {message}
    </p>
  );
}
