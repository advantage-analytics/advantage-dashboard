/**
 * Depth/contact band logic for the Visualizations tab (Phase 2B) — ONE
 * `BandSettings` record per workspace, applied to every return chart. Pure —
 * no React, no Supabase; the loader (`viz-bands-server.ts`) and the action
 * (`viz-bands-actions.ts`) build on top of this module.
 *
 * ## The from-baseline / from-net mirror
 *
 * Today's stats (`viz-model.ts`) bucket return-placement DEPTH from the
 * NET (`depthM`, 0 = net, `REAL_NET_Y` ≈ 11.885 m = the baseline) and
 * return-CONTACT depth from the BASELINE (`depthM`, 0 = baseline, negative =
 * inside the court, positive = behind it) — two different origins for a
 * value that both happen to be called `depthM`.
 *
 * This module's dividers are all expressed from the BASELINE, in feet,
 * because that is how the bands are displayed and edited ("0 ft" reads as
 * "at the baseline" everywhere in the UI). `depthFromBaselineFt` converts a
 * NET-origin metres value into that space: `(COURT_HALF_M − m) * FT_PER_M`.
 *
 * That conversion is ORDER-REVERSING: as `depthM` (from net) increases
 * toward the baseline, `depthFromBaselineFt` DECREASES toward 0. So a
 * boundary rule that reads as "value === divider belongs to the band with
 * the HIGHER depthM" (today's `depthKeyPlacement`, using `<`) becomes, once
 * converted, "value === divider belongs to the band with the LOWER
 * from-baseline value" — the opposite of `bandIndex`'s own documented
 * convention ("value === divider belongs to the band AFTER it", i.e. the
 * higher-index / higher-value band). A caller that naively feeds
 * `depthFromBaselineFt(depthM)` straight into `bandIndex` with ascending
 * baseline-oriented dividers gets today's boundary bucket WRONG at both
 * dividers — proven in `tests/viz-bands.spec.ts`.
 *
 * `contactDepthKey`, by contrast, already measures from the baseline (its
 * own `depthM` is signed from the returner's baseline), so composing
 * `bandIndex` with the baseline-oriented `contactDividersFt` agrees with it
 * directly — no mirror needed. Only DEPTH placement needs the flip.
 *
 * The flip itself belongs to whichever caller buckets a live `depthM` value
 * (Phase 2B Task 2's `viz-model.ts` rewiring) — this module only builds and
 * proves the pieces `bandIndex`/`depthFromBaselineFt`/`resolveDepthDividersFt`
 * a correct caller composes. The general pattern, mirroring around the
 * dividers' own axis: bucket the NET-origin value directly against
 * NET-oriented dividers (`COURT_HALF_FT − d` for each baseline divider `d`,
 * re-sorted ascending), then flip the resulting index:
 * `numBands - 1 - bandIndex(depthM * FT_PER_M, netOrientedDividers)`.
 */

import {
  FT_PER_M,
  formatDistanceValue,
  formatRange,
  type DistanceUnit,
} from "@/lib/format/distance";

export type DepthScheme =
  "none" | "thirds" | "deepMidShort" | "inside" | "custom";

export interface BandSettings {
  depthScheme: DepthScheme;
  depthDividersFt: [number, number] | null;
  contactDividersFt: [number, number];
}

/** DB row shape (`viz_band_settings`), snake_case as PostgREST returns it. */
export interface BandSettingsDbRow {
  depth_scheme: string;
  depth_dividers_ft: [number, number] | null;
  contact_dividers_ft: [number, number];
}

/** Net-to-baseline distance — the same value `viz-model.ts`'s `REAL_NET_Y`
 *  and `court-geometry.ts` use for the real court. */
export const COURT_HALF_M = 11.885;

/** `COURT_HALF_M` in feet, computed (not rounded) — ≈38.993. The migration's
 *  own CHECK constraints use the literal `39`; `validateBandInput` mirrors
 *  those literals directly rather than this computed value, since the two
 *  are independent contracts that happen to be close. */
export const COURT_HALF_FT = COURT_HALF_M * FT_PER_M;

/** No row in `viz_band_settings` = these — thirds, no custom depth
 *  dividers, contact split at the baseline and 5 ft behind it. Matches
 *  today's `DEPTH_THIRD_M`/`FIVE_FEET_M` bucketing exactly. */
export const DEFAULT_BANDS: BandSettings = {
  depthScheme: "thirds",
  depthDividersFt: null,
  contactDividersFt: [0, 5],
};

/** A NET-origin depth (metres, 0 = net, `COURT_HALF_M` = baseline) converted
 *  to a BASELINE-origin depth in feet (0 = baseline, `COURT_HALF_FT` = net).
 *  See the module doc comment: this conversion is order-reversing. */
