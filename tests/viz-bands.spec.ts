import { expect, test } from "@playwright/test";
import {
  bandIndex,
  bandsEqual,
  clampDividers,
  contactBandIndexFromBaselineM,
  COURT_HALF_FT,
  COURT_HALF_M,
  contactBandRows,
  contactReadout,
  DEFAULT_BANDS,
  deepMidShortDescription,
  depthBandIndexFromNetM,
  depthBandRows,
  makeContactBucketer,
  makeDepthBucketer,
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

const DEPTH_INDEX_LABEL = ["deep", "mid", "short"] as const;
const CONTACT_INDEX_LABEL = ["inside", "near", "far"] as const;

/** One ulp above/below `x`, for a "one ulp either side" boundary check. */
function ulpNeighbors(x: number): [number, number] {
  return [
    x - Number.EPSILON * Math.abs(x || 1),
    x + Number.EPSILON * Math.abs(x || 1),
  ];
}

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

// ---------------------------------------------------------------------------
// Boundary equivalence — the core of this task. Proves that, with
// DEFAULT_BANDS (thirds / contact [0,5]), every value the OLD `<`-based
// functions bucket is bucketed IDENTICALLY (bit-for-bit, metres throughout,
// no rounding crutch) by the exported `depthBandIndexFromNetM` /
// `contactBandIndexFromBaselineM` — including both exact dividers, in both
// directions, one ulp either side, and including the mirrored inequality
// the from-baseline conversion introduces for DEPTH (but NOT for CONTACT,
// whose own depthM is already baseline-origin).
// ---------------------------------------------------------------------------

test.describe("boundary equivalence — depth placement (net-origin, mirrored)", () => {
  const cases = [
    0,
    0.5,
    ...ulpNeighbors(DEPTH_THIRD_M),
    DEPTH_THIRD_M, // exact lower divider
    ...ulpNeighbors(2 * DEPTH_THIRD_M),
    2 * DEPTH_THIRD_M, // exact upper divider
    REAL_NET_Y,
  ];

  for (const depthM of cases) {
    test(`depthM=${depthM} matches the old bucket bit-for-bit`, () => {
      const oldLabel = oldDepthKeyPlacement(depthM);
      const newIdx = depthBandIndexFromNetM(depthM, DEFAULT_BANDS);
      expect(DEPTH_INDEX_LABEL[newIdx]).toBe(oldLabel);
    });
  }

  test("naive direct composition (no mirror) gets the exact dividers WRONG — kept as documentation of the trap this task exists to catch", () => {
    const baselineDividers = resolveDepthDividersFt(DEFAULT_BANDS); // ascending, baseline-origin
    // The net-origin → baseline-feet conversion, done inline: it is exactly
    // the composition this test documents as the trap.
    const naiveIdx = (depthM: number) =>
      bandIndex((COURT_HALF_M - depthM) / 0.3048, baselineDividers);

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
  const cases = [
    -3,
    -0.01,
    0, // exact lower divider
    0.01,
    ...ulpNeighbors(FIVE_FEET_M),
    FIVE_FEET_M, // exact upper divider (5 ft = 1.524 m)
    10,
  ];

  for (const depthM of cases) {
    test(`depthM=${depthM} matches the old bucket bit-for-bit`, () => {
      const oldLabel = oldContactDepthKey(depthM);
      const newIdx = contactBandIndexFromBaselineM(depthM, DEFAULT_BANDS);
      expect(CONTACT_INDEX_LABEL[newIdx]).toBe(oldLabel);
    });
  }
});

// ---------------------------------------------------------------------------

/**
 * Fix round 2 (#3): `makeDepthBucketer`/`makeContactBucketer` hoist the
 * divider resolution out of a caller's loop; `depthBandIndexFromNetM`/
 * `contactBandIndexFromBaselineM` become thin one-off wrappers over them.
 * Both paths must agree bit-for-bit for every case the regression suites
 * above already cover — a bucketer built once and called many times must
 * never answer differently than building fresh per call.
 */
test.describe("makeDepthBucketer / makeContactBucketer", () => {
  test("makeDepthBucketer agrees with depthBandIndexFromNetM across every depth scheme and boundary case", () => {
    const schemes: BandSettings[] = [
      DEFAULT_BANDS,
      { ...DEFAULT_BANDS, depthScheme: "deepMidShort" },
      { ...DEFAULT_BANDS, depthScheme: "inside" },
      { ...DEFAULT_BANDS, depthScheme: "none" },
      {
        depthScheme: "custom",
        depthDividersFt: [6, 20],
        contactDividersFt: [0, 5],
      },
    ];
    const probes = [0, 1, DEPTH_THIRD_M, 2 * DEPTH_THIRD_M, 5, 10, REAL_NET_Y];
    for (const bands of schemes) {
      const bucket = makeDepthBucketer(bands);
      for (const depthM of probes) {
        expect(bucket(depthM)).toBe(depthBandIndexFromNetM(depthM, bands));
      }
    }
  });

  test("makeContactBucketer agrees with contactBandIndexFromBaselineM across every boundary case", () => {
    const schemes: BandSettings[] = [
      DEFAULT_BANDS,
      { ...DEFAULT_BANDS, contactDividersFt: [2, 8] },
    ];
    const probes = [-3, -0.5, 0, 1, FIVE_FEET_M, 3, 10];
    for (const bands of schemes) {
      const bucket = makeContactBucketer(bands);
      for (const depthM of probes) {
        expect(bucket(depthM)).toBe(
          contactBandIndexFromBaselineM(depthM, bands),
        );
      }
    }
  });
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

  // Stage 2C: switching the workspace's unit to metres must never move which
  // bucket a landing falls into (`fromFt`/`toFt` — what `makeDepthBucketer`
  // reads — stay in feet regardless of `unit`) — only the DISPLAYED range
  // follows the preference. Labels stay "Deep"/"Mid"/"Short"; only
  // `rangeLabel` picks up the unit, one decimal, trailing ".0" dropped
  // (13 ft → 3.9624 m → "4 m", not "3.96 m" or "4.0 m").
  test("thirds in metres: same buckets, ranges follow the preference", () => {
    const ft = depthBandRows(DEFAULT_BANDS, "ft");
    const m = depthBandRows(DEFAULT_BANDS, "m");
    expect(m.map((r) => r.label)).toEqual(["Deep", "Mid", "Short"]);
    expect(m[0].rangeLabel).toBe("0–4 m");
    expect(m[1].rangeLabel).toBe("4–7.9 m");
    expect(m[2].rangeLabel).toBe("7.9–11.9 m");
    // The stored/bucketing bounds (feet) never change with `unit`.
    expect(m.map((r) => [r.fromFt, r.toFt])).toEqual(
      ft.map((r) => [r.fromFt, r.toFt]),
    );
  });

  test("inside gives two rows IN INDEX ORDER against depthBandIndexFromNetM", () => {
    const bands: BandSettings = { ...DEFAULT_BANDS, depthScheme: "inside" };
    const rows = depthBandRows(bands, "ft");
    expect(rows.map((r) => r.label)).toEqual([
      "Beyond the baseline",
      "Inside the baseline",
    ]);
    // No degenerate "0-0 ft" — "Beyond" carries no LOWER bound (it's open
    // past the baseline, i.e. every baseline-origin ft value <= 0).
    expect(rows[0].fromFt).toBeNull();
    expect(rows[1].rangeLabel).toBe("0–39 ft");

    // A landing essentially anywhere inside the court indexes to row 1
    // ("Inside the baseline"); only a landing at/past the far baseline
    // itself indexes to row 0 ("Beyond the baseline") — proving the row
    // array's order actually matches the index the bucketing function hands
    // back, not just a plausible-looking order.
    expect(depthBandIndexFromNetM(6, bands)).toBe(1);
    expect(depthBandIndexFromNetM(COURT_HALF_M, bands)).toBe(0);
  });

  // Fix round 2 (#1): both rows share the SAME baseline-origin feet space
  // (0 = the baseline, `COURT_HALF_FT` = the net) — "Beyond the baseline"
  // is everything AT OR PAST the baseline itself in that space (<= 0, open
  // below), never anchored at `COURT_HALF_FT` (the net, not the baseline —
  // the bug this fix corrects). "Inside the baseline" is the ordinary
  // `[0, COURT_HALF_FT]` range every other row here already uses.
  test("inside: fromFt/toFt are in baseline-origin feet, not net-origin", () => {
    const bands: BandSettings = { ...DEFAULT_BANDS, depthScheme: "inside" };
    const rows = depthBandRows(bands, "ft");
    const beyond = rows.find((r) => r.key === "beyond-baseline")!;
    const inside = rows.find((r) => r.key === "inside-baseline")!;
    expect(beyond.fromFt).toBeNull();
    expect(beyond.toFt).toBe(0);
    expect(inside.fromFt).toBe(0);
    expect(inside.toFt).toBe(COURT_HALF_FT);
  });

  test("a 3-band scheme resolving fewer than 2 dividers returns [] rather than NaN rows (fix round 2 #6)", () => {
    const malformed: BandSettings = {
      depthScheme: "custom",
      depthDividersFt: null,
      contactDividersFt: [0, 5],
    };
    expect(depthBandRows(malformed, "ft")).toEqual([]);
  });
});

test.describe("contactBandRows", () => {
  test("defaults render the exact legacy rows (unchanged)", () => {
    const rows = contactBandRows(DEFAULT_BANDS, "ft");
    expect(rows.map((r) => r.label)).toEqual([
      "Inside the baseline",
      "0–5 ft behind",
      "5 ft+ behind",
    ]);
  });

  // Stage 2C: the design's own worked example — DEFAULT_BANDS in metres.
  // 5 ft is EXACTLY 1.524 m (`FT_PER_M` is the exact conversion), which
  // rounds to one decimal as "1.5 m" — never "1.524 m".
  test("defaults in metres: '1.5 m', never '1.524 m'", () => {
    const rows = contactBandRows(DEFAULT_BANDS, "m");
    expect(rows.map((r) => r.label)).toEqual([
      "Inside the baseline",
      "0–1.5 m behind",
      "1.5 m+ behind",
    ]);
  });

  test("[2, 5]: first divider positive -> 'behind or closer', not 'inside'", () => {
    const rows = contactBandRows(
      { ...DEFAULT_BANDS, contactDividersFt: [2, 5] },
      "ft",
    );
    expect(rows.map((r) => r.label)).toEqual([
      "2 ft behind or closer",
      "2–5 ft behind",
      "5 ft+ behind",
    ]);
  });

  test("[-6, -2]: wholly-inside bounded band is ASCENDING magnitude, and the open last band reads 'or further back'", () => {
    const rows = contactBandRows(
      { ...DEFAULT_BANDS, contactDividersFt: [-6, -2] },
      "ft",
    );
    expect(rows.map((r) => r.label)).toEqual([
      "6 ft inside or deeper",
      "2–6 ft inside",
      "2 ft inside or further back",
    ]);
  });

  test("[-1.5, 2]: spans the baseline, bounded", () => {
    const rows = contactBandRows(
      { ...DEFAULT_BANDS, contactDividersFt: [-1.5, 2] },
      "ft",
    );
    expect(rows.map((r) => r.label)).toEqual([
      "1.5 ft inside or deeper",
      "1.5 ft inside → 2 ft behind",
      "2 ft+ behind",
    ]);
  });

  test("never prints Infinity, NaN, undefined, or a descending range — grid over valid pairs, both units", () => {
    const pairs: [number, number][] = [
      [0, 5],
      [2, 5],
      [-6, -2],
      [-1.5, 2],
      [-39, 30],
      [-39, -38],
      [29, 30],
      [0, 0.5],
      [-0.5, 0],
    ];
    const badTokens = ["Infinity", "NaN", "undefined"];
    for (const contactDividersFt of pairs) {
      for (const unit of ["ft", "m"] as const) {
        const rows = contactBandRows(
          { ...DEFAULT_BANDS, contactDividersFt },
          unit,
        );
        for (const row of rows) {
          for (const token of badTokens) {
            expect(row.label).not.toContain(token);
            expect(row.rangeLabel).not.toContain(token);
          }
          // A "X-Y" range embedded in the label must read ascending.
          const rangeMatch = row.label.match(/^([\d.]+)–([\d.]+) /);
          if (rangeMatch) {
            expect(Number(rangeMatch[1])).toBeLessThanOrEqual(
              Number(rangeMatch[2]),
            );
          }
        }
      }
    }
  });
});

test.describe("contactReadout", () => {
  test("inside", () =>
    expect(contactReadout("ft", -2.5)).toBe("2.5 ft inside"));
  test("at the line", () =>
    expect(contactReadout("ft", 0)).toBe("at the line"));
  test("behind", () => expect(contactReadout("ft", 3)).toBe("3 ft behind"));

  // Stage 2C.
  test("inside, metres", () =>
    expect(contactReadout("m", -5)).toBe("1.5 m inside"));
  test("at the line, metres", () =>
    expect(contactReadout("m", 0)).toBe("at the line"));
  test("behind, metres", () =>
    expect(contactReadout("m", 3 * FT_PER_M)).toBe("3 m behind"));
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
  test("the moved (lower) divider keeps its dragged position; the other is pushed up to keep the gap", () => {
    expect(clampDividers([9, 10], 0, [0, 39], 2)).toEqual([9, 11]);
  });

  test("leaves the pair alone when the gap is already large enough", () => {
    expect(clampDividers([5, 10], 0, [0, 39], 2)).toEqual([5, 10]);
  });

  test("the moved (upper) divider keeps its dragged position; the other is pushed down to keep the gap", () => {
    expect(clampDividers([5, 6], 1, [0, 39], 2)).toEqual([4, 6]);
  });

  test("clamps to the outer bounds", () => {
    expect(clampDividers([-5, 10], 0, [0, 39], 2)).toEqual([0, 10]);
    expect(clampDividers([5, 50], 1, [0, 39], 2)).toEqual([5, 39]);
  });

  test("[0, 0.5] moved 0 minGap 2: the moved divider stays; the other is pushed to keep the gap", () => {
    expect(clampDividers([0, 0.5], 0, [0, 39], 2)).toEqual([0, 2]);
  });

  test("when the pair cannot fit, the MOVED divider stops (lower edge)", () => {
    // Dragging the lower divider (a) up to 2.9 inside [0, 3] with a 2 ft gap
    // would need b >= 4.9, past bounds — b clamps to hi (3), and a gives
    // ground to the position that still leaves room: hi - minGapFt = 1.
    expect(clampDividers([2.9, 3], 0, [0, 3], 2)).toEqual([1, 3]);
  });

  test("when the pair cannot fit, the MOVED divider stops (upper edge)", () => {
    // Dragging the upper divider (b) down to 0.1 inside [0, 3] with a 2 ft
    // gap would need a <= -1.9, past bounds — a clamps to lo (0), and b
    // gives ground to lo + minGapFt = 2.
    expect(clampDividers([0, 0.1], 1, [0, 3], 2)).toEqual([0, 2]);
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

  // ── fix round 1, #5: round to 2dp (half-up) BEFORE validating ──────────

  test("38.999 rounds to 39.00 and is THEN rejected (not accepted as 38.999)", () => {
    expect(
      validateBandInput({
        depthScheme: "custom",
        depthDividersFt: [10, 38.999],
        contactDividersFt: [0, 5],
      }),
    ).toBeNull();
  });

  test("[1.001, 1.002] both round to 1.00 and collapse into a non-ascending pair", () => {
    expect(
      validateBandInput({
        depthScheme: "custom",
        depthDividersFt: [1.001, 1.002],
        contactDividersFt: [0, 5],
      }),
    ).toBeNull();
  });

  test("12.345 rounds half-up to 12.35, and the ROUNDED value is what's returned", () => {
    const result = validateBandInput({
      depthScheme: "custom",
      depthDividersFt: [5, 12.345],
      contactDividersFt: [0, 5],
    });
    expect(result?.depthDividersFt).toEqual([5, 12.35]);
  });

  test("rejects NaN, Infinity, strings, and the wrong array length", () => {
    expect(
      validateBandInput({
        depthScheme: "thirds",
        depthDividersFt: null,
        contactDividersFt: [NaN, 5],
      }),
    ).toBeNull();
    expect(
      validateBandInput({
        depthScheme: "thirds",
        depthDividersFt: null,
        contactDividersFt: [0, Infinity],
      }),
    ).toBeNull();
    expect(
      validateBandInput({
        depthScheme: "thirds",
        depthDividersFt: null,
        contactDividersFt: ["0", "5"],
      }),
    ).toBeNull();
    expect(
      validateBandInput({
        depthScheme: "thirds",
        depthDividersFt: null,
        contactDividersFt: [0, 5, 10],
      }),
    ).toBeNull();
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

test.describe("deepMidShortDescription", () => {
  test("feet: the menu's own copy, unchanged", () => {
    expect(deepMidShortDescription("ft")).toBe(
      "Coach default — 10 ft, 14 ft, then the rest",
    );
  });

  test("metres: the same bands, in the viewer's unit", () => {
    expect(deepMidShortDescription("m")).toBe(
      "Coach default — 3 m, 4.3 m, then the rest",
    );
  });
});
