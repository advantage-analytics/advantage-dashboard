"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { submitUnlistedProgram } from "@/lib/services/programs/claim-actions";
import {
  CLAIM_BUTTON,
  CLAIM_FIELD,
  CLAIM_LABEL,
  CLAIM_MICRO,
  ClaimActions,
} from "./claim-shell";
import { TeamPills } from "./team-pills";

/**
 * Three fields, deliberately. The spec says resist adding a fourth: this lands
 * in the same review queue as an unrecognized-domain claim, and everything else
 * can be asked once a person is actually looking at it.
 *
 * At page scale school and squad share a row, because "Northgate University"
 * and "Men's" are one answer asked twice — putting them on separate rows made
 * a three-field form look like a six-field one.
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
      <p className="text-body max-w-[62ch] rounded-[var(--radius-card)] border border-[var(--border-hairline)] bg-[var(--surface-subtle)] px-5 py-4">
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
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <div className="grid gap-5 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div>
          <label htmlFor="school" className={CLAIM_LABEL}>
            School
          </label>
          <input
            id="school"
            value={school}
            onChange={(e) => setSchool(e.target.value)}
            className={CLAIM_FIELD}
          />
        </div>

        <div>
          <span className={CLAIM_LABEL}>Team</span>
          <TeamPills value={team} onChange={setTeam} />
        </div>
      </div>

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
        {/* Any address works. Many D2, D3 and NAIA coaches have no
            institutional address, and this path must not imply otherwise. */}
        <p className="text-micro mt-2">
          Any address works. We&#39;ll confirm the program by hand.
        </p>
      </div>

      {error && (
        <p className="max-w-[62ch] rounded-[var(--radius-button)] bg-[rgba(229,24,55,0.08)] px-3 py-2 text-[12px] text-[#E51837]">
          {error}
        </p>
      )}

      <div className="pt-1">
        <ClaimActions>
          <button
            type="submit"
            disabled={pending || !school.trim() || !email.trim()}
            className={CLAIM_BUTTON}
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
          <span className={CLAIM_MICRO}>
            You&#39;ll hear back before you&#39;d have finished uploading a
            match.
          </span>
        </ClaimActions>
      </div>
    </form>
  );
}
