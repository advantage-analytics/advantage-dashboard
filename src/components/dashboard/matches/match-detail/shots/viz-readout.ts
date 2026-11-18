import type { ZoneKey, ZoneStats } from "@/lib/data/serve-zones";
import type { Cut, StatRow, VizDotMeta } from "./viz-model";
import { marksAreShots } from "./cut-kinds";
import { pointScoreLabel } from "@/lib/ui/score-format";

/**
 * The focused and fullscreen courts' hover/focus readout, as a PURE function of one
 * dot's `VizDotMeta` — no React, no DOM, so
 * `tests/viz-readout.spec.ts` can pin the one rule that matters here:
 * **only what the data says**.
 *
 * Every part is omitted when its field is missing or unmeasured; nothing is
 * invented and nothing falls back to a zero. No shot speed is ever shown (a
 * single camera cannot measure it accurately); a point with no stored score
 * shows no score; a shot the tracker only called "In" contributes no shot line
 * at all, because "in" is not a fact the dot's own
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
   * Index into `lines` of the mono/tabular fact line ("Set 3 · 40-15"), or
   * `-1` when nothing measurable existed. The render site needs this because the shot line above it may itself be absent, so "the mono
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
): Readout {
  const title = `${names.subject} ${meta.wonBySubject ? "won" : "lost"} the point`;

  const shot = shotPhrase(meta.shotType, cut);
  const call = resultPhrase(meta.result);
  // `meta.isAce` checked first: an ace's own shot row reads `result: "In"` —
  // the ace is a point fact — so a `result`-only check never fires. An ace
  // also subsumes the serve description: "First serve, ace" says the same
  // thing twice.
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
  if (score !== "") facts.push(pointScoreLabel(score));
  // No shot speed: a single camera cannot read it accurately, so it is never
  // loaded and never printed (UGA coaches call, 2026-11-16).

  const lines: string[] = [];
  if (shotLine !== null && shotLine !== "") lines.push(shotLine);
  const monoLine = facts.length > 0 ? lines.length : -1;
  if (facts.length > 0) lines.push(facts.join(" · "));

  return { title, lines, monoLine };
}

/**
 * The lightbox's mark readout (canvas S04/S05): a header of the legend word
 * and the point score, the shot, then where in the match it was. `where` is
 * the caller's — the lightbox reads set, game and server off the point
 * itself, the way the Video tab's point list prints them — so this stays a
 * pure function of the dot. Every part is omitted when its field is missing.
 */
export interface MarkReadout {
  /** "Ace" / "Point won" / "Point lost" / "Out" / "Error". */
  title: string;
  /** The point score ("30-15"), or `null` when none was stored. */
  score: string | null;
  /** The shot and its call (never its speed); `null` when none. */
  shot: string | null;
  /** "Set 2 · Game 5 · You serving", or `null`. */
  where: string | null;
  /** Which match the point is from — the season's "vs Lee · Nov 3" — or
   *  `null` on a one-match court, where the match goes without saying. */
  match: string | null;
  /** The last line, under a hairline: what a click does here
   *  (`markClickHint`). `null` draws no hint. */
  hint: string | null;
  /** Which mark of an Approaches pair the card is about — "Contact" (where
   *  the approach was struck) or "Placement" (where it landed) — drawn as
   *  the card's first line. Absent on every single-mark cut. */
  part?: "Contact" | "Placement";
}

/** The two marks of an Approaches pair (`VizDot.pair`). */
export type PairPart = "contact" | "placement";

/**
 * The readout's last line: what clicking the mark does, said in the state
 * the mark is in. The first click focuses (selects and glides), the second
 * watches; a selected mark has spent its first click. A host that cannot
 * play this point (no video, no clip) offers the focus alone, and a second
 * click there does nothing.
 */
export function markClickHint(selected: boolean, canWatch: boolean): string {
  if (!canWatch) return "Click to focus";
  return selected
    ? "Click again to watch"
    : "Click to focus · Click again to watch";
}

