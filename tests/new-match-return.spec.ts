import { expect, test } from "@playwright/test";

import {
  askReturnHref,
  classifyNewMatchVisit,
  WIZARD_FROM_ASK_HREF,
  wizardReturnTarget,
} from "@/lib/matches/new-match-visit";

/**
 * The hand-off Ask makes to the wizard (roadmap 6.2): `?return=ask` is read
 * as a return target and nothing else, the way back names the match that was
 * sent, and the parameter never changes what kind of visit the page sees.
 */

test("wizardReturnTarget reads `ask` and nothing else", () => {
  expect(wizardReturnTarget({ return: "ask" })).toBe("ask");
  expect(wizardReturnTarget({ return: "matches" })).toBeNull();
  expect(wizardReturnTarget({ return: "" })).toBeNull();
  expect(wizardReturnTarget({})).toBeNull();
});

test("askReturnHref names the match it sent, or just the page", () => {
  expect(askReturnHref("0b7c9a1e-4f2d-4b8a-9c3e-2d1f5a6b7c8d")).toBe(
    "/dashboard/ask?sent=0b7c9a1e-4f2d-4b8a-9c3e-2d1f5a6b7c8d",
  );
  expect(askReturnHref(null)).toBe("/dashboard/ask");
  // Escaped, so a value that is not an id cannot add a parameter.
  expect(askReturnHref("a&b")).toBe("/dashboard/ask?sent=a%26b");
});

test("the hand-off link is the wizard with the return target, and `return` never changes the visit", () => {
  expect(WIZARD_FROM_ASK_HREF).toBe("/dashboard/matches/new?return=ask");
  expect(classifyNewMatchVisit({ return: "ask" })).toEqual({ kind: "create" });
  expect(
    classifyNewMatchVisit({ return: "ask", source: "swing-vision" }),
  ).toEqual({ kind: "create" });
  expect(classifyNewMatchVisit({ videoFor: "m-1", return: "ask" })).toEqual({
    kind: "attach",
    matchId: "m-1",
    mode: undefined,
  });
});