export function depthFromBaselineFt(depthFromNetM: number): number {
  return (COURT_HALF_M - depthFromNetM) * FT_PER_M;
}

/** Coach-default preset: near, roughly 10 ft and 14 ft past that (24 ft from
 *  the baseline), not derived from `COURT_HALF_FT` — a fixed, named preset
 *  rather than a fraction of the court. */
const DEEP_MID_SHORT_DIVIDERS: [number, number] = [10, 24];

/** `resolveDepthDividersFt`'s dividers, ascending, baseline-origin feet.
 *  `bandIndex(valueFt, dividers)` then buckets a baseline-origin ft value
 *  against them directly (band 0 = nearest the baseline = deepest). */
export function resolveDepthDividersFt(b: BandSettings): number[] {
  switch (b.depthScheme) {
    case "none":
      return [];
    case "thirds":
      return [COURT_HALF_FT / 3, (2 * COURT_HALF_FT) / 3];
    case "deepMidShort":
      return [...DEEP_MID_SHORT_DIVIDERS];
    case "inside":
      return [0];
    case "custom":
      return b.depthDividersFt ? [...b.depthDividersFt] : [];
  }
}

/**
 * 0-based band index for `valueFt` against ascending `dividers`: band 0 is
 * everything below `dividers[0]`, band `i` is `[dividers[i-1], dividers[i])`,
 * and the last band is everything at or above the final divider.
 *
 * `value === divider` belongs to the band AFTER it (the higher-index band) —
 * see the module doc comment for why a DEPTH caller (whose live value is
 * NET-origin) must mirror around this convention rather than feed it
 * straight through, while a CONTACT caller (already baseline-origin) can
 * call this directly.
 */
export function bandIndex(valueFt: number, dividers: number[]): number {
  let idx = 0;
  for (const divider of dividers) {
    if (valueFt >= divider) idx++;
  }
  return idx;
}

// ---------------------------------------------------------------------------
// Fix round 1: metre-native bucketing.
//
// `bandIndex` above works in whatever unit its caller passes — Task 2's own
// `viz-model.ts` composes it with feet dividers converted through
// `FT_PER_M`. These two functions are an ADDITIONAL, metre-native path: they
// take a live `depthM` (as `viz-model.ts`'s dots already carry it) and a
// `BandSettings`, and bucket it using EXACTLY the inequalities today's
// (pre-Phase-2B) `depthKeyPlacement`/`contactDepthKey` use, computed in
// metres throughout — never round-tripping through feet — so the default
// (`thirds` / `[0, 5]`) boundaries are bit-identical to those functions, not
// just numerically close. Existing exports (`bandIndex`,
// `resolveDepthDividersFt`, `depthBandRows`, `contactBandRows`) are
// untouched; `viz-model.ts` may keep using its own feet-based composition or
// switch to these — either is a Task 2+ decision, not this module's.
// ---------------------------------------------------------------------------

/**
 * `resolveDepthDividersFt`'s dividers (baseline-origin feet) converted to
 * NET-origin metres, ascending. `"thirds"` is special-cased to the exact
 * `COURT_HALF_M / 3` / `(2 * COURT_HALF_M) / 3` expressions — the same ones
 * `depthKeyPlacement`'s replacement must match bit-for-bit — rather than
 * going baseline-feet → baseline-metres → net-metres, which is mathematically
 * equal but not guaranteed bit-identical in IEEE double.
 */
function depthDividersNetOriginM(b: BandSettings): number[] {
  if (b.depthScheme === "thirds") {
    const third = COURT_HALF_M / 3;
    return [third, 2 * third];
  }
  const baselineOriginM = resolveDepthDividersFt(b).map((ft) => ft * 0.3048);
  return baselineOriginM.map((d) => COURT_HALF_M - d).sort((a, c) => a - c);
}

/**
 * Depth-placement band index for a NET-origin `depthM` (0 = net,
 * `COURT_HALF_M` = baseline — the same origin `viz-model.ts`'s
 * `isPlacementRow`/`depthKeyPlacement` read), bucketed against `b`'s
 * dividers. Index 0 is the band `depthBandRows` lists FIRST (`"Deep"`,
 * nearest the baseline) so the index agrees with row order.
 *
 * With `DEFAULT_BANDS` this reproduces `depthKeyPlacement`'s own
 * inequalities (`depthM < third → Short`, `< 2·third → Mid`, else `Deep`)
 * bit-for-bit, including at `depthM === third`, `=== 2·third`, and one ulp
 * either side of each — proven in `tests/viz-bands.spec.ts`.
 */
