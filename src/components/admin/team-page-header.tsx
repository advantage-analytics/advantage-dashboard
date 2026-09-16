import { ProgramCrest } from "@/components/dashboard/settings/teams/program-crest";
import { StatePill } from "@/components/ui/state-pill";
import { PilotPill, ApprovePill } from "@/components/admin/plan-pills";
import { programSubtitle } from "@/lib/data/programs-server";
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
 * The Admin › Teams detail page's header: crest, name, state, plan, and the
 * facts line every settings identity card already uses `programSubtitle` for.
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

  const facts = [
    programSubtitle(program.division, program.conference),
    program.homeVenue,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex items-start gap-4 pb-6">
      <ProgramCrest name={program.name} crestUrl={program.crestUrl} size={52} />
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-display truncate">{program.name}</h1>
          <StatePill>{programStatusLabel(program.status)}</StatePill>
          {plan === "pilot" ? (
            <PilotPill />
          ) : plan === "approve" ? (
            <ApprovePill />
          ) : null}
        </div>
        {facts ? (
          <p className="truncate text-[12px] text-[var(--ink-600)]">{facts}</p>
        ) : null}
      </div>
    </div>
  );
}
