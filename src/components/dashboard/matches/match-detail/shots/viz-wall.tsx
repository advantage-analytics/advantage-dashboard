"use client";

import { useMemo, type ReactNode } from "react";
import { useMatchData } from "@/components/dashboard/matches/match-data-provider";
import { useMatchSides } from "@/components/dashboard/matches/match-detail/use-match-sides";
import { CourtTile, TileFullscreenGlyph } from "./court-tile";
import { useVizState, useExternalSwapFadeIn } from "./use-viz-state";
import { buildDefaultTiles } from "./default-tiles";
import { VIZ_TILE_GRID_CLASS } from "./viz-labels";

/**
 * The wall switches between default cuts and saved views. Default cuts form
 * one gallery in subject order, without separate player/phase sections.
 *
 * Attribution (guardrails §4): `useMatchSides()` is the only place "you" is
 * resolved here; each tile's subject is read straight off the side
 * (`side.isPlayer1`) and passed to `computeViz` (inside `buildDefaultTiles`),
 * never re-derived. Won/lost stays relative to the tile's own subject — on
 * an opponent tile green means the opponent won.
 *
 * F4: the six tiles themselves come from `buildDefaultTiles` (`default-tiles.ts`)
 * — the same builder the focused view's Views grid uses (a wrapping grid
 * reached by scrolling the page, not a scrolling row) — so the wall and
 * that grid can never draw a different set of tiles.
 */

export type WallCollection = "default" | "saved";

export function VizWall({
  savedViewsBand,
  collection,
  onCollectionChange,
}: {
  savedViewsBand?: ReactNode;
  collection: WallCollection;
  onCollectionChange: (collection: WallCollection) => void;
}) {
  const { points } = useMatchData();
  const { you, opp } = useMatchSides();
  const { hrefFor } = useVizState();

  // F5: mirrors `viz-focused.tsx`'s identical fallback — see
  // `useExternalSwapFadeIn`'s doc comment.
  const fallbackFadeIn = useExternalSwapFadeIn();

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
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see comment above
    [points, you.isPlayer1, you.name, opp.name, hrefFor],
  );

  const visibleTiles = tiles.filter((tile) => tile.total > 0);

  return (
    <div
      className={
        fallbackFadeIn
          ? "viz-crossfade-in @container flex flex-col gap-6"
          : "@container flex flex-col gap-6"
      }
    >
      <div
        className="flex flex-wrap items-center gap-2"
        role="group"
        aria-label="View collection"
      >
        {(["default", "saved"] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={collection === value}
            onClick={() => onCollectionChange(value)}
            className={`min-h-8 cursor-pointer rounded-full border px-3 py-1.5 text-[10px] font-medium tracking-[1.5px] uppercase transition-colors duration-200 motion-reduce:transition-none ${
              collection === value
                ? "border-[var(--ink-900)] bg-[var(--ink-900)] text-white"
                : "border-[var(--border-hairline)] text-[var(--ink-700)] hover:bg-[var(--surface-subtle)]"
            }`}
          >
            {value === "default" ? "Default" : "Saved"}
          </button>
        ))}
      </div>
      {collection === "default" ? (
        visibleTiles.length > 0 ? (
          <div
            role="list"
            aria-label="Default views"
            className={VIZ_TILE_GRID_CLASS}
          >
            {visibleTiles.map((tile) => (
              <div key={tile.key} role="listitem">
                <CourtTile
                  playerName={tile.playerName}
                  name={tile.name}
                  pills={tile.pills}
                  countLabel={tile.countLabel}
                  cut={tile.cut}
                  dots={tile.dots}
                  chart={tile.chart}
                  href={tile.href}
                  navigateState={tile.state}
                  actionSlot={
                    <TileFullscreenGlyph
                      name={tile.name}
                      tileState={tile.state}
                    />
                  }
                />
              </div>
            ))}
          </div>
        ) : (
          <EmptyWall />
        )
      ) : null}
      <div hidden={collection !== "saved"}>{savedViewsBand}</div>
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
