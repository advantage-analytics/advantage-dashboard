import { redirect } from "next/navigation";
import { ClaimShell } from "@/components/claim/claim-shell";
import { PilotTermsForm } from "@/components/claim/pilot-terms-form";
import type { CustomOrgType } from "@/lib/services/programs/create-actions";
import {
  PILOT_TERMS_VERSION,
  pilotTermsCopy,
} from "@/lib/services/programs/pilot-terms";
import { quotaTierFor } from "@/lib/services/splitstep/quota";
import { readPendingTeam } from "../pending-team";

export const metadata = { title: "Pilot terms" };

/** The eyebrow's type half. "Other" has no honest label, so it shows none. */
const ORG_LABEL: Record<CustomOrgType, string | null> = {
  club: "Club",
  high_school: "High school",
  academy: "Academy",
  other: null,
};

/**
 * Pilot terms, custom-team flow (design frame B): the last step before
 * `create_custom_program`, reached from `/claim/team/setup` whenever the coach
 * holds no acceptance at the current version.
 *
 * The team does not exist yet. Its name and type come from the pending-team
 * cookie the setup submit parked (`pending-team.ts`); with nothing parked
 * there is nothing to accept terms FOR, so the coach goes back to choosing a
 * type. The hours are the tier the new team will actually draw from,
 * `quotaTierFor()` for a team of this org type: the individual figure, never
 * the collegiate one. The layout already requires a session.
 */
export default async function TeamPilotTermsPage() {
  const pending = await readPendingTeam();
  if (!pending) redirect("/claim/team/type");

  const copy = pilotTermsCopy({
    flow: "team",
    accountType: quotaTierFor({ kind: "team", orgType: pending.orgType }),
  });
  const eyebrow = [pending.name, ORG_LABEL[pending.orgType]]
    .filter(Boolean)
    .join(" · ");

  return (
    <ClaimShell
      width={720}
      gap={20}
      back={`/claim/team/setup?${new URLSearchParams({ type: pending.orgType })}`}
    >
      <PilotTermsForm
        flow="team"
        eyebrow={eyebrow}
        copy={copy}
        version={PILOT_TERMS_VERSION}
      />
    </ClaimShell>
  );
}
