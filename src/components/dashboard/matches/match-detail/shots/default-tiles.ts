/**
 * F4: the shared builder behind the six default tiles (`DEFAULT_CUTS` × [you,
 * opp]) — extracted out of `viz-wall.tsx` so the wall and the focused view's
 * Views grid (a wrapping grid reached by scrolling the page, not a scrolling
 * row) draw the identical set of tiles, in the identical order, and can
 * never drift against each other. Pure TypeScript; no React.
 *
 * Attribution (guardrails §4): `subjectIsPlayer1` comes only from
 * `sides.you.isPlayer1` / `sides.opp.isPlayer1` — never re-derived here, and
 * nothing in this file reads player1/player2 off a match or a point.
 */

import type { MatchPoint } from "@/lib/data/match-points-server";
import { DEFAULT_CUTS } from "./default-cuts";
import {
  EMPTY_VIZ_FILTERS,
  computeViz,
  tileCountLabel,
  type Cut,
  type PlayerFilter,
  type VizDot,
} from "./viz-model";
import type { VizState } from "./viz-url";

export interface DefaultTileSide {
  isPlayer1: boolean;
  name: string;
}

export interface DefaultTile {
  /** Stable, order-independent key: `"you:serve"`, `"opponent:returnContact"`, etc. */
  key: string;
  playerName: string;
  subject: PlayerFilter;
  name: string;
  pills: string[];
  countLabel: string;
  cut: Cut;
  dots: VizDot[];
  state: VizState;
  href: string;
  /** Drawable points in the cut's pool — `0` for every one of a subject's
   * tiles means that subject has nothing to show (mirrors `viz-wall.tsx`'s
   * `EmptySubjectRow` rule). */
  total: number;
}

/**
 * The six default tiles in wall order: your three (serve, return placement,
 * return contact), then the opponent's three. `hrefFor` is the caller's
 * `useVizState().hrefFor` (or an equivalent pure function in a test), applied
 * to each tile's own `VizState` to build its `href`.
 */
export function buildDefaultTiles(
  points: MatchPoint[],
  sides: { you: DefaultTileSide; opp: DefaultTileSide },
  hrefFor: (next: VizState) => string,
): DefaultTile[] {
  const rows: { subject: PlayerFilter; side: DefaultTileSide }[] = [
    { subject: "you", side: sides.you },
    { subject: "opponent", side: sides.opp },
  ];

  const tiles: DefaultTile[] = [];
  for (const row of rows) {
    for (const cut of DEFAULT_CUTS) {
      const filters = {
        ...EMPTY_VIZ_FILTERS,
        ...cut.filters,
        player: row.subject,
      };
      const result = computeViz(
        points,
        cut.cut,
        filters,
        row.side.isPlayer1,
        cut.chart,
      );
      const state: VizState = {
        cut: cut.cut,
        chart: cut.chart,
        filters,
        viewId: null,
      };
      tiles.push({
        key: `${row.subject}:${cut.cut}`,
        playerName: row.side.name,
        subject: row.subject,
        name: cut.name,
        pills: cut.pills,
        countLabel: tileCountLabel(result),
        cut: cut.cut,
        dots: result.dots,
        state,
        href: hrefFor(state),
        total: result.total,
      });
    }
  }
  return tiles;
}