export function buildMarkReadout(
  meta: VizDotMeta,
  outcome: "won" | "lost" | "miss",
  cut: Cut,
  where: string | null,
  extra: {
    match?: string | null;
    hint?: string | null;
    /** The pair mark under the pointer, on the Approaches cut. */
    part?: PairPart | null;
  } = {},
): MarkReadout {
  const title = meta.isAce
    ? "Ace"
    : cut === "errors"
      ? "Error"
      : outcome === "miss"
        ? "Out"
        : outcome === "won"
          ? "Point won"
          : "Point lost";
  const shot = shotPhrase(meta.shotType, cut);
  const call = resultPhrase(meta.result);
  const shotLine = meta.isAce
    ? shot
    : shot !== null && call !== null
      ? `${shot}, ${lowerFirst(call)}`
      : (shot ?? call);
  const score = (meta.pointScore ?? "").trim();
  return {
    title,
    score: score === "" ? null : pointScoreLabel(score),
    // No speed beside the shot — see `buildReadout`.
    shot: shotLine === null || shotLine === "" ? null : shotLine,
    where,
    match: extra.match ?? null,
    hint: extra.hint ?? null,
    ...(extra.part
      ? { part: extra.part === "contact" ? "Contact" : "Placement" }
      : {}),
  };
}

/** A serve zone's readout: the same sentence the zone's `aria-label` reads. */
export function buildZoneReadout(
  zone: ZoneKey,
  stats: ZoneStats,
  names: ReadoutNames,
): Readout {
  return {
    title: `${names.subject} — ${zone.replace("-", " ")}`,
    lines: [`${stats.winPct}% of ${stats.count} points won`],
    monoLine: -1,
  };
}

/** What one of a cut's rows counts, singular and plural. */
function rowNoun(cut: Cut, count: number): string {
  if (cut === "approaches") return count === 1 ? "approach" : "approaches";
  const one =
    cut === "serve"
      ? "serve"
      : cut === "returnPlacement" || cut === "returnContact"
        ? "return"
        : cut === "errors"
          ? "error"
          : "shot";
  return count === 1 ? one : `${one}s`;
}

/**
 * The Statistics column's first figure, named for what its "N of M" counts:
 * "Shots won" on a rally cut, whose marks are shots (`marksAreShots`), and
 * "Points won" everywhere else, where one mark is one point. Here, beside the
 * rows' own words, so `tests/viz-readout.spec.ts` pins the pair together.
 */
export function wonFigureLabel(cut: Cut): string {
  return marksAreShots(cut) ? "Shots won" : "Points won";
}

/**
 * The hovered or focused row's readout, in the order it reads: what the row
 * counts ("12 of 20 serves won", or on the errors cut's share rows "4 of 12
 * errors"), the group's average when it has one, then what a click does —
 * keep the row's marks, or, on the kept row, let them go. Pure, so
 * `tests/viz-readout.spec.ts` pins the words; `lightbox-stats.tsx` draws them.
 */
export function statRowTooltip(
  row: StatRow,
  cut: Cut,
  group: { average: number | null; total: number },
  pressed: boolean,
): { title: string; value: string | null; lines: string[]; hint: string } {
  const lines = row.share
    ? [`${row.count} of ${group.total} ${rowNoun(cut, group.total)}`]
    : [`${row.won} of ${row.count} ${rowNoun(cut, row.count)} won`];
  if (group.average !== null)
    lines.push(`Average ${group.average}% across the court`);
  // A rally cut's marks are shots, several to a point; every other cut's
  // row counts one mark per point.
  const noun = marksAreShots(cut) ? "shot" : "point";
  const kept = row.count === 1 ? `this ${noun}` : `these ${row.count} ${noun}s`;
  return {
    title: row.label,
    value: row.winPct === null ? null : `${row.winPct}%`,
    lines,
    hint: pressed ? "Click to show all again" : `Click to keep ${kept}`,
  };
}

const READOUT_WIDTH = 220;
const READOUT_GAP = 10;
const READOUT_MARGIN = 8;
/**
 * The tallest card the flip plans for: the title row (~18px with its 2px
 * margin), the shot line wrapping to two (32), the where line (16), the
 * season's match line wrapping to two (32), and the hint under its hairline
 * (6 + 1 + 6 + 16), with the column's 2px gaps and 21px of padding — ~160.
 * Rather than measure on every hover, the flip uses the worst case; it can
 * flip a little early for a short card and never clips one.
 */