export function depthBandIndexFromNetM(
  depthFromNetM: number,
  b: BandSettings,
): number {
  const netDividers = depthDividersNetOriginM(b);
  if (netDividers.length === 0) return 0;
  const netIdx = bandIndex(depthFromNetM, netDividers);
  return netDividers.length - netIdx;
}

/**
 * Contact band index for a BASELINE-origin `depthM` (negative = inside the
 * court, positive = behind it — the same signing `contactDepthKey` and
 * `contactDividersFt` already share, so no mirror is needed here). Index 0
 * is the band `contactBandRows` lists first (`"Inside the baseline"`).
 *
 * With `DEFAULT_BANDS.contactDividersFt` (`[0, 5]`) this reproduces
 * `contactDepthKey`'s own inequalities (`depthM < 0 → inside`, `< 1.524 →
 * near`, else `far`) bit-for-bit: `5 * 0.3048 === 1.524` exactly in IEEE
 * double (unlike `5 * FT_PER_M`, which is a hair off) — proven in
 * `tests/viz-bands.spec.ts`.
 */
export function contactBandIndexFromBaselineM(
  depthM: number,
  b: BandSettings,
): number {
  const dividersM = b.contactDividersFt.map((ft) => ft * 0.3048);
  return bandIndex(depthM, dividersM);
}

export interface BandRow {
  key: string;
  label: string;
  rangeLabel: string;
  fromFt: number | null;
  toFt: number | null;
}

function rangeRow(
  key: string,
  label: string,
  fromFt: number,
  toFt: number,
  unit: DistanceUnit,
): BandRow {
  return {
    key,
    label,
    rangeLabel: formatRange(unit, fromFt, toFt),
    fromFt,
    toFt,
  };
}

const DEPTH_3_KEYS = ["deep", "mid", "short"] as const;
const DEPTH_3_LABELS = ["Deep", "Mid", "Short"];

/**
 * Rows for the Depth group, ordered nearest-baseline first (Deep) to
 * nearest-net last (Short) — matching `band 0 = deepest` from
 * `resolveDepthDividersFt`. `"none"` → `[]` (the group is omitted entirely,
 * never rendered with zero rows — Task 2's concern).
 *
 * `"inside"` → two rows, IN INDEX ORDER against `depthBandIndexFromNetM`:
 * its single divider sits at the baseline (`resolveDepthDividersFt`
 * returns `[0]`), so index 0 is a landing AT OR PAST the far baseline
 * (`depthFromNetM >= COURT_HALF_M`) — "Beyond the baseline", an edge case
 * with no real range, and index 1 is everything actually inside the court
 * (`depthFromNetM < COURT_HALF_M`, i.e. virtually every eligible landing) —
 * "Inside the baseline", `0–39 ft`. Never `[0, 0]`: "Beyond" carries no
 * `toFt` (open past the baseline) rather than degenerately spanning `[0,
 * 0]`.
 */
export function depthBandRows(b: BandSettings, unit: DistanceUnit): BandRow[] {
  if (b.depthScheme === "none") return [];

  if (b.depthScheme === "inside") {
    return [
      {
        key: "beyond-baseline",
        label: "Beyond the baseline",
        rangeLabel: "past the line",
        fromFt: COURT_HALF_FT,
        toFt: null,
      },
      rangeRow(
        "inside-baseline",
        "Inside the baseline",
        0,
        COURT_HALF_FT,
        unit,
      ),
    ];
  }

  const [d0, d1] = resolveDepthDividersFt(b);
  const bounds: [number, number][] = [
    [0, d0],
    [d0, d1],
    [d1, COURT_HALF_FT],
  ];
  return bounds.map(([from, to], i) =>
    rangeRow(DEPTH_3_KEYS[i], DEPTH_3_LABELS[i], from, to, unit),
  );
}

/** The number only ("2.5"), for composing a contact-band sentence. */
function n(unit: DistanceUnit, ft: number): string {
  return formatDistanceValue(unit, ft);
}

/**
 * One contact band's label, `lo`/`hi` in ft (a bound may be `±Infinity` for
 * the first/last band). The infinite-bound cases are checked FIRST, before
 * any finite sign comparison — `hi <= 0` and `lo < 0 && hi > 0` are both
 * true when `hi === Infinity`/`lo === -Infinity` respectively, so testing
 * sign before infinity used to fall through into a finite-pair branch and
 * print the literal "Infinity" (fix round 1, blocking #3).
 */
