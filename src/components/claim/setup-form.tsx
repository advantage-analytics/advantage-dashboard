"use client";

import { createContext, useContext, useMemo, useState, useTransition } from "react";
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
} from "./claim-shell";

/**
 * F4 and F4.1 are the same screen in two states, and the state is the address.
 *
 * The form and the panel beside it both read it, so the address lives in a
 * context between them rather than in either one — the alternative was lifting
 * the whole two-column layout into one component and losing the shell's
 * centring and escape chrome with it.
 */
const EmailContext = createContext<{
  email: string;
  setEmail: (value: string) => void;
}>({ email: "", setEmail: () => {} });

export function SetupEmailProvider({ children }: { children: React.ReactNode }) {
  const [email, setEmail] = useState("");
  return (
    <EmailContext value={{ email, setEmail }}>{children}</EmailContext>
  );
}

/**
 * What the panel is allowed to know.
 *
 * Freemail, and nothing else. It must NOT flip on whether the address is on the
 * program's recorded staff list — that is what decides the claim, and a panel
 * that changed when you got it right would be an enumeration oracle over 3,117
 * real people's work addresses. Freemail is computed from a public list, so it
 * gives nothing of ours away.
 */
function usesPersonalAddress(email: string): boolean {
  const domain = emailDomain(email);
  return domain.length > 0 && isFreemail(domain);
}

/**
 * The panel on the right — F4's "what happens when you do", or F4.1's "what
 * waits, and what doesn't" once the address is a personal one.
 *
 * The frame's middle row promised that everyone else on the recorded staff
 * would be told, with one click to object. That announcement was cut —
 * unsolicited bulk mail to scraped addresses — so the sentence was a promise
 * the system does not keep, made at the moment a coach commits. What stands in
 * its place is what actually happens. It states the rule without saying which
 * side of it THIS address falls on, which is the same line the inline note
 * holds: telling the browser that would be an enumeration oracle.
 *
 * No red field and no warning either way: plenty of D2, D3 and NAIA programs
 * have no institutional address at all, so the divergence is in what is held
 * back LATER, not in how this screen treats the person filling it in.
 */
export function SetupAside() {
  const { email } = useContext(EmailContext);

  if (usesPersonalAddress(email)) {
    return (
      <AsidePanel
        title="What waits, and what doesn't"
        items={[
          "Invite staff and players — now",
          "Roster, roles, permissions — now",
          "Sending video — after we confirm",
        ]}
        footnote="No red field, no warning: plenty of D2 and NAIA programs have no institutional address."
      />
    );
  }

  return (
    <AsidePanel
      title="What happens when you do"
      items={[
        "You manage staff, roster and permissions",
        "An address already on the program's staff list settles straight away; anything else reaches a person",
        "Inviting people works immediately; only sending video waits on that check",
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
 */
export function SetupForm({
  programKey,
  program,
}: {
  programKey: string;
  program: ClaimProgram;
}) {
  const router = useRouter();
  const { email, setEmail } = useContext(EmailContext);
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<string>(CLAIM_ROLES[0].value);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Only once the address looks finished. Telling someone their half-typed
  // address is unrecognised, on every keystroke, is not feedback.
  const note = useMemo(() => {
    if (!email.includes("@") || !email.split("@")[1]?.includes(".")) return null;
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
        <select
          id="role"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className={`${CLAIM_FIELD} cursor-pointer`}
        >
          {CLAIM_ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
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
        {note && <p className="text-micro mt-2">{note}</p>}
      </div>

      {error && (
        <p className="rounded-[var(--radius-button)] bg-[rgba(229,24,55,0.08)] px-3 py-2 text-[12px] text-[#E51837]">
          {error}
        </p>
      )}

      <div className="pt-1">
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
      </div>
    </form>
  );
}
