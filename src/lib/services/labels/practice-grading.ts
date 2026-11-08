/**
 * Grading a practice copy (practice-session.ts) against its answer key — the
 * completed analyst session it was made from. Pure: the loader
 * (practice-grading-server.ts) reads the rows and hands them here.
 *
 * Points are lined up by film time, not by id or index: the copy was seeded
 * fresh, so its rows share nothing with the key's but the video. Each live
 * key point takes the nearest unclaimed live copy point whose first stroke is
 * within `MATCH_TOLERANCE_SECONDS` of its own. What is left over is a
 * boundary error:
 *   - a key point with no partner — the applicant deleted or merged a real
 *     point, or never added one the AI missed;
 *   - a copy point with no partner — a rally the key removed (a let, a dead
 *     ball, a duplicate) that the applicant kept, or a point they added or
 *     split off that isn't one.
 *
 * Each matched pair is then compared field by field: server, winner, ending,
 * ended by, error kind, the last stroke (the last live stroke's family:
 * serve, forehand, backhand, volley, overhead) and the shot kinds (every tag
 * on the point's live strokes, sorted: `label_shots.tags`). A field the key
 * never set is not graded: error kind on a key nobody judged, and shot kinds
 * on a key with no tag anywhere — a key labelled before kinds existed.
 * Shot kinds are compared per point, not per stroke, because a copy's
 * strokes need not line up one for one with the key's.
 *
 * Every miss is split in two by what the AI pre-fill said, read off the
 * copy's own `seed`:
 *   - **missed fix** — the copy still holds the AI's value (or its AI point
 *     was never deleted / never added), and the key changed it;
 *   - **new error** — the applicant changed something the AI had right, or
 *     changed a wrong value to another wrong one.
 * Fields with no seed (error kind, last stroke, shot kinds) count a miss left
 * empty as missed and a wrong value entered as new.
 *
 * `fixesNeeded` is every place the copy's pre-fill disagreed with the key,
 * and `fixesMade` the ones the applicant got right — "caught N of M".
 */

export type Side = "p1" | "p2";

/** One `label_points` row, as grading reads it. */
export interface GradePoint {
  id: string;
  setNumber: number | null;
  server: Side | null;
  winner: Side | null;
  ending: string | null;
  endedBy: Side | null;
  errorKind: string | null;
  status: "unchanged" | "edited" | "added" | "deleted";
  /** The point's seeded fields; null on a point the labeller added. */
  seed: {
    server?: Side | null;
    winner?: Side | null;
    ending?: string | null;
    ended_by?: Side | null;
  } | null;
  /** Live strokes in video order: their film time, stroke and shot kinds. */
  shots: {
    videoTime: number | null;
    stroke: string | null;
    tags?: readonly string[];
  }[];
  /** The last live stroke's family as the pre-fill had it; null if unknown. */
  seedLastStroke?: string | null;
}

export const GRADED_FIELDS = [
  "server",
  "winner",
  "ending",
  "endedBy",
  "errorKind",
  "lastStroke",
  "shotKinds",
] as const;
export type GradedField = (typeof GRADED_FIELDS)[number];

export const FIELD_LABELS: Record<GradedField | "boundary", string> = {
  boundary: "Point boundaries",
  server: "Server",
  winner: "Winner",
  ending: "Ending",
  endedBy: "Ended by",
  errorKind: "Error kind",
  lastStroke: "Last stroke",
  shotKinds: "Shot kinds",
};

/** How far apart (seconds) two points' first strokes may be and still be one point. */
export const MATCH_TOLERANCE_SECONDS = 2.5;

/** Endings that mean "this rally is not a point". */
const NOT_A_POINT = new Set(["not_a_point", "let_replayed"]);

/** One disagreement, for the per-point list. */
export interface GradeMiss {
  field: GradedField | "boundary";
  kind: "missed_fix" | "new_error";
  /** Film time of the point, seconds. */
  at: number | null;
  expected: string | null;
  got: string | null;
}

export interface FieldTally {
  checked: number;
  correct: number;
  missedFixes: number;
  newErrors: number;
}

export interface PracticeGrade {
  /** Live key points graded. */
  keyPoints: number;
  /** Key points the copy had a partner for. */
  matched: number;
  /** Correct checks over all checks (boundaries + fields), 0–100. */
  accuracy: number;
  missedFixes: number;
  newErrors: number;
  fixesNeeded: number;
  fixesMade: number;
  byField: Record<GradedField | "boundary", FieldTally>;
  misses: GradeMiss[];
}

