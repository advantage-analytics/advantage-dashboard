import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import {
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
