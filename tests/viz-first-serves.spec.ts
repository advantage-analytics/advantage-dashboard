import { expect, test } from "@playwright/test";

import {
  EMPTY_VIZ_FILTERS,
  computeViz,
  computeVizStats,
  firstServesStruck,
} from "@/components/dashboard/matches/match-detail/shots/viz-model";
import type { MatchPoint } from "@/lib/data/match-points-server";
import { DEFAULT_BANDS } from "@/lib/data/viz-bands";
import { servePoint } from "./fixtures/viz-serve-points";

/**
 * A point whose first serve faulted (landing `faultDepth` past the net, out
 * long) and whose second serve went in where `servePoint` puts it.
 */
function faultThenIn(id: string, opts: { ace?: boolean } = {}): MatchPoint {
  const second = servePoint({ id, second: true });
  const [played] = second.shots ?? [];
  const firstServe = {
    ...played,
    id: `${id}-first`,
    // As real data stores it: a faulted first serve is shot 0, before the
    // second serve that counted (shot 1).
    shotNumber: 0,
    shotType: "First Serve",
    result: "Out",
    landingY: 11.885 + 7.5, // past the service line: long
  };
  return {
    ...second,
    resultType: opts.ace ? "Ace" : second.resultType,
    shots: [firstServe, { ...played, shotNumber: 1 }],
  };
}

const POINTS: MatchPoint[] = [
  servePoint({ id: "first-in" }),
  servePoint({ id: "first-in-2", lateral: 3.4 }),
  faultThenIn("fault-1"),
  faultThenIn("fault-ace", { ace: true }),
];

const first = { ...EMPTY_VIZ_FILTERS, ball: ["first"] as const };
const second = { ...EMPTY_VIZ_FILTERS, ball: ["second"] as const };

test("Ball › 1st alone switches the serve court to every first serve struck", () => {
  expect(firstServesStruck("serve", ["first"])).toBe(true);
  expect(firstServesStruck("serve", ["first", "second"])).toBe(false);
  expect(firstServesStruck("serve", [])).toBe(false);
  expect(firstServesStruck("serve", ["second"])).toBe(false);
  expect(firstServesStruck("returnPlacement", ["first"])).toBe(false);
});

test("1st draws the faulted first serves as misses; All draws the played serve", () => {
  const all = computeViz(POINTS, "serve", EMPTY_VIZ_FILTERS, true);
  // One serve per point, the one played: no miss on the court.
  expect(all.count).toBe(4);
  expect(all.dots.filter((d) => d.outcome === "miss")).toHaveLength(0);

  const firsts = computeViz(POINTS, "serve", first, true);
  expect(firsts.count).toBe(4);
  expect(firsts.total).toBe(4);
  const misses = firsts.dots.filter((d) => d.outcome === "miss");
  expect(misses.map((d) => d.id).sort()).toEqual(["fault-1", "fault-ace"]);
  // A faulted first serve is never the ace, even when the second serve was.
  expect(firsts.dots.find((d) => d.id === "fault-ace")?.shape).not.toBe("star");
  expect(firsts.serveOutOrNetCount).toBe(2);

  // 2nd alone is unchanged: the two points played on a second serve.
  const seconds = computeViz(POINTS, "serve", second, true);
  expect(seconds.dots.map((d) => d.id).sort()).toEqual([
    "fault-1",
    "fault-ace",
  ]);
  expect(seconds.dots.every((d) => d.outcome !== "miss")).toBe(true);
});

test("1st states first-serve percentage and keeps zone shares on serves in", () => {
  const firsts = computeViz(POINTS, "serve", first, true);
  const stats = computeVizStats(
    POINTS,
    "serve",
    first,
    true,
    firsts,
    DEFAULT_BANDS,
    "ft",
  );
  expect(stats.landed).toEqual({ count: 2, of: 4 });
  expect(stats.subtitle).toContain("2 of 4 first serves landed in");
  const zoned = Object.values(firsts.zoneStats ?? {}).reduce(
    (n, z) => n + z.count,
    0,
  );
  expect(zoned).toBe(2);
});

test("1st with Zone keeps only first serves that landed in that zone", () => {
  const all = computeViz(POINTS, "serve", first, true);
  const zones = Object.entries(all.zoneStats ?? {}).filter(([, z]) => z.count);
  for (const [key] of zones) {
    const [side, zone] = key.split("-") as [
      "deuce" | "ad",
      "t" | "body" | "wide",
    ];
    const kept = computeViz(
      POINTS,
      "serve",
      { ...first, court: [side], zone: [zone] },
      true,
    );
    expect(
      kept.dots.every((d) => d.outcome !== "miss"),
      key,
    ).toBe(true);
    expect(kept.count, key).toBe(
      all.zoneStats?.[key as keyof typeof all.zoneStats]?.count,
    );
  }
});
