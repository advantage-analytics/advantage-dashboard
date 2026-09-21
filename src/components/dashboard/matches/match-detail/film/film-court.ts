import type { MatchPoint, MatchShot } from "@/lib/data/match-points-server";

/**
 * FilmCourt's geometry — pure, no React. Turns the shots of a point (or of a
 * whole match) into marks positioned as PERCENTAGES of the court box, so one
 * geometry serves the card at any size.
 *
 * ── The stored frame, as observed in the live database (2026-09-21) ──────────
 *
 * `shots.contact_x/contact_y/landing_x/landing_y` are METRES in one fixed world
 * frame for both sources: x about the centre line, y = 0 at one baseline,
 * 11.885 at the net, 23.77 at the other baseline. That is what
 * `metersToCourtFrame` (`src/lib/services/splitstep/derivation/court.ts`) and
 * `serve-zones.ts` (`normalizeLanding`, `REAL_*`) claim, and the ranges agree.
 * min / p01 / p50 / p99 / max, one match per source:
 *
 *   Advantage Intelligence (`source_provider = 'splitstep'`), 769 shots,
 *   750 with a contact pair, 640 with a landing pair:
 *     contact_x  -6.22 / -5.36 /  0.15 /  5.39 /  7.14
 *     contact_y  -3.75 / -3.60 /  5.17 / 29.67 / 30.10
 *     landing_x  -5.46 / -4.77 /  0.16 /  5.10 /  5.72
 *     landing_y  -1.95 / -0.22 / 16.53 / 25.52 / 25.82
 *
 *   SwingVision (`source_provider = 'swing-vision'`), 949 shots, every pair set:
 *     contact_x  -5.66 / -4.68 / -0.06 /  4.60 /  5.11
 *     contact_y  -3.70 / -2.76 / 15.62 / 26.48 / 27.82
 *     landing_x  -6.15 / -4.17 /  0.05 /  4.78 /  7.99
 *     landing_y  -1.69 / -0.35 / 10.94 / 24.08 / 26.79
 *
 * What follows from those numbers:
 *   - One mapping serves both sources; there is no per-source branch here.
 *   - Players stand up to ~6 m behind a baseline and balls land up to ~3 m long
 *     or ~4 m wide, so values outside the court are normal, not corrupt. Marks
 *     are clamped to 0–100 so a long ball stays on the card.
 *   - Advantage Intelligence leaves pairs null (19 contacts, 129 landings in
 *     that match). A null pair yields no mark — never a mark at 0,0.
 *   - A player's contacts sit on ONE side of the net within a point: 0 of 273
 *     (point, player) groups straddled it for Advantage Intelligence, 3 of 258
 *     for SwingVision. That is what makes `contactY` a usable "which end are
 *     you on" signal, and why it is read as a vote rather than from one shot.
 *   - "Net" landings cannot be trusted for position. SwingVision imputes them
 *     (all 75 sat on the hitter's side); Advantage Intelligence recorded 19 of
 *     49 on the FAR side of the net and left 19 null. So a net ball is placed
 *     on the hitter's side, and the hitter's side comes from `contactY`.
 *
 * ── Orientation ─────────────────────────────────────────────────────────────
 *
 * The court is drawn with YOU AT THE BOTTOM. Which end you are on is not
 * stored and the frame does not follow end changes, so it is decided per point
 * from the shots themselves (see `youAreAtLowEnd`). When you are at the high-y
 * end the whole point is rotated 180° (`x → -x`, `y → 23.77 - y`) — both axes,
 * never y alone, or deuce and ad swap (the same trap `metersToCourtFrame`
 * documents). The frame is right-handed seen from the low-y end: a server
 * there stands at +x for a deuce point (`serveCourtSide`), so +x is screen
 * right when the low-y end is at the bottom.
 *
 * You/opponent is the caller's `youIsPlayer1`, from `useMatchSides()`
 * (guardrails §4) — never inferred from player1/player2 order here.
 *
 * The verdict comes from `result`, never from position.
 */

