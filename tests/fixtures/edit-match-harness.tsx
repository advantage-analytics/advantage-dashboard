import { createRoot } from "react-dom/client";

import { EditMatchDialog } from "@/components/dashboard/matches/match-actions/edit-match-dialog";

/** The real Edit match dialog, open, for `tests/edit-match-scoring.spec.ts`. */
createRoot(document.getElementById("root") as HTMLElement).render(
  <EditMatchDialog matchId="m-1" open onOpenChange={() => {}} />,
);
