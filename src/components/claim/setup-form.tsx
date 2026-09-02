"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import {
  checkClaimEmail,
  isFreemail,
  emailDomain,
  type ClaimProgram,
} from "@/lib/services/programs/domain-match";
import { startClaim } from "@/lib/services/programs/claim-actions";
import { CLAIM_ROLES } from "@/lib/services/programs/claim-roles";
import {
  AsidePanel,
  CLAIM_BUTTON,
  CLAIM_FIELD,
  CLAIM_LABEL,
  CLAIM_LINK,
  CLAIM_MICRO,
  ClaimActions,
  ClaimSelect,
} from "./claim-shell";

/**
 * What the inline note is allowed to know.
 *
 * Freemail, and nothing else. It must NOT flip on whether the address is on the
 * program's recorded staff list — that is what decides the claim, and a note
 * that changed when you got it right would be an enumeration oracle over 3,117
 * real people's work addresses. Freemail is computed from a public list, so it
 * gives nothing of ours away.
 */
function usesPersonalAddress(email: string): boolean {
  const domain = emailDomain(email);
  return domain.length > 0 && isFreemail(domain);
}

/**
 * The panel on the right — what setting up the program hands you, in two
 * labeled groups (4.3b c).
 *
 * Static, deliberately. It used to be two panels that swapped on whether the
 * address was a personal one, which meant the page rewrote itself while a
 * coach typed. Both groups are true of every address — inviting and roster
 * work at once, sending video waits on the check — and the check is merely
 * faster for a recognized one. The address-specific sentence lives under the
 * field, next to the thing it is about.
 *
 * The frame's earlier promise that everyone on the recorded staff would be
 * told, with one click to object, stays cut: that announcement was
 * unsolicited bulk mail to scraped addresses, and a promise the system does
 * not keep has no place at the moment a coach commits.
 */
export function SetupAside() {
  return (
    <AsidePanel
      groups={[
        {
          title: "Yours now",
          items: ["Invite staff and players", "Roster, roles, permissions"],
        },
        {
          title: "After we confirm",
          items: ["Sending video for analysis"],
        },
      ]}
    />
  );
}

/**
 * The form itself.
 *
 * The inline note is computed in the browser from the same pure function the
 * server uses, so it updates as you type without a round trip. It is a
 * courtesy, not a decision — the claim is re-checked against the program row on
 * submit.
 *
 * No red field and no warning either way: plenty of JUCO, D2 and NAIA programs
 * have no institutional address at all, so the divergence is in what is held
 * back LATER, not in how this screen treats the person filling it in. That is
 * said to the coach, once, under the field — not to us in a footnote.
 */
export function SetupForm({
  programKey,
  program,
}: {
  programKey: string;
  program: ClaimProgram;
}) {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<string>(CLAIM_ROLES[0].value);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Only once the address looks finished. Telling someone their half-typed
  // address is unrecognised, on every keystroke, is not feedback. Until then
  // the line answers the question a coach arrives with.
  const note = useMemo(() => {
    if (!email.includes("@") || !email.split("@")[1]?.includes(".")) {
      return "Any address works. Plenty of JUCO and NAIA programs have no institutional one.";
    }
    return usesPersonalAddress(email)
      ? "We'll confirm this one manually. Everything except sending video works while we do."
      : checkClaimEmail(email, program).inlineNote;
  }, [email, program]);

  const canSubmit = fullName.trim().length > 0 && email.trim().length > 0;

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await startClaim({ programKey, fullName, role, email });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Nothing has been claimed yet — only a link sent. The claim itself is
      // created when that link is opened, which is what keeps this action from
      // being able to park an open claim on every program in the directory.
      router.push(
        `/claim/check-email?to=${encodeURIComponent(email)}` +
          `&program=${encodeURIComponent(programKey)}`
      );
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="fullName" className={CLAIM_LABEL}>
            Full name
          </label>
          <input
            id="fullName"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            autoComplete="name"
            className={CLAIM_FIELD}
          />
        </div>

        <div>
          <label htmlFor="role" className={CLAIM_LABEL}>
            Role
          </label>
          <ClaimSelect
            id="role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            {CLAIM_ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </ClaimSelect>
        </div>
      </div>

      <div>
        <label htmlFor="email" className={CLAIM_LABEL}>
          School email
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          className={CLAIM_FIELD}
        />
        {/* Quiet, never blocking, and never styled as an error. */}
        {note && <p className={`${CLAIM_MICRO} mt-2`}>{note}</p>}
      </div>

      {error && (
        <p className="rounded-[var(--radius-button)] bg-[rgba(229,24,55,0.08)] px-3 py-2 text-[12px] text-[#E51837]">
          {error}
        </p>
      )}

      <div className="pt-1">
        <ClaimActions>
          <button
            type="submit"
            disabled={!canSubmit || pending}
            className={CLAIM_BUTTON}
          >
            {pending ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                Setting up
              </span>
            ) : (
              "Set up the program"
            )}
          </button>
          {/* The way across the fork, from the form itself: a coach who
              realizes mid-form that someone else should own this gets the
              referral screen, not the back arrow. An action, never an
              identity. */}
          <Link href={`/claim/${programKey}/request`} className={CLAIM_LINK}>
            Someone else should own it
          </Link>
        </ClaimActions>
      </div>
    </form>
  );
}
