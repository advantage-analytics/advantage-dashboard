import { createRoot } from "react-dom/client";
import { LabelBoard } from "@/components/label/label-board";
import { HarnessBoundary } from "./admin-team-harness-boundary";

/**
 * The labeller board on `/label` in a real browser, with
 * `claimLabelMatchAction` swapped for `admin-team-actions-browser-mock.ts`.
 * `tests/label-board-claim.spec.ts` bundles this and presses Claim.
 */
createRoot(document.getElementById("root")!).render(
  <HarnessBoundary>
    <div style={{ width: 900 }}>
      <LabelBoard
        board={{
          todo: [
            {
              jobId: "00000001-0000-4000-8000-000000000000",
              videoSeconds: 5400,
              urgency: "standard",
              dueAt: "2026-11-14T12:00:00Z",
              claimable: true,
              flags: null,
            },
          ],
          inProgress: [],
          published: [],
          submitted: [],
          holding: false,
        }}
        now={Date.parse("2026-11-13T12:00:00Z")}
        canClaim
      />
    </div>
  </HarnessBoundary>,
);
document.documentElement.dataset.hydrated = "true";