function contactRow(
  unit: DistanceUnit,
  key: string,
  lo: number,
  hi: number,
): BandRow {
  let label: string;
  if (lo === -Infinity) {
    // Band 0: everything up to `hi`.
    if (hi === 0) label = "Inside the baseline";
    else if (hi < 0) label = `${n(unit, -hi)} ${unit} inside or deeper`;
    else label = `${n(unit, hi)} ${unit} behind or closer`;
  } else if (hi === Infinity) {
    // Last band: everything from `lo` on.
    if (lo < 0) label = `${n(unit, -lo)} ${unit} inside or further back`;
    else label = `${n(unit, lo)} ${unit}+ behind`;
  } else if (lo >= 0) {
    // Wholly behind the baseline, bounded.
    label = `${n(unit, lo)}–${n(unit, hi)} ${unit} behind`;
  } else if (hi <= 0) {
    // Wholly inside the court, bounded — ascending magnitude (the shallower
    // bound, closer to 0, first): "2–6 ft inside", not "6–2".
    label = `${n(unit, -hi)}–${n(unit, -lo)} ${unit} inside`;
  } else {
    // Spans the baseline itself, bounded.
    label = `${n(unit, -lo)} ${unit} inside → ${n(unit, hi)} ${unit} behind`;
  }
  return {
    key,
    label,
    rangeLabel: label,
    fromFt: lo === -Infinity ? null : lo,
    toFt: hi === Infinity ? null : hi,
  };
}

/**
 * Rows for the Contact group: always exactly three (two dividers), inside →
 * behind. With `DEFAULT_BANDS.contactDividersFt` (`[0, 5]`) this is EXACTLY
 * "Inside the baseline", "0–5 ft behind", "5 ft+ behind" — today's
 * `returnContactStats` rows, unchanged.
 */
export function contactBandRows(
  b: BandSettings,
  unit: DistanceUnit,
): BandRow[] {
  const [d0, d1] = b.contactDividersFt;
  return [
    contactRow(unit, "inside", -Infinity, d0),
    contactRow(unit, "near", d0, d1),
    contactRow(unit, "far", d1, Infinity),
  ];
}

/** A single contact point's readout — "2.5 ft inside" | "at the line" |
 *  "3 ft behind". `ft` is signed the same way `contactDividersFt` is
 *  (negative = inside, positive = behind). */
export function contactReadout(unit: DistanceUnit, ft: number): string {
  if (ft === 0) return "at the line";
  if (ft < 0) return `${n(unit, -ft)} ${unit} inside`;
  return `${n(unit, ft)} ${unit} behind`;
}

export function schemeLabel(s: DepthScheme): string {
  switch (s) {
    case "none":
      return "OFF";
    case "thirds":
      return "THIRDS";
    case "deepMidShort":
      return "DEEP·MID·SHORT";
    case "inside":
      return "INSIDE";
    case "custom":
      return "CUSTOM";
  }
}

/**
 * Re-clamp `pair` after divider `moved` (0 = the lower one, 1 = the higher)
 * was dragged to its new position in `pair`. The MOVED divider takes
 * priority: it is clamped to `bounds` first, then the OTHER divider is
 * pushed just far enough to keep `minGapFt` between them. Only if pushing
 * the other divider would itself cross `bounds` does the moved divider give
 * ground — it stops at the furthest position that still leaves room for the
 * other one inside `bounds` with the required gap, which is the sense in
 * which "the moved divider stops" when the pair cannot fit.
 *
 * `bounds` is applied inclusively here; a caller that needs strict `0 < a <
 * b < 39` (depth) rather than `-39 <= a < b <= 30` (contact) passes bounds
 * already inset by its own epsilon — this function has no opinion on units
 * or which side is depth vs. contact.
 */
export function clampDividers(
  pair: [number, number],
  moved: 0 | 1,
  bounds: [number, number],
  minGapFt: number,
): [number, number] {
  const [lo, hi] = bounds;
  let [a, b] = pair;
  if (moved === 0) {
    a = Math.max(lo, Math.min(a, hi));
    if (b < a + minGapFt) b = a + minGapFt;
    if (b > hi) {
      b = hi;
      a = Math.max(lo, Math.min(a, b - minGapFt));
    }
  } else {
    b = Math.max(lo, Math.min(b, hi));
    if (a > b - minGapFt) a = b - minGapFt;
    if (a < lo) {
      a = lo;
      b = Math.min(hi, Math.max(b, a + minGapFt));
    }
  }
  return [a, b];
}

function pairEqual(
  a: [number, number] | null,
  b: [number, number] | null,
): boolean {
  if (a === null || b === null) return a === b;
  return a[0] === b[0] && a[1] === b[1];
}

