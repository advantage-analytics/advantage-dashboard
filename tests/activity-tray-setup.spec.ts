import { expect, test } from "@playwright/test";

import {
  personalSetupSteps,
  setupOutstanding,
  teamSetupSteps,
} from "@/components/dashboard/activity/tray-setup";

/**
 * The tray's setup steps as data — which steps a workspace has, where each
 * one goes, and when the section stops rendering.
 */
test.describe("tray setup steps", () => {
  test("personal has two steps, each pointed at its settings page", () => {
    const steps = personalSetupSteps({
      playingProfile: false,
      notifications: true,
    });
    expect(steps.map((step) => [step.key, step.done, step.href])).toEqual([
      ["playingProfile", false, "/dashboard/settings/profile"],
      ["notifications", true, "/dashboard/settings/preferences"],
    ]);
  });

  test("team drops the dual step while the Schedule is closed", () => {
    const facts = { roster: true, schedule: false, match: false };
    expect(teamSetupSteps(facts, false).map((step) => step.key)).toEqual([
      "roster",
      "match",
    ]);
    expect(teamSetupSteps(facts, true).map((step) => step.key)).toEqual([
      "roster",
      "schedule",
      "match",
    ]);
  });

  test("a closed Schedule's missing dual never holds setup open", () => {
    const steps = teamSetupSteps(
      { roster: true, schedule: false, match: true },
      false,
    );
    expect(setupOutstanding(steps)).toBe(false);
  });

  test("one open step keeps the section; none, or no steps, drops it", () => {
    expect(
      setupOutstanding(
        personalSetupSteps({ playingProfile: true, notifications: false }),
      ),
    ).toBe(true);
    expect(
      setupOutstanding(
        personalSetupSteps({ playingProfile: true, notifications: true }),
      ),
    ).toBe(false);
    expect(setupOutstanding([])).toBe(false);
  });
});
