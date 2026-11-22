"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { submitUnlistedProgram } from "@/lib/services/programs/claim-actions";
import { CLAIM_ROLES } from "@/lib/services/programs/claim-roles";
import {
  CLAIM_BUTTON,
  CLAIM_FIELD,
  CLAIM_LABEL,
  CLAIM_MICRO,
  ClaimActions,
  ClaimSelect,
} from "./claim-shell";
import { TeamPills } from "./team-pills";

/**
 * Five fields: school, squad, name, role, email. This was three, on the theory
 * that everything else could be asked once a person was looking at it — but
 * nobody can ask, because the only thing on file is an address. A request
 * that arrived as "HZCU", Men's and a bare address (2026-11-21) left the
 * reviewer nothing to decide on. Name and role are what the admin queue
 * prints beside every other request, so they are asked here too. The role
 * list is the claim flow's one vocabulary (`CLAIM_ROLES`).
 *
 * At page scale school and squad share a row, because "Northgate University"
 * and "Men's" are one answer asked twice — putting them on separate rows made
 * a three-field form look like a six-field one.
 */
export function UnlistedProgramForm() {
  const [school, setSchool] = useState("");
  const [team, setTeam] = useState<"mens" | "womens">("mens");
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  if (sent) {
    return (
      <p className="text-body max-w-[62ch] rounded-[var(--radius-card)] border border-[var(--border-hairline)] bg-[var(--surface-subtle)] px-5 py-4">
        Thanks — we have {school.trim()}. A person will look at it, and
        we&#39;ll email{" "}
        <span className="text-[var(--ink-900)]">{email.trim()}</span> either
        way.
      </p>
    );
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await submitUnlistedProgram({
        school,
        team,
        name,
        role,
        email,
      });
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

      <div className="grid gap-5 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
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
            disabled={
              pending ||
              !school.trim() ||
              !name.trim() ||
              !role ||
              !email.trim()
            }
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
