import { createRoot } from "react-dom/client";
import { VizStateProvider } from "@/components/dashboard/matches/match-detail/shots/viz-state-context";
import { VizFocused } from "@/components/dashboard/matches/match-detail/shots/viz-focused";

createRoot(document.getElementById("root")!).render(
  <VizStateProvider>
    <main className="@container mx-auto w-full max-w-[920px] px-4 py-6">
      <VizFocused
        savedViews={[]}
        workspaceKind="personal"
        workspaceName="Avery"
        hasPlayableVideo={!window.location.search.includes("video=none")}
        onWatchPoint={(pointId) => {
          const query = new URLSearchParams(window.location.search);
          query.set("tab", "film");
          query.set("point", pointId);
          window.history.pushState(null, "", `/?${query.toString()}`);
        }}
      />
    </main>
  </VizStateProvider>,
);
