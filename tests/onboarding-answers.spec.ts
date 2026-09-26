import { expect, test } from "@playwright/test";

import {
  ACQUISITION_SOURCES,
  isAcquisitionSource,
  isRecordingSource,
  isRosterSizeBand,
  isWeeklyFilmBand,
  providerForRecordingSource,
} from "@/app/onboarding/answers";

/**
 * The shared onboarding answer vocabulary (screens 1.5, 1.7, 5.2). This spec
 * pins the provider mapping the recording-source answer drives, the guards'
 * rejection of unknown input, and the one coach-vs-player label divergence.
 */

test.describe("providerForRecordingSource", () => {
  test("maps swing-vision to the swing-vision provider", () => {
    expect(providerForRecordingSource("swing-vision")).toBe("swing-vision");
  });

  test("maps video to the splitstep provider", () => {
    expect(providerForRecordingSource("video")).toBe("splitstep");
  });

  test("maps none to null", () => {
    expect(providerForRecordingSource("none")).toBeNull();
  });

  test("maps null to null", () => {
    expect(providerForRecordingSource(null)).toBeNull();
  });

  test("maps undefined to null", () => {
    expect(providerForRecordingSource(undefined)).toBeNull();
  });
});

test.describe("isRecordingSource", () => {
  test("accepts every known value", () => {
    expect(isRecordingSource("swing-vision")).toBe(true);
    expect(isRecordingSource("video")).toBe(true);
    expect(isRecordingSource("none")).toBe(true);
  });

  test("rejects an unknown string", () => {
    expect(isRecordingSource("camcorder")).toBe(false);
  });

  test("rejects an empty string", () => {
    expect(isRecordingSource("")).toBe(false);
  });

  test("rejects a non-string", () => {
    expect(isRecordingSource(undefined)).toBe(false);
    expect(isRecordingSource(null)).toBe(false);
    expect(isRecordingSource(42)).toBe(false);
  });
});

test.describe("isAcquisitionSource", () => {
  test("accepts every known value", () => {
    for (const source of ACQUISITION_SOURCES) {
      expect(isAcquisitionSource(source.value)).toBe(true);
    }
  });

  test("rejects an unknown string", () => {
    expect(isAcquisitionSource("carrier_pigeon")).toBe(false);
  });

  test("rejects an empty string", () => {
    expect(isAcquisitionSource("")).toBe(false);
  });

  test("rejects a non-string", () => {
    expect(isAcquisitionSource(undefined)).toBe(false);
    expect(isAcquisitionSource(null)).toBe(false);
    expect(isAcquisitionSource(7)).toBe(false);
  });
});

test.describe("isRosterSizeBand", () => {
  test("accepts every known band", () => {
    expect(isRosterSizeBand("1-6")).toBe(true);
    expect(isRosterSizeBand("7-10")).toBe(true);
    expect(isRosterSizeBand("11-15")).toBe(true);
    expect(isRosterSizeBand("16+")).toBe(true);
  });

  test("rejects an unknown string", () => {
    expect(isRosterSizeBand("17-20")).toBe(false);
  });

  test("rejects an empty string", () => {
    expect(isRosterSizeBand("")).toBe(false);
  });

  test("rejects a non-string", () => {
    expect(isRosterSizeBand(undefined)).toBe(false);
    expect(isRosterSizeBand(null)).toBe(false);
    expect(isRosterSizeBand(16)).toBe(false);
  });
});

test.describe("isWeeklyFilmBand", () => {
  test("accepts every known band", () => {
    expect(isWeeklyFilmBand("none")).toBe(true);
    expect(isWeeklyFilmBand("1-3")).toBe(true);
    expect(isWeeklyFilmBand("4-10")).toBe(true);
    expect(isWeeklyFilmBand("10+")).toBe(true);
  });

  test("rejects an unknown string", () => {
    expect(isWeeklyFilmBand("11-20")).toBe(false);
  });

  test("rejects an empty string", () => {
    expect(isWeeklyFilmBand("")).toBe(false);
  });

  test("rejects a non-string", () => {
    expect(isWeeklyFilmBand(undefined)).toBe(false);
    expect(isWeeklyFilmBand(null)).toBe(false);
    expect(isWeeklyFilmBand(0)).toBe(false);
  });
});

test.describe("acquisition source labels", () => {
  test("coach_or_teammate is the only entry where the coach label differs from the player label", () => {
    for (const source of ACQUISITION_SOURCES) {
      if (source.value === "coach_or_teammate") {
        expect(source.coachLabel).not.toBe(source.playerLabel);
      } else {
        expect(source.coachLabel).toBe(source.playerLabel);
      }
    }
  });

  test("coach_or_teammate reads 'Another coach or program' for coaches", () => {
    const entry = ACQUISITION_SOURCES.find(
      (source) => source.value === "coach_or_teammate",
    );
    expect(entry?.coachLabel).toBe("Another coach or program");
    expect(entry?.playerLabel).toBe("A coach or teammate");
  });

  test("other reads 'Somewhere else' for both roles", () => {
    const entry = ACQUISITION_SOURCES.find(
      (source) => source.value === "other",
    );
    expect(entry?.playerLabel).toBe("Somewhere else");
    expect(entry?.coachLabel).toBe("Somewhere else");
  });
});
