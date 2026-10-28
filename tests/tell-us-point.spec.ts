import { expect, test } from "@playwright/test";

import { reportPointLabel, reportPointOf } from "@/lib/data/match-verification";
import { readingPhrase, type PointReading } from "@/lib/data/self-review";

/**
 * "Something still wrong? Tell us" names the point in view: the chip's three
 * parts, the line `program_requests.point_label` stores, and the reading in
 * words — who did it, an error or double fault named on the point's loser.
 */

const NAMES = { p1: "Lee", p2: "Nakamura" } as const;

function reading(partial: Partial<PointReading>): PointReading {
  return {
    winner: "p1",
    ending: null,
    errorKind: null,
    lastStroke: null,
    ...partial,
  };
}

test.describe("readingPhrase", () => {
  test("a winner names the stroke and the point's winner", () => {
    expect(
      readingPhrase(
        reading({ ending: "winner", lastStroke: "forehand" }),
        NAMES,
      ),
    ).toBe("Forehand winner by Lee");
    expect(readingPhrase(reading({ ending: "winner" }), NAMES)).toBe(
      "Winner by Lee",
    );
  });

  test("an error and a double fault name the player who made them", () => {
    expect(
      readingPhrase(
        reading({
          ending: "error",
          errorKind: "unforced",
          lastStroke: "backhand",
        }),
        NAMES,
      ),
    ).toBe("Backhand unforced error by Nakamura");
    expect(
      readingPhrase(reading({ ending: "error", errorKind: "forced" }), NAMES),
    ).toBe("Forced error by Nakamura");
    expect(
      readingPhrase(reading({ winner: "p2", ending: "double_fault" }), NAMES),
    ).toBe("Double fault by Lee");
  });

  test("serve endings and no ending at all", () => {
    expect(readingPhrase(reading({ ending: "ace" }), NAMES)).toBe("Ace by Lee");
    expect(
      readingPhrase(reading({ winner: "p2", ending: "service_winner" }), NAMES),
    ).toBe("Service winner by Nakamura");
    expect(readingPhrase(reading({ winner: "p2" }), NAMES)).toBe(
      "Won by Nakamura",
    );
  });
});

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
