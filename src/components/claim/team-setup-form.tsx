"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import {
  askToJoinExistingTeam,
  continueToPilotTerms,
} from "@/app/claim/team/actions";
import { CLAIM_ROLES } from "@/lib/services/programs/claim-roles";
import type { CustomProgramSearchResult } from "@/lib/data/programs-server";
import type { CustomOrgType } from "@/lib/services/programs/create-actions";
import { OWNER_NAME_MAX } from "@/lib/services/programs/custom-org";
import {
  CLAIM_BUTTON,
  CLAIM_FIELD,
  CLAIM_LABEL,
  ClaimSelect,
} from "./claim-shell";
import { ExistingTeamMatches, TYPE_LABEL } from "./existing-team-matches";
import { TeamPills } from "./team-pills";
import { squadsFor, type Squad } from "@/lib/data/squad";

/**
 * Onboarding & Team Setup, screen 7.2 — you name it, you own it, no
 * confirmation step. The team's name and squad, plus the coach's own name and
 * role, and a create button. The whole difference from the college path is what's
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

/** Long enough to stop typing, short enough not to feel laggy. */
const DEBOUNCE_MS = 180;

function reasonMessage(reason: string): string {
  switch (reason) {
    case "limit-reached":
      return (
        "You can own up to 2 club, high school or academy teams. To add " +
        "another, remove one first or ask its owner to add you instead."
      );
    // `continueToPilotTerms` routes this one to the terms screen itself, so
    // it only reaches the form if that navigation failed.
    case "terms-not-accepted":
      return "Something changed with the pilot terms. Try again to see them.";
    case "invalid-name":
      return "Give the team a name between 2 and 120 characters.";
    case "invalid-owner-name":
      return `Keep your name to ${OWNER_NAME_MAX} characters.`;
    case "invalid-team":
      return "Say whether the team is men's, women's or co-ed.";
    case "invalid-org-type":
      return "Something's off with the team type — go back a step and pick one.";
    case "no-session":
      return "Your session expired. Sign in again to create the team.";
    default:
      return "We couldn't create the team. Try again.";
  }
}

/** The refusals `askToJoinExistingTeam` can return; success never returns. */
function askReasonMessage(reason: string): string {
  switch (reason) {
    case "already-member":
      return "You're already on that team — switch to it from your workspace menu.";
    case "already-requested":
      return "You've already asked to join that team. Its owner has your request.";
    case "college":
      return "That's a college program. Find it from the college path to ask for access.";
    case "not-found":
      return "That team isn't on Advantage any more. Try the search again.";
    case "no-session":
      return "Your session expired. Sign in again to ask to join.";
    default:
      return "We couldn't send that request. Try again.";
  }
}

export function TeamSetupForm({
  orgType,
  defaultOwnerName,
  defaultTeamName = "",
  defaultTeam = null,
}: {
  orgType: CustomOrgType;
  defaultOwnerName: string;
  /** What the coach typed before going on to the terms and coming back. */
  defaultTeamName?: string;
  /** The parked Team answer, on the same return trip. Null: not yet asked. */
  defaultTeam?: Squad | null;
}) {
  const copy = TYPE_LABEL[orgType];
  const [teamName, setTeamName] = useState(defaultTeamName);
  const [ownerName, setOwnerName] = useState(defaultOwnerName);
  // Starts unanswered on purpose. A preselected "Men's" is how a mixed club
  // ends up a men's team: the coach never sees a question, only a setting.
  const [team, setTeam] = useState<Squad | null>(defaultTeam);
  const squads = squadsFor(orgType);
  const [role, setRole] = useState<string>(CLAIM_ROLES[0].value);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // The row whose "Ask to join" is in flight. Stays set through a successful
  // ask, because success is a server redirect and the button should not come
  // back to life while the navigation is under way.
  const [askingId, setAskingId] = useState<string | null>(null);
  const [, startAsk] = useTransition();

  // Existing custom teams with a name like the one being typed. The debounce
  // and the latest-request guard are `ProgramSearch`'s, so a slow early
  // keystroke cannot overwrite a faster later one.
  const [matches, setMatches] = useState<CustomProgramSearchResult[]>([]);
  const latest = useRef(0);
  const query = teamName.trim();
  // Derived during render: below two characters there is nothing to show, and
  // no request is made.
  const active = query.length >= 2;
  const visibleMatches = active ? matches : [];

  useEffect(() => {
    if (!active) return;

    const id = ++latest.current;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/programs/custom-search?q=${encodeURIComponent(query)}&type=${encodeURIComponent(orgType)}`,
        );
        const body = (await res.json()) as {
          results: CustomProgramSearchResult[];
        };
        if (id !== latest.current) return;
        setMatches(body.results ?? []);
      } catch {
        if (id === latest.current) setMatches([]);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query, active, orgType]);

  const canSubmit =
    teamName.trim().length >= 2 && ownerName.trim().length > 0 && team !== null;

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      // Success redirects on the server (to the pilot terms, or straight into
      // the new team when they are already accepted); a returned value is
      // always a refusal.
      const result = await continueToPilotTerms({
        name: teamName,
        orgType,
        ownerName,
        team,
      });
      if (result && !result.ok) setError(reasonMessage(result.reason));
    });
  }

  function askToJoin(programId: string) {
    setError(null);
    setAskingId(programId);
    startAsk(async () => {
      // The role is the 7.2 answer, validated against the allowlist on the
      // server; the coach's address and name are the session's, never sent.
      const result = await askToJoinExistingTeam({ programId, role });
      if (result && !result.ok) {
        setError(askReasonMessage(result.reason));
        setAskingId(null);
      }
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
          <ExistingTeamMatches
            rows={visibleMatches}
            term={query}
            onAskToJoin={askToJoin}
            pendingProgramId={askingId}
          />
        </div>

        <div>
          <span className={CLAIM_LABEL}>Team</span>
          <TeamPills value={team} onChange={setTeam} options={squads} />
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
              maxLength={OWNER_NAME_MAX}
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
            disabled={!canSubmit || pending || askingId !== null}
            className={CLAIM_BUTTON}
          >
            {pending ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                Continue
              </span>
            ) : (
              "Continue"
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
