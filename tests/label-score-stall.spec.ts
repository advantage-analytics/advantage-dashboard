import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "@playwright/test";

import type { LabelPoint } from "@/lib/services/labels/session";
import { createLoader } from "./fixtures/vm-modules";

/**
 * The publish checks' "Score read off the video": open, never blocking, and
 * only on a match whose score stream stalled (marks.ts `scoreStalled`).
 */
test.describe("a stalled score stream on the dashboard", () => {
  const { LabelDashboard } = createLoader().load(
    "src/components/admin/labels/label-dashboard.tsx",
  ) as { LabelDashboard: React.ComponentType<Record<string, unknown>> };
  const { fixtureMatch, NAMES, UPLOAD } = createLoader().load(
    "src/app/design/labels/fixture.ts",
  ) as {
    fixtureMatch: () => { points: LabelPoint[] };
    NAMES: unknown;
    UPLOAD: unknown;
  };
  const { labelScores } = createLoader().load(
    "src/lib/services/labels/score.ts",
  ) as {
    labelScores: (points: LabelPoint[], ad: boolean) => { games: unknown };
  };
  const marks = { points: {}, shots: {}, suggestions: [], serveSides: {} };
  const page = (scoreStalled?: unknown) => {
    const { points } = fixtureMatch();
    return renderToStaticMarkup(
      React.createElement(LabelDashboard, {
        points,
        marks: scoreStalled ? { ...marks, scoreStalled } : marks,
        games: labelScores(points, false).games,
        adScoring: false,
        names: NAMES,
        finalScore: null,
        matchScore: null,
        videoEndsEarly: true,
        warnings: [],
        complete: false,
        upload: UPLOAD,
        onOpen: () => {},
      }),
    );
  };

  test("says so when the game score never moved", () => {
    const html = page({ points: 38, gameChanges: 0, stalledPoints: 38 });
    expect(html).toContain("Score read off the video");
    expect(html).toContain("game score never changed over 38 points");
  });

  test("says nothing on a match whose score followed it", () => {
    expect(page()).not.toContain("Score read off the video");
  });
});
