"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { createCustomTeam } from "@/app/claim/team/actions";
import { CLAIM_ROLES } from "@/lib/services/programs/claim-roles";
import type { CustomOrgType } from "@/lib/services/programs/create-actions";
import {
  CLAIM_BUTTON,
  CLAIM_FIELD,
  CLAIM_LABEL,
  ClaimSelect,
} from "./claim-shell";

/**
 * Onboarding & Team Setup, screen 7.2 — you name it, you own it, no
 * confirmation step. Two fields the coach fills plus their own name and role,
 * and a create button. The whole difference from the college path is what's
 * absent: no list, no domain note, no email link, no announced claim. The
 * "How this differs from a college team" aside lives in the page, passed to
 * `ClaimShell`'s right column.
 *
 * `Team name` is what the workspace becomes and the only field the create
 * action needs. `Your name` persists to the coach's own profile (see
 * `createCustomTeam`). `Your role` is present because 7.2 shows it and the
 * college setup form asks the same question — but a custom org's owner
 * membership is `owner` by construction and there is no per-owner title column,
 * so it's a confirmatory field: selectable, not stored. Wiring it anywhere
 * would mean inventing a destination the schema doesn't have.
 */

/** The eyebrow + title reflect the org type chosen on 7.1. */
const TYPE_LABEL: Record<
  CustomOrgType,
  { eyebrow: string; title: string; placeholder: string }
> = {
  club: {
    eyebrow: "Tennis club",
    title: "Set up your club team",
    placeholder: "Riverside Tennis Club — Juniors",
  },
  high_school: {
    eyebrow: "High school",
    title: "Set up your high school team",
    placeholder: "Riverside High — Varsity",
  },
  academy: {
    eyebrow: "Academy",
    title: "Set up your academy team",
    placeholder: "Baseline Academy — Performance Group",
  },
  other: {
    eyebrow: "Something else",
    title: "Set up your team",
    placeholder: "Your team's name",
  },
};

function reasonMessage(reason: string): string {
  switch (reason) {
    case "limit-reached":
      return (
        "You can own up to 2 club, high school or academy teams. To add " +
        "another, remove one first or ask its owner to add you instead."
      );
    case "invalid-name":
      return "Give the team a name between 2 and 120 characters.";
    case "invalid-org-type":
      return "Something's off with the team type — go back a step and pick one.";
    case "no-session":
      return "Your session expired. Sign in again to create the team.";
    default:
      return "We couldn't create the team. Try again.";
  }
}

export function TeamSetupForm({
  orgType,
  defaultOwnerName,
}: {
  orgType: CustomOrgType;
  defaultOwnerName: string;
}) {
  const copy = TYPE_LABEL[orgType];
  const [teamName, setTeamName] = useState("");
  const [ownerName, setOwnerName] = useState(defaultOwnerName);
  const [role, setRole] = useState<string>(CLAIM_ROLES[0].value);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const canSubmit = teamName.trim().length >= 2 && ownerName.trim().length > 0;

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      // Success redirects on the server; a returned value is always a refusal.
      const result = await createCustomTeam({
        name: teamName,
        orgType,
        ownerName,
      });
      if (result && !result.ok) setError(reasonMessage(result.reason));
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-0.5">
        <span className="eyebrow">{copy.eyebrow}</span>
        <h1 className="text-title-lg" style={{ paddingTop: 6 }}>
          {copy.title}
        </h1>
      </div>

      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <div>
          <label htmlFor="teamName" className={CLAIM_LABEL}>
            Team name — how players will see it
          </label>
          <input
            id="teamName"
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            placeholder={copy.placeholder}
            maxLength={120}
            autoComplete="off"
            className={CLAIM_FIELD}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="ownerName" className={CLAIM_LABEL}>
              Your name
            </label>
            <input
              id="ownerName"
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              autoComplete="name"
              className={CLAIM_FIELD}
            />
          </div>

          <div>
            <label htmlFor="ownerRole" className={CLAIM_LABEL}>
              Your role
            </label>
            <ClaimSelect
              id="ownerRole"
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
                Creating
              </span>
            ) : (
              "Create team"
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