/** A stroke's family, as the last-stroke check compares it. */
export function strokeFamily(stroke: string | null): string | null {
  switch (stroke) {
    case null:
      return null;
    case "first_serve":
    case "second_serve":
      return "serve";
    case "forehand_volley":
    case "backhand_volley":
      return "volley";
    default:
      return stroke;
  }
}

/** Whether the row is a point at all: live and not a let or a non-point. */
export function isGradedPoint(point: GradePoint): boolean {
  return (
    point.status !== "deleted" &&
    !(point.ending !== null && NOT_A_POINT.has(point.ending))
  );
}

/** The first timed stroke, or null. */
export function pointTime(point: GradePoint): number | null {
  let first: number | null = null;
  for (const shot of point.shots) {
    if (typeof shot.videoTime !== "number") continue;
    if (first === null || shot.videoTime < first) first = shot.videoTime;
  }
  return first;
}

function lastStroke(point: GradePoint): string | null {
  const last = point.shots.at(-1);
  return last ? strokeFamily(last.stroke) : null;
}

/**
 * Every shot kind on the point's live strokes, sorted and joined ("approach,
 * passing"), or null for none. A kind on two strokes is listed twice.
 */
export function pointShotKinds(point: GradePoint): string | null {
  const kinds = point.shots.flatMap((shot) => shot.tags ?? []).sort();
  return kinds.length > 0 ? kinds.join(", ") : null;
}

function fieldValue(point: GradePoint, field: GradedField): string | null {
  switch (field) {
    case "server":
      return point.server;
    case "winner":
      return point.winner;
    case "ending":
      return point.ending;
    case "endedBy":
      return point.endedBy;
    case "errorKind":
      return point.errorKind;
    case "lastStroke":
      return lastStroke(point);
    case "shotKinds":
      return pointShotKinds(point);
  }
}

/** The AI's value for `field` on a copy point; `undefined` when it had none to give. */
function seedValue(
  point: GradePoint,
  field: GradedField,
): string | null | undefined {
  if (field === "lastStroke") return point.seedLastStroke;
  if (field === "errorKind" || field === "shotKinds") return null; // never seeded
  if (!point.seed) return undefined;
  const key = field === "endedBy" ? "ended_by" : field;
  return (point.seed as Record<string, string | null | undefined>)[key];
}

/**
 * Pair live key points with live copy points by first-stroke time: nearest
 * first, each copy point used once. Points without a timed stroke never pair.
 */
export function pairPoints(
  key: readonly GradePoint[],
  copy: readonly GradePoint[],
  tolerance = MATCH_TOLERANCE_SECONDS,
): {
  pairs: [GradePoint, GradePoint][];
  keyOnly: GradePoint[];
  copyOnly: GradePoint[];
} {
  const candidates: { k: number; c: number; gap: number }[] = [];
  key.forEach((kp, k) => {
    const kt = pointTime(kp);
    if (kt === null) return;
    copy.forEach((cp, c) => {
      const ct = pointTime(cp);
      if (ct === null) return;
      const gap = Math.abs(kt - ct);
      if (gap <= tolerance) candidates.push({ k, c, gap });
    });
  });
  candidates.sort((a, b) => a.gap - b.gap);
  const keyUsed = new Set<number>();
  const copyUsed = new Set<number>();
  const pairs: [GradePoint, GradePoint][] = [];
  for (const { k, c } of candidates) {
    if (keyUsed.has(k) || copyUsed.has(c)) continue;
    keyUsed.add(k);
    copyUsed.add(c);
    pairs.push([key[k], copy[c]]);
  }
  return {
    pairs,
    keyOnly: key.filter((_, i) => !keyUsed.has(i)),
    copyOnly: copy.filter((_, i) => !copyUsed.has(i)),
  };
}

function emptyTally(): FieldTally {
  return { checked: 0, correct: 0, missedFixes: 0, newErrors: 0 };
}

/**
 * Grade one copy against the key. `keyPoints` is every key row of the graded
 * set (tombstones included — they are filtered here); `copyPoints` every row
 * of the copy. A key point whose only partner is a copy point the applicant
 * removed is their error, not the AI's.
 */
