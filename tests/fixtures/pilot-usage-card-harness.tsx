import { Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { PilotUsageCard } from "@/components/admin/pilot-usage-card";

/**
 * The Admin › Teams Pilot card in a real browser, with its server actions
 * swapped for `pilot-usage-card-actions-browser-mock.ts` and the router for
 * `next-navigation-browser-mock.ts`. `tests/pilot-usage-card.spec.ts` bundles
 * this and drives it.
 *
 * The boundary stands in for the page's error screen: anything a click throws
 * to it is recorded on `window.boundaryErrors` and replaces the card, the way
 * an error boundary replaces the real page.
 */
const host = window as unknown as {
  routerPushes: string[];
  routerRefreshes: number;
  boundaryErrors: string[];
};
host.routerPushes = [];
host.routerRefreshes = 0;
host.boundaryErrors = [];

class Boundary extends Component<
  { children: ReactNode },
  { error: string | null }
> {
  state = { error: null as string | null };
  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
  componentDidCatch(error: unknown) {
    host.boundaryErrors.push(
      error instanceof Error ? error.message : String(error),
    );
  }
  render() {
    if (this.state.error) {
      return <p role="alert">Page error: {this.state.error}</p>;
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(
  <Boundary>
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
          endsOn: "2026-12-31",
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
  </Boundary>,
);
document.documentElement.dataset.hydrated = "true";
