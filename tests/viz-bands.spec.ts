import { expect, test } from "@playwright/test";
import {
  bandIndex,
  bandsEqual,
  clampDividers,
  COURT_HALF_FT,
  COURT_HALF_M,
  contactBandRows,
  contactReadout,
  DEFAULT_BANDS,
  depthBandRows,
  depthFromBaselineFt,
  resolveDepthDividersFt,
  rowToBandSettings,
  schemeLabel,
  validateBandInput,
  type BandSettings,
} from "@/lib/data/viz-bands";
import { FT_PER_M } from "@/lib/format/distance";

// ---------------------------------------------------------------------------
// Regression fixtures: today's `viz-model.ts` bucketing, copied verbatim so
// this spec pins the exact old behaviour independent of that file changing
// under it later (Task 2 rewires `viz-model.ts` to use this module; this
// spec must keep failing/passing on its OWN copy of the old logic).
// ---------------------------------------------------------------------------

const REAL_NET_Y = COURT_HALF_M; // 11.885 — same constant, named as viz-model.ts names it
const DEPTH_THIRD_M = REAL_NET_Y / 3;
const FIVE_FEET_M = 1.524;

function oldDepthKeyPlacement(depthM: number): "deep" | "mid" | "short" {
  if (depthM < DEPTH_THIRD_M) return "short";
  if (depthM < 2 * DEPTH_THIRD_M) return "mid";
  return "deep";
}

function oldContactDepthKey(depthM: number): "inside" | "near" | "far" {
  if (depthM < 0) return "inside";
  if (depthM < FIVE_FEET_M) return "near";
  return "far";
}

/**
 * The correct depth bucketing, composed from this module's pieces per the
 * mirror documented on `bandIndex`/`depthFromBaselineFt`: bucket the
 * NET-origin value directly against NET-oriented dividers (mirrored from the
 * baseline-oriented ones `resolveDepthDividersFt` returns), then flip the
 * resulting index so band 0 is still "deep" (nearest baseline).
 */
function depthIndexFromNetM(depthM: number, bands: BandSettings): number {
  const baselineDividers = resolveDepthDividersFt(bands);
  if (baselineDividers.length === 0) return 0;
  const netDividers = baselineDividers
    .map((d) => COURT_HALF_FT - d)
    .sort((a, b) => a - b);
  const netIdx = bandIndex(depthM * FT_PER_M, netDividers);
  return baselineDividers.length - netIdx;
}

const DEPTH_INDEX_LABEL = ["deep", "mid", "short"] as const;

// ---------------------------------------------------------------------------

test.describe("resolveDepthDividersFt", () => {
  test("none has no dividers", () => {
    expect(
      resolveDepthDividersFt({ ...DEFAULT_BANDS, depthScheme: "none" }),
    ).toEqual([]);
  });

  test("thirds are exact thirds of COURT_HALF_FT", () => {
    const [a, b] = resolveDepthDividersFt(DEFAULT_BANDS);
    expect(a).toBeCloseTo(COURT_HALF_FT / 3, 10);
    expect(b).toBeCloseTo((2 * COURT_HALF_FT) / 3, 10);
  });

  test("deepMidShort is the fixed 10/24 coach preset", () => {
    expect(
      resolveDepthDividersFt({ ...DEFAULT_BANDS, depthScheme: "deepMidShort" }),
    ).toEqual([10, 24]);
  });

  test("inside is a single divider at 0", () => {
    expect(
      resolveDepthDividersFt({ ...DEFAULT_BANDS, depthScheme: "inside" }),
    ).toEqual([0]);
  });

  test("custom returns its own pair", () => {
    expect(
      resolveDepthDividersFt({
        depthScheme: "custom",
        depthDividersFt: [8, 20],
        contactDividersFt: [0, 5],
      }),
    ).toEqual([8, 20]);
  });

  test("custom with no dividers resolves to none", () => {
    expect(
      resolveDepthDividersFt({
        depthScheme: "custom",
        depthDividersFt: null,
        contactDividersFt: [0, 5],
      }),
    ).toEqual([]);
  });
});

