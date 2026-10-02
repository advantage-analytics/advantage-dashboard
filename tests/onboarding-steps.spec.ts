import { expect, test } from "@playwright/test";

import { previousStep, stepLabel } from "@/app/onboarding/steps";

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

test.describe("stepLabel", () => {
  test("steps 1 and 2 carry no total, whatever the persona", () => {
    expect(stepLabel(1, null)).toBe("Step 1");
    expect(stepLabel(2, null)).toBe("Step 2");
    expect(stepLabel(2, "play")).toBe("Step 2");
  });

  test("the player's run counts 3, 4, 5 of 5 across the skipped guardian step", () => {
    expect(stepLabel(3, "play")).toBe("Step 3 of 5");
    expect(stepLabel(5, "play")).toBe("Step 4 of 5");
    expect(stepLabel(6, "play")).toBe("Step 5 of 5");
  });

  test("the guardian step is step 3 of 3", () => {
    expect(stepLabel(4, "junior")).toBe("Step 3 of 3");
  });
});
