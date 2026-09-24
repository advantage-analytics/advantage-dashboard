import { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  VizStateProvider,
  useVizState,
} from "@/components/dashboard/matches/match-detail/shots/viz-state-context";
import { VizFocused } from "@/components/dashboard/matches/match-detail/shots/viz-focused";

import {
  VizWall,
  type WallCollection,
} from "@/components/dashboard/matches/match-detail/shots/viz-wall";

function Surface() {
  const { state } = useVizState();
  const [collection, setCollection] = useState<WallCollection>("default");
  if (!state.cut)
    return (
      <VizWall collection={collection} onCollectionChange={setCollection} />
    );
  return (
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
  );
}

createRoot(document.getElementById("root")!).render(
  <VizStateProvider>
    <main className="@container mx-auto w-full max-w-[920px] px-4 py-6">
      <Surface />
    </main>
  </VizStateProvider>,
);
