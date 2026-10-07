import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import {
  MatchReportProvider,
  useMatchReport,
} from "@/components/dashboard/matches/match-detail/match-report-context";
import { TourRunner } from "@/components/dashboard/onboarding/tour-runner";
import { DEFAULT_BANDS } from "@/lib/data/viz-bands";

/**
 * T9: `TourRunner` over a fake report under the real `MatchReportProvider`.
 * The spec aliases `markTourDone` to a recording mock and `next/navigation`
 * to the address-bar mock, so `selectView`'s `history.pushState` is real and
 * `?tab=` can be read back.
 *
 * The page's query string picks the fake report's shape:
 *
 *   ?targets=scoreboard,insight,head-to-head   which `data-tour` targets the
 *                                              body renders (default: all three)
 *   ?tabs=1                                    also render the Visualizations
 *                                              and Video rows — the `tab`
 *                                              steps' targets, always present
 *                                              as in the real rail — and the
 *                                              view each switches to
 *   ?reject=1                                  make the action mock reject
 *
 * The address-bar mock reads `window.location` at render time and nothing
 * re-renders on `pushState`, so the harness patches `pushState` to bump a
 * counter — the one piece of the Next router the provider needs here.
 */

const params = new URLSearchParams(window.location.search);
const TARGETS = (params.get("targets") ?? "scoreboard,insight,head-to-head")
  .split(",")
  .filter(Boolean);
const TABS = params.get("tabs") === "1";
window.__markTourDoneRejects = params.get("reject") === "1";
window.__markTourDoneCalls = [];

const listeners = new Set<() => void>();
const pushState = window.history.pushState.bind(window.history);
window.history.pushState = (...args) => {
  pushState(...args);
  listeners.forEach((listener) => listener());
};

function FakeReport() {
  const { state } = useMatchReport();
  return (
    <div style={{ display: "flex", gap: 24, padding: 24 }}>
      <aside style={{ width: 200 }}>
        {TARGETS.includes("scoreboard") && (
          <div data-tour="scoreboard">6-4 3-6 7-5</div>
        )}
        {TABS && (
          <div role="tablist">
            <button type="button" role="tab" data-tour="shots">
              Visualizations
            </button>
            <button type="button" role="tab" data-tour="film">
              Video
            </button>
          </div>
        )}
      </aside>
      <main style={{ flex: 1 }}>
        {state.view === "statistics" && (
          <>
            {TARGETS.includes("insight") && (
              <section data-tour="insight">
                The second serve decided it.
              </section>
            )}
            {TARGETS.includes("head-to-head") && (
              <section data-tour="head-to-head">Head-to-head</section>
            )}
          </>
        )}
        {state.view === "shots" && (
          <section data-view="shots">Serve placement court</section>
        )}
        {state.view === "film" && <section data-view="film">Player</section>}
      </main>
    </div>
  );
}

function Harness() {
  // Bumps on every pushState so the provider re-reads the address bar.
  const [, setTick] = useState(0);
  // A remount of the runner with `start` still true — the spec's "does not
  // reopen after Done" case.
  const [runnerKey, setRunnerKey] = useState(0);
  const [mounted, setMounted] = useState(true);

  useEffect(() => {
    const listener = () => setTick((tick) => tick + 1);
    listeners.add(listener);
    document.documentElement.dataset.hydrated = "true";
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return (
    <MatchReportProvider
      matchId="sample"
      summary="The second serve decided it."
      canCompare={false}
      isDerived={false}
      statsPublished
      hasPlayableVideo={TABS}
      savedViews={[]}
      workspaceRole="owner"
      workspaceKind="personal"
      workspaceName=""
      bandSettings={DEFAULT_BANDS}
      canEditBands
      unit="ft"
      readOnly
      sample
    >
      <FakeReport />
      <button
        type="button"
        onClick={() => {
          setMounted(false);
          setRunnerKey((key) => key + 1);
          // Two commits: out, then back in.
          setTimeout(() => setMounted(true), 0);
        }}
      >
        Remount runner
      </button>
      {mounted && <TourRunner key={runnerKey} tour="sample" start />}
    </MatchReportProvider>
  );
}

createRoot(document.getElementById("root")!).render(<Harness />);