test.describe("bandIndex", () => {
  test("value below the first divider is band 0", () => {
    expect(bandIndex(5, [10, 20])).toBe(0);
  });

  test("value === divider belongs to the band AFTER it", () => {
    expect(bandIndex(10, [10, 20])).toBe(1);
    expect(bandIndex(20, [10, 20])).toBe(2);
  });

  test("value strictly between dividers", () => {
    expect(bandIndex(15, [10, 20])).toBe(1);
  });

  test("value above the last divider", () => {
    expect(bandIndex(25, [10, 20])).toBe(2);
  });

  test("no dividers is always band 0", () => {
    expect(bandIndex(999, [])).toBe(0);
  });
});

test.describe("depthFromBaselineFt", () => {
  test("at the net (depthM = 0) is COURT_HALF_FT from the baseline", () => {
    expect(depthFromBaselineFt(0)).toBeCloseTo(COURT_HALF_FT, 10);
  });

  test("at the baseline (depthM = COURT_HALF_M) is 0 ft from the baseline", () => {
    expect(depthFromBaselineFt(COURT_HALF_M)).toBeCloseTo(0, 10);
  });

  test("order-reversing: a larger depthM (closer to the baseline) yields a smaller ft value", () => {
    expect(depthFromBaselineFt(2)).toBeGreaterThan(depthFromBaselineFt(8));
  });
});

// ---------------------------------------------------------------------------
// Boundary equivalence — the core of this task. Proves that, with
// DEFAULT_BANDS (thirds / contact [0,5]), every value the OLD `<`-based
// functions bucket is bucketed identically by this module's pieces —
// including both exact dividers, in both directions, and including the
// mirrored inequality the from-baseline conversion introduces for DEPTH
// (but NOT for CONTACT, whose own depthM is already baseline-origin).
// ---------------------------------------------------------------------------

test.describe("boundary equivalence — depth placement (net-origin, mirrored)", () => {
  const cases = [
    0,
    0.5,
    DEPTH_THIRD_M - 0.01,
    DEPTH_THIRD_M, // exact lower divider
    DEPTH_THIRD_M + 0.01,
    2 * DEPTH_THIRD_M - 0.01,
    2 * DEPTH_THIRD_M, // exact upper divider
    2 * DEPTH_THIRD_M + 0.01,
    REAL_NET_Y,
  ];

  for (const depthM of cases) {
    test(`depthM=${depthM} matches the old bucket`, () => {
      const oldLabel = oldDepthKeyPlacement(depthM);
      const newIdx = depthIndexFromNetM(depthM, DEFAULT_BANDS);
      expect(DEPTH_INDEX_LABEL[newIdx]).toBe(oldLabel);
    });
  }

  test("naive direct composition (no mirror) gets the exact dividers WRONG — the trap this task exists to catch", () => {
    const baselineDividers = resolveDepthDividersFt(DEFAULT_BANDS); // ascending, baseline-origin
    const naiveIdx = (depthM: number) =>
      bandIndex(depthFromBaselineFt(depthM), baselineDividers);

    // At depthM === DEPTH_THIRD_M the old code returns "mid" (index 1), but
    // naive composition returns index 2 ("short") — the mirror is real.
    expect(oldDepthKeyPlacement(DEPTH_THIRD_M)).toBe("mid");
    expect(naiveIdx(DEPTH_THIRD_M)).toBe(2);

    // At depthM === 2*DEPTH_THIRD_M the old code returns "deep" (index 2),
    // but naive composition returns index 1 ("mid").
    expect(oldDepthKeyPlacement(2 * DEPTH_THIRD_M)).toBe("deep");
    expect(naiveIdx(2 * DEPTH_THIRD_M)).toBe(1);
  });
});

test.describe("boundary equivalence — return contact (already baseline-origin, no mirror needed)", () => {
  const CONTACT_INDEX_LABEL = ["inside", "near", "far"] as const;

  function contactIndexFromBaselineM(depthM: number): number {
    // depthM here is ALREADY baseline-origin (negative = inside, positive =
    // behind) — direct ft conversion, no depthFromBaselineFt flip needed.
    // Rounded to 1e-6 ft: `1.524 * FT_PER_M` (multiplying by the precomputed
    // constant) lands a sliver under 5 in IEEE double (4.999999999999999)
    // even though `1.524 / 0.3048` is exactly 5 — the same boundary value
    // computed two mathematically-equal ways disagrees by float noise. A
    // real caller converting a live coordinate would round for display
    // anyway; this proof does the same rather than asserting on raw
    // multiplication noise that says nothing about the bucketing logic.
    const ft = Math.round(depthM * FT_PER_M * 1e6) / 1e6;
    return bandIndex(ft, DEFAULT_BANDS.contactDividersFt);
  }

  const cases = [
    -3,
    -0.01,
    0, // exact lower divider
    0.01,
    FIVE_FEET_M - 0.01,
    FIVE_FEET_M, // exact upper divider (5 ft)
    FIVE_FEET_M + 0.01,
    10,
  ];

  for (const depthM of cases) {
    test(`depthM=${depthM} matches the old bucket`, () => {
      const oldLabel = oldContactDepthKey(depthM);
      const newIdx = contactIndexFromBaselineM(depthM);
      expect(CONTACT_INDEX_LABEL[newIdx]).toBe(oldLabel);
    });
  }
});

