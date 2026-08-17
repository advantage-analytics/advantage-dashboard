"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { checkClaimEmail, type ClaimProgram } from "@/lib/services/programs/domain-match";
import { startClaim } from "@/lib/services/programs/claim-actions";
import { CLAIM_BUTTON, CLAIM_FIELD, CLAIM_LABEL } from "./claim-shell";

const ROLES = [
  { value: "head_coach", label: "Head coach" },
  { value: "assistant_coach", label: "Assistant coach" },
  { value: "director_of_tennis", label: "Director of tennis" },
  { value: "operations", label: "Operations" },
  { value: "other", label: "Other" },
];

/**
 * F4 and F4.1 are the same form.
 *
 * The only difference is one micro-line under the email field, and that is the
 * design's whole point: a coach with no institutional address must not be shown
 * a red field, a warning, or a different button. Plenty of D2, D3 and NAIA
 * programs have no institutional address at all. The divergence is in what is
 * held back LATER, not in how this screen treats the person filling it in.
 *
 * The inline note is computed in the browser from the same pure function the
 * server uses, so it updates as you type without a round trip. It is a
 * courtesy, not a decision — `submitClaim` re-checks against the program row.
 */
export function SetupForm({
  programKey,
  program,
  schoolName,
}: {
  programKey: string;
  program: ClaimProgram;
  schoolName: string;
}) {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState(ROLES[0].value);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Only once the address looks finished. Telling someone their half-typed
  // address is unrecognised, on every keystroke, is not feedback.
  const note = useMemo(() => {
    if (!email.includes("@") || !email.split("@")[1]?.includes(".")) return null;
    return checkClaimEmail(email, program);
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
    <form onSubmit={onSubmit} noValidate>
      <div className="flex flex-col gap-4">
        <div>
          <label htmlFor="fullName" className={CLAIM_LABEL}>Full name</label>
          <input
            id="fullName"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            autoComplete="name"
            className={CLAIM_FIELD}
          />
        </div>

        <div>
          <label htmlFor="role" className={CLAIM_LABEL}>Role</label>
          <select
            id="role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className={`${CLAIM_FIELD} cursor-pointer`}
          >
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="email" className={CLAIM_LABEL}>School email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            className={CLAIM_FIELD}
          />
          {/* Quiet, never blocking, and never styled as an error. */}
          {note && (
            <p className="mt-1.5 text-[11px] leading-[1.5] text-[var(--ink-500)]">
{note.inlineNote}
            </p>
          )}
        </div>
      </div>

      {error && (
        <p className="mt-4 rounded-[6px] bg-[rgba(229,24,55,0.08)] px-3 py-2 text-[12px] text-[#E51837]">
          {error}
        </p>
      )}

      <button type="submit" disabled={!canSubmit || pending} className={`${CLAIM_BUTTON} mt-6`}>
        {pending ? (
          <span className="inline-flex items-center gap-1.5">
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            Setting up
          </span>
        ) : (
          "Set up the program"
        )}
      </button>
    </form>
  );
}
