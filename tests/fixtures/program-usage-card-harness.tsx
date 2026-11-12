import { createRoot } from "react-dom/client";
import { ProgramUsageCard } from "@/components/dashboard/settings/program-usage-card";
import { HarnessBoundary } from "./admin-team-harness-boundary";

/**
 * Settings › Usage's program card in a real browser, with `loadProgramUsage`
 * swapped for `admin-team-actions-browser-mock.ts`.
 * `tests/program-usage-card.spec.ts` bundles this and drives it.
 */
createRoot(document.getElementById("root")!).render(
  <HarnessBoundary>
    <div style={{ width: 640 }}>
      <ProgramUsageCard
        program={{
          id: "11111111-1111-4111-8111-111111111111",
          name: "Centennial High School",
          kind: "team",
          mark: "CH",
          iconUrl: null,
          team: null,
        }}
        initial={{
          usedSeconds: 3600,
          capSeconds: 270000,
          billingMonth: "2026-11-01",
          lines: [],
        }}
        currentMonth="2026-11-01"
      />
    </div>
  </HarnessBoundary>,
);
document.documentElement.dataset.hydrated = "true";
