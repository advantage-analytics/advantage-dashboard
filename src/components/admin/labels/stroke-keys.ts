import {
  LABEL_SPINS,
  type LabelShot,
  type LabelStroke,
} from "@/lib/services/labels/session";

/**
 * One key sets the selected stroke's Stroke or Spin, so a rally is labelled
 * without opening a menu per cell. Pure: the console reads the key and writes
 * the patch through its usual shot edit.
 *
 * - F forehand · B backhand · O overhead.
 * - V makes the stroke a volley on its side (a forehand volley from a
 *   forehand), or a groundstroke again from a volley. With no side yet it is
 *   a forehand volley.
 * - S is a first serve; pressed on a serve it switches first ↔ second.
 * - 1–4 are the Spin menu's rows in order (`LABEL_SPINS`): topspin, flat,
 *   backspin, sidespin.
 *
 * The answer is the change asked for; the console writes a stroke through
 * `strokeChangePatch`, as the Stroke menu does, so a let keeps its rule. A key
 * that would write what the stroke already holds answers null.
 */
export const STROKE_KEY_HINTS: readonly { key: string; label: string }[] = [
  { key: "F", label: "forehand" },
  { key: "B", label: "backhand" },
  { key: "V", label: "volley" },
  { key: "O", label: "overhead" },
  { key: "S", label: "serve" },
  { key: "1–4", label: "spin" },
];

const VOLLEY_OF: Partial<Record<LabelStroke, LabelStroke>> = {
  forehand: "forehand_volley",
  backhand: "backhand_volley",
  forehand_volley: "forehand",
  backhand_volley: "backhand",
};

function strokeFor(key: string, current: LabelStroke | null) {
  switch (key) {
    case "f":
      return "forehand";
    case "b":
      return "backhand";
    case "o":
      return "overhead";
    case "v":
      return (current && VOLLEY_OF[current]) ?? "forehand_volley";
    case "s":
      return current === "first_serve" ? "second_serve" : "first_serve";
    default:
      return null;
  }
}

export type StrokeKeyChange =
  { stroke: LabelStroke } | { spin: (typeof LABEL_SPINS)[number] };

/** The change a key asks for on `shot`, or null when it asks for nothing new. */
export function strokeKeyChange(
  key: string,
  shot: Pick<LabelShot, "stroke" | "spin">,
): StrokeKeyChange | null {
  const lower = key.toLowerCase();
  const spinIndex = "1234".indexOf(lower);
  if (spinIndex !== -1) {
    const spin = LABEL_SPINS[spinIndex];
    return shot.spin === spin ? null : { spin };
  }
  const stroke = strokeFor(lower, shot.stroke);
  if (stroke === null || stroke === shot.stroke) return null;
  return { stroke };
}

/** Whether a key is one of the stroke keys at all. */
export function isStrokeKey(key: string): boolean {
  return /^[fbvos1-4]$/i.test(key);
}
