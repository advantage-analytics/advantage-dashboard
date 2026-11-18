import { expect, test } from "@playwright/test";
import {
  dotMatchesPick,
  legendCounts,
  markIsPoint,
  pointsBehind,
  resultMarks,
} from "@/components/dashboard/matches/match-detail/shots/lightbox-points";
import { statPickDotIds } from "@/components/dashboard/matches/match-detail/shots/stat-cut";
import {
  computeViz,
  EMPTY_VIZ_FILTERS,
  type Cut,
  type VizDot,
} from "@/components/dashboard/matches/match-detail/shots/viz-model";
import type { MatchPoint } from "@/lib/data/match-points-server";
import { DEFAULT_BANDS } from "@/lib/data/viz-bands";
import {
  LOBBED,
  MATCH,
  PASSED_DTL,
  withoutLanding,
} from "./fixtures/approach-points";
import { servePoint } from "./fixtures/viz-serve-points";

const dot = (
  id: string,
  outcome: VizDot["outcome"],
  shotType: string | null,
): VizDot => ({
  id,
  outcome,
  shape: "circle",
  lateralM: 0,
  depthM: 0,
  atNet: false,
  meta: {
    pointId: id,
    setNumber: 1,
    pointScore: null,
    wonBySubject: false,
    shotType,
    result: "Out",
    isAce: false,
  },
});

test("a missed first serve is a fault, not a point; a missed second serve is a double fault, a point", () => {
  expect(markIsPoint("serve", dot("a", "miss", "First Serve"))).toBe(false);
  expect(markIsPoint("serve", dot("b", "miss", "Second Serve"))).toBe(true);
  // Anything else on serve, and every mark on another cut, stands for a point.
  expect(markIsPoint("serve", dot("c", "won", "First Serve"))).toBe(true);
  expect(markIsPoint("returnPlacement", dot("d", "miss", null))).toBe(true);
});

test("Points and Watch keep a double fault and leave out a first-serve fault", () => {
  const points = [
    servePoint({ id: "fault" }),
    servePoint({ id: "double", second: true }),
  ];
  const listed = pointsBehind(
    "serve",
    [
      dot("fault", "miss", "First Serve"),
      dot("double", "miss", "Second Serve"),
    ],
    points,
  );
  expect(listed.map((p) => p.id)).toEqual(["double"]);
});

/* ── Approaches with no landing (T20) ─────────────────────────────────── */

const OTHER_CUTS: Cut[] = [
  "serve",
  "returnPlacement",
  "returnContact",
  "rallyPosition",
  "rallyPlacement",
  "errors",
];

/** The shared net-point match, one number per point, with the landing taken
 *  off the points in `stripped` (as the filters harness's `?landing=`). */
function netMatch(stripped: (id: string) => boolean): MatchPoint[] {
  return MATCH.map((point, i) => ({
    ...(stripped(point.id) ? withoutLanding(point) : point),
    pointNumber: i + 1,
  }));
}

test("Approaches: the matched points include an approach with no landing, in match order, one per counted approach", () => {
  const points = netMatch((id) => id === PASSED_DTL.id || id === LOBBED.id);
  const result = computeViz(points, "approaches", EMPTY_VIZ_FILTERS, true);
  // Counted, not drawn: they travel beside the dots, never as one.
  expect(result.undrawn?.map((m) => m.id)).toEqual([PASSED_DTL.id, LOBBED.id]);
  expect(result.dots.map((d) => d.id)).not.toContain(PASSED_DTL.id);
  expect(result.count - result.dots.length).toBe(2);

  const listed = pointsBehind("approaches", resultMarks(result), points);
  expect(listed.map((p) => p.id)).toEqual([
    "serve-volley",
    PASSED_DTL.id,
    "passed-cc",
    "drawn-in",
    LOBBED.id,
    "opp-error",
  ]);
  expect(listed).toHaveLength(result.count);

  // Every approach without a landing: every one still listed.
  const none = netMatch(() => true);
  const bare = computeViz(none, "approaches", EMPTY_VIZ_FILTERS, true);
  expect(bare.dots).toHaveLength(0);
  expect(
    pointsBehind("approaches", resultMarks(bare), none).map((p) => p.id),
  ).toEqual(listed.map((p) => p.id));
});

test("Approaches: a legend pick narrows the undrawn approaches by outcome, and the legend counts them", () => {
  const points = netMatch(() => true);
  const result = computeViz(points, "approaches", EMPTY_VIZ_FILTERS, true);
  const counts = legendCounts(resultMarks(result));
  expect(counts.won + counts.lost).toBe(result.count);
  const won = resultMarks(result).filter((m) => dotMatchesPick(m, "won"));
  expect(pointsBehind("approaches", won, points)).toHaveLength(counts.won);
  expect(won.map((m) => m.id)).toEqual(["serve-volley", "opp-error"]);
});

test("Approaches: How it ended keeps an undrawn approach; Approach to cannot (it has no wing)", () => {
  const points = netMatch(() => true);
  const result = computeViz(points, "approaches", EMPTY_VIZ_FILTERS, true);
  const lost = result.undrawn!.find((m) => m.id === "drawn-in")!;
  const bucket = lost.meta!.bucket!;
  const ended = statPickDotIds(
    points,
    "approaches",
    EMPTY_VIZ_FILTERS,
    true,
    undefined,
    result.dots,
    { group: "approach-ended", row: bucket, label: bucket },
    DEFAULT_BANDS,
    result.undrawn,
  );
  expect(ended.has("drawn-in")).toBe(true);
  for (const row of ["backhand", "middle", "forehand"]) {
    const wing = statPickDotIds(
      points,
      "approaches",
      EMPTY_VIZ_FILTERS,
      true,
      undefined,
      result.dots,
      { group: "approach-to", row, label: row },
      DEFAULT_BANDS,
      result.undrawn,
    );
    expect(wing.size).toBe(0);
  }
});

test("every other cut lists exactly what it did: no undrawn entries, the same points behind its dots", () => {
  for (const strip of [false, true]) {
    const points = netMatch(() => strip);
    for (const cut of OTHER_CUTS) {
      for (const player of [true, false]) {
        const result = computeViz(points, cut, EMPTY_VIZ_FILTERS, player);
        expect(result.undrawn, `${cut}`).toBeUndefined();
        expect(resultMarks(result)).toBe(result.dots);
        expect(pointsBehind(cut, resultMarks(result), points)).toEqual(
          pointsBehind(cut, result.dots, points),
        );
      }
    }
  }
});
