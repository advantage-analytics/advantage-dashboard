import { expect, test } from "@playwright/test";

import { reportPointLabel, reportPointOf } from "@/lib/data/match-verification";

/**
 * A "Tell us" report can name a point: the chip's parts, and the line
 * `program_requests.point_label` stores, which `reportMatchIssue` builds from
 * the point row itself.
 */

test.describe("reportPointOf / reportPointLabel", () => {
  const point = {
    id: "11111111-1111-4111-8111-111111111111",
    pointNumber: 61,
    setNumber: 2,
    gameScoreRaw: "4-4",
    pointScoreRaw: "30-40",
  };

  test("the chip's parts and the stored line", () => {
    const report = reportPointOf(point, "Forehand winner by Lee");
    expect(report).toEqual({
      id: point.id,
      number: 61,
      where: "Set 2 · 4-4 · 30-40",
      reading: "Forehand winner by Lee",
    });
    expect(reportPointLabel(report)).toBe(
      "61 · Set 2 · 4-4 · 30-40 · Forehand winner by Lee",
    );
  });

  test("a score the vendor never read is left out, not zeroed", () => {
    expect(
      reportPointOf(
        { ...point, gameScoreRaw: null, pointScoreRaw: null },
        "Won by Lee",
      ).where,
    ).toBe("Set 2");
  });
});
