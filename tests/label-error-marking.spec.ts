import { expect, test } from "@playwright/test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createLoader } from "./fixtures/vm-modules";
import { readFileSync } from "node:fs";
import {
  errorAfterAnswer,
  errorStops,
  ERROR_STOP_LABEL,
} from "../src/lib/services/labels/flag-nav";
import {
  errorMarkingReady,
  partialPublishWarnings,
  PUBLISHED_PAST_TAILS,
} from "../src/lib/services/labels/session-status";
import { isUnforcedKey } from "../src/components/admin/labels/stroke-keys";
import type { LabelPoint } from "../src/lib/services/labels/session";

/** A live point that ended on a missed stroke, as the rail reads it. */
function errorPoint(index: number, over: Partial<LabelPoint> = {}): LabelPoint {
  return {
    id: `p${index}`,
    pointIndex: index,
    status: "seed",
    ending: "error",
    endedBy: "p2",
    winner: "p1",
    errorKind: null,
    shots: [{ id: `s${index}`, status: "seed", siteRemoval: null }],
    ...over,
  } as unknown as LabelPoint;
}

test.describe("the errors to mark", () => {
  test("every unmarked error, in rail order, numbered as the rail numbers them", () => {
    const stops = errorStops([
      errorPoint(5),
      errorPoint(1),
      errorPoint(2, { errorKind: "forced" }),
      errorPoint(3, { status: "deleted" }),
      errorPoint(4, { ending: "winner", endedBy: "p1" }),
    ]);
    expect(stops).toEqual([
      { pointId: "p1", pointNumber: 2, label: ERROR_STOP_LABEL },
      { pointId: "p5", pointNumber: 6, label: ERROR_STOP_LABEL },
    ]);
  });

  test("a missed return that publishes as a service winner is not asked about", () => {
    expect(errorStops([errorPoint(0, { ending: "service_winner" })])).toEqual(
      [],
    );
  });
});

test.describe("the walk", () => {
  const points = [errorPoint(0), errorPoint(1), errorPoint(2)];
  const stops = errorStops(points);

  test("an answer goes on to the next error still to mark", () => {
    expect(errorAfterAnswer(stops, points, "p0")?.pointId).toBe("p1");
  });

  test("past the end it wraps round to one skipped earlier", () => {
    expect(errorAfterAnswer(stops, points, "p2")?.pointId).toBe("p0");
  });

  test("the last one answered ends it", () => {
    expect(errorAfterAnswer([stops[1]], points, "p1")).toBeNull();
  });
});

test.describe("what it promises", () => {
  const { errorsCheck } = createLoader().load(
    "src/components/admin/labels/label-dashboard.tsx",
  ) as {
    errorsCheck: (
      points: LabelPoint[],
      ready: boolean,
      onMarkErrors?: () => void,
    ) => {
      state: string;
      detail: string;
      link?: { label: string };
      button?: { label: string };
    };
  };
  const marked = (index: number, errorKind: "forced" | "unforced") =>
    errorPoint(index, { errorKind });
  const noShots = (index: number) => errorPoint(index, { shots: [] });
  const noop = () => {};

  test("every error marked: done, with the two counts", () => {
    expect(
      errorsCheck([marked(0, "forced"), marked(1, "unforced")], true),
    ).toMatchObject({ state: "done", detail: "1 forced, 1 unforced." });
  });

  test("an error with no shots stays open and says the split is held back", () => {
    expect(errorsCheck([marked(0, "forced"), noShots(1)], true)).toMatchObject({
      state: "open",
      detail:
        "1 forced, 0 unforced. 1 error has no shots to mark, so this match shows Errors only.",
    });
    expect(errorsCheck([noShots(0), noShots(1)], true)).toMatchObject({
      state: "open",
      detail:
        "2 errors have no shots to mark, so this match shows Errors only.",
    });
  });

  test("no errors at all: done", () => {
    expect(errorsCheck([], true)).toMatchObject({
      state: "done",
      detail: "No error to mark.",
    });
  });

  test("it waits with a quiet way in, then asks; never blocking", () => {
    const waiting = errorsCheck([errorPoint(0)], false, noop);
    expect(waiting).toMatchObject({
      state: "open",
      link: { label: "Mark now" },
    });
    expect(waiting.button).toBeUndefined();
    const asking = errorsCheck(
      [errorPoint(0), marked(1, "forced")],
      true,
      noop,
    );
    expect(asking).toMatchObject({
      state: "open",
      button: { label: "Mark 1 error" },
    });
    expect(asking.detail).toContain("reports plain Errors");
  });
});

