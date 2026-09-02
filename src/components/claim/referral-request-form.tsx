"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Loader2, Users } from "lucide-react";
import { requestInvite } from "@/lib/services/programs/claim-actions";
import { CLAIM_ROLES } from "@/lib/services/programs/claim-roles";
import { ReferralLink } from "./referral-link";
import {
  CLAIM_BUTTON,
  CLAIM_FIELD,
  CLAIM_LABEL,
  CLAIM_LINK,
  CLAIM_MICRO,
  ClaimActions,
  ClaimSelect,
} from "./claim-shell";

/**
 * 4.3b (a) — the program is listed but nobody has set it up: refer it, and
 * leave a name.
 *
 * Two acts under two plain labels, hairline-separated. The link comes first
 * because it is the only thing on the screen that can make a workspace exist;
 * the name is what gets this person added the day it does. Then the three
 * consequences of asking, stated for a program with no coach on it — which is
 * why they are not `JoinSharingRows`: that block promises "your coach
 * approves the request", and there is no coach here to approve anything.
 *
 * Its own component rather than a mode of `ContactOwnerForm` because the
 * shape differs in every section — labeled groups, no note, a link between
 * the title and the fields — and the only thing the two share is the action
 * they call.
 *
 * The visitor is usually signed in — the flow puts onboarding before this
 * screen — so name and address come from the profile and the address is a
 * fact stated beside the button, not a field. Signed-out is still an ordinary
 * case (a forwarded link can land anywhere), and it gets the email field back.
 */
export function ReferralRequestForm({
  programKey,
  schoolName,
  referralUrl,
  defaultName = "",
  defaultRole = "",
  accountEmail,
}: {
  programKey: string;
  schoolName: string;
  /** The program's own status page — one click from "Set up this program". */
  referralUrl: string;
  /** From the profile; editable, because a coach may know them by another name. */
  defaultName?: string;
  /** One of `CLAIM_ROLES`, chosen from the persona — a player lands on "Player". */
  defaultRole?: string;
  /** The verified session address, when there is a session. */
  accountEmail?: string;
}) {
  const [name, setName] = useState(defaultName);
  const [email, setEmail] = useState(accountEmail ?? "");
  const [role, setRole] = useState(defaultRole);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  if (sent) {
    return (
      <div className="flex flex-col gap-5">
        <p className="text-body max-w-[62ch] rounded-[var(--radius-card)] border border-[var(--border-hairline)] bg-[var(--surface-subtle)] px-5 py-4">
          On file. The first person to claim {schoolName} sees your request —
          nothing has been created for you in the meantime.
        </p>
        <ClaimActions gap={16}>
          {accountEmail ? (
            <Link href="/dashboard" className={CLAIM_BUTTON}>
              Continue to my account
            </Link>
          ) : (
            <Link href="/claim/program" className={CLAIM_LINK}>
              Back to search
            </Link>
          )}
        </ClaimActions>
      </div>
    );
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await requestInvite({
        programKey,
        email,
        name,
        role: role || undefined,
      });
      if (!result.ok) setError(result.error);
      else setSent(true);
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {/* Act one: the link. */}
      <section className="flex flex-col gap-2.5 border-t border-[var(--border-hairline)] pt-4">
        <span className={SECTION_LABEL}>Send this to whoever should run it</span>
        <ReferralLink url={referralUrl} />
      </section>

      {/* Act two: the name that waits on file. */}
      <section className="flex flex-col gap-3 border-t border-[var(--border-hairline)] pt-4">
        <span className={SECTION_LABEL}>Be added when it goes live</span>
        <div
          className={`grid gap-4 ${
            accountEmail ? "sm:grid-cols-[1.5fr_1fr]" : "sm:grid-cols-2"
          }`}
        >
          <div>
            <label htmlFor="name" className={CLAIM_LABEL}>
              Your name
            </label>
            <input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              className={CLAIM_FIELD}
            />
          </div>
          {!accountEmail && (
            <div>
              <label htmlFor="email" className={CLAIM_LABEL}>
                Your email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                className={CLAIM_FIELD}
              />
            </div>
          )}
          <div>
            <label htmlFor="role" className={CLAIM_LABEL}>
              Your role
            </label>
            <ClaimSelect
              id="role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              <option value="">Choose one</option>
              {CLAIM_ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </ClaimSelect>
          </div>
        </div>
        {/* The note strip: where the prefilled values came from. Only when
            something was actually read from a profile. */}
        {accountEmail && (
          <div className="flex items-start gap-2 rounded-[var(--radius-element)] bg-[var(--surface-subtle)] px-3 py-2.5">
            <Users
              className="mt-0.5 size-[13px] shrink-0 text-[var(--ink-600)]"
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <span className="text-[11px] leading-[1.6] text-[var(--ink-700)]">
              Read from your profile — nothing to retype. Whoever claims the
              program sees a name and a role, not a bare address.
            </span>
          </div>
        )}
      </section>

      {/* What asking does, on a program with no coach on it. Plain rows, no
          arrow: these are facts about a queue, not consequences of joining. */}
      <section className="flex flex-col gap-2.5 border-t border-[var(--border-hairline)] pt-4">
        <span className={SECTION_LABEL}>If you request an invite</span>
        <div className="flex flex-col">
          {CONSEQUENCES.map((row, index) => (
            <div
              key={row}
              className={`py-[11px] ${
                index === 0
                  ? "pt-0"
                  : "border-t border-[var(--border-hairline)]"
              }`}
            >
              <span className="text-body-sm">{row}</span>
            </div>
          ))}
        </div>
      </section>

      {error && (
        <p className="rounded-[var(--radius-button)] bg-[rgba(229,24,55,0.08)] px-3 py-2 text-[12px] text-[#E51837]">
          {error}
        </p>
      )}

      {/* One primary. The two escapes are quiet links: "Keep it personal"
          leaves with the account intact, "Set it up yourself" is the way
          across the fork to the claim screen — an action, never an identity. */}
      <ClaimActions gap={16}>
        <button
          type="submit"
          disabled={pending || !email.trim()}
          className={CLAIM_BUTTON}
        >
          {pending ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              Sending
            </span>
          ) : (
            "Request an invite"
          )}
        </button>
        <Link href="/dashboard" className={CLAIM_LINK}>
          Keep it personal
        </Link>
        <Link href={`/claim/${programKey}`} className={CLAIM_LINK}>
          Set it up yourself
        </Link>
      </ClaimActions>

      <span className={CLAIM_MICRO}>
        {accountEmail
          ? `Your request stays on file. They reach you at ${accountEmail}.`
          : "Your request stays on file. No account is created for you."}
      </span>
    </form>
  );
}

/** A group label: the field label's size, in the page's ink. */
const SECTION_LABEL = "text-[11px] text-[var(--ink-900)]";

const CONSEQUENCES: readonly string[] = [
  "No one approves it yet — there's no coach here to ask.",
  "The first person to claim the program sees your request.",
  "Your uploaded matches stay personal until you share them.",
];
