import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import {
  VizStateProvider,
  useVizState,
} from "@/components/dashboard/matches/match-detail/shots/viz-state-context";
import {
  VizWall,
  type WallCollection,
} from "@/components/dashboard/matches/match-detail/shots/viz-wall";
import { SavedViewsBand } from "@/components/dashboard/matches/match-detail/shots/saved-views-band";
import { EMPTY_VIZ_FILTERS } from "@/components/dashboard/matches/match-detail/shots/viz-model";
import type { SavedViewRow } from "@/lib/data/saved-views-logic";

const views: SavedViewRow[] = [
  {
    id: "saved-serve",
    name: "Saved serve",
    cut: "serve",
    chart: "scatter",
    filters: { ...EMPTY_VIZ_FILTERS, player: "you" },
    order: 0,
    shared: false,
    mine: false,
  },
  {
    id: "saved-serve-2",
    name: "Second saved serve",
    cut: "serve",
    chart: "scatter",
    filters: { ...EMPTY_VIZ_FILTERS, player: "you" },
    order: 1,
    shared: false,
    mine: false,
  },
];

function Harness() {
  const { state, setState } = useVizState();
  const [wallCollection, setWallCollection] =
    useState<WallCollection>("default");
  useEffect(() => {
    if (state.cut !== null && !state.draft) {
      // Mirror ShotsTab's persisted wall selection across the focused branch.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setWallCollection(state.viewId ? "saved" : "default");
    }
  }, [state.cut, state.draft, state.viewId]);
  const band = (
    <SavedViewsBand
      views={views}
      workspaceRole="player"
      workspaceKind="personal"
      variant={state.cut === null ? "wall" : "focused"}
    />
  );
  return (
    <main>
      {state.cut === null ? (
        <VizWall
          savedViewsBand={band}
          collection={wallCollection}
          onCollectionChange={setWallCollection}
        />
      ) : (
        <>
          <section data-testid="focused">
            <h1 id="viz-focused-heading" tabIndex={-1}>
              Focused {state.viewId ?? `${state.filters.player}:${state.cut}`}
            </h1>
            <button
              onClick={() =>
                setState({
                  cut: null,
                  chart: "scatter",
                  filters: EMPTY_VIZ_FILTERS,
                  viewId: null,
                })
              }
            >
              Back to wall
            </button>
            <button
              onClick={() =>
                setState((previous) => ({
                  ...previous,
                  filters: { ...previous.filters, set: [2] },
                }))
              }
            >
              Filter set
            </button>
          </section>
          {band}
        </>
      )}
      {state.fullscreen && (
        <section data-testid="fullscreen">
          <button
            onClick={() =>
              setState((previous) => ({ ...previous, fullscreen: false }))
            }
          >
            Exit fullscreen
          </button>
        </section>
      )}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <VizStateProvider>
    <Harness />
  </VizStateProvider>,
);