test.describe("the statistics card", () => {
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
  const card = (points: LabelPoint[]) =>
    renderToStaticMarkup(
      React.createElement(LabelDashboard, {
        points,
        marks: null,
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

  test("errors read as one row until every one is marked", () => {
    const { points } = fixtureMatch();
    const unmarked = card(points);
    expect(unmarked).toContain(">Errors<");
    expect(unmarked).not.toContain("Forced errors");
    const partly = points.map((p, i) =>
      i === points.findIndex((q) => q.ending === "error")
        ? { ...p, errorKind: "forced" as const }
        : p,
    );
    expect(card(partly)).not.toContain("Forced errors");
  });

  test("every error marked: the split", () => {
    const all = fixtureMatch().points.map((p) => ({
      ...p,
      errorKind: "unforced" as const,
    }));
    const html = card(all);
    expect(html).toContain("Unforced errors");
    expect(html).toContain("Forced errors");
  });
});

test.describe("while it asks", () => {
  const consoleSource = readFileSync(
    "src/components/admin/labels/label-console.tsx",
    "utf8",
  );

  test("the court only shows the stroke: a stray click places nothing", () => {
    expect(consoleSource).toContain(
      "const courtEditable = editable && askedErrorShotId === null;",
    );
    expect(consoleSource).toContain("editable={courtEditable}");
  });

  test("a refused save comes back to ask again", () => {
    expect(consoleSource).toContain(
      "if (!saved) goToErrorLatest.current(answered);",
    );
  });

  test("an open that never jumped does not leave marking armed", () => {
    expect(consoleSource).toMatch(
      /window\.clearTimeout\(timer\);[\s\S]{0,120}openToMarkError\.current = false;/,
    );
  });
});

test.describe("when it asks", () => {
  const partial = `Point 3${PUBLISHED_PAST_TAILS.noEnding}`;

  test("once no score stop is open and every point can be written", () => {
    expect(errorMarkingReady(0, [])).toBe(true);
    expect(errorMarkingReady(1, [])).toBe(false);
    expect(errorMarkingReady(0, [partial])).toBe(false);
  });

  test("unchecked points and other warnings do not hold it", () => {
    expect(
      errorMarkingReady(0, [
        "12 points of 98 not checked",
        "Set 1 labelled 6–3, the match record says 6–4 — it publishes as labelled",
      ]),
    ).toBe(true);
    expect(partialPublishWarnings(["12 points of 98 not checked"])).toEqual([]);
  });
});

test.describe("the keys", () => {
  const consoleSource = readFileSync(
    "src/components/admin/labels/label-console.tsx",
    "utf8",
  );

  test("] and [ walk the score first, then carry on into the errors", () => {
    const step = consoleSource.slice(
      consoleSource.indexOf("stepToFlag.current = (direction, kind) => {"),
      consoleSource.indexOf("stepShot.current = (direction) => {"),
    );
    expect(step).toContain(
      'if (kind === "score" && flagStops.score.length === 0) {',
    );
    expect(step).toContain("if (error) goToError(error.pointId);");
  });

  test("marking an error never holds the publish", () => {
    expect(consoleSource).not.toContain("confirmDisabled");
    expect(consoleSource).toContain(
      'if (question.kind === "complete-session") startMarkingErrors();',
    );
  });

  test("U is the unforced key", () => {
    expect(isUnforcedKey("u")).toBe(true);
    expect(isUnforcedKey("U")).toBe(true);
    expect(isUnforcedKey("e")).toBe(false);
  });
});
