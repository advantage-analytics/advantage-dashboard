import type { Cut, VizDotMeta } from "./viz-model";
import { formatSpeed, type DistanceUnit } from "@/lib/format/distance";

/**
 * The fullscreen viewer's hover/focus readout, as a PURE function of one
 * dot's `VizDotMeta` (Phase 2A, Task 4) — no React, no DOM, so
 * `tests/viz-readout.spec.ts` can pin the one rule that matters here:
 * **only what the data says**.
 *
 * Every part is omitted when its field is missing or unmeasured; nothing is
 * invented and nothing falls back to a zero. A serve with no recorded speed
 * shows no speed (Global Constraints: "no fabricated serve speed"); a point
 * with no stored score shows no score; a shot the tracker only called "In"
 * contributes no shot line at all, because "in" is not a fact the dot's own
 * position doesn't already carry.
 *
 * Attribution (guardrails §4): the title reads off `meta.wonBySubject`, which
 * `computeViz` already resolved against the subject — this function never
 * sees player1/player2 and never re-derives a winner.
 *
 * Lives in its own module rather than inside `viz-fullscreen-court.tsx` so
 * the spec imports a plain `.ts` with no client-component or React
 * dependency; the court file renders what it returns and owns nothing about
 * the wording.
 */
export interface Readout {
  /** "Reid won the point" / "Reid lost the point". */
  title: string;
  /** 0–2 lines: the shot line, then the fact line. Empty lines never appear. */
  lines: string[];
  /**
   * Index into `lines` of the mono/tabular fact line ("Set 3 · 40-15 · 118
   * mph"), or `-1` when nothing measurable existed. The render site needs
   * this because the shot line above it may itself be absent, so "the mono
   * one is line 2" is not something a caller can assume.
   */
  monoLine: number;
}

export interface ReadoutNames {
  /** The current view's subject — `useVizView().subjectName`. */
  subject: string;
}

/** "Forehand Volley" → "Forehand volley". Leaves an already-lower word alone. */
function sentenceCase(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed === "") return "";
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
}

function lowerFirst(raw: string): string {
  return raw.charAt(0).toLowerCase() + raw.slice(1);
}

/**
 * The shot itself, named the way the cut frames it. `shotType` is
 * SwingVision's own Title-Case vocabulary ("First Serve", "Forehand",
 * "Backhand Slice"); `"Feed"` is the shot_number=0 row, not a stroke anyone
 * played, so it names nothing.
 *
 * On the two return cuts the stroke alone ("Forehand") would be ambiguous
 * with a rally ball, so the cut's own noun is appended — unless the recorded
 * type already says "return".
 */
function shotPhrase(shotType: string | null, cut: Cut): string | null {
  const raw = (shotType ?? "").trim();
  if (raw === "" || raw.toLowerCase() === "feed") return null;
  const phrase = sentenceCase(raw);
  const isReturn = cut === "returnPlacement" || cut === "returnContact";
  if (isReturn && !phrase.toLowerCase().includes("return")) {
    return `${phrase} return`;
  }
  return phrase;
}

/**
 * The tracker's call on the shot. `"In"` is deliberately nothing: the dot is
 * already drawn where the ball landed, in its outcome colour, so printing
 * "in" would be a word that carries no information the mark doesn't.
 * Anything outside the known vocabulary prints as the tracker recorded it
 * rather than being dropped — an unrecognised call is still data.
 */
function resultPhrase(result: string | null): string | null {
  const raw = (result ?? "").trim();
  if (raw === "") return null;
  const lower = raw.toLowerCase();
  if (lower === "in") return null;
  if (lower === "out") return "Out";
  if (lower === "net") return "Into the net";
  if (lower === "ace") return "Ace";
  return sentenceCase(raw);
}

export function buildReadout(
  meta: VizDotMeta,
  names: ReadoutNames,
  cut: Cut,
  unit: DistanceUnit = "ft",
): Readout {
  const title = `${names.subject} ${meta.wonBySubject ? "won" : "lost"} the point`;

  const shot = shotPhrase(meta.shotType, cut);
  const call = resultPhrase(meta.result);
  // Fix round 1: `meta.isAce` FIRST. An ace's own shot row reads `result:
  // "In"` — the ace is a point fact — so a `result`-only test never fired.
  // An ace also subsumes the serve description: "First serve, ace" says the
  // same thing twice.
  const shotLine = meta.isAce
    ? "Ace"
    : call === "Ace"
      ? "Ace"
      : shot !== null && call !== null
        ? `${shot}, ${lowerFirst(call)}`
        : (shot ?? call);

  const facts: string[] = [];
  if (Number.isFinite(meta.setNumber) && meta.setNumber > 0) {
    facts.push(`Set ${meta.setNumber}`);
  }
  const score = (meta.pointScore ?? "").trim();
  if (score !== "") facts.push(score);
  // Unmeasured speed arrives as `null` from `computeViz`, but a stored 0 is
  // equally "not a reading" — never "0 mph"/"0 km/h".
  if (
    meta.speedMph !== null &&
    Number.isFinite(meta.speedMph) &&
    meta.speedMph > 0
  ) {
    facts.push(formatSpeed(unit, meta.speedMph));
  }

  const lines: string[] = [];
  if (shotLine !== null && shotLine !== "") lines.push(shotLine);
  const monoLine = facts.length > 0 ? lines.length : -1;
  if (facts.length > 0) lines.push(facts.join(" · "));

  return { title, lines, monoLine };
}
