import { expect, test } from "@playwright/test";

import { pointScoresOf } from "@/lib/services/splitstep/derivation/scores";
import type { SplitStepStroke } from "@/lib/services/splitstep/derivation/types";

/**
 * The film room's scoreboard reads `points.set_score` / `game_score` /
 * `point_score`, which the derivation used to drop on the floor even though
 * the vendor sends them on every stroke. These pin the two rules that matter:
 * the FIRST stroke's prediction is the score the point starts from, and the
 * strings are stored server-first and verbatim — never re-oriented here.
 */

function stroke(scores: Partial<SplitStepStroke>): SplitStepStroke {
  return {
    predPointScore: null,
    predGameScore: null,
    predSetScore: null,
    ...scores,
  } as SplitStepStroke;
}

test.describe("pointScoresOf", () => {
  test("reads the first stroke, not the last", () => {
    const out = pointScoresOf({
      strokes: [
        stroke({
          predPointScore: "30-40",
          predGameScore: "3-5",
          predSetScore: "1-0",
        }),
        stroke({
          predPointScore: "40-40",
          predGameScore: "3-5",
          predSetScore: "1-0",
        }),
      ],
    });
    expect(out).toEqual({
      set_score: "1-0",
      game_score: "3-5",
      point_score: "30-40",
    });
  });

  test("keeps the vendor's server-first orientation verbatim", () => {
    const out = pointScoresOf({
      strokes: [stroke({ predPointScore: "AD-40" })],
    });
    expect(out.point_score).toBe("AD-40");
  });

  test("an empty rally or a nulled sentinel is null, not 0-0", () => {
    expect(pointScoresOf({ strokes: [] })).toEqual({
      set_score: null,
      game_score: null,
      point_score: null,
    });
    expect(pointScoresOf({ strokes: [stroke({})] }).game_score).toBeNull();
  });
});
