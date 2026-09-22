import { expect, test } from "@playwright/test";

import { profileDayZeroCopy } from "@/lib/ui/profile-day-zero-copy";

/**
 * `profileDayZeroCopy` — the four voices a player profile's day zero is read
 * in, pinned as whole sentences.
 *
 * Pure, so no browser and no dev server, the same as `tests/date-value.spec.ts`.
 * What these pin is the failure the module exists to prevent: a third party's
 * sentence drifting into "their first match", which is a page about a named
 * athlete addressing nobody. Asserting the assembled sentence rather than the
 * three fragments is deliberate — the split is an implementation detail of
 * putting a control mid-sentence, and a space lost at a seam is exactly the
 * kind of break a fragment-by-fragment assertion waves through.
 */

const sentence = (copy: ReturnType<typeof profileDayZeroCopy>) =>
  copy.lead + (copy.link?.label ?? "") + (copy.tail ?? "");

test.describe("the offer, for a reader who can send a match", () => {
  test("the athlete is addressed directly", () => {
    const copy = profileDayZeroCopy({
      isSelf: true,
      firstName: "Maya",
      canUpload: true,
    });
    expect(sentence(copy)).toBe(
      "Your first match fills this page. Send match video from New match, or import a SwingVision export.",
    );
    expect(copy.link).toEqual({ label: "import a SwingVision export" });
  });

  test("staff read the athlete's name, never 'their'", () => {
    const copy = profileDayZeroCopy({
      isSelf: false,
      firstName: "Maya",
      canUpload: true,
    });
    expect(sentence(copy)).toBe(
      "Maya's first match fills this page. Send match video from New match, or import a SwingVision export.",
    );
    expect(copy.link).toEqual({ label: "import a SwingVision export" });
  });
});

test.describe("no offer for a reader who cannot send a match", () => {
  test("the athlete is told who will send it", () => {
    const copy = profileDayZeroCopy({
      isSelf: true,
      firstName: "Maya",
      canUpload: false,
    });
    expect(sentence(copy)).toBe(
      "Your first match fills this page, once your coaching staff send one.",
    );
  });

  test("a teammate reads the name in both halves, never 'they'", () => {
    const copy = profileDayZeroCopy({
      isSelf: false,
      firstName: "Maya",
      canUpload: false,
    });
    expect(sentence(copy)).toBe(
      "Maya's first match fills this page, once Maya or the coaching staff send one.",
    );
  });
});

test("`link` is null exactly when the reader cannot send a match", () => {
  for (const isSelf of [true, false]) {
    expect(
      profileDayZeroCopy({ isSelf, firstName: "Maya", canUpload: true }).link,
      `isSelf ${isSelf}`,
    ).not.toBeNull();
    expect(
      profileDayZeroCopy({ isSelf, firstName: "Maya", canUpload: false }).link,
      `isSelf ${isSelf}`,
    ).toBeNull();
    expect(
      profileDayZeroCopy({ isSelf, firstName: "Maya", canUpload: false }).tail,
      `isSelf ${isSelf}`,
    ).toBeNull();
  }
});

test.describe("the sr-only description does not depend on the offer", () => {
  test("the athlete's own page", () => {
    for (const canUpload of [true, false]) {
      expect(
        profileDayZeroCopy({ isSelf: true, firstName: "Maya", canUpload })
          .description,
        `canUpload ${canUpload}`,
      ).toBe(
        "Once your first match is analysed this page fills with season numbers, every match, results by line, and where first serves land. Nothing below is real data yet.",
      );
    }
  });

  test("somebody else's page", () => {
    for (const canUpload of [true, false]) {
      expect(
        profileDayZeroCopy({ isSelf: false, firstName: "Maya", canUpload })
          .description,
        `canUpload ${canUpload}`,
      ).toBe(
        "Once Maya's first match is analysed this page fills with season numbers, every match, results by line, and where first serves land. Nothing below is real data yet.",
      );
    }
  });
});
