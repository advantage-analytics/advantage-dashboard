import { createRoot } from "react-dom/client";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DualDetail } from "@/components/dashboard/schedule/dual-detail";
import {
  detail,
  NORMAL_ENTRIES,
  OUTCOME_ENTRIES,
} from "./schedule-dual-outcomes-data";

/**
 * The dual event page on fixture lines. `?normal` swaps the all-outcomes
 * card for the two-line in-progress one; `?viewer=player` renders a member
 * who cannot manage the schedule; `?line=` is handed in as the initial
 * selection, the way the server page hands `searchParams.line` down (the
 * navigation mock's `useSearchParams()` returns null).
 */
const query = new URLSearchParams(location.search);
const normal = query.has("normal");

createRoot(document.getElementById("root")!).render(
  <TooltipProvider>
    <DualDetail
      detail={detail(normal ? NORMAL_ENTRIES : OUTCOME_ENTRIES)}
      canEdit={query.get("viewer") !== "player"}
      conference="Big Ten"
      initialLineId={query.get("line")}
    />
  </TooltipProvider>,
);
document.documentElement.dataset.hydrated = "true";
