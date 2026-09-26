import { Calendar, Globe, Landmark, MapPin } from "lucide-react";

import { AdminTeamCrestControl } from "@/components/admin/team-crest-control";
import { TeamHeaderActions } from "@/components/admin/team-header-actions";
import { StatePill } from "@/components/ui/state-pill";
import { PilotPill, ApprovePill } from "@/components/admin/plan-pills";
import { programSubtitle } from "@/lib/data/programs-server";
import { formatShortDate } from "@/lib/ui/date-format";
import type {
  AdminTeamClaim,
  AdminTeamProgram,
} from "@/lib/data/admin-team-server";

/**
 * The claim statuses a human still has to decide — same set `admin-teams-
 * server.ts`'s `NEEDS_DECISION` reproduces for the Teams list row. Kept as
 * its own copy rather than an import: that file's set is a module-private
 * implementation detail of the directory's `plan` column, and this header
 * derives the identical fact from a differently-shaped read (`getAdminTeam`'s
 * single `claim`, not a list row's embedded array).
 */
const NEEDS_DECISION = new Set(["pending_review", "objected"]);

/** "claim_pending" -> "Claim pending". `programs.status`'s own vocabulary. */
function programStatusLabel(status: string): string {
  return status
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * The Admin › Teams detail page's header: the crest — uploadable here, unlike
 * every other place the console draws one — the name, the state and plan
 * pills, the four-fact line under them, and the actions at the right edge
 * (`TeamHeaderActions`, a client component: this one is a Server Component
 * and reads `programSubtitle` from a `*-server.ts` module).
 *
 * Home venue is deliberately not one of those facts: the canvas' line is the
 * four an admin triages on (what the program is, where it is, the domain a
 * claim is matched against, when it was claimed), and the venue is a detail
 * the Details card below already prints.
 *
 * `PilotPill` wins over `ApprovePill` on an active program for the same
 * reason `toAdminTeamRow` gives `plan` that order — once a program is active,
 * the claim that got it there is settled history, not a decision still
 * pending, and the two conditions cannot both be true for a real row.
 *
 * The approve case is the static `ApprovePill`, not the Teams list's
 * clickable `ApproveChip`: the approve/decline flow lives on that list today
 * and is a later task's job to bring here, and this is a Server Component —
 * handing a handler across that boundary is what 500'd every waiting
 * program's page before. A tag that reports the state is the honest shape
 * until there is something real to press.
 */
export function TeamPageHeader({
  program,
  claim,
}: {
  program: AdminTeamProgram;
  claim: AdminTeamClaim | null;
}) {
  const needsDecision = claim !== null && NEEDS_DECISION.has(claim.status);
  const plan: "pilot" | "approve" | "none" =
    program.status === "active" ? "pilot" : needsDecision ? "approve" : "none";

  const cityState = [program.city, program.state].filter(Boolean).join(", ");

  /**
   * The canvas' four facts, in its order: what the program is, where it is,
   * the domain a claim's email is matched against, and when it was claimed.
   * Each is dropped rather than drawn empty — an admin reading "—" cannot
   * tell a program with no conference from one whose row was never filled in,
   * and an unclaimed program has no claim date to print at all.
   */
  const facts: { key: string; icon: typeof Landmark; text: string }[] = [
    {
      key: "program",
      icon: Landmark,
      text: programSubtitle(program.division, program.conference),
    },
    { key: "place", icon: MapPin, text: cityState },
    { key: "domain", icon: Globe, text: program.primaryDomain ?? "" },
    {
      key: "claimed",
      icon: Calendar,
      text: program.claimedAt
        ? `Claimed ${formatShortDate(program.claimedAt)}`
        : "",
    },
  ].filter((fact) => fact.text !== "");

  return (
    <div className="flex items-center gap-5">
      <AdminTeamCrestControl
        programId={program.id}
        name={program.name}
        crestUrl={program.crestUrl}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-display truncate">{program.name}</h1>
          <StatePill>{programStatusLabel(program.status)}</StatePill>
          {plan === "pilot" ? (
            <PilotPill />
          ) : plan === "approve" ? (
            <ApprovePill />
          ) : null}
        </div>
        {facts.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-[18px] gap-y-1.5 text-[12px] text-[var(--ink-600)]">
            {facts.map(({ key, icon: Icon, text }) => (
              <span key={key} className="flex items-center gap-1.5">
                <Icon
                  aria-hidden="true"
                  className="size-[13px] shrink-0 text-[var(--ink-400)]"
                  strokeWidth={1.5}
                />
                {text}
              </span>
            ))}
          </div>
        )}
      </div>
      <TeamHeaderActions program={program} />
    </div>
  );
}