// ---------------------------------------------------------------------------

test.describe("depthBandRows", () => {
  test("none is an empty array (the group is omitted, never zero rows rendered)", () => {
    expect(
      depthBandRows({ ...DEFAULT_BANDS, depthScheme: "none" }, "ft"),
    ).toEqual([]);
  });

  test("thirds gives Deep/Mid/Short with rounded display ranges", () => {
    const rows = depthBandRows(DEFAULT_BANDS, "ft");
    expect(rows.map((r) => r.label)).toEqual(["Deep", "Mid", "Short"]);
    expect(rows[0].rangeLabel).toBe("0–13 ft");
    expect(rows[2].rangeLabel).toBe("26–39 ft");
    expect(rows[0].fromFt).toBe(0);
  });

  test("inside gives Inside/Beyond the baseline", () => {
    const rows = depthBandRows(
      { ...DEFAULT_BANDS, depthScheme: "inside" },
      "ft",
    );
    expect(rows.map((r) => r.label)).toEqual([
      "Inside the baseline",
      "Beyond the baseline",
    ]);
  });
});

test.describe("contactBandRows", () => {
  test("defaults render the exact legacy rows", () => {
    const rows = contactBandRows(DEFAULT_BANDS, "ft");
    expect(rows.map((r) => r.label)).toEqual([
      "Inside the baseline",
      "0–5 ft behind",
      "5 ft+ behind",
    ]);
  });

  test("a band wholly inside, unbounded", () => {
    const rows = contactBandRows(
      { ...DEFAULT_BANDS, contactDividersFt: [-6, -3] },
      "ft",
    );
    expect(rows[0].label).toBe("6 ft inside or deeper");
  });

  test("a band wholly inside, bounded", () => {
    const rows = contactBandRows(
      { ...DEFAULT_BANDS, contactDividersFt: [-6, -3] },
      "ft",
    );
    expect(rows[1].label).toBe("6–3 ft inside");
  });

  test("a band spanning the baseline", () => {
    const rows = contactBandRows(
      { ...DEFAULT_BANDS, contactDividersFt: [-4, 6] },
      "ft",
    );
    expect(rows[1].label).toBe("4 ft inside → 6 ft behind");
  });

  test("a bounded behind band", () => {
    const rows = contactBandRows(
      { ...DEFAULT_BANDS, contactDividersFt: [2, 8] },
      "ft",
    );
    expect(rows[1].label).toBe("2–8 ft behind");
  });
});

test.describe("contactReadout", () => {
  test("inside", () =>
    expect(contactReadout("ft", -2.5)).toBe("2.5 ft inside"));
  test("at the line", () =>
    expect(contactReadout("ft", 0)).toBe("at the line"));
  test("behind", () => expect(contactReadout("ft", 3)).toBe("3 ft behind"));
});

test.describe("schemeLabel", () => {
  test("every scheme", () => {
    expect(schemeLabel("none")).toBe("OFF");
    expect(schemeLabel("thirds")).toBe("THIRDS");
    expect(schemeLabel("deepMidShort")).toBe("DEEP·MID·SHORT");
    expect(schemeLabel("inside")).toBe("INSIDE");
    expect(schemeLabel("custom")).toBe("CUSTOM");
  });
});

test.describe("clampDividers", () => {
  test("keeps a minimum gap when the lower divider is dragged up into the upper one", () => {
    expect(clampDividers([9, 10], 0, [0, 39], 2)).toEqual([8, 10]);
  });

  test("leaves the pair alone when the gap is already large enough", () => {
    expect(clampDividers([5, 10], 0, [0, 39], 2)).toEqual([5, 10]);
  });

  test("keeps a minimum gap when the upper divider is moved down", () => {
    expect(clampDividers([5, 6], 1, [0, 39], 2)).toEqual([5, 7]);
  });

  test("clamps to the outer bounds", () => {
    expect(clampDividers([-5, 10], 0, [0, 39], 2)).toEqual([0, 10]);
    expect(clampDividers([5, 50], 1, [0, 39], 2)).toEqual([5, 39]);
  });
});

