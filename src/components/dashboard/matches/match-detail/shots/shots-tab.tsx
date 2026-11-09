"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useMounted } from "@/lib/ui/use-mounted";
import {
  VizWall,
  type WallCollection,
} from "@/components/dashboard/matches/match-detail/shots/viz-wall";
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
import { useWallMemory } from "@/components/dashboard/matches/match-detail/shots/viz-wall-memory";

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
/**
 * The lightbox, loaded only when a card opens: Radix Dialog, the pan/zoom
 * court, the filters and the point list stay out of the tab's first chunk
 * (the fullscreen viewer it replaced was split the same way). Client-only
 * either way — it is never in the server HTML (see `lightboxOpen` below).
 */
const VizLightbox = dynamic(
  () =>
    import("@/components/dashboard/matches/match-detail/shots/viz-lightbox").then(
      (m) => m.VizLightbox,
    ),
  { ssr: false },
);

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
  const { state, navigation } = useVizState();
  // What the wall showed before the tab last unmounted — "Watch these N
  // points" leaves for the Video tab, and Back mounts the tab again on the
  // lightbox's URL, which names neither the wall's player nor its collection.
  const wallMemory = useWallMemory();
  const remembered = wallMemory?.memory ?? null;
  const remember = wallMemory?.remember;
  // Otherwise a hard load of a saved view's link, or of a "Create view"
  // draft, opens over Saved, as a click from there does.
  const [wallCollection, setWallCollection] = useState<WallCollection>(
    () =>
      remembered?.collection ??
      (state.cut !== null &&
      (state.viewId !== null || state.editedFrom !== undefined || state.draft)
        ? "saved"
        : "default"),
  );
  const { meta, actions } = useMatchReport();
  const points = useVizPoints(useMatchData());
  const mounted = useMounted();
  const { canSaveViews } = shotsWriteAccess(meta);

  // The wall's own player. While the lightbox is open `state.filters.player`
  // belongs to the opened card (and its You | Opponent switch), so the wall
  // keeps the player it showed when the card opened, and closing goes back
  // to it.
  const [wallPlayer, setWallPlayer] = useState<PlayerFilter>(() =>
    state.cut === null ? state.filters.player : (remembered?.player ?? "you"),
  );
  if (state.cut === null && state.filters.player !== wallPlayer) {
    setWallPlayer(state.filters.player);
  }
  useEffect(() => {
    remember?.({ player: wallPlayer, collection: wallCollection });
  }, [remember, wallPlayer, wallCollection]);

  // One lightbox per OPENING — keyed on that, never on the live `viewId`:
  // editing a filter, switching You | Opponent or saving a view all rewrite
  // `viewId`, and a remount there would close the Filters popover, drop the
  // legend and Statistics picks, the pane and the zoom, and lose the focus
  // return. The collection the card opened from is fixed at the same moment
  // (a saved view or a draft over Saved, a default card over Default), so
  // closing an edited saved view still lands on Saved. A render-phase update
  // on the closed → open edge; no effect.
  const isOpen = state.cut !== null;
  const [opening, setOpening] = useState({ count: 0, open: isOpen });
  if (opening.open !== isOpen) {
    setOpening({ count: opening.count + (isOpen ? 1 : 0), open: isOpen });
    if (isOpen)
      setWallCollection(
        state.viewId !== null || state.editedFrom !== undefined || state.draft
          ? "saved"
          : "default",
      );
  }

  // Back/Forward from one open saved view to another is a new opening too:
  // the pane, zoom, selection and picks belong to the view they were made
  // on. Only a navigation the store did not make counts (`navigation`), and
  // only when it lands on a different view — the court's view, or the one it
  // was edited from, so an edit never remounts.
  const baseViewId = state.viewId ?? state.editedFrom ?? null;
  const [visit, setVisit] = useState({
    navigation,
    viewId: baseViewId,
    count: 0,
  });
  if (visit.navigation !== navigation || visit.viewId !== baseViewId) {
    const landedOtherView =
      visit.navigation !== navigation &&
      isOpen &&
      baseViewId !== null &&
      baseViewId !== visit.viewId;
    setVisit({
      navigation,
      viewId: baseViewId,
      count: visit.count + (landedOtherView ? 1 : 0),
    });
  }

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
          key={`${opening.count}:${visit.count}`}
          wallPlayer={wallPlayer}
          onWatchPoints={actions.watchPointSet}
        />
      )}
    </>
  );
}