const READOUT_MAX_HEIGHT = 160;

export interface ReadoutPlacement {
  /** The card's horizontal centre, in stage px. */
  left: number;
  /** The card's bottom edge, or its top edge when `below`, in stage px. */
  top: number;
  width: number;
  below: boolean;
}

/**
 * Where the fullscreen readout sits: above its mark, as every chart readout
 * does, below it when there is no room, slid along the stage's edge rather than
 * run off it. A mark panned out of view pins the card to the nearest edge.
 */
export function placeReadout(
  anchor: { x: number; y: number },
  stage: { w: number; h: number },
  /** Px between the anchor and the card — the lightbox passes the selection
   *  ring's own radius plus 8, so the card clears the ring. */
  gap: number = READOUT_GAP,
): ReadoutPlacement {
  const width = Math.min(
    READOUT_WIDTH,
    Math.max(0, stage.w - READOUT_MARGIN * 2),
  );
  const left = Math.max(
    READOUT_MARGIN + width / 2,
    Math.min(anchor.x, stage.w - READOUT_MARGIN - width / 2),
  );
  const y = Math.max(
    READOUT_MARGIN,
    Math.min(anchor.y, stage.h - READOUT_MARGIN),
  );
  const below = y - gap - READOUT_MAX_HEIGHT < READOUT_MARGIN;
  return {
    left,
    top: y + (below ? gap : -gap),
    width,
    below,
  };
}

/** Where a pair's readout opens, relative to its mark (`placeApronReadout`). */
export type ApronReadoutSide = "left" | "right" | "above" | "below";

export interface ApronReadoutPlacement {
  side: ApronReadoutSide;
  /**
   * In stage px. `left`/`right`: the card's near edge (its right edge on
   * `"left"`, its left edge on `"right"`) and `top` its vertical centre.
   * `above`/`below`: as `placeReadout` — the card's horizontal centre, and
   * its bottom (above) or top (below) edge.
   */
  left: number;
  top: number;
  width: number;
}

/**
 * The Approaches court's readout (`approach-map-v9.html`): a pair's marks sit
 * in both halves of the court, so a card hung above a mark lands on the
 * marks of the half beyond it. It opens OUTWARD instead, into the apron
 * beside the court — left of a mark on the left half of the court, right of
 * one on the right half — falls back to the other side when the stage has no
 * room there, and sits above the mark (`placeReadout`, which itself drops
 * below at the stage's top) only when neither side fits.
 *
 * Side cards are centred on the mark's height and slid along the stage's
 * edge rather than run off it. The fit uses the same worst-case width and
 * height as `placeReadout`, so a card never clips.
 */
export function placeApronReadout(
  anchor: { x: number; y: number },
  stage: { w: number; h: number },
  /** The court's centre line, in stage px: which half the mark is in. */
  courtCentreX: number,
  /** Px between the anchor and the card (the selection ring's radius + 8). */
  gap: number = READOUT_GAP,
): ApronReadoutPlacement {
  const width = Math.min(
    READOUT_WIDTH,
    Math.max(0, stage.w - READOUT_MARGIN * 2),
  );
  const fitsLeft = anchor.x - gap - width >= READOUT_MARGIN;
  const fitsRight = anchor.x + gap + width <= stage.w - READOUT_MARGIN;
  const preferred: "left" | "right" =
    anchor.x < courtCentreX ? "left" : "right";
  const other = preferred === "left" ? "right" : "left";
  const fits = { left: fitsLeft, right: fitsRight };
  const side = fits[preferred] ? preferred : fits[other] ? other : null;
  if (side === null) {
    const above = placeReadout(anchor, stage, gap);
    return {
      side: above.below ? "below" : "above",
      left: above.left,
      top: above.top,
      width: above.width,
    };
  }
  const lo = READOUT_MARGIN + Math.min(READOUT_MAX_HEIGHT, stage.h) / 2;
  const hi = Math.max(lo, stage.h - lo);
  const top = Math.max(lo, Math.min(anchor.y, hi));
  return {
    side,
    left: side === "left" ? anchor.x - gap : anchor.x + gap,
    top,
    width,
  };
}
