import { expect, test } from "@playwright/test";

import {
  TOURS,
  TOUR_TARGETS,
  firstReportTourEligible,
  resolveSteps,
  setupSteps,
  soloDestination,
  type SetupFacts,
} from "@/lib/onboarding/tours";

/**
 * The first-run tours' pure rules (design §5, §7–§9): the step lists, the
 * missing-target skip, the solo onboarding destination, first-report
 * eligibility and the getting-set-up steps.
 */

test.describe("TOURS", () => {
  for (const tour of ["sample", "first-report"] as const) {
    test(`"${tour}" walks scoreboard, insight, head-to-head, shots, film`, () => {
      expect(TOURS[tour].map((step) => step.target)).toEqual([...TOUR_TARGETS]);
    });

    test(`"${tour}" switches tab only for the shots and film steps`, () => {
      const tabs = Object.fromEntries(
        TOURS[tour].map((step) => [step.target, step.tab]),
      );
      expect(tabs).toEqual({
        scoreboard: undefined,
        insight: undefined,
        "head-to-head": undefined,
        shots: "shots",
        film: "film",
      });
    });

    test(`"${tour}" has a title and a one-sentence body on every step`, () => {
      for (const step of TOURS[tour]) {
        expect(step.title.length).toBeGreaterThan(0);
        expect(step.body).toMatch(/^[A-Z][^.!?]*\.$/);
      }
    });
  }

  test("the first-report copy speaks about the player's own match", () => {
    for (const step of TOURS["first-report"]) {
      expect(`${step.title} ${step.body}`).toMatch(/\byour\b/i);
    }
  });
});

test.describe("resolveSteps", () => {
  test("every target present keeps the whole tour in order", () => {
    expect(resolveSteps("sample", TOUR_TARGETS)).toEqual([...TOURS.sample]);
  });

  test("a dropped target is skipped and the rest keep tour order", () => {
    const steps = resolveSteps("first-report", [
      "shots",
      "scoreboard",
      "head-to-head",
      "insight",
    ]);
    expect(steps.map((step) => step.target)).toEqual([
      "scoreboard",
      "insight",
      "head-to-head",
      "shots",
    ]);
  });

  test("no target present resolves to no steps", () => {
    expect(resolveSteps("sample", [])).toEqual([]);
  });
});

test.describe("soloDestination", () => {
  test("video goes to the upload wizard", () => {
    expect(soloDestination("video")).toBe("/dashboard/matches/new");
  });

  test("SwingVision goes to the wizard with the import pre-selected", () => {
    expect(soloDestination("swing-vision")).toBe(
      "/dashboard/matches/new?source=swing-vision",
    );
  });

  test("not recording yet goes to the sample tour", () => {
    expect(soloDestination("none")).toBe("/dashboard/matches/sample?tour=1");
  });

  test("a skipped recording question goes to the sample tour", () => {
    expect(soloDestination(null)).toBe("/dashboard/matches/sample?tour=1");
  });
});

test.describe("firstReportTourEligible", () => {
  const eligible = {
    workspaceKind: "personal",
    isCreator: true,
    finishedMatchCount: 1,
    doneAt: null,
  } as const;

  test("personal, creator, one finished match, not done: eligible", () => {
    expect(firstReportTourEligible(eligible)).toBe(true);
  });

  test("a team workspace is not eligible", () => {
    expect(
      firstReportTourEligible({ ...eligible, workspaceKind: "team" }),
    ).toBe(false);
  });

  test("a viewer who did not create the match is not eligible", () => {
    expect(firstReportTourEligible({ ...eligible, isCreator: false })).toBe(
      false,
    );
  });

  test("zero or several finished matches are not eligible", () => {
    expect(
      firstReportTourEligible({ ...eligible, finishedMatchCount: 0 }),
    ).toBe(false);
    expect(
      firstReportTourEligible({ ...eligible, finishedMatchCount: 2 }),
    ).toBe(false);
  });

  test("a tour already done is not eligible", () => {
    expect(
      firstReportTourEligible({
        ...eligible,
        doneAt: "2026-10-01T12:00:00Z",
      }),
    ).toBe(false);
  });
});

test.describe("setupSteps", () => {
  const fresh: SetupFacts = {
    sampleTourDoneAt: null,
    firstReportTourDoneAt: null,
    finishedMatchCount: 1,
    playingProfile: false,
    notifications: false,
  };

  const done = (facts: SetupFacts) =>
    Object.fromEntries(setupSteps(facts).map((s) => [s.key, s.done]));

  test("the two tours come first, then profile and preferences", () => {
    const steps = setupSteps(fresh);
    expect(steps.map((s) => s.label)).toEqual([
      "See the sample report",
      "Read your first report",
      "Hand and backhand",
      "How you hear that a report is ready",
    ]);
    expect(steps.map((s) => s.href)).toEqual([
      "/dashboard/matches/sample?tour=1",
      "/dashboard/matches",
      "/dashboard/settings/profile",
      "/dashboard/settings/preferences",
    ]);
    expect(steps.map((s) => s.link)).toEqual([
      "Open sample",
      "Open matches",
      "Open profile",
      "Open preferences",
    ]);
  });

  test("nothing set: nothing done", () => {
    expect(done(fresh)).toEqual({
      sampleTour: false,
      firstReportTour: false,
      playingProfile: false,
      notifications: false,
    });
  });

  test("each tour step is done when its timestamp is set", () => {
    expect(
      done({ ...fresh, sampleTourDoneAt: "2026-10-01T12:00:00Z" }),
    ).toMatchObject({ sampleTour: true, firstReportTour: false });
    expect(
      done({ ...fresh, firstReportTourDoneAt: "2026-10-01T12:00:00Z" }),
    ).toMatchObject({ sampleTour: false, firstReportTour: true });
  });

  test("more than one finished match counts both tours as done", () => {
    expect(done({ ...fresh, finishedMatchCount: 2 })).toEqual({
      sampleTour: true,
      firstReportTour: true,
      playingProfile: false,
      notifications: false,
    });
  });

  test("profile and preferences follow their existing facts", () => {
    expect(
      done({ ...fresh, playingProfile: true, notifications: true }),
    ).toMatchObject({ playingProfile: true, notifications: true });
  });
});
