import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import { HintRunner } from "@/components/dashboard/onboarding/hint-runner";

/**
 * T22: `HintRunner` over a fake shell — the workspace switcher in a sidebar,
 * the activity tray in a header. The spec aliases `markTourDone` to a
 * recording mock.
 *
 *   ?hint=<id>      which hint runs (default `workspace-switcher`)
 *   ?viewer=<id>    whose hint it is (default `viewer-1`): keys the guard
 *   ?when=0         the hint is not due
 *   ?dialog=1       start with a `role="dialog"` element in the document —
 *                   BetaWelcome, or an open menu — that "Close dialog" removes
 *
 * Clicking the "Activity" anchor stands for opening the tray: it sets the
 * runner's `resolved`, as `ActivityTray` passes its own open state.
 */

const params = new URLSearchParams(window.location.search);
const HINT =
  params.get("hint") === "activity-tray"
    ? "activity-tray"
    : "workspace-switcher";
const VIEWER = params.get("viewer") ?? "viewer-1";
const WHEN = params.get("when") !== "0";
window.__markTourDoneCalls = [];

function Harness() {
  const [dialog, setDialog] = useState(params.get("dialog") === "1");
  const [runnerKey, setRunnerKey] = useState(0);
  const [mounted, setMounted] = useState(true);
  const [trayOpen, setTrayOpen] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.hydrated = "true";
  }, []);

  return (
    <div style={{ display: "flex", gap: 24 }}>
      <aside style={{ width: 200, padding: 16 }}>
        <button type="button" data-tour="workspace-switcher">
          Stanford Women&apos;s Tennis
        </button>
      </aside>
      <main style={{ flex: 1 }}>
        <header style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            type="button"
            data-tour="activity-tray"
            onClick={() => setTrayOpen(true)}
          >
            Activity
          </button>
        </header>
        <button
          type="button"
          onClick={() => {
            setMounted(false);
            setRunnerKey((key) => key + 1);
            setTimeout(() => setMounted(true), 0);
          }}
        >
          Remount runner
        </button>
        {dialog && (
          <div role="dialog" aria-label="Welcome">
            <button type="button" onClick={() => setDialog(false)}>
              Close dialog
            </button>
          </div>
        )}
        {mounted && (
          <HintRunner
            key={runnerKey}
            hint={HINT}
            viewerId={VIEWER}
            when={WHEN}
            copyFacts={{ teamName: "Stanford Women's Tennis" }}
            resolved={trayOpen}
          />
        )}
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Harness />);
