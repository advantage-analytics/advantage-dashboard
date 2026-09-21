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
 * never rendered with zero rows — Task 2's concern). `"inside"` → two rows,
 * "Inside the baseline" / "Beyond the baseline", split at its single
 * divider.
 */
export function depthBandRows(b: BandSettings, unit: DistanceUnit): BandRow[] {
  if (b.depthScheme === "none") return [];

  if (b.depthScheme === "inside") {
    const [divider] = resolveDepthDividersFt(b);
    return [
      rangeRow("inside-baseline", "Inside the baseline", 0, divider, unit),
      rangeRow(
        "beyond-baseline",
        "Beyond the baseline",
        divider,
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

function contactRow(
  unit: DistanceUnit,
  key: string,
  lo: number,
  hi: number,
): BandRow {
  let label: string;
  if (lo === -Infinity && hi === 0) {
    label = "Inside the baseline";
  } else if (hi <= 0) {
    // Wholly inside the court (both bounds at or behind the net side of the
    // baseline, i.e. negative-or-zero).
    label =
      lo === -Infinity
        ? `${n(unit, -hi)} ${unit} inside or deeper`
        : `${n(unit, -lo)}–${n(unit, -hi)} ${unit} inside`;
  } else if (lo < 0 && hi > 0) {
    // Spans the baseline itself.
    label = `${n(unit, -lo)} ${unit} inside → ${n(unit, hi)} ${unit} behind`;
  } else {
    // Wholly behind the baseline (both bounds >= 0).
    label =
      hi === Infinity
        ? `${n(unit, lo)} ${unit}+ behind`
        : `${n(unit, lo)}–${n(unit, hi)} ${unit} behind`;
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
 * Move divider `moved` (0 = the lower one, 1 = the higher) of `pair` toward
 * `value`'s direction — actually just re-clamps `pair` so it stays within
 * `bounds` and keeps at least `minGapFt` between the two, with the moved
 * divider taking priority over the other when they'd otherwise collide.
 */
export function clampDividers(
  pair: [number, number],
  moved: 0 | 1,
  bounds: [number, number],
  minGapFt: number,
): [number, number] {
  const [lo, hi] = bounds;
  let [a, b] = pair;
  a = Math.max(lo, Math.min(a, hi));
  b = Math.max(lo, Math.min(b, hi));
  if (moved === 0) {
    a = Math.min(a, b - minGapFt);
    a = Math.max(a, lo);
  } else {
    b = Math.max(b, a + minGapFt);
    b = Math.min(b, hi);
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
 * Validate arbitrary input into a `BandSettings`, mirroring
 * `viz_band_settings`'s own CHECK constraints exactly (the literal `39`/`30`/
 * `-39` bounds, not `COURT_HALF_FT`) so a value this accepts can never be
 * refused by the table, and a value the table would reject never reaches it.
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
    const [d0, d1] = rawDepthDividers;
    if (!(d0 > 0 && d1 < 39 && d0 < d1)) return null;
    depthDividersFt = [d0, d1];
  }
  if (depthScheme === "custom" && depthDividersFt === null) return null;

  if (!isFiniteNumberPair(obj.contactDividersFt)) return null;
  const [c0, c1] = obj.contactDividersFt;
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
