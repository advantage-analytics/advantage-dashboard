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
 * Point mode of an Advantage Intelligence match is drawn in the CAMERA view
 * (`CourtView`): unrotated, far baseline at the top, so a mark sits where the
 * ball is in the film. Everything else below describes the other view.
 *
 * There the court is drawn with YOU AT THE BOTTOM. Which end you are on is not
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

/** Where a mark's readout hangs, so it never covers the mark it explains. */
export interface ReadoutPlacement {
  /** Which side of the court box the readout sits beside. */
  side: "left" | "right";
  /** Its top edge, percent of the court box's height. */
  top: number;
}

/**
 * How far above the mark the readout's top edge sits, and the lowest top that
 * still leaves its three lines inside the card — percentages of the court box
 * (227px tall against a readout of roughly 68px).
 */
const READOUT_LIFT_PCT = 12;
const READOUT_MAX_TOP_PCT = 70;

/**
 * Which side of the court a mark at (`x`, `y`) — percentages of the court box
 * — is read on. A mark in the left half is read on the right and vice versa,
 * so the readout never lands on top of the marks around it, and the top is
 * clamped so the box stays inside the frame.
 */
export function readoutPlacement(x: number, y: number): ReadoutPlacement {
  return {
    side: x > 50 ? "left" : "right",
    top: round(
      Math.min(READOUT_MAX_TOP_PCT, Math.max(0, y - READOUT_LIFT_PCT)),
    ),
  };
}

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
  /**
   * The shot this mark came from. `FilmCourt`'s readout prints its stroke,
   * spin, speed, placement and result — never its coordinates, which is why an
   * end change leaves everything the card DRAWS identical (see the spec's
   * end-change case, which projects the shot out before comparing).
   */
  shot: MatchShot;
  /** 1-based place in its point's rally, and the rally's shot count. */
  order: number;
  rallyShots: number;
  /**
   * Who struck it. Separate from {@link CourtMarkRole} because the role is the
   * verdict: an out ball reads "out" whichever player hit it, and the readout
   * still has to name them.
   */
  hitter: "you" | "opp";
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

function hitterOf(shot: MatchShot, youIsPlayer1: boolean): "you" | "opp" {
  return shot.isPlayer1 === youIsPlayer1 ? "you" : "opp";
}

function roleOf(shot: MatchShot, youIsPlayer1: boolean): CourtMarkRole {
  if (isResult(shot, "out")) return "out";
  return hitterOf(shot, youIsPlayer1);
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
  live: boolean,
  withContact: boolean,
  withBounce: boolean,
  /** 1-based place in the rally, and the rally's length. */
  order: number,
  rallyShots: number,
): CourtMark[] {
  const role = roleOf(shot, youIsPlayer1);
  const detail = {
    shot,
    order,
    rallyShots,
    hitter: hitterOf(shot, youIsPlayer1),
  };
  const out: CourtMark[] = [];
  if (withContact && shot.contactX != null && shot.contactY != null) {
    out.push({
      shotId: shot.id,
      kind: "contact",
      ...toCourtPercent(shot.contactX, shot.contactY, youLow),
      opacity,
      role,
      live: false,
      ...detail,
    });
  }
  const bounce = withBounce ? bouncePosition(shot, youLow, youIsPlayer1) : null;
  if (bounce) {
    out.push({
      shotId: shot.id,
      kind: "bounce",
      ...toCourtPercent(bounce.x, bounce.y, youLow),
      opacity,
      role,
      live,
      ...detail,
    });
  }
  return out;
}

/**
 * How the court is turned.
 *
 *   "camera"      The stored frame as the film shows it: y = 23.77 (the far
 *                 baseline, the top of the picture) at the top, +x to the
 *                 right. Only true for Advantage Intelligence matches, whose
 *                 frame is the vendor's camera frame plus one offset
 *                 (`metersToCourtFrame`) — so a mark sits where the ball is on
 *                 screen, and the players swap halves when they change ends,
 *                 exactly as they do in the film.
 *   "you-bottom"  You at the bottom whatever end you are on (`youAreAtLowEnd`).
 *                 For sources whose frame is not tied to the camera, and for
 *                 match mode, where shots from both ends are laid over each
 *                 other and have to share one orientation to mean anything.
 */
export type CourtView = "camera" | "you-bottom";

/**
 * Point mode: the rally as it happens. `shots` is one point's shots in rally
 * order and `activeShot` is the 1-based position in that array of the shot
 * playing now (0 = none, so no marks). Shots aged 0–2 behind it are drawn,
 * oldest first, each as a contact mark then a bounce mark.
 *
 * `activeBounceShown: false` holds the playing shot's bounce back: the ball has
 * been struck but has not landed yet, and a dot at the landing spot would be
 * the court telling the future. The ring then stays on the last ball that DID
 * bounce — the one the player has just hit.
 */
export function pointMarks(
  shots: readonly MatchShot[],
  opts: {
    youIsPlayer1: boolean;
    activeShot: number;
    view?: CourtView;
    activeBounceShown?: boolean;
  },
): CourtMark[] {
  const { youIsPlayer1, activeShot } = opts;
  const activeBounceShown = opts.activeBounceShown ?? true;
  if (activeShot <= 0) return [];
  // Orientation reads the WHOLE point so it cannot change mid-rally. The
  // camera view never rotates: `toCourtPercent`'s unrotated mapping already
  // puts the far baseline at the top.
  const youLow =
    opts.view === "camera" ? true : youAreAtLowEnd(shots, youIsPlayer1);
  if (youLow === null) return [];

  // The ring marks the most recent bounce on show.
  const liveAge = activeBounceShown ? 0 : 1;

  const out: CourtMark[] = [];
  shots.forEach((shot, i) => {
    const age = activeShot - (i + 1);
    if (age < 0 || age >= TRAIL.length) return;
    out.push(
      ...marksForShot(
        shot,
        youLow,
        youIsPlayer1,
        TRAIL[age],
        age === liveAge,
        true,
        age > 0 || activeBounceShown,
        i + 1,
        shots.length,
      ),
    );
  });
  return out;
}

/**
 * When the playing shot's bounce may be drawn, as a share of the way from its
 * contact to the next one. Measured on a real match's per-frame ball
 * trajectories (414 consecutive strokes): the bounce falls at 0.42 / 0.62 /
 * 0.85 of that gap (p10 / p50 / p90).
 */
export const BOUNCE_REVEAL_SHARE = 0.6;
/** The same for a rally's last shot, which has no next contact: median flight. */
export const BOUNCE_REVEAL_SECONDS = 0.75;

/** True once the film has reached the moment the playing shot's ball lands. */
export function bounceRevealed(
  filmTime: number,
  contactTime: number,
  nextContactTime: number | null,
): boolean {
  const at =
    nextContactTime !== null && nextContactTime > contactTime
      ? contactTime + (nextContactTime - contactTime) * BOUNCE_REVEAL_SHARE
      : contactTime + BOUNCE_REVEAL_SECONDS;
  return filmTime >= at;
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
    shots.forEach((shot, i) => {
      for (const mark of marksForShot(
        shot,
        youLow,
        opts.youIsPlayer1,
        1,
        false,
        false,
        true,
        i + 1,
        shots.length,
      )) {
        out.push({ ...mark, pointId: point.id });
      }
    });
  }
  return out;
}
