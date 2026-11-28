import { createRoot } from "react-dom/client";
import { PilotUsageCard } from "@/components/admin/pilot-usage-card";
import { HarnessBoundary } from "./admin-team-harness-boundary";
import type { ProgramOrgType } from "@/lib/workspace/types";

/**
 * The Admin › Teams Pilot card in a real browser, with its server actions
 * swapped for `admin-team-actions-browser-mock.ts` and the router for
 * `next-navigation-browser-mock.ts`. `tests/pilot-usage-card.spec.ts` bundles
 * this and drives it.
 *
 * The query string picks the case (all optional, defaults as before):
 *  - `org` — the program's `org_type` (`high_school` by default);
 *  - `pilot` — `future` (default: an end date next year), `none` (no end date,
 *    never approved), `ended` (ended by hand today) or `lapsed` (ended
 *    yesterday);
 *  - `begun=1` — `plansHaveBegun()` is true;
 *  - `eligible=1` — the team is already on the pool, so the button revokes.
 */
const params = new URLSearchParams(window.location.search);
const utcDay = (offsetDays: number) =>
  new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);
const pilotCase = params.get("pilot") ?? "future";
const pilot = {
  // Next year, so the date picker's floor never catches the fixture.
  endsOn:
    pilotCase === "none"
      ? null
      : pilotCase === "ended"
        ? utcDay(0)
        : pilotCase === "lapsed"
          ? utcDay(-1)
          : `${new Date().getUTCFullYear() + 1}-12-31`,
  approvedAt: pilotCase === "none" ? null : "2026-09-01T00:00:00Z",
  approvedByName: pilotCase === "none" ? null : "Cj",
  approvedByIsViewer: pilotCase !== "none",
  endedAt: pilotCase === "ended" ? `${utcDay(0)}T12:00:00Z` : null,
};
createRoot(document.getElementById("root")!).render(
  <HarnessBoundary>
    <div style={{ width: 380 }}>
      <PilotUsageCard
        programId="11111111-1111-4111-8111-111111111111"
        programName="Centennial High School"
        usage={{
          usedSeconds: 3600,
          capSeconds: 36000,
          billingMonth: "2026-10-01",
          lines: [],
        }}
        pilot={pilot}
        orgType={(params.get("org") as ProgramOrgType | null) ?? "high_school"}
        pilotEligible={params.get("eligible") === "1"}
        teamPool={false}
        plansBegun={params.get("begun") === "1"}
      />
    </div>
  </HarnessBoundary>,
);
document.documentElement.dataset.hydrated = "true";
