import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import type { MatchFilterContext } from "@/components/dashboard/matches/match-detail/match-filters/model";
import { vizFilterContext } from "@/components/dashboard/matches/match-detail/shots/use-viz-view";
import { DEFAULT_BANDS } from "@/lib/data/viz-bands";

/**
 * The Visualizations tab's lob keys (`shots/viz-lob-keys.tsx`): read once by
 * `ShotsTab` with the Statistics view's hooks and gate, and laid into the ONE
 * filter context the tab computes with (`useVizFilterContext`), so the wall's
 * cards, the Saved cards, the opened view and its point list read the same
 * lob-aware context — a card and its lightbox cannot disagree.
 *
 * The report providers need Next's router and cannot mount offline, so the
 * wiring is pinned at the source and the merge is tested pure.
 */
const SHOTS = "src/components/dashboard/matches/match-detail/shots/";
const read = (file: string) =>
  readFileSync(path.join(process.cwd(), SHOTS, file), "utf8");

const BASE: MatchFilterContext = {
  youIsPlayer1: true,
  hands: { player1: "right", player2: null },
  isDerived: true,
};

test.describe("vizFilterContext", () => {
  test("lays the lob keys in beside the live bands", () => {
    const lobKeys = new Set([12.5, 40]);
    const ctx = vizFilterContext(BASE, DEFAULT_BANDS, "m", lobKeys);
    expect(ctx.lobKeys).toBe(lobKeys);
    expect(ctx.bands).toBe(DEFAULT_BANDS);
    expect(ctx.unit).toBe("m");
    expect(ctx.hands).toBe(BASE.hands);
  });

  test("unknown lobs (null) leave lobKeys unset, never an empty set", () => {
    const ctx = vizFilterContext(BASE, DEFAULT_BANDS, "ft", null);
    expect("lobKeys" in ctx).toBe(false);
    expect(ctx.bands).toBe(DEFAULT_BANDS);
  });
});

test.describe("Visualizations lob-keys wiring", () => {
  test("read once, with the Statistics view's hooks and gate", () => {
    const provider = read("viz-lob-keys.tsx");
    expect(provider).toContain("useBallPathsRoute(meta.readOnly)");
    expect(provider).toContain("enabled: meta.isDerived && route.allowed");
    expect(provider).toContain("endpoint: route.endpoint");
    // No fetch of its own: the shared one-entry cache is the only reader.
    expect(provider).not.toMatch(/\bfetch\(/);
    // `null` until known: the context's default is null.
    expect(read("viz-lob-keys-context.ts")).toMatch(
      /createContext<ReadonlySet<number> \| null>\(\s*null,?\s*\)/,
    );
  });

  test("ShotsTab mounts it once, around both the wall and the lightbox", () => {
    const tab = read("shots-tab.tsx");
    const mounts = tab.match(/<VizLobKeysProvider>/g) ?? [];
    expect(mounts).toHaveLength(1);
    expect(tab).toMatch(
      /<VizLobKeysProvider>\s*<ShotsTabBody \/>\s*<\/VizLobKeysProvider>/,
    );
  });

  test("every surface computes with useVizFilterContext", () => {
    for (const file of [
      "viz-wall.tsx",
      "saved-views-band.tsx",
      "viz-lightbox.tsx",
      "lightbox-point-list.tsx",
    ]) {
      const src = read(file);
      expect(src, file).toContain("useVizFilterContext()");
      expect(src, file).not.toContain("useMatchFilters()");
    }
    expect(read("use-viz-view.ts")).toMatch(
      /const context = useVizFilterContext\(\);/,
    );
  });
});
