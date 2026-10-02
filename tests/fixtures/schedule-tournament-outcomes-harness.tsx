import { createRoot } from "react-dom/client";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TournamentDetail } from "@/components/dashboard/schedule/tournament-detail";
import {
  detail,
  rosterPlayerIds,
  waitingEntry,
} from "./schedule-tournament-outcomes-data";

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
 * The tournament event page on fixture entries. `?viewer=player` renders a
 * member who cannot manage the schedule; `?match=` is handed in as the
 * initial selection, the way the server page hands `searchParams.match` down
 * (the navigation mock's `useSearchParams()` returns null).
 * `?entries=waiting` keeps only the entry with nothing played — zero rows.
 */
const query = new URLSearchParams(location.search);
const shown =
  query.get("entries") === "waiting"
    ? { ...detail, entries: [waitingEntry] }
    : detail;

createRoot(document.getElementById("root")!).render(
  <TooltipProvider>
    <TournamentDetail
      detail={shown}
      canEdit={query.get("viewer") !== "player"}
      totals={null}
      rosterPlayerIds={rosterPlayerIds}
      initialMatchId={query.get("match")}
    />
  </TooltipProvider>,
);
document.documentElement.dataset.hydrated = "true";