export function bandsEqual(a: BandSettings, b: BandSettings): boolean {
  return (
    a.depthScheme === b.depthScheme &&
    pairEqual(a.depthDividersFt, b.depthDividersFt) &&
    pairEqual(a.contactDividersFt, b.contactDividersFt)
  );
}

const VALID_DEPTH_SCHEMES: readonly DepthScheme[] = [
  "none",
  "thirds",
  "deepMidShort",
  "inside",
  "custom",
];

function isFiniteNumberPair(x: unknown): x is [number, number] {
  return (
    Array.isArray(x) &&
    x.length === 2 &&
    typeof x[0] === "number" &&
    typeof x[1] === "number" &&
    Number.isFinite(x[0]) &&
    Number.isFinite(x[1])
  );
}

/**
 * Round to 2 decimal places, half-up — matching `numeric(5,2)`'s own
 * rounding for `depth_dividers_ft`/`contact_dividers_ft`. Plain
 * `Math.round(x * 100) / 100` is "round half away from zero" for the
 * *represented* double, which is what we want here (`12.345`'s nearest
 * double is a hair ABOVE 12.345, so it rounds up to `12.35` as intended);
 * it is not a general decimal half-up rounder (a value whose double
 * happens to sit a hair BELOW its decimal reading, e.g. some `x.xx5`
 * literals, could round the "wrong" way at true machine precision) — not a
 * concern at the 2dp/±39 range this table's columns live in.
 */
function roundHalfUp2dp(x: number): number {
  return Math.round(x * 100) / 100;
}

function roundPair(pair: [number, number]): [number, number] {
  return [roundHalfUp2dp(pair[0]), roundHalfUp2dp(pair[1])];
}

/**
 * Validate arbitrary input into a `BandSettings`, mirroring
 * `viz_band_settings`'s own CHECK constraints exactly (the literal `39`/`30`/
 * `-39` bounds, not `COURT_HALF_FT`) so a value this accepts can never be
 * refused by the table, and a value the table would reject never reaches it.
 *
 * Both pairs are rounded to 2dp (half-up) FIRST — matching the column type
 * `numeric(5,2)` — and the CHECKs are validated against the ROUNDED values,
 * which are also what's returned: what this function approves is exactly
 * what a caller should persist, not the un-rounded input that produced it
 * (a value that rounds to an out-of-range or non-ascending pair, e.g.
 * `38.999` → `39.00`, is rejected on the value the database would actually
 * store, not the value that was typed).
 *
 * `null` on anything that doesn't validate — this never defaults a bad shape
 * to `DEFAULT_BANDS` itself; that's `rowToBandSettings`'s job.
 */
export function validateBandInput(x: unknown): BandSettings | null {
  if (typeof x !== "object" || x === null) return null;
  const obj = x as Record<string, unknown>;

  const depthScheme = obj.depthScheme;
  if (
    typeof depthScheme !== "string" ||
    !VALID_DEPTH_SCHEMES.includes(depthScheme as DepthScheme)
  ) {
    return null;
  }

  let depthDividersFt: [number, number] | null = null;
  const rawDepthDividers = obj.depthDividersFt;
  if (rawDepthDividers !== null && rawDepthDividers !== undefined) {
    if (!isFiniteNumberPair(rawDepthDividers)) return null;
    const [d0, d1] = roundPair(rawDepthDividers);
    if (!Number.isFinite(d0) || !Number.isFinite(d1)) return null;
    if (!(d0 > 0 && d1 < 39 && d0 < d1)) return null;
    depthDividersFt = [d0, d1];
  }
  if (depthScheme === "custom" && depthDividersFt === null) return null;

  if (!isFiniteNumberPair(obj.contactDividersFt)) return null;
  const [c0, c1] = roundPair(obj.contactDividersFt);
  if (!Number.isFinite(c0) || !Number.isFinite(c1)) return null;
  if (!(c0 >= -39 && c1 <= 30 && c0 < c1)) return null;

  return {
    depthScheme: depthScheme as DepthScheme,
    depthDividersFt,
    contactDividersFt: [c0, c1],
  };
}

/** A DB row (or `null`, meaning no record exists yet) → `BandSettings`,
 *  falling back to `DEFAULT_BANDS` for a missing or invalid row rather than
 *  ever surfacing a malformed value to a caller. */
export function rowToBandSettings(row: BandSettingsDbRow | null): BandSettings {
  if (!row) return DEFAULT_BANDS;
  const validated = validateBandInput({
    depthScheme: row.depth_scheme,
    depthDividersFt: row.depth_dividers_ft,
    contactDividersFt: row.contact_dividers_ft,
  });
  return validated ?? DEFAULT_BANDS;
}
