import { createRoot } from "react-dom/client";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TournamentDetail } from "@/components/dashboard/schedule/tournament-detail";
import { detail, rosterPlayerIds } from "./schedule-tournament-outcomes-data";

declare global {
  interface Window {
    actionCalls: { action: string; input: unknown }[];
    routerPushes: string[];
    routerRefreshes: number;
  }
}

window.actionCalls = [];
window.routerPushes = [];
window.routerRefreshes = 0;

/**
 * The tournament event page on fixture entries. `?match=` is handed in as the
 * initial selection, the way the server page hands `searchParams.match` down
 * (the navigation mock's `useSearchParams()` returns null).
 */
const query = new URLSearchParams(location.search);

createRoot(document.getElementById("root")!).render(
  <TooltipProvider>
    <TournamentDetail
      detail={detail}
      canEdit
      totals={null}
      rosterPlayerIds={rosterPlayerIds}
      initialMatchId={query.get("match")}
    />
  </TooltipProvider>,
);
document.documentElement.dataset.hydrated = "true";
