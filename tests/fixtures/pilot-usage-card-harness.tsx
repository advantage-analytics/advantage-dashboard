import { createRoot } from "react-dom/client";
import { PilotUsageCard } from "@/components/admin/pilot-usage-card";
import { HarnessBoundary } from "./admin-team-harness-boundary";

/**
 * The Admin › Teams Pilot card in a real browser, with its server actions
 * swapped for `admin-team-actions-browser-mock.ts` and the router for
 * `next-navigation-browser-mock.ts`. `tests/pilot-usage-card.spec.ts` bundles
 * this and drives it.
 */
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
        pilot={{
          // Next year, so the date picker's floor never catches the fixture.
          endsOn: `${new Date().getUTCFullYear() + 1}-12-31`,
          approvedAt: "2026-09-01T00:00:00Z",
          approvedByName: "Cj",
          approvedByIsViewer: true,
          endedAt: null,
        }}
        orgType="high_school"
        pilotEligible={false}
        teamPool={false}
      />
    </div>
  </HarnessBoundary>,
);
document.documentElement.dataset.hydrated = "true";
