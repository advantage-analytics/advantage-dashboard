/**
 * Distance formatting shared by the Visualizations tab's depth/contact bands
 * (Phase 2B). Pure — no React, no Supabase.
 *
 * `FT_PER_M` is the EXACT conversion (`1 / 0.3048`), not the rounded
 * `3.28084` a first pass might reach for — the plan's ruling is explicit
 * that this must hold: `5 ft === 1.524 m` exactly, which only the exact
 * conversion guarantees (`1.524 / (1 / 0.3048) === 1.524 * 0.3048 === 5`,
 * bit-for-bit; `1.524 * 3.28084` lands a hair off 5).
 */

export type DistanceUnit = "ft" | "m";

export const FT_PER_M = 1 / 0.3048;

/** Round to the nearest tenth and drop a trailing ".0" — "12", "2.5", "3.5". */
function trimmed(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  const normalized = rounded === 0 ? 0 : rounded; // collapse -0 to 0
  return Number.isInteger(normalized)
    ? String(normalized)
    : normalized.toFixed(1);
}

function toUnit(unit: DistanceUnit, ft: number): number {
  return unit === "ft" ? ft : ft / FT_PER_M;
}

/** "12 ft" | "2.5 ft" | "3.5 m" — never a trailing ".0". */
export function formatDistance(unit: DistanceUnit, ft: number): string {
  return `${trimmed(toUnit(unit, ft))} ${unit}`;
}

/** "0–12 ft" (en dash, the unit written once, at the end). */
export function formatRange(
  unit: DistanceUnit,
  fromFt: number,
  toFt: number,
): string {
  const from = trimmed(toUnit(unit, fromFt));
  const to = trimmed(toUnit(unit, toFt));
  return `${from}–${to} ${unit}`;
}

/**
 * The number only, no unit suffix — for composing a sentence around it
 * ("{x} ft inside or deeper"). Reuses `formatDistance`'s rounding so a
 * composed label and a plain `formatDistance` call never disagree on the
 * displayed digits.
 */
export function formatDistanceValue(unit: DistanceUnit, ft: number): string {
  return trimmed(toUnit(unit, ft));
}

const KMH_PER_MPH = 1.609344;

/** "118" | "190" — the bare number, for a column whose header names the
 *  unit (`speedUnitLabel`). Same rounding as `formatSpeed`. */
export function formatSpeedValue(unit: DistanceUnit, mph: number): string {
  return String(Math.round(unit === "ft" ? mph : mph * KMH_PER_MPH));
}

/** "mph" | "km/h". */
export function speedUnitLabel(unit: DistanceUnit): string {
  return unit === "ft" ? "mph" : "km/h";
}

/** "118 mph" | "190 km/h" — rounded to the nearest integer. */
export function formatSpeed(unit: DistanceUnit, mph: number): string {
  return `${formatSpeedValue(unit, mph)} ${speedUnitLabel(unit)}`;
}

/**
 * Snap to the nearest half-foot, or — in metres — the nearest half-metre
 * expressed back in feet (so a metric drag still lands on a "clean" metric
 * value once converted for display, rather than a half-foot that reads as an
 * odd metric fraction).
 *
 * NIT: the `"m"` branch's result, converted back to ft and rounded to 2dp
 * for storage (`numeric(5,2)`, what `validateBandInput` persists), does not
 * always round-trip back to the exact half-metre that was snapped to — e.g.
 * 0.5 m snaps clean, but some half-metre values land on a ft figure whose
 * 2dp rounding is a hundredth of a foot off the "true" half-metre. Not
 * corrected here: it's sub-visual (well under the half-foot a "ft" drag
 * already accepts as its own granularity) and out of this task's scope.
 */
export function snapFt(unit: DistanceUnit, ft: number): number {
  if (unit === "ft") {
    return Math.round(ft * 2) / 2;
  }
  const m = ft / FT_PER_M;
  const snappedM = Math.round(m * 2) / 2;
  return snappedM * FT_PER_M;
}
