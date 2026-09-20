"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMatchData } from "@/components/dashboard/matches/match-data-provider";
import { useMatchSides } from "@/components/dashboard/matches/match-detail/use-match-sides";
import { CourtTile } from "./court-tile";
import { useVizState } from "./use-viz-state";
import { buildDefaultTiles } from "./default-tiles";
import { VIZ_TILE_GRID_CLASS, VIZ_TILE_GRID_STYLE } from "./viz-labels";

/**
 * P1a/P1b: the wall of default cuts, one row per subject (you first, then
 * the opponent — never player1/player2), three tiles per row.
 *
 * Attribution (guardrails §4): `useMatchSides()` is the only place "you" is
 * resolved here; each row's subject is read straight off the side
 * (`side.isPlayer1`) and passed to `computeViz` (inside `buildDefaultTiles`),
 * never re-derived. Won/lost stays relative to the row's own subject — on
 * the opponent's row green means the opponent won.
 *
 * F4: the six tiles themselves come from `buildDefaultTiles` (`default-tiles.ts`)
 * — the same builder the focused view's Views grid uses (a wrapping grid
 * reached by scrolling the page, not a scrolling row) — so the wall and
 * that grid can never draw a different set of tiles.
 */

export function VizWall({ savedViewsBand }: { savedViewsBand?: ReactNode }) {
  const { points } = useMatchData();
  const { you, opp } = useMatchSides();
  const { hrefFor, externalCourtSwap, clearExternalCourtSwap } = useVizState();

  // F5: mirrors `viz-focused.tsx`'s identical fallback — see
  // `VizStateContextValue.externalCourtSwap`'s doc comment.
  const [fallbackFadeIn] = useState(externalCourtSwap);
  // M6: keyed on the flag itself, not `[]` — this component doesn't
  // remount on every court change (props just change), so a `[]`-deps
  // effect only ever clears whatever the flag was AT THE FIRST mount. A
  // later external swap (e.g. browser Back) that sets the flag while this
  // component stays mounted would otherwise never get cleared, and the
  // stale `true` would trigger a spurious fade on some unrelated later
  // mount. Clearing on every render where the flag reads `true` — right
  // after `fallbackFadeIn` has already captured it once for this mount —
  // fixes that without ever re-triggering the fade itself, since
  // `fallbackFadeIn` is `useState`'s initial value and never reacts to
  // later prop changes.
  useEffect(() => {
    if (externalCourtSwap) clearExternalCourtSwap();
  }, [externalCourtSwap, clearExternalCourtSwap]);

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

  const rows: { subject: "you" | "opponent"; name: string }[] = [
    { subject: "you", name: you.name },
    { subject: "opponent", name: opp.name },
  ];

  return (
    <div
      className={
        fallbackFadeIn
          ? "viz-crossfade-in flex flex-col gap-6"
          : "flex flex-col gap-6"
      }
    >
      {rows.map((row) => {
        const rowTiles = tiles.filter((t) => t.subject === row.subject);
        const isEmpty = rowTiles.every((t) => t.total === 0);
        return (
          <div key={row.subject}>
            {isEmpty ? (
              <EmptySubjectRow name={row.name} />
            ) : (
              // M9: one list per player, labelled with the player's name —
              // matches the shape the focused Views grid and the saved-views
              // grid use, so this row's three tiles are one announced group
              // instead of three unrelated cards.
              <div
                role="list"
                aria-label={row.name}
                className={VIZ_TILE_GRID_CLASS}
                style={VIZ_TILE_GRID_STYLE}
              >
                {rowTiles.map((tile) => (
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
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {savedViewsBand}
    </div>
  );
}

/**
 * Honest zero for a subject with nothing drawable in any default cut — never
 * an empty court (an empty serve chart reads as "you hit no serves", per
 * `reference/empty-and-loading.md`). One bar across the row, not three blank
 * tiles, so the page states plainly what is missing instead of repeating an
 * empty shape three times.
 */
function EmptySubjectRow({ name }: { name: string }) {
  return (
    <div
      className="flex items-center justify-center rounded-[var(--radius-card)] border px-6 py-8 text-center"
      style={{
        borderColor: "var(--border-hairline)",
        backgroundColor: "var(--surface-card)",
      }}
    >
      <p className="text-[12px]" style={{ color: "var(--ink-500)" }}>
        No serves or returns recorded for {name} yet.
      </p>
    </div>
  );
}
