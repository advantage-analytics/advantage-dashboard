import { expect, test } from "@playwright/test";
import { analysedInstant } from "@/lib/services/labels/job-groups";

/**
 * The Labels list's "Analysed" time must render the same characters on the
 * server and in every browser, or React throws #418 on hydration. Safari's
 * Intl prints U+202F before "PM" where Node prints a plain space.
 */
test.describe("analysedInstant", () => {
  test("formats a moment in UTC with plain spaces", () => {
    expect(analysedInstant("2026-10-03T14:14:00Z")).toBe(
      "Oct 3, 2026, 2:14 PM UTC",
    );
  });

  test("folds Safari's narrow no-break space to a plain space", () => {
    // `format` is a getter on the prototype, so swap the property itself.
    const proto = Intl.DateTimeFormat.prototype;
    const original = Object.getOwnPropertyDescriptor(proto, "format")!;
    Object.defineProperty(proto, "format", {
      configurable: true,
      // What Safari 26's Intl returns for the same options.
      get: () => () => "Oct 3, 2026, 2:14\u202fPM",
    });
    try {
      expect(analysedInstant("2026-10-03T14:14:00Z")).toBe(
        "Oct 3, 2026, 2:14 PM UTC",
      );
    } finally {
      Object.defineProperty(proto, "format", original);
    }
  });

  test("returns null for a missing or invalid time", () => {
    expect(analysedInstant(null)).toBeNull();
    expect(analysedInstant("not a date")).toBeNull();
  });
});
