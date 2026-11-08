"use client";

import { useEffect, useState } from "react";
import { useMounted } from "@/lib/ui/use-mounted";
import {
  VizWall,
  type WallCollection,
} from "@/components/dashboard/matches/match-detail/shots/viz-wall";
import { VizLightbox } from "@/components/dashboard/matches/match-detail/shots/viz-lightbox";
import type { PlayerFilter } from "@/components/dashboard/matches/match-detail/shots/viz-model";
import {
  useVizState,
  VizStateProvider,
} from "@/components/dashboard/matches/match-detail/shots/viz-state-context";
import { useMatchReport } from "@/components/dashboard/matches/match-detail/match-report-context";
import { SavedViewsBand } from "@/components/dashboard/matches/match-detail/shots/saved-views-band";
import { VizBandsProvider } from "@/components/dashboard/matches/match-detail/shots/viz-bands-context";
import { shotsWriteAccess } from "@/components/dashboard/matches/match-detail/shots/shots-write-access";
import { VizEmpty } from "@/components/dashboard/matches/match-detail/shots/viz-empty";
import { useMatchData } from "@/components/dashboard/matches/match-data-provider";
import { useVizPoints } from "@/components/dashboard/matches/match-detail/shots/use-viz-points";

/**
 * The Visualizations tab's panel: the wall (`VizWall`, four court-first
 * cards, one player at a time) always, and over it the lightbox
 * (`VizLightbox`) whenever `?cut=` names a cut — a wall card, a saved view or
 * a pasted link opens it, and closing drops `cut` again. The wall never
 * unmounts, so closing lands exactly where the reader left it.
 *
 * Attribution (guardrails §4): "you" is resolved exactly once, by
 * `useMatchSides()` — `VizWall` and the lightbox's `useVizView` each call it
 * and pass the resolved side's own `isPlayer1` down to `computeViz`.
 *
 * `VizStateProvider` is mounted ONCE here, around the wall and the
 * lightbox, so every descendant's `useVizState()` reads the SAME store.
 * `ShotsTabBody` reads it, inside the provider.
 *
 * The public share page and the sample match (`meta.readOnly`) draw the same
 * courts with nothing that writes: no Saved collection, no "Save as view".
 */
export function ShotsTab() {
  return (
    // `VizBandsProvider` sits inside the state provider and around both
    // surfaces: a band preset picked in the lightbox moves the bands and the
    // percentages printed on them in the same frame.
    <VizStateProvider>
      <VizBandsProvider>
        <ShotsTabBody />
      </VizBandsProvider>
    </VizStateProvider>
  );
}

function ShotsTabBody() {
  const { state } = useVizState();
  const [wallCollection, setWallCollection] =
    useState<WallCollection>("default");
  const { meta, actions } = useMatchReport();
  const points = useVizPoints(useMatchData());
  const mounted = useMounted();
  const { canSaveViews } = shotsWriteAccess(meta);

  // The wall's own player. While the lightbox is open `state.filters.player`
  // belongs to the opened card (and its You | Opponent switch), so the wall
  // keeps the player it showed when the card opened, and closing goes back
  // to it.
  const [wallPlayer, setWallPlayer] = useState<PlayerFilter>(
    state.cut === null ? state.filters.player : "you",
  );
  if (state.cut === null && state.filters.player !== wallPlayer) {
    setWallPlayer(state.filters.player);
  }

  // A saved view opens over the Saved collection, a default card over
  // Default, so closing returns to the collection that opened it.
  useEffect(() => {
    if (state.cut !== null && !state.draft) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setWallCollection(state.viewId ? "saved" : "default");
    }
  }, [state.cut, state.draft, state.viewId]);

  // Before anything else, so no URL can reach an empty court.
  if (points.length === 0) return <VizEmpty />;

  // The lightbox is a client-only portal: never part of the server HTML or
  // the hydration render, so a hard load of `?cut=…` hydrates the wall and
  // then opens over it.
  const lightboxOpen = mounted && state.cut !== null;

  return (
    <>
      <VizWall
        // A read-only report has no Saved collection to switch to: its only
        // item would be "Create view", a writer.
        savedViewsBand={
          meta.readOnly ? undefined : (
            <SavedViewsBand
              views={meta.savedViews}
              workspaceRole={meta.workspaceRole}
              workspaceKind={meta.workspaceKind}
              canSaveViews={canSaveViews}
              readOnly={meta.readOnly}
            />
          )
        }
        collection={wallCollection}
        onCollectionChange={setWallCollection}
        player={wallPlayer}
      />
      {lightboxOpen && (
        <VizLightbox
          // A different saved view (Back/Forward between two) is a different
          // card: its own baseline, its own legend and Statistics picks.
          key={state.viewId ?? "card"}
          wallPlayer={wallPlayer}
          onWatchPoints={actions.watchPointSet}
        />
      )}
    </>
  );
}
