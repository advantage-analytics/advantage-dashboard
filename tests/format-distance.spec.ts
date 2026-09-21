import { expect, test } from "@playwright/test";
import {
  FT_PER_M,
  formatDistance,
  formatRange,
  snapFt,
} from "@/lib/format/distance";

test.describe("FT_PER_M", () => {
  test("is the exact conversion — 5 ft === 1.524 m", () => {
    expect(1.524 * FT_PER_M).toBeCloseTo(5, 10);
    expect(5 / FT_PER_M).toBeCloseTo(1.524, 10);
  });
});

test.describe("formatDistance", () => {
  test("whole numbers have no trailing .0", () => {
    expect(formatDistance("ft", 12)).toBe("12 ft");
  });

  test("half values keep one decimal", () => {
    expect(formatDistance("ft", 2.5)).toBe("2.5 ft");
  });

  test("converts to metres", () => {
    // 5 ft -> exactly 1.524 m
    expect(formatDistance("m", 5)).toBe("1.5 m");
  });

  test("negative values format with a leading minus, no trailing .0", () => {
    expect(formatDistance("ft", -3)).toBe("-3 ft");
  });

  test("zero has no trailing .0 and no stray minus sign", () => {
    expect(formatDistance("ft", 0)).toBe("0 ft");
    expect(formatDistance("ft", -0)).toBe("0 ft");
  });
});

test.describe("formatRange", () => {
  test("en dash, unit written once at the end", () => {
    expect(formatRange("ft", 0, 12)).toBe("0–12 ft");
  });

  test("half-foot bounds", () => {
    expect(formatRange("ft", 13, 26)).toBe("13–26 ft");
  });

  test("metric range", () => {
    expect(formatRange("m", 0, 5)).toBe("0–1.5 m");
  });
});

test.describe("snapFt", () => {
  test("snaps to the nearest half-foot in ft mode", () => {
    expect(snapFt("ft", 12.2)).toBe(12);
    expect(snapFt("ft", 12.26)).toBe(12.5);
    expect(snapFt("ft", 12.74)).toBe(12.5);
    expect(snapFt("ft", 12.76)).toBe(13);
  });

  test("snaps to the nearest half-metre, expressed back in ft, in m mode", () => {
    // 1 m == FT_PER_M ft; snapping 1.1 m should land on 1.0 m exactly.
    const oneMeterInFt = FT_PER_M;
    expect(snapFt("m", oneMeterInFt * 1.1)).toBeCloseTo(oneMeterInFt, 6);
  });
});
