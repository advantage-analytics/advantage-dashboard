import type { Cut, StatRow, VizDotMeta } from "./viz-model";
import { marksAreShots } from "./cut-kinds";
import { pointScoreLabel } from "@/lib/ui/score-format";
import {
  REAL_HALF_SINGLES,
  REAL_NET_Y,
  type ZoneKey,
  type ZoneStats,
} from "@/lib/data/serve-zones";
import {
  FT_PER_M,
  formatDistance,
  type DistanceUnit,
} from "@/lib/format/distance";

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
 * The lightbox's mark readout (board Readout-C, "polished C"), in two
 * states the court draws from this one object:
 *
 * - **hover** (or keyboard focus): a one-line dark pill — `title`, `score`,
 *   and a white play badge when `watch`;
 * - **selected**: a pinned dark card — `title` and `score`, `where` (and the
 *   season's `match`), the "Hit from" / "Landed" rows when the shot has
 *   both ends recorded (in any view), then "Watch point" or "No video for
 *   this point" under a hairline.
 *
 * `where` is the caller's — the lightbox reads set, game and server off the
 * point itself, the way the Video tab's point list prints them — so this
 * stays a pure function of the dot. Every part is omitted when its field is
 * missing: nothing is invented.
 */
export interface MarkReadout {
  /** The shot and its call, one phrase: "Forehand unforced error",
   *  "Backhand, out", "First serve, point won", "Ace" (`markTitle`). */
  title: string;
  /** The point score ("30-15"), or `null` when none was stored. */
  score: string | null;
  /** "Set 2 · Game 5 · You serving", or `null`. */
  where: string | null;
  /** Which match the point is from — the season's "vs Lee · Nov 3" — or
   *  `null` on a one-match court, where the match goes without saying. */
  match: string | null;
  /** The card's "Hit from" row (ring glyph): "3 ft behind the baseline",
   *  or "Contact not recorded". `null` when the row is not drawn. */
  hitFrom: string | null;
  /** The card's "Landed" row (dot glyph): "2 ft long". `null` when the row
   *  is not drawn. The two rows are drawn together or not at all. */
  landed: string | null;
  /** The point can be watched: the pill ends in a play badge and the card in
   *  "Watch point"; otherwise no badge, and "No video for this point". */
  watch: boolean;
  /** Which mark of a pair the pointer is on — "Contact" (where the shot was
   *  struck) or "Placement" (where it landed). Read to screen readers only:
   *  the card's rows say both. Absent on a mark drawn in one place. */
  part?: "Contact" | "Placement";
  /** "Contact not recorded": the view draws contact (Contact or Both) and
   *  this shot has none, so its landing stands alone. Absent otherwise. */
  contact?: "Contact not recorded";
}

/** The two marks of a pair (`VizDot.pair`): a shot drawn at both its ends —
 *  Approaches by default, every other placement chart in Both. */
export type PairPart = "contact" | "placement";

/** The card's closing action, and what it says when there is nothing to play. */
export const WATCH_POINT_LABEL = "Watch point";
export const NO_VIDEO_LABEL = "No video for this point";
/** The card's two row labels. */
export const HIT_FROM_LABEL = "Hit from";
export const LANDED_LABEL = "Landed";

/**
 * The readout's title: the shot and the call on it in one sentence-case
 * phrase.
 *
 * - An ace is "Ace" — the serve it was is the star itself.
 * - The errors cut names the error: "Forehand unforced error",
 *   "Backhand forced error", or "Forehand error" where the match's errors are
 *   not judged (`VizDotMeta.errorKind` absent); a double fault is
 *   "Double fault".
 * - Everywhere else the shot, then the tracker's call ("Backhand, out",
 *   "Forehand, into the net"), or — a ball called in — what became of the
 *   point ("First serve, point won"). A miss with no recorded call is out.
 *   With no shot recorded the call or the point's fate stands alone.
 */
export function markTitle(
  meta: VizDotMeta,
  outcome: "won" | "lost" | "miss",
  cut: Cut,
): string {
  if (meta.isAce || resultPhrase(meta.result) === "Ace") return "Ace";
  const shot = shotPhrase(meta.shotType, cut);
  if (cut === "errors") {
    if (meta.errorKind === "doubleFault") return "Double fault";
    const noun =
      meta.errorKind === "unforced"
        ? "unforced error"
        : meta.errorKind === "forced"
          ? "forced error"
          : "error";
    return shot !== null ? `${shot} ${noun}` : sentenceCase(noun);
  }
  const call = resultPhrase(meta.result) ?? (outcome === "miss" ? "Out" : null);
  const fate = outcome === "won" ? "point won" : "point lost";
  if (shot !== null)
    return `${shot}, ${call !== null ? lowerFirst(call) : fate}`;
  return call ?? sentenceCase(fate);
}

/** A readout distance: whole feet, or metres to a tenth — never under the
 *  smallest step it prints, so a ball just long never reads "0 ft long". */
function readoutDistance(m: number, unit: DistanceUnit): string {
  const ft = Math.abs(m) * FT_PER_M;
  if (unit === "ft") return `${Math.max(1, Math.round(ft))} ft`;
  return formatDistance("m", Math.max(0.1 / 0.3048, ft));
}

/** Within half a step of zero, a distance reads as "on" the line. */
function onLine(m: number, unit: DistanceUnit): boolean {
  return unit === "ft" ? Math.abs(m) * FT_PER_M < 0.5 : Math.abs(m) < 0.05;
}

/**
 * Where the shot was struck, from its contact (`VizDot.pair.depthM`: metres
 * behind (+) or inside (−) the hitter's own baseline): "3 ft behind the
 * baseline", "4 ft inside the baseline", "On the baseline".
 */
export function hitFromPhrase(
  contactDepthM: number,
  unit: DistanceUnit = "ft",
): string {
  if (onLine(contactDepthM, unit)) return "On the baseline";
  return `${readoutDistance(contactDepthM, unit)} ${contactDepthM > 0 ? "behind" : "inside"} the baseline`;
}

/**
 * Where the shot landed, from the dot's own placement (metres past the net,
 * lateral from the centre line): "In the net", "2 ft long", "1 ft wide",
 * "2 ft long, 1 ft wide", "6 ft inside the baseline", "On the baseline". A
 * ball the tracker called out whose landing reads on a line (SwingVision
 * imputes them there) is "Out, on the line".
 */
export function landedPhrase(
  landing: { lateralM: number; depthM: number; atNet: boolean },
  result: string | null,
  unit: DistanceUnit = "ft",
): string {
  if (landing.atNet) return "In the net";
  const long = landing.depthM - REAL_NET_Y;
  const wide = Math.abs(landing.lateralM) - REAL_HALF_SINGLES;
  const parts: string[] = [];
  if (long > 0 && !onLine(long, unit))
    parts.push(`${readoutDistance(long, unit)} long`);
  if (wide > 0 && !onLine(wide, unit))
    parts.push(`${readoutDistance(wide, unit)} wide`);
  if (parts.length > 0) return parts.join(", ");
  if ((result ?? "").trim().toLowerCase() === "out") return "Out, on the line";
  if (long > 0 || onLine(long, unit)) return "On the baseline";
  return `${readoutDistance(long, unit)} inside the baseline`;
}

export function buildMarkReadout(
  meta: VizDotMeta,
  outcome: "won" | "lost" | "miss",
  cut: Cut,
  where: string | null,
  extra: {
    match?: string | null;
    /** The host can play this point (`canWatchMark`). */
    watch?: boolean;
    /** The pair mark under the pointer, where both ends are drawn. */
    part?: PairPart | null;
    /** The view draws contact and this shot has no recorded contact. */
    contactMissing?: boolean;
    /**
     * The shot's two recorded ends, for the card's rows — in any view,
     * drawn or not: the landing (the dot's own placement) and the contact's
     * depth (`VizDot.pair.depthM`). The rows show when both exist, or when
     * the landing does and `contactMissing` (the view draws contact, none
     * was recorded) says why the contact does not.
     */
    ends?: {
      landing: { lateralM: number; depthM: number; atNet: boolean } | null;
      contactDepthM: number | null;
    };
    unit?: DistanceUnit;
  } = {},
): MarkReadout {
  const score = (meta.pointScore ?? "").trim();
  const unit = extra.unit ?? "ft";
  const landing = extra.ends?.landing ?? null;
  const contactDepthM = extra.ends?.contactDepthM ?? null;
  const rows =
    landing !== null && (contactDepthM !== null || extra.contactMissing);
  return {
    title: markTitle(meta, outcome, cut),
    score: score === "" ? null : pointScoreLabel(score),
    // No speed anywhere — see `buildReadout`.
    where,
    match: extra.match ?? null,
    hitFrom: !rows
      ? null
      : contactDepthM !== null
        ? hitFromPhrase(contactDepthM, unit)
        : "Contact not recorded",
    landed: rows ? landedPhrase(landing, meta.result, unit) : null,
    watch: extra.watch ?? false,
    ...(extra.part
      ? { part: extra.part === "contact" ? "Contact" : "Placement" }
      : {}),
    ...(extra.contactMissing ? { contact: "Contact not recorded" } : {}),
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
  /** The card's widest — the selected mark's card is 236px. */
  maxWidth: number = READOUT_WIDTH,
): ReadoutPlacement {
  const width = Math.min(maxWidth, Math.max(0, stage.w - READOUT_MARGIN * 2));
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
  /** The card's widest, as `placeReadout`'s. */
  maxWidth: number = READOUT_WIDTH,
): ApronReadoutPlacement {
  const width = Math.min(maxWidth, Math.max(0, stage.w - READOUT_MARGIN * 2));
  const fitsLeft = anchor.x - gap - width >= READOUT_MARGIN;
  const fitsRight = anchor.x + gap + width <= stage.w - READOUT_MARGIN;
  const preferred: "left" | "right" =
    anchor.x < courtCentreX ? "left" : "right";
  const other = preferred === "left" ? "right" : "left";
  const fits = { left: fitsLeft, right: fitsRight };
  const side = fits[preferred] ? preferred : fits[other] ? other : null;
  if (side === null) {
    const above = placeReadout(anchor, stage, gap, maxWidth);
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
