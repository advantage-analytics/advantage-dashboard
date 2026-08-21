"use client";

import { useState, useTransition } from "react";
import { X, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { AdvSwitch } from "@/components/ui/adv-switch";
import { advButton } from "@/lib/ui/adv-button";
import {
  inviteMember,
  setPlayersCanUpload,
} from "@/components/dashboard/settings/team-actions";

/**
 * F7 — invite the roster, over the home page rather than inside a wizard.
 *
 * The dimmed page behind it is the point: inviting people is never a gate to
 * the program. A coach who closes this dialog has lost nothing and is still
 * where they were.
 *
 * Addresses arrive as a paste from a team list far more often than one at a
 * time, so the field accepts a whole block and splits it. Anything that isn't
 * an address is left in the field rather than silently dropped — a typo'd
 * roster entry that vanishes is worse than one that stays visible.
 */

/** Whitespace, commas and semicolons all separate addresses in a pasted list. */
const SEPARATORS = /[\s,;]+/;

/** Deliberately loose. The database and the mail server are the real checks. */
const LOOKS_LIKE_EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export type InviteKind = "player" | "staff";

const COPY: Record<
  InviteKind,
  { title: string; description: string; role: "player" | "staff" }
> = {
  player: {
    title: "Invite players",
    description: "Paste a list of addresses or add them one at a time.",
    role: "player",
  },
  staff: {
    title: "Invite staff",
    description: "Assistants and operations. They see everything you see.",
    role: "staff",
  },
};

export function InviteDialog({
  kind,
  playersCanUpload,
  onOpenChange,
}: {
  /** Null when closed — the dialog is keyed by what it is inviting. */
  kind: InviteKind | null;
  playersCanUpload: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [emails, setEmails] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [canUpload, setCanUpload] = useState(playersCanUpload);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  const copy = kind ? COPY[kind] : null;

  function reset() {
    setEmails([]);
    setDraft("");
    setError(null);
    setSent(null);
  }

  /** Pull every complete address out of the draft and leave the rest behind. */
  function absorb(text: string, keepTrailing: boolean) {
    const parts = text.split(SEPARATORS);
    const trailing = keepTrailing ? (parts.pop() ?? "") : "";
    const found = parts.filter((part) => LOOKS_LIKE_EMAIL.test(part));
    const rejected = parts.filter(
      (part) => part.length > 0 && !LOOKS_LIKE_EMAIL.test(part)
    );

    if (found.length > 0) {
      // Deduped against the existing chips AND within the paste itself: a
      // roster copied out of a spreadsheet routinely carries the same address
      // twice, and two identical chips would send two invites for one seat.
      setEmails((current) => [
        ...new Set([...current, ...found]),
      ]);
    }
    // Anything that didn't parse stays in the field, joined back together, so
    // the person can see and fix it.
    setDraft([...rejected, trailing].filter(Boolean).join(" "));
  }

  function onSend() {
    if (!copy) return;
    // A finished address still sitting in the field counts — nobody expects to
    // press a separator key before pressing Send.
    const pendingDraft = draft.trim();
    const all = LOOKS_LIKE_EMAIL.test(pendingDraft)
      ? [...emails, pendingDraft]
      : emails;
    if (all.length === 0) return;

    setError(null);
    startTransition(async () => {
      if (copy.role === "player" && canUpload !== playersCanUpload) {
        const permission = await setPlayersCanUpload(canUpload);
        if (!permission.ok) {
          setError(permission.error);
          return;
        }
      }

      // Sequential, not parallel: `create_program_invite` upserts on the
      // one-open-invite index, and a pasted list with the same address twice
      // would otherwise race itself for that row.
      // A send that fails does NOT stop the run. Every invite before it is
      // already written, and abandoning the rest would leave a pasted roster
      // half-invited with no way to tell which half — so the addresses that
      // did not get mail are collected and named at the end instead.
      const unsent: string[] = [];

      for (const email of all) {
        const result = await inviteMember({ email, role: copy.role });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        if (result.warning) unsent.push(email);
      }

      setEmails([]);
      setDraft("");
      setSent(all.length);

      if (unsent.length > 0) {
        setError(
          `Saved, but the email didn't send to ${unsent.join(", ")}. Resend from Settings › Team.`
        );
      }
    });
  }

  const count =
    emails.length + (LOOKS_LIKE_EMAIL.test(draft.trim()) ? 1 : 0);

  return (
    <Dialog
      open={kind !== null}
      onOpenChange={(open) => {
        if (!open) reset();
        onOpenChange(open);
      }}
    >
      <DialogContent
        className="max-w-[680px] rounded-[var(--radius-card)] border-0 bg-[var(--surface-card)] p-6"
        style={{ boxShadow: "var(--shadow-floating)" }}
      >
        <div className="flex flex-col gap-1.5">
          <DialogTitle className="text-left text-[16px] font-normal tracking-[-0.4px] text-[var(--ink-900)]">
            {copy?.title ?? ""}
          </DialogTitle>
          <DialogDescription className="text-left text-[12px] text-[var(--ink-700)]">
            {copy?.description ?? ""}
          </DialogDescription>
        </div>

        {sent !== null ? (
          <p className="rounded-[var(--radius-element)] border border-[var(--border-hairline)] bg-[var(--surface-subtle)] px-4 py-3.5 text-[13px] leading-[1.6] text-[var(--ink-700)]">
            {sent === 1 ? "Invite sent" : `${sent} invites sent`}. They have 14
            days to accept, and you can resend from Settings › Team.
          </p>
        ) : (
          <>
            <label
              className="flex min-h-[64px] cursor-text flex-wrap content-start items-start gap-2 rounded-[var(--radius-element)] border border-[var(--border-field)] p-3 focus-within:border-[var(--blue)] focus-within:ring-2 focus-within:ring-[var(--blue-ring-40)]"
              htmlFor="invite-emails"
            >
              {emails.map((email) => (
                <span
                  key={email}
                  className="inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] bg-[var(--surface-subtle)] py-1 pl-2.5 pr-1.5 font-mono text-[11px] text-[var(--ink-700)]"
                >
                  {email}
                  <button
                    type="button"
                    aria-label={`Remove ${email}`}
                    onClick={(event) => {
                      event.preventDefault();
                      setEmails((current) =>
                        current.filter((item) => item !== email)
                      );
                    }}
                    className="cursor-pointer rounded-full p-0.5 text-[var(--ink-400)] transition-colors hover:text-[var(--ink-900)]"
                  >
                    <X className="size-3" strokeWidth={1.5} />
                  </button>
                </span>
              ))}
              <input
                id="invite-emails"
                value={draft}
                placeholder={emails.length === 0 ? "name@school.edu" : ""}
                onChange={(e) => absorb(e.target.value, true)}
                onPaste={(e) => {
                  e.preventDefault();
                  absorb(
                    `${draft} ${e.clipboardData.getData("text")} `,
                    false
                  );
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    absorb(`${draft} `, false);
                  }
                  if (
                    e.key === "Backspace" &&
                    draft === "" &&
                    emails.length > 0
                  ) {
                    setEmails((current) => current.slice(0, -1));
                  }
                }}
                className="min-w-[180px] flex-1 bg-transparent py-1 font-mono text-[11px] text-[var(--ink-900)] outline-none placeholder:text-[var(--ink-400)]"
              />
            </label>

            {copy?.role === "player" && (
              <div className="flex items-center gap-3 rounded-[var(--radius-element)] bg-[var(--surface-subtle)] px-4 py-3.5">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-[13px] text-[var(--ink-900)]">
                    Let players send their own video
                  </span>
                  <span className="text-[11px] leading-[1.4] text-[var(--ink-500)]">
                    {canUpload
                      ? "On. Their uploads come out of the program's hours."
                      : "Off. Their matches still appear when you send them."}
                  </span>
                </div>
                <span className="ml-auto">
                  <AdvSwitch
                    checked={canUpload}
                    onCheckedChange={setCanUpload}
                    label="Let players send their own video"
                  />
                </span>
              </div>
            )}

            {error && (
              <p className="rounded-[var(--radius-button)] bg-[rgba(229,24,55,0.08)] px-3 py-2 text-[12px] text-[#E51837]">
                {error}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-3.5 pt-0.5">
              <button
                type="button"
                onClick={onSend}
                disabled={pending || count === 0}
                className={advButton("primary")}
              >
                {pending ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Loader2
                      className="size-3.5 animate-spin"
                      aria-hidden="true"
                    />
                    Sending
                  </span>
                ) : count === 0 ? (
                  "Send invites"
                ) : count === 1 ? (
                  "Send 1 invite"
                ) : (
                  `Send ${count} invites`
                )}
              </button>
              <span className="text-[11px] text-[var(--ink-500)]">
                Invites last 14 days.
              </span>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