/** Chart-only literals — the frame's, not tokens. */
export const YOU = "#60A5FA";
export const OPP = "#94A3B8";
// The handoff draws out balls in #E5484D, which colors.css does not own. This is
// the dark scope's --danger, the loss colour the same handoff names for dark.
export const OUT = "#FF6478";

/** Opacity by age: 0 = the shot playing now. Nothing survives three shots. */
export const TRAIL = [1, 0.5, 0.22] as const;

/** Court dimensions in the database frame, metres. */
export const COURT_LENGTH_M = 23.77;
export const NET_Y_M = COURT_LENGTH_M / 2;
export const DOUBLES_WIDTH_M = 10.97;

/**
 * The C2 court box, as percentages of the card's court area: the doubles court
 * spans left 6% → right 94% and top 3% → bottom 97%. Singles lines then fall
 * on 17% / 83% and the service lines on 24.7% / 75.3%, as the frame draws them.
 */
export const COURT_BOX = { left: 6, right: 94, top: 3, bottom: 97 } as const;

/**
 * How far onto the hitter's side a net ball is drawn when its recorded landing
 * is on the wrong side of the net (or on it).
 */
const NET_INSET_M = 0.3;

export type CourtMarkRole = "you" | "opp" | "out";

export interface CourtMark {
  shotId: string;
  kind: "contact" | "bounce";
  /** Percent of the court box, clamped to 0–100. */
  x: number;
  y: number;
  /** From {@link TRAIL}; always 1 in match mode. */
  opacity: number;
  role: CourtMarkRole;
  /** True only on the bounce of the shot playing now — it carries the ring. */
  live: boolean;
}

export interface MatchCourtMark extends CourtMark {
  /** The point the shot belongs to — a match-mode mark seeks into it. */
  pointId: string;
}

const clampPct = (v: number) => Math.min(100, Math.max(0, v));
const round = (v: number) => Math.round(v * 100) / 100;

/**
 * Database frame → court-box percent. `youLow` says you are at the y = 0 end
 * for this point; otherwise the position is rotated 180° first.
 */
export function toCourtPercent(
  xMeters: number,
  yMeters: number,
  youLow: boolean,
): { x: number; y: number } {
  const x = youLow ? xMeters : -xMeters;
  const y = youLow ? yMeters : COURT_LENGTH_M - yMeters;
  const width = COURT_BOX.right - COURT_BOX.left;
  const height = COURT_BOX.bottom - COURT_BOX.top;
  return {
    x: round(clampPct(50 + (x / DOUBLES_WIDTH_M) * width)),
    // y = 0 is your baseline, drawn at the bottom.
    y: round(clampPct(COURT_BOX.bottom - (y / COURT_LENGTH_M) * height)),
  };
}

const isResult = (shot: MatchShot, result: string) =>
  shot.result?.trim().toLowerCase() === result;

/**
 * Which end you are on for one point: true = the y = 0 end. Null when the
 * shots cannot say — then the point draws nothing rather than guessing.
 *
 * Every measured contact votes: a shot you hit below the net says you are low,
 * one your opponent hit below the net says you are high. Only when no contact
 * is measured do landings vote (a ball you hit lands on the far side); net
 * balls are left out of that, since their landing is the untrustworthy one.
 */
export function youAreAtLowEnd(
  shots: readonly MatchShot[],
  youIsPlayer1: boolean,
): boolean | null {
  let votes = 0;
  for (const s of shots) {
    if (s.contactY == null) continue;
    const hitterLow = s.contactY < NET_Y_M;
    votes += hitterLow === (s.isPlayer1 === youIsPlayer1) ? 1 : -1;
  }
  if (votes === 0) {
    for (const s of shots) {
      if (s.landingY == null || isResult(s, "net")) continue;
      const hitterLow = s.landingY > NET_Y_M;
      votes += hitterLow === (s.isPlayer1 === youIsPlayer1) ? 1 : -1;
    }
  }
  return votes === 0 ? null : votes > 0;
}

