/**
 * Spin labels for the match filters — pure, no React.
 *
 * `shots.spin_type` carries each source's own vocabulary. The video vendor
 * describes the ball's rotation ("sidespin", "topspin", "backspin"); tennis
 * names serves and returns by stroke. These map one onto the other: a
 * sidespin serve is a slice serve, a topspin serve is a kick. Matching is on
 * the whole label, case-insensitive and trimmed; anything unrecognised is null
 * rather than guessed.
 */

export type ServeSpin = "Flat" | "Slice" | "Kick";
export type ReturnSpin = "Topspin" | "Slice";

const SERVE_SPIN: Record<string, ServeSpin> = {
  flat: "Flat",
  slice: "Slice",
  sidespin: "Slice",
  kick: "Kick",
  topspin: "Kick",
};

const RETURN_SPIN: Record<string, ReturnSpin> = {
  topspin: "Topspin",
  slice: "Slice",
  backspin: "Slice",
};

function key(raw: string | null | undefined): string {
  return (raw ?? "").trim().toLowerCase();
}

/** flat → Flat, slice | sidespin → Slice, kick | topspin → Kick; else null. */
export function normalizeServeSpin(
  raw: string | null | undefined,
): ServeSpin | null {
  return Object.hasOwn(SERVE_SPIN, key(raw)) ? SERVE_SPIN[key(raw)] : null;
}

/** topspin → Topspin, slice | backspin → Slice; else null. */
export function normalizeReturnSpin(
  raw: string | null | undefined,
): ReturnSpin | null {
  return Object.hasOwn(RETURN_SPIN, key(raw)) ? RETURN_SPIN[key(raw)] : null;
}