export function gradePractice(
  keyPoints: readonly GradePoint[],
  copyPoints: readonly GradePoint[],
): PracticeGrade {
  const keyLive = keyPoints.filter(isGradedPoint);
  const copyLive = copyPoints.filter(isGradedPoint);
  // Copy rows the applicant removed (deleted, or marked not a point) that the
  // AI had seeded as points: their partners decide who dropped a key point.
  const copyRemoved = copyPoints.filter(
    (p) => !isGradedPoint(p) && p.status !== "added",
  );

  const byField = Object.fromEntries(
    (["boundary", ...GRADED_FIELDS] as const).map((f) => [f, emptyTally()]),
  ) as Record<GradedField | "boundary", FieldTally>;
  const misses: GradeMiss[] = [];
  let fixesNeeded = 0;
  let fixesMade = 0;

  // A key with no shot kind anywhere was labelled before kinds existed (or
  // its labeller tagged nothing): its points say nothing about kinds.
  const keyTagged = keyLive.some((p) => pointShotKinds(p) !== null);

  const { pairs, keyOnly, copyOnly } = pairPoints(keyLive, copyLive);
  const removedPairs = pairPoints(keyOnly, copyRemoved);
  const droppedByApplicant = new Set(removedPairs.pairs.map(([k]) => k.id));

  // Boundaries: one check per key point, one per copy point the key lacks.
  const boundary = byField.boundary;
  for (const [, cp] of pairs) {
    boundary.checked += 1;
    boundary.correct += 1;
    // The AI had no such point and the applicant added it: a fix made.
    if (cp.status === "added") {
      fixesNeeded += 1;
      fixesMade += 1;
    }
  }
  for (const kp of keyOnly) {
    boundary.checked += 1;
    const byApplicant = droppedByApplicant.has(kp.id);
    if (byApplicant) boundary.newErrors += 1;
    else {
      boundary.missedFixes += 1;
      fixesNeeded += 1;
    }
    misses.push({
      field: "boundary",
      kind: byApplicant ? "new_error" : "missed_fix",
      at: pointTime(kp),
      expected: "point",
      got: byApplicant ? "removed" : "missing",
    });
  }
  for (const cp of copyOnly) {
    boundary.checked += 1;
    const added = cp.status === "added";
    if (added) boundary.newErrors += 1;
    else {
      boundary.missedFixes += 1;
      fixesNeeded += 1;
    }
    misses.push({
      field: "boundary",
      kind: added ? "new_error" : "missed_fix",
      at: pointTime(cp),
      expected: "no point",
      got: added ? "added" : "kept",
    });
  }
  // Rallies the AI seeded that the key also has no point for, which the
  // applicant correctly removed.
  for (const cp of copyRemoved) {
    const partnered = removedPairs.pairs.some(([, c]) => c.id === cp.id);
    if (!partnered) {
      fixesNeeded += 1;
      fixesMade += 1;
    }
  }

  // Fields on every matched pair.
  for (const [kp, cp] of pairs) {
    for (const field of GRADED_FIELDS) {
      const expected = fieldValue(kp, field);
      // A key that never judged errors grades no error kind.
      if (field === "errorKind" && expected === null) continue;
      if (field === "shotKinds" && !keyTagged) continue;
      const got = fieldValue(cp, field);
      const ai = seedValue(cp, field);
      const tally = byField[field];
      tally.checked += 1;
      const aiWrong = ai === undefined ? false : ai !== expected;
      if (got === expected) {
        tally.correct += 1;
        if (aiWrong) {
          fixesNeeded += 1;
          fixesMade += 1;
        }
        continue;
      }
      // Wrong. Missed when the copy still holds the AI's value (or, for a
      // field the AI never fills, when it was left empty).
      const missed = ai === undefined ? got === null : got === ai;
      if (missed) {
        tally.missedFixes += 1;
        fixesNeeded += 1;
      } else {
        tally.newErrors += 1;
        if (aiWrong) fixesNeeded += 1;
      }
      misses.push({
        field,
        kind: missed ? "missed_fix" : "new_error",
        at: pointTime(kp),
        expected,
        got,
      });
    }
  }

  let checked = 0;
  let correct = 0;
  let missedFixes = 0;
  let newErrors = 0;
  for (const tally of Object.values(byField)) {
    checked += tally.checked;
    correct += tally.correct;
    missedFixes += tally.missedFixes;
    newErrors += tally.newErrors;
  }
  misses.sort((a, b) => (a.at ?? Infinity) - (b.at ?? Infinity));

  return {
    keyPoints: keyLive.length,
    matched: pairs.length,
    accuracy: checked === 0 ? 0 : Math.round((correct / checked) * 1000) / 10,
    missedFixes,
    newErrors,
    fixesNeeded,
    fixesMade,
    byField,
    misses,
  };
}

/** `seconds` of film as m:ss, or h:mm:ss past an hour. */
export function filmClock(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return "—";
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}

/** RFC 4180 CSV: every cell quoted when it needs to be. Pure. */
export function toCsv(
  rows: readonly (readonly (string | number | null)[])[],
): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const text = cell === null ? "" : String(cell);
          return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
        })
        .join(","),
    )
    .join("\r\n");
}