test.describe("bandsEqual", () => {
  test("equal settings", () => {
    expect(bandsEqual(DEFAULT_BANDS, { ...DEFAULT_BANDS })).toBe(true);
  });

  test("different scheme", () => {
    expect(
      bandsEqual(DEFAULT_BANDS, { ...DEFAULT_BANDS, depthScheme: "none" }),
    ).toBe(false);
  });

  test("different contact dividers", () => {
    expect(
      bandsEqual(DEFAULT_BANDS, {
        ...DEFAULT_BANDS,
        contactDividersFt: [0, 6],
      }),
    ).toBe(false);
  });

  test("null vs non-null depth dividers", () => {
    expect(
      bandsEqual(DEFAULT_BANDS, {
        ...DEFAULT_BANDS,
        depthDividersFt: [8, 20],
      }),
    ).toBe(false);
  });
});

test.describe("validateBandInput", () => {
  test("accepts DEFAULT_BANDS shaped input", () => {
    expect(
      validateBandInput({
        depthScheme: "thirds",
        depthDividersFt: null,
        contactDividersFt: [0, 5],
      }),
    ).toEqual(DEFAULT_BANDS);
  });

  test("rejects an unknown scheme", () => {
    expect(
      validateBandInput({
        depthScheme: "bogus",
        depthDividersFt: null,
        contactDividersFt: [0, 5],
      }),
    ).toBeNull();
  });

  test("rejects custom with no depth dividers", () => {
    expect(
      validateBandInput({
        depthScheme: "custom",
        depthDividersFt: null,
        contactDividersFt: [0, 5],
      }),
    ).toBeNull();
  });

  test("rejects a descending depth pair", () => {
    expect(
      validateBandInput({
        depthScheme: "custom",
        depthDividersFt: [20, 8],
        contactDividersFt: [0, 5],
      }),
    ).toBeNull();
  });

  test("rejects a depth divider at or past the table's bounds", () => {
    expect(
      validateBandInput({
        depthScheme: "custom",
        depthDividersFt: [0, 20],
        contactDividersFt: [0, 5],
      }),
    ).toBeNull();
    expect(
      validateBandInput({
        depthScheme: "custom",
        depthDividersFt: [10, 39],
        contactDividersFt: [0, 5],
      }),
    ).toBeNull();
  });

  test("rejects contact dividers outside -39..30 or descending", () => {
    expect(
      validateBandInput({
        depthScheme: "thirds",
        depthDividersFt: null,
        contactDividersFt: [-40, 5],
      }),
    ).toBeNull();
    expect(
      validateBandInput({
        depthScheme: "thirds",
        depthDividersFt: null,
        contactDividersFt: [0, 31],
      }),
    ).toBeNull();
    expect(
      validateBandInput({
        depthScheme: "thirds",
        depthDividersFt: null,
        contactDividersFt: [5, 0],
      }),
    ).toBeNull();
  });

  test("rejects a non-object", () => {
    expect(validateBandInput(null)).toBeNull();
    expect(validateBandInput("nope")).toBeNull();
  });
});

test.describe("rowToBandSettings", () => {
  test("null row -> DEFAULT_BANDS", () => {
    expect(rowToBandSettings(null)).toEqual(DEFAULT_BANDS);
  });

  test("a valid row round-trips", () => {
    expect(
      rowToBandSettings({
        depth_scheme: "custom",
        depth_dividers_ft: [8, 20],
        contact_dividers_ft: [1, 6],
      }),
    ).toEqual({
      depthScheme: "custom",
      depthDividersFt: [8, 20],
      contactDividersFt: [1, 6],
    });
  });

  test("an invalid row falls back to DEFAULT_BANDS rather than surfacing garbage", () => {
    expect(
      rowToBandSettings({
        depth_scheme: "custom",
        depth_dividers_ft: null, // custom requires dividers
        contact_dividers_ft: [0, 5],
      }),
    ).toEqual(DEFAULT_BANDS);
  });
});
