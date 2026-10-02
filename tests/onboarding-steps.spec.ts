import { expect, test } from "@playwright/test";

import { previousStep } from "@/app/onboarding/steps";

/**
 * The onboarding flow's Back graph. Both persona branches (college question 3,
 * guardian step 4) return to the persona step, and the player's recording
 * step returns to the college question — 4 is never on the player's run.
 */

test.describe("previousStep", () => {
  test("step 1 (1.2, name) has no previous step", () => {
    expect(previousStep(1)).toBeNull();
  });

  test("step 2 (1.3, persona) goes back to the name", () => {
    expect(previousStep(2)).toBe(1);
  });

  test("step 3 (1.4, college) goes back to the persona", () => {
    expect(previousStep(3)).toBe(2);
  });

  test("step 4 (3.1, guardian) goes back to the persona", () => {
    expect(previousStep(4)).toBe(2);
  });

  test("step 5 (1.5, recording) goes back to the college question", () => {
    expect(previousStep(5)).toBe(3);
  });

  test("step 6 (1.7, heard about) goes back to the recording source", () => {
    expect(previousStep(6)).toBe(5);
  });
});
