import { createRoot } from "react-dom/client";
import { TournamentDetail } from "@/components/dashboard/schedule/tournament-detail";
import { detail } from "./schedule-tournament-outcomes-data";

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

createRoot(document.getElementById("root")!).render(
  <TournamentDetail detail={detail} canEdit totals={null} />,
);
document.documentElement.dataset.hydrated = "true";
