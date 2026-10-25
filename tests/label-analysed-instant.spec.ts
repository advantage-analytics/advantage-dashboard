import { expect, test } from "@playwright/test";
import { analysedInstant } from "@/lib/services/labels/job-groups";

/**
 * The Labels list's "Analysed" time must render the same characters on the
 * server and in every browser, or React throws #418 on hydration. Safari's
 * Intl can join the date and time with "at" and puts U+202F before "PM",
 * so the label is built from the UTC fields instead.
 */
test.describe("analysedInstant", () => {
  test("formats a moment in UTC with plain spaces", () => {
    expect(analysedInstant("2026-10-03T14:14:00Z")).toBe(
      "Oct 3, 2026, 2:14 PM UTC",
    );
  });

  test("does not depend on the engine's Intl output", () => {
    // `format` is a getter on the prototype, so swap the property itself.
    const proto = Intl.DateTimeFormat.prototype;
    const original = Object.getOwnPropertyDescriptor(proto, "format")!;
    Object.defineProperty(proto, "format", {
      configurable: true,
      // What Safari 26's Intl can return for a date and time: "at" joins
      // them and U+202F sits before "PM".
      get: () => () => "Oct 3, 2026 at 2:14\u202fPM",
    });
    try {
      expect(analysedInstant("2026-10-03T14:14:00Z")).toBe(
        "Oct 3, 2026, 2:14 PM UTC",
      );
    } finally {
      Object.defineProperty(proto, "format", original);
    }
  });

  test("writes midnight and noon as 12", () => {
    expect(analysedInstant("2026-01-09T00:05:00Z")).toBe(
      "Jan 9, 2026, 12:05 AM UTC",
    );
    expect(analysedInstant("2026-12-31T12:00:00Z")).toBe(
      "Dec 31, 2026, 12:00 PM UTC",
    );
  });

  test("returns null for a missing or invalid time", () => {
    expect(analysedInstant(null)).toBeNull();
    expect(analysedInstant("not a date")).toBeNull();
  });
});
