import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

import { lastBallNearNet, NEAR_NET_M } from "@/lib/services/labels/marks-state";
import { markHover } from "@/lib/services/labels/marks-copy";
import type { LabelShot } from "@/lib/services/labels/session";
import { labelPoint, labelShot } from "./fixtures/label-session";

// "Into the net?" off the landing — a last ball called in that came down
// within a metre past the net — and Y, the key that takes a suggestion.

const NET = 11.885;

/** A point ending on a forehand hit from the near baseline. */
const endingOn = (last: Partial<LabelShot>) =>
  labelPoint("p", 0, {
    shots: [
      labelShot("serve", "p", {
        stroke: "first_serve",
        result: "in",
        contactX: 1,
        contactY: 24,
        landingX: -1,
        landingY: 6,
        videoTime: 1,
      }),
      labelShot("last", "p", {
        stroke: "forehand",
        result: "in",
        contactX: 0,
        contactY: 1,
        landingX: 2,
        landingY: NET + 0.4,
        videoTime: 2,
        ...last,
      }),
    ],
  });

test.describe("lastBallNearNet", () => {
  test("a last rally ball called in, down within a metre past the net, is asked", () => {
    expect(NEAR_NET_M).toBe(1);
    expect(lastBallNearNet(endingOn({}), true)).toEqual({
      code: "net_by_trajectory",
      tier: "hint",
      scope: "point",
      params: { by: "landing" },
    });
    // From the far end the same: past the net is toward the near baseline.
    expect(
      lastBallNearNet(endingOn({ contactY: 23, landingY: NET - 0.6 }), true)
        ?.code,
    ).toBe("net_by_trajectory");
  });

  test("not a deeper ball, one on the hitter's own side, a miss, a call the labeller made, or a serve", () => {
    for (const last of [
      { landingY: NET + 1.2 },
      // Did not clear: the landing already reads Net.
      { landingY: NET - 0.5 },
      { result: "out" as const },
      { result: "net" as const },
      { resultCalled: true },
      { landingX: null, landingY: null },
    ]) {
      expect(lastBallNearNet(endingOn(last), true)).toBeNull();
    }
    const ace = labelPoint("p", 0, {
      shots: [
        labelShot("serve", "p", {
          stroke: "first_serve",
          result: "in",
          contactX: 1,
          contactY: 1,
          landingX: -1,
          landingY: NET + 0.5,
          videoTime: 1,
        }),
      ],
    });
    expect(lastBallNearNet(ace, true)).toBeNull();
  });

  test("its words say why it is asked", () => {
    const hover = markHover(lastBallNearNet(endingOn({}), true)!, {
      p1: "Lee",
      p2: "Vargas",
    });
    expect(hover).toContain("within a metre of the net");
  });
});

test("the row offers Yes, make it net; Y takes the marked suggestion, or adds the shot at an armed slot", () => {
  const mark = readFileSync(
    "src/components/admin/labels/label-black-mark.tsx",
    "utf8",
  );
  expect(mark).toContain("label: MAKE_IT_NET_ACTION,");
  expect(mark).toContain(
    'onPatchShot(lastBallId, { result: "net", result_called: true })',
  );
  expect(
    readFileSync("src/components/admin/labels/label-black-parts.tsx", "utf8"),
  ).toContain('export const ACCEPT_KEY = "Y";');
  const row = readFileSync(
    "src/components/admin/labels/label-black-shot-row.tsx",
    "utf8",
  );
  expect(row).toContain("accepted={hint === accepted}");
  expect(row).toContain("{action === first ? <AcceptKeyChip /> : null}");
  const source = readFileSync(
    "src/components/admin/labels/label-console.tsx",
    "utf8",
  );
  expect(source).toContain("return addShotKey.current();");
  expect(source).toContain(
    "const action = hint ? firstHintAction(hint) : null;",
  );
  expect(source).toContain("? () => acceptKey.current()");
});

test("Y reaches the row between points at the open one, after the point's own suggestions", () => {
  const rail = readFileSync(
    "src/components/admin/labels/label-black-rail.tsx",
    "utf8",
  );
  // The point's own answer and an armed slot come first.
  expect(rail).toContain(
    "if (!editable || expandedPointId === null || armedSlotAfterShotId) {",
  );
  expect(rail).toContain(
    "acceptedHint(pointHints(point, marks, names, edit), point, selectedShotId)",
  );
  // Each row's lead answer, and the key drawn on that row alone.
  for (const kind of [
    "fold",
    "point",
    "overflow",
    "serve-order",
    "court-end",
    "serve-repeat",
    "short",
  ]) {
    expect(rail).toContain(`kind: "${kind}"`);
    expect(rail).toContain(`acceptKey={accepts === "${kind}"}`);
  }
  expect(rail).toContain('operations.onCombinePoints(before.id, "below")');
  const source = readFileSync(
    "src/components/admin/labels/label-console.tsx",
    "utf8",
  );
  expect(source).toContain("const row = acceptRow.current;");
  expect(source).toContain("acceptRowRef={acceptRow}");
});
