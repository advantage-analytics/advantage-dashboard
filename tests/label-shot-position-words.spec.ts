import { expect, test } from "@playwright/test";
import {
  depthWords,
  placementWords,
  positionWords,
} from "../src/components/admin/labels/shot-position-words";

test("depth reads against the nearer baseline, the service box or the net", () => {
  expect(depthWords(-0.65)).toBe("0.65 m behind the near baseline");
  expect(depthWords(24.12)).toBe("0.35 m behind the far baseline");
  expect(depthWords(18.34)).toBe("5.43 m inside the far baseline");
  expect(depthWords(14.1)).toBe("in the far service box, 2.21 m from the net");
  expect(depthWords(3)).toBe("3.00 m inside the near baseline");
});

test("a set position names the spot, how far off centre, and what a click does", () => {
  expect(positionWords("hit", 1.42, -0.65, true)).toEqual({
    label: "Hit 0.65 m behind the near baseline",
    detail: ["1.42 m right of centre", "Click to move it on the court"],
  });
  expect(positionWords("landed", 4.91, 4.86, false)).toEqual({
    label: "Landed 4.86 m inside the near baseline",
    detail: ["4.91 m right of centre, outside the singles line"],
  });
});

test("an unset position says so and how to place it", () => {
  expect(positionWords("landed", null, null, true)).toEqual({
    label: "No landing yet",
    detail: ["Click, then click the court where it bounced"],
  });
  expect(positionWords("hit", null, 3, false)).toEqual({
    label: "No contact point yet",
    detail: [],
  });
});

test("placement gives the bucket and the rule that chose it", () => {
  expect(
    placementWords("Wide", {
      stroke: "first_serve",
      contactX: -0.26,
      landingX: 4.91,
    }),
  ).toEqual({
    label: "Wide serve",
    detail: ["Bounced 4.91 m from the centre line. Wide is past 2.74 m"],
  });
  expect(
    placementWords("Crosscourt", {
      stroke: "forehand",
      contactX: -3,
      landingX: 6.83,
    }),
  ).toEqual({
    label: "Crosscourt",
    detail: [
      "Hit left of centre, landed right",
      "The ball crossed the centre line",
    ],
  });
  expect(
    placementWords("Middle", {
      stroke: "forehand",
      contactX: 1.42,
      landingX: 0.4,
    }).detail,
  ).toEqual([
    "Bounced 0.40 m from the centre line. Anything within 1 m is middle",
  ]);
});
