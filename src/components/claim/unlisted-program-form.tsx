"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { submitUnlistedProgram } from "@/lib/services/programs/claim-actions";
import { CLAIM_BUTTON } from "./claim-shell";
import { cn } from "@/lib/utils";

const FIELD =
  "h-10 w-full rounded-[8px] border border-[var(--border-medium)] bg-[var(--surface-card)] px-3.5 text-[13px] text-[var(--ink-900)] outline-none placeholder:text-[var(--ink-400)] focus:border-[var(--ink-900)]";
const LABEL = "mb-1.5 block text-[12px] text-[var(--ink-600)]";

/**
 * Three fields, deliberately. The spec says resist adding a fourth: this lands
 * in the same review queue as an unrecognized-domain claim, and everything else
 * can be asked once a person is actually looking at it.
 */
export function UnlistedProgramForm() {
  const [school, setSchool] = useState("");
  const [team, setTeam] = useState<"mens" | "womens">("mens");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  if (sent) {
    return (
      <p className="rounded-[10px] border border-[var(--border-hairline)] bg-[var(--surface-card)] px-4 py-3.5 text-[13px] leading-[1.6] text-[var(--ink-700)]">
        Thanks — we have {school.trim()}. We&#39;ll set it up and email{" "}
        <span className="text-[var(--ink-900)]">{email.trim()}</span> when it is
        ready.
      </p>
    );
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await submitUnlistedProgram({ school, team, email });
      if (!result.ok) setError(result.error);
      else setSent(true);
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <div className="flex flex-col gap-4">
        <div>
          <label htmlFor="school" className={LABEL}>School</label>
          <input
            id="school"
            value={school}
            onChange={(e) => setSchool(e.target.value)}
            className={FIELD}
          />
        </div>

        <div>
          <span className={LABEL}>Team</span>
          <div role="radiogroup" aria-label="Team" className="flex gap-2">
            {(["mens", "womens"] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={team === value}
                onClick={() => setTeam(value)}
                className={cn(
                  "h-9 flex-1 rounded-[8px] border text-[13px] transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--blue-ring-40)]",
                  team === value
                    ? "border-[var(--ink-900)] text-[var(--ink-900)]"
                    : "border-[var(--border-medium)] text-[var(--ink-600)] hover:border-[var(--ink-300)]"
                )}
              >
                {value === "mens" ? "Men's" : "Women's"}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="email" className={LABEL}>Your email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            className={FIELD}
          />
          {/* Any address works. Many D2, D3 and NAIA coaches have no
              institutional address, and this path must not imply otherwise. */}
          <p className="mt-1.5 text-[11px] text-[var(--ink-500)]">
            Any address works. We&#39;ll confirm the program by hand.
          </p>
        </div>
      </div>

      {error && (
        <p className="mt-4 rounded-[6px] bg-[rgba(229,24,55,0.08)] px-3 py-2 text-[12px] text-[#E51837]">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending || !school.trim() || !email.trim()}
        className={`${CLAIM_BUTTON} mt-6`}
      >
        {pending ? (
          <span className="inline-flex items-center gap-1.5">
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            Sending
          </span>
        ) : (
          "Send"
        )}
      </button>
    </form>
  );
}