function roleOf(shot: MatchShot, youIsPlayer1: boolean): CourtMarkRole {
  if (isResult(shot, "out")) return "out";
  return shot.isPlayer1 === youIsPlayer1 ? "you" : "opp";
}

/** Where the bounce is drawn, in the database frame; null = no bounce mark. */
function bouncePosition(
  shot: MatchShot,
  youLow: boolean,
  youIsPlayer1: boolean,
): { x: number; y: number } | null {
  if (shot.landingX == null || shot.landingY == null) return null;
  if (!isResult(shot, "net")) return { x: shot.landingX, y: shot.landingY };

  // A net ball never crossed: keep it on the hitter's side, decided by where
  // they struck it — and by the point's orientation only if that is unmeasured.
  const hitterLow =
    shot.contactY != null
      ? shot.contactY < NET_Y_M
      : (shot.isPlayer1 === youIsPlayer1) === youLow;
  const y = hitterLow
    ? Math.min(shot.landingY, NET_Y_M - NET_INSET_M)
    : Math.max(shot.landingY, NET_Y_M + NET_INSET_M);
  return { x: shot.landingX, y };
}

function marksForShot(
  shot: MatchShot,
  youLow: boolean,
  youIsPlayer1: boolean,
  opacity: number,
  age: number,
  withContact: boolean,
): CourtMark[] {
  const role = roleOf(shot, youIsPlayer1);
  const out: CourtMark[] = [];
  if (withContact && shot.contactX != null && shot.contactY != null) {
    out.push({
      shotId: shot.id,
      kind: "contact",
      ...toCourtPercent(shot.contactX, shot.contactY, youLow),
      opacity,
      role,
      live: false,
    });
  }
  const bounce = bouncePosition(shot, youLow, youIsPlayer1);
  if (bounce) {
    out.push({
      shotId: shot.id,
      kind: "bounce",
      ...toCourtPercent(bounce.x, bounce.y, youLow),
      opacity,
      role,
      live: age === 0,
    });
  }
  return out;
}

/**
 * Point mode: the rally as it happens. `shots` is one point's shots in rally
 * order and `activeShot` is the 1-based position in that array of the shot
 * playing now (0 = none, so no marks). Shots aged 0–2 behind it are drawn,
 * oldest first, each as a contact mark then a bounce mark.
 */
export function pointMarks(
  shots: readonly MatchShot[],
  opts: { youIsPlayer1: boolean; activeShot: number },
): CourtMark[] {
  const { youIsPlayer1, activeShot } = opts;
  if (activeShot <= 0) return [];
  // Orientation reads the WHOLE point so it cannot change mid-rally.
  const youLow = youAreAtLowEnd(shots, youIsPlayer1);
  if (youLow === null) return [];

  const out: CourtMark[] = [];
  shots.forEach((shot, i) => {
    const age = activeShot - (i + 1);
    if (age < 0 || age >= TRAIL.length) return;
    out.push(
      ...marksForShot(shot, youLow, youIsPlayer1, TRAIL[age], age, true),
    );
  });
  return out;
}

/**
 * Match mode: bounces only, no trail, nothing live. Pass the points of the
 * applied cut — the court follows it. Each point is oriented on its own, so
 * end changes never put your shots at the top.
 */
export function matchMarks(
  points: readonly MatchPoint[],
  opts: { youIsPlayer1: boolean },
): MatchCourtMark[] {
  const out: MatchCourtMark[] = [];
  for (const point of points) {
    const shots = point.shots ?? [];
    const youLow = youAreAtLowEnd(shots, opts.youIsPlayer1);
    if (youLow === null) continue;
    for (const shot of shots) {
      for (const mark of marksForShot(
        shot,
        youLow,
        opts.youIsPlayer1,
        1,
        -1,
        false,
      )) {
        out.push({ ...mark, pointId: point.id });
      }
    }
  }
  return out;
}
