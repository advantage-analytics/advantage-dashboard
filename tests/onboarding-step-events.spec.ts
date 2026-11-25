import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { AGE_REFUSAL, DOB_ERROR, isAgeRefusal } from "@/app/onboarding/age";
import { stepViewedProps } from "@/app/onboarding/steps";

/**
 * `onboarding_step_viewed` and `onboarding_submit_failed`: where a new user
 * stopped in `/onboarding`, and whether a finishing action refused them.
 * The flow needs Next's server actions and cannot mount offline, so the
 * payload is tested pure and the wiring is pinned at the source.
 */
const FLOW = readFileSync(
  path.join(process.cwd(), "src/app/onboarding/onboarding-flow.tsx"),
  "utf8",
);

test.describe("stepViewedProps", () => {
  test("steps 1 and 2 have a position before a persona, but no total", () => {
    expect(stepViewedProps(1, null)).toEqual({
      step: 1,
      step_number: 1,
      step_count: null,
      persona: null,
    });
    expect(stepViewedProps(2, null)).toEqual({
      step: 2,
      step_number: 2,
      step_count: null,
      persona: null,
    });
  });

  test("the player's run counts by position across the skipped guardian step", () => {
    expect(stepViewedProps(3, "play")).toMatchObject({
      step: 3,
      step_number: 3,
      step_count: 5,
    });
    expect(stepViewedProps(5, "play")).toMatchObject({
      step: 5,
      step_number: 4,
      step_count: 5,
    });
    expect(stepViewedProps(6, "play")).toMatchObject({
      step: 6,
      step_number: 5,
      step_count: 5,
    });
  });

  test("the guardian step is 3 of 3; the coach's run is 2 long", () => {
    expect(stepViewedProps(4, "junior")).toEqual({
      step: 4,
      step_number: 3,
      step_count: 3,
      persona: "junior",
    });
    expect(stepViewedProps(2, "coach")).toMatchObject({
      step_number: 2,
      step_count: 2,
    });
  });

  test("carries the step, its position and the persona — nothing typed", () => {
    expect(Object.keys(stepViewedProps(6, "play")).sort()).toEqual([
      "persona",
      "step",
      "step_count",
      "step_number",
    ]);
  });
});

test.describe("isAgeRefusal", () => {
  test("matches both age-gate refusals and nothing else", () => {
    expect(isAgeRefusal(AGE_REFUSAL.child)).toBe(true);
    expect(isAgeRefusal(AGE_REFUSAL.teen)).toBe(true);
    expect(isAgeRefusal(DOB_ERROR)).toBe(false);
    expect(isAgeRefusal("We couldn't save that. Try again.")).toBe(false);
  });
});

test.describe("onboarding-flow wiring", () => {
  test("every page turn sends onboarding_step_viewed from the step", () => {
    expect(FLOW).toMatch(
      /track\("onboarding_step_viewed", stepViewedProps\(step, personaRef\.current\)\);\s*\}, \[step\]\);/,
    );
  });

  test("every action refusal goes through failSubmit, never setError alone", () => {
    expect(FLOW).not.toContain("setError(result.error)");
    expect(FLOW.match(/failSubmit\(result\.error\)/g)).toHaveLength(4);
  });

  test("a submit failure sends the step and persona only, and skips the age gate", () => {
    const sends = FLOW.match(/track\("onboarding_submit_failed",[^)]*\)/g);
    expect(sends).toEqual([
      'track("onboarding_submit_failed", { step, persona })',
    ]);
    expect(FLOW).toMatch(
      /if \(!isAgeRefusal\(message\)\) \{\s*track\("onboarding_submit_failed"/,
    );
  });
});
