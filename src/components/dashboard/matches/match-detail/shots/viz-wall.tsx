"use client";

import { useMemo, type ReactNode } from "react";
import { useMatchData } from "@/components/dashboard/matches/match-data-provider";
import { useVizPoints } from "@/components/dashboard/matches/match-detail/shots/use-viz-points";
import { useMatchSides } from "@/components/dashboard/matches/match-detail/use-match-sides";
import { WallCard } from "./wall-card";
import { LifecycleChip } from "./lifecycle-chip";
import { PlayerChips } from "./player-chips";
import { useMatchPlayerChipLabels } from "./use-match-player-chip-labels";
import { LegendMark } from "./legend-mark";
import { useVizState } from "./use-viz-state";
import { buildDefaultTiles } from "./default-tiles";
import { useMatchFilters } from "../match-filters/provider";
import { useVizBands } from "@/components/dashboard/matches/match-detail/shots/viz-bands-context";
import { wallLegendItems } from "./viz-labels";
import { EMPTY_VIZ_FILTERS, type PlayerFilter } from "./viz-model";

/**
 * The wall (canvas W5 + card D3): one toolbar strip — `Default | Saved` ·
 * `You | Opponent` · the legend — over five court-first cards in a two-column grid,
 * one player at a time. The Saved collection sits under the same strip and
 * shows that player's saved views as the same cards. Which player is URL-backed (`?player=opponent` on the
 * wall, `viz-url.ts`), so a reload or Back lands on the same five cards.
 *
 * Attribution (guardrails §4): `useMatchSides()` is the only place "you" is
 * resolved here; each card's subject is read straight off the side
 * (`side.isPlayer1`) and passed to `computeViz` (inside `buildDefaultTiles`),
 * never re-derived. Won/lost stays relative to the card's own subject — on
 * an opponent card green means the opponent won.
 *
 * The cards come from `buildDefaultTiles` (`default-tiles.ts`), with the
 * workspace's bands so each card's footer (`wall-summary.ts`) buckets rally
 * depth exactly as the Statistics column does.
 */

export type WallCollection = "default" | "saved";

export function VizWall({
  savedViewsBand,
  collection: requestedCollection,
  onCollectionChange,
  player,
}: {
  /**
   * The Saved collection's content. Absent (a read-only report with no saved
   * views, where there is nothing to list and no "Create view" tile to offer)
   * drops the Default/Saved switch and keeps the wall on Default.
   */
  savedViewsBand?: ReactNode;
  collection: WallCollection;
  onCollectionChange: (collection: WallCollection) => void;
  /** Which player's five cards — the wall's own, kept by `shots-tab.tsx`
   *  while the lightbox owns `state.filters`. */
  player: PlayerFilter;
}) {
  const points = useVizPoints(useMatchData());
  const { you, opp } = useMatchSides();
  // "You" only for the player the report is about; names for everyone else.
  const chipLabels = useMatchPlayerChipLabels();
  const { setState, hrefFor } = useVizState();
  // The errors card's name, filter and error reading follow whether this
  // match's errors are judged (`defaultCutsFor`, `errorKindOf`).
  const { context: matchCtx } = useMatchFilters();
  const { bands, unit } = useVizBands();

  const hasSaved = savedViewsBand != null;
  const collection: WallCollection = hasSaved ? requestedCollection : "default";

  // Keyed on `points`/`you.isPlayer1`/the names/`hrefFor` — `opp.isPlayer1`
  // is always `you.isPlayer1`'s inverse, so it carries no information the
  // memo doesn't already have.
  const tiles = useMemo(
    () =>
      buildDefaultTiles(
        points,
        {
          you: { isPlayer1: you.isPlayer1, name: you.name },
          opp: { isPlayer1: opp.isPlayer1, name: opp.name },
        },
        hrefFor,
        matchCtx,
        { bands, unit },
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see comment above
    [points, you.isPlayer1, you.name, opp.name, hrefFor, matchCtx, bands, unit],
  );

  const visibleTiles = tiles.filter(
    (tile) => tile.subject === player && tile.total > 0,
  );

  function choosePlayer(next: PlayerFilter) {
    if (next === player) return;
    setState((prev) => ({
      ...prev,
      cut: null,
      filters: { ...EMPTY_VIZ_FILTERS, player: next },
      viewId: null,
    }));
  }

  return (
    <div data-viz-wall="" className="@container flex flex-col gap-[18px]">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {hasSaved && (
          <div className="flex gap-2" role="group" aria-label="View">
            {(["default", "saved"] as const).map((value) => (
              <LifecycleChip
                key={value}
                pressed={collection === value}
                onClick={() => onCollectionChange(value)}
              >
                {value === "default" ? "Default" : "Saved"}
              </LifecycleChip>
            ))}
          </div>
        )}
        {/* The same strip on both collections: the Saved wall filters its
            views by the same You | Opponent and reads the same marks. */}
        {hasSaved && (
          <span
            aria-hidden="true"
            className="h-4 w-px"
            style={{ backgroundColor: "var(--border-medium)" }}
          />
        )}
        <PlayerChips
          value={player}
          onChange={choosePlayer}
          labels={chipLabels}
        />
        <div className="flex-1" />
        <div
          role="group"
          aria-label="Legend"
          className="flex flex-wrap items-center gap-x-[14px] gap-y-[6px]"
        >
          {wallLegendItems().map((item) => (
            <LegendMark key={item.key} item={item} />
          ))}
        </div>
      </div>
      {collection === "default" ? (
        visibleTiles.length > 0 ? (
          <div
            role="list"
            aria-label="Default views"
            className="grid grid-cols-1 items-start gap-4 @min-[640px]:grid-cols-2"
          >
            {visibleTiles.map((tile) => (
              <div key={tile.key} role="listitem">
                <WallCard
                  name={tile.name}
                  playerName={tile.playerName}
                  possessive={tile.subject === "you" ? "your" : "their"}
                  cut={tile.cut}
                  dots={tile.dots}
                  summary={tile.summary!}
                  href={tile.href}
                  navigateState={tile.state}
                />
              </div>
            ))}
          </div>
        ) : (
          <EmptyWall />
        )
      ) : null}
      {hasSaved && <div hidden={collection !== "saved"}>{savedViewsBand}</div>}
    </div>
  );
}

/**
 * Honest zero when no default cut has drawable data — never an empty court
 * (an empty serve chart reads as "you hit no serves").
 */
function EmptyWall() {
  return (
    <div
      className="flex items-center justify-center rounded-[var(--radius-card)] border px-6 py-8 text-center"
      style={{
        borderColor: "var(--border-hairline)",
        backgroundColor: "var(--surface-card)",
      }}
    >
      <p className="text-[12px]" style={{ color: "var(--ink-500)" }}>
        No serves, returns, or rallies recorded yet.
      </p>
    </div>
  );
}
