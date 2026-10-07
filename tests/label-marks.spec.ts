import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import {
  analyzeResults,
  buildTranscript,
  lastStrokeWinner,
  POINT_FLAGS,
  serveCourtSide,
  SHOT_FLAGS,
  type DerivedPoint,
  type DerivedShot,
  type MatchScore,
  type RawSplitStepStroke,
  type SplitStepRally,
  type SplitStepStroke,
  type Transcript,
} from "@/lib/services/splitstep/derivation";
import {
  buildLabelMarks,
  isServeFault,
  LABEL_MARK_META,
  LABEL_ONLY_FLAGS,
  netHitTier,
  type LabelMark,
  type LabelMarks,
  type MarkablePoint,
} from "@/lib/services/labels/marks";
import { buildLabelSeed } from "@/lib/services/labels/seed";

const FIXTURES = path.join(__dirname, "fixtures", "splitstep");

function load(name: string) {
  const raw = JSON.parse(
    readFileSync(path.join(FIXTURES, name), "utf8"),
  ) as RawSplitStepStroke[];
  const analysis = analyzeResults(raw, { startTimeSeconds: 0 });
  // The fixture's own folded score, so the transcript reconciles — the same
  // route tests/label-seed.spec.ts takes.
  const probe = buildTranscript({
    rallies: analysis.rallies,
    labels: analysis.players,
    score: { player1: [], player2: [] },
    initialTopIsPlayer1: null,
  });
  const [p1, p2] = analysis.players;
  const sets = probe.reconciliation.foldedSets;
  const score: MatchScore = {
    player1: sets.map((s) => s[p1] ?? 0),
    player2: sets.map((s) => s[p2] ?? 0),
  };
  const transcript = buildTranscript({
    rallies: analysis.rallies,
    labels: analysis.players,
    score,
    initialTopIsPlayer1: null,
  });
  return { raw, analysis, transcript };
}

/** Label-shaped rows from the seed, with ids synthesised from the vendor ids. */
function labelPointsFrom(
  transcript: Transcript,
  raw: RawSplitStepStroke[],
): MarkablePoint[] {
  return buildLabelSeed(transcript, raw).points.map((point) => ({
    id: `point-${point.point_index}`,
    vendorRallyIds: point.vendor_rally_ids,
    shots: point.shots.map((shot) => ({
      id: `shot-${shot.event_id}`,
      eventId: shot.event_id,
    })),
  }));
}

const side = (isPlayer1: boolean) => (isPlayer1 ? "p1" : "p2");
const codesOf = (marks: LabelMark[] | undefined) =>
  (marks ?? []).map((m) => m.code);

const clean = load("clean-match.json");
const cleanPoints = labelPointsFrom(clean.transcript, clean.raw);
// Every code the derivation raises, hidden ones too — the scorecard's
// reading, and what the join itself is pinned against.
const cleanMarks = buildLabelMarks(
  clean.transcript,
  clean.analysis.rallies,
  cleanPoints,
  { hidden: true },
);
// What the console is handed: no hidden mark at all.
const shownMarks = buildLabelMarks(
  clean.transcript,
  clean.analysis.rallies,
  cleanPoints,
);
const rallyById = new Map(clean.analysis.rallies.map((r) => [r.rallyId, r]));
const labelIdOfRally = (rallyId: number) =>
  cleanPoints.find((p) => p.vendorRallyIds.includes(rallyId))!.id;

test.describe("buildLabelMarks on the clean fixture", () => {
  test("a transcript point's flags land on the label point whose vendorRallyIds holds its rally id", () => {
    let flagged = 0;
    for (const point of clean.transcript.points) {
      // The two score flags are the console's to raise (score-marks.ts).
      const known = point.flags.filter(
        (f) =>
          f in LABEL_MARK_META &&
          f !== POINT_FLAGS.SERVICE_COURT_REPEAT &&
          f !== POINT_FLAGS.SCORE_SIDE_MISMATCH,
      );
      if (known.length === 0) continue;
      flagged += 1;
      const labelId = labelIdOfRally(point.rally_id);
      const codes = codesOf(cleanMarks.points[labelId]);
      for (const code of known) expect(codes).toContain(code);
      // Point marks carry point-scoped codes only, in the derivation's order.
      for (const m of cleanMarks.points[labelId]) {
        expect(m.scope).toBe("point");
        expect(m.tier).toBe(LABEL_MARK_META[m.code].tier);
      }
    }
    expect(flagged).toBeGreaterThan(20);
    // Nothing lands on a label point without a flagged rally.
    for (const [labelId, marks] of Object.entries(cleanMarks.points)) {
      expect(marks.length).toBeGreaterThan(0);
      const point = cleanPoints.find((p) => p.id === labelId)!;
      const derived = clean.transcript.points.filter((p) =>
        point.vendorRallyIds.includes(p.rally_id),
      );
      expect(derived.length).toBeGreaterThan(0);
    }
  });

  test("winner_disputed names the score's winner and the last stroke's, as sides that differ", () => {
    const disputed = clean.transcript.points.filter((p) =>
      p.flags.includes(POINT_FLAGS.WINNER_DISPUTED),
    );
    expect(disputed.length).toBeGreaterThan(10);
    const player1 = clean.transcript.reconciliation.player1Label;
    for (const point of disputed) {
      const marks = cleanMarks.points[labelIdOfRally(point.rally_id)];
      const m = marks.find((x) => x.code === "winner_disputed");
      expect(m).toBeDefined();
      if (m?.code !== "winner_disputed") throw new Error("narrowing");
      expect(m.tier).toBe("count");
      expect(m.params.scoreWinner).toBe(side(point.won_by_player1));
      const byFlag = lastStrokeWinner(rallyById.get(point.rally_id)!);
      expect(m.params.lastStrokeWinner).toBe(side(byFlag === player1));
      expect(m.params.lastStrokeWinner).not.toBe(m.params.scoreWinner);
    }
  });

  test("a shot flag lands on the label shot whose eventId is the derived shot's event_id", () => {
    let seen = 0;
    for (const point of clean.transcript.points) {
      point.shots.forEach((shot, i) => {
        const known = shot.flags.filter((f) => f in LABEL_MARK_META);
        if (known.length === 0) {
          expect(cleanMarks.shots[`shot-${shot.event_id}`]).toBeUndefined();
          return;
        }
        seen += 1;
        const marks = cleanMarks.shots[`shot-${shot.event_id}`];
        expect(codesOf(marks)).toEqual(known);
        for (const m of marks) {
          expect(m.scope).toBe("shot");
          if (m.code === "out_ball_rally_continued") {
            expect(m.tier).toBe("hidden");
            expect(m.params.nextHitter).toBe(
              side(point.shots[i + 1].is_player1),
            );
          }
          if (m.code === "net_hit_contradicts_height") {
            // A hint only where it bears on the ending: the last stroke.
            expect(m.tier).toBe(
              i === point.shots.length - 1 ? "hint" : "hidden",
            );
          }
          if (m.code === "geometry_discarded") expect(m.tier).toBe("hidden");
        }
      });
    }
    expect(seen).toBeGreaterThan(100);
    expect(
      Object.values(cleanMarks.shots).some((ms) =>
        ms.some((m) => m.code === "net_hit_contradicts_height"),
      ),
    ).toBe(true);
  });

  test("phantom_strokes_dropped lists the rally's strokes the transcript has no shot for", () => {
    const dropped = clean.transcript.points.filter((p) =>
      p.flags.includes(POINT_FLAGS.PHANTOM_STROKES_DROPPED),
    );
    expect(dropped.length).toBeGreaterThan(5);
    for (const point of dropped) {
      const labelId = labelIdOfRally(point.rally_id);
      const m = cleanMarks.points[labelId].find(
        (x) => x.code === "phantom_strokes_dropped",
      );
      if (m?.code !== "phantom_strokes_dropped") throw new Error("missing");
      expect(m.tier).toBe("hidden");
      const kept = new Set(point.shots.map((s) => s.event_id));
      const rally = rallyById.get(point.rally_id)!;
      expect(m.params.eventIds).toEqual(
        rally.strokes.filter((s) => !kept.has(s.eventId)).map((s) => s.eventId),
      );
      // The seed made a label row for each of them — the ghost rows.
      const labelShots = cleanPoints.find((p) => p.id === labelId)!.shots;
      for (const id of m.params.eventIds) {
        expect(labelShots.some((s) => s.eventId === id)).toBe(true);
      }
      expect(["p1", "p2"]).toContain(m.params.hitter);
    }
  });

  test("the two score flags are not marks; serveSides carries the side each serve was hit from instead", () => {
    // The file flags them, the marks do not: the console raises both against
    // the LABELLED score (score-marks.ts), which the file cannot know.
    expect(
      clean.transcript.points.some((p) =>
        p.flags.includes(POINT_FLAGS.SERVICE_COURT_REPEAT),
      ),
    ).toBe(true);
    for (const marks of Object.values(cleanMarks.points)) {
      for (const m of marks) {
        expect(m.code).not.toBe("service_court_repeat");
        expect(m.code).not.toBe("score_side_mismatch");
      }
    }

    // Every transcript point with a label row and a serve clear of the
    // centre mark has its side; the side is the server's stance.
    let sided = 0;
    for (const point of clean.transcript.points) {
      const labelId = labelIdOfRally(point.rally_id);
      const serve = rallyById.get(point.rally_id)!.serves[0];
      const expected =
        serve && Math.abs(serve.playerX ?? 0) >= 0.3
          ? serveCourtSide(serve.playerX, serve.playerY)
          : null;
      if (expected === null) continue;
      sided += 1;
      expect(cleanMarks.serveSides[labelId]).toBe(expected);
    }
    expect(sided).toBeGreaterThan(20);
    for (const side of Object.values(cleanMarks.serveSides)) {
      expect(["deuce", "ad"]).toContain(side);
    }
    // A point the labeller added has no vendor rally, so no side.
    for (const id of Object.keys(cleanMarks.serveSides)) {
      expect(
        cleanPoints.find((p) => p.id === id)?.vendorRallyIds.length,
      ).toBeGreaterThan(0);
    }
  });

  test("a flag whose rally or event has no label row is dropped, and nothing else moves", () => {
    const flagged = clean.transcript.points.find(
      (p) =>
        p.flags.includes(POINT_FLAGS.WINNER_DISPUTED) &&
        p.shots.some((s) => s.flags.length > 0),
    )!;
    const gone = labelIdOfRally(flagged.rally_id);
    const without = cleanPoints.filter((p) => p.id !== gone);
    const marks = buildLabelMarks(
      clean.transcript,
      clean.analysis.rallies,
      without,
      { hidden: true },
    );
    expect(cleanMarks.points[gone]).toBeDefined();
    expect(marks.points[gone]).toBeUndefined();
    for (const shot of flagged.shots) {
      expect(marks.shots[`shot-${shot.event_id}`]).toBeUndefined();
    }
    expect(marks.suggestions.some((s) => s.pointId === gone)).toBe(false);
    // Every other row reads exactly as before.
    const rest = { ...cleanMarks.points };
    delete rest[gone];
    expect(marks.points).toEqual(rest);
    const restShots = { ...cleanMarks.shots };
    for (const shot of flagged.shots) delete restShots[`shot-${shot.event_id}`];
    expect(marks.shots).toEqual(restShots);

    // One shot row missing: its marks and the suggestion that would sit after
    // it go; the point's own marks stay.
    const pair = cleanMarks.suggestions.find((s) => s.kind === "missing_shot")!;
    const pruned = cleanPoints.map((p) =>
      p.id === pair.pointId
        ? { ...p, shots: p.shots.filter((s) => s.id !== pair.afterShotId) }
        : p,
    );
    const marks2 = buildLabelMarks(
      clean.transcript,
      clean.analysis.rallies,
      pruned,
      { hidden: true },
    );
    expect(marks2.shots[pair.afterShotId]).toBeUndefined();
    expect(marks2.suggestions.some((s) => s.key === pair.key)).toBe(false);
    expect(marks2.points[pair.pointId]).toEqual(
      cleanMarks.points[pair.pointId],
    );
  });

  test("a code outside the vocabulary produces no mark", () => {
    const [first, ...rest] = clean.transcript.points;
    const doctored: Transcript = {
      ...clean.transcript,
      points: [
        {
          ...first,
          flags: [...first.flags, "hitter_switched", "winner_by_two_of_three"],
          shots: first.shots.map((s) => ({
            ...s,
            flags: [...s.flags, "return_moved", "vendor_unsure"],
          })),
        },
        ...rest,
      ],
    };
    const marks = buildLabelMarks(
      doctored,
      clean.analysis.rallies,
      cleanPoints,
      { hidden: true },
    );
    expect(marks).toEqual(cleanMarks);
    const all = [
      ...Object.values(marks.points).flat(),
      ...Object.values(marks.shots).flat(),
    ];
    for (const m of all) {
      expect(m.code).not.toBe("hitter_switched");
      expect(m.code in LABEL_MARK_META).toBe(true);
      expect(m.scope).toBe(LABEL_MARK_META[m.code].scope);
    }
  });

  test("one missing_shot suggestion per same-player pair, after the pair's first shot", () => {
    const suggestions = cleanMarks.suggestions.filter(
      (s) => s.kind === "missing_shot",
    );
    expect(suggestions.length).toBeGreaterThan(0);
    const flaggedPoints = clean.transcript.points.filter((p) =>
      p.flags.includes(POINT_FLAGS.SAME_PLAYER_CONSECUTIVE),
    );
    expect(new Set(suggestions.map((s) => s.pointId))).toEqual(
      new Set(flaggedPoints.map((p) => labelIdOfRally(p.rally_id))),
    );
    for (const s of suggestions) {
      if (s.kind !== "missing_shot") throw new Error("narrowing");
      const point = clean.transcript.points.find(
        (p) => labelIdOfRally(p.rally_id) === s.pointId,
      )!;
      const afterEventId = Number(s.key.slice("missing_shot:".length));
      expect(s.afterShotId).toBe(`shot-${afterEventId}`);
      const i = point.shots.findIndex((x) => x.event_id === afterEventId);
      const a = point.shots[i];
      const b = point.shots[i + 1];
      expect(a.is_player1).toBe(b.is_player1);
      expect(s.hitter).toBe(side(!a.is_player1));
      expect(s.videoTime).toBeCloseTo((a.video_time! + b.video_time!) / 2, 6);
    }
    // The fixture's first such point: P3, strokes 16 and 17 both by player 2.
    const p3 = suggestions.find((s) => s.pointId === "point-2");
    expect(p3).toMatchObject({
      key: "missing_shot:16",
      afterShotId: "shot-16",
      hitter: "p1",
    });
  });

  test("no missing_point suggestion comes from the file: it is read off the labelled rows (score-marks.ts)", () => {
    expect(
      cleanMarks.suggestions.filter((s) => s.kind === "missing_point"),
    ).toHaveLength(0);
    expect(cleanMarks.suggestions.length).toBeGreaterThan(0);
  });

  test("a rally with exactly one out-called serve and a short tail is a serve_fault; the fold's silence is a pick_winner", () => {
    const faults = cleanPoints.filter((p) =>
      codesOf(cleanMarks.points[p.id]).includes(LABEL_ONLY_FLAGS.SERVE_FAULT),
    );
    const expected = clean.transcript.points.filter((p) =>
      isServeFault(rallyById.get(p.rally_id)!),
    );
    expect(expected.length).toBeGreaterThan(0);
    expect(new Set(faults.map((p) => p.id))).toEqual(
      new Set(expected.map((p) => labelIdOfRally(p.rally_id))),
    );
    // Every clean-match winner settled, so nobody is asked to pick one.
    expect(
      Object.values(cleanMarks.points)
        .flat()
        .some((m) => m.code === LABEL_ONLY_FLAGS.PICK_WINNER),
    ).toBe(false);
  });
});

test.describe("buildLabelMarks on the degraded fixture", () => {
  test("a refused transcript yields no marks at all", () => {
    // The degraded payload is refused outright (its warm-up rally resolves no
    // winner — tests/splitstep-transcript.spec.ts), so it has no points to
    // mark and the labels console would never seed it either.
    const degraded = load("degraded-match.json");
    expect(degraded.transcript.ok).toBe(false);
    expect(degraded.transcript.points).toEqual([]);
    const marks = buildLabelMarks(
      degraded.transcript,
      degraded.analysis.rallies,
      [],
    );
    expect(marks).toEqual({
      points: {},
      shots: {},
      suggestions: [],
      serveSides: {},
    });
  });
});

// ---------------------------------------------------------------------------
// Hand-built rallies for the two labels-only flags.
// ---------------------------------------------------------------------------

function stroke(over: Partial<SplitStepStroke>): SplitStepStroke {
  return {
    eventId: 0,
    videoTime: 0,
    trimmedFrame: 0,
    bounceFrame: null,
    rallyId: 1,
    strokeNumber: 1,
    playerLabel: "A",
    predPointScore: "0-0",
    predGameScore: "0-0",
    predSetScore: "0-0",
    strokeType: "groundstroke",
    strokeSide: "forehand",
    strokeScore: 1,
    sideScore: 1,
    playerX: 1,
    playerY: -5,
    opponentX: 0,
    opponentY: 5,
    speedKmh: 100,
    spinType: "flat",
    initialHeightM: 1,
    heightAtNetM: 1.5,
    netHit: false,
    bounceX: 0,
    bounceY: 5,
    bounceScore: 1,
    in: true,
    lineConfidence: 0.9,
    ...over,
  };
}

/** A rally from (label, kind, in) triples, numbered and timed in order. */
function rallyOf(
  rallyId: number,
  spec: Array<[label: string, type: "serve" | "groundstroke", isIn?: boolean]>,
): SplitStepRally {
  const strokes = spec.map(([label, type, isIn = true], i) =>
    stroke({
      eventId: rallyId * 100 + i,
      videoTime: 10 * rallyId + i,
      rallyId,
      strokeNumber: i + 1,
      playerLabel: label,
      strokeType: type,
      strokeSide: type === "serve" ? "overhead" : "forehand",
      playerY: label === "A" ? -5 : 5,
      in: isIn,
    }),
  );
  return {
    rallyId,
    strokes,
    server: strokes[0]?.playerLabel ?? "A",
    serves: strokes.filter((s) => s.strokeType === "serve"),
  };
}

function shotOf(s: SplitStepStroke, index: number): DerivedShot {
  return {
    event_id: s.eventId,
    shot_number: index + 1,
    is_player1: s.playerLabel === "A",
    shot_type: s.strokeType === "serve" ? "First Serve" : "Forehand",
    spin_type: s.spinType,
    speed_mph: null,
    contact_x: s.playerX,
    contact_y: s.playerY,
    landing_x: s.bounceX,
    landing_y: s.bounceY,
    result: null,
    video_time: s.videoTime,
    bounce_video_time: null,
    zone: null,
    flags: [],
    derived: true,
  };
}

function pointOf(
  rally: SplitStepRally,
  number: number,
  over: Partial<DerivedPoint> = {},
): DerivedPoint {
  return {
    rally_id: rally.rallyId,
    point_number: number,
    set_number: 1,
    game_number: 1,
    server_is_player1: rally.server === "A",
    won_by_player1: false,
    rally_length: rally.strokes.length,
    result_type: null,
    is_break_point: false,
    is_set_point: false,
    is_match_point: false,
    set_score: "0-0",
    game_score: "0-0",
    point_score: "0-0",
    video_time: rally.strokes[0]?.videoTime ?? null,
    duration: null,
    flags: [],
    derived: true,
    shots: rally.strokes.map(shotOf),
    ...over,
  };
}

/** A transcript around hand-built rallies; `winners` is per rally, by label. */
function transcriptOf(
  rallies: SplitStepRally[],
  winners: Array<string | null>,
  pointsOver: Array<Partial<DerivedPoint>> = [],
): Transcript {
  return {
    ...clean.transcript,
    points: rallies.map((r, i) =>
      pointOf(r, i + 1, {
        won_by_player1: winners[i] === "A",
        ...(pointsOver[i] ?? {}),
      }),
    ),
    reconciliation: {
      ...clean.transcript.reconciliation,
      player1Label: "A",
      settledWinners: rallies.map((r, i) => ({
        rallyId: r.rallyId,
        server: r.server,
        winner: winners[i],
        via: winners[i] === null ? null : "ladder",
      })),
    },
  };
}

function labelRows(rallies: SplitStepRally[]): MarkablePoint[] {
  return rallies.map((r, i) => ({
    id: `p${i + 1}`,
    vendorRallyIds: [r.rallyId],
    shots: r.strokes.map((s) => ({ id: `s${s.eventId}`, eventId: s.eventId })),
  }));
}

const marksFor = (
  rallies: SplitStepRally[],
  winners: Array<string | null>,
  pointsOver?: Array<Partial<DerivedPoint>>,
): LabelMarks =>
  buildLabelMarks(
    transcriptOf(rallies, winners, pointsOver),
    rallies,
    labelRows(rallies),
  );

test.describe("the labels-only flags", () => {
  test("serve_fault: one serve called out, one or two strokes after it", () => {
    const oneBack = rallyOf(1, [
      ["A", "serve", false],
      ["B", "groundstroke"],
    ]);
    const twoBack = rallyOf(2, [
      ["A", "serve", false],
      ["B", "groundstroke"],
      ["A", "groundstroke"],
    ]);
    const marks = marksFor([oneBack, twoBack], ["A", "B"]);
    expect(codesOf(marks.points.p1)).toEqual(["serve_fault"]);
    expect(codesOf(marks.points.p2)).toEqual(["serve_fault"]);
    const m = marks.points.p1[0];
    expect(m).toEqual({
      code: "serve_fault",
      tier: "hint",
      scope: "point",
      params: {},
    });
    expect(isServeFault(oneBack)).toBe(true);
    expect(isServeFault(twoBack)).toBe(true);
  });

  test("serve_fault: three strokes after the serve, a serve called in, or a second serve is not one", () => {
    const threeBack = rallyOf(1, [
      ["A", "serve", false],
      ["B", "groundstroke"],
      ["A", "groundstroke"],
      ["B", "groundstroke"],
    ]);
    const calledIn = rallyOf(2, [
      ["A", "serve", true],
      ["B", "groundstroke"],
    ]);
    const secondServe = rallyOf(3, [
      ["A", "serve", false],
      ["A", "serve", false],
      ["B", "groundstroke"],
    ]);
    const unreturned = rallyOf(4, [["A", "serve", false]]);
    const marks = marksFor(
      [threeBack, calledIn, secondServe, unreturned],
      ["A", "A", "B", "B"],
    );
    expect(marks.points).toEqual({});
    for (const r of [threeBack, calledIn, secondServe, unreturned]) {
      expect(isServeFault(r)).toBe(false);
    }
  });

  test("pick_winner: the fold settled no winner — and only then", () => {
    const rally = rallyOf(1, [
      ["A", "serve"],
      ["B", "groundstroke"],
      ["A", "groundstroke"],
      ["B", "groundstroke"],
    ]);
    const open = marksFor([rally], [null]);
    expect(open.points.p1).toEqual([
      { code: "pick_winner", tier: "count", scope: "point", params: {} },
    ]);
    const settled = marksFor([rally], ["B"]);
    expect(settled.points.p1).toBeUndefined();
    // A rally the fold never saw at all is not a pick either.
    const transcript = transcriptOf([rally], ["B"]);
    transcript.reconciliation.settledWinners = [];
    const unseen = buildLabelMarks(transcript, [rally], labelRows([rally]));
    expect(unseen.points.p1).toBeUndefined();
  });
});

test.describe("the three tiers", () => {
  test("six codes can change the score, and only they are counted", () => {
    const counted = Object.entries(LABEL_MARK_META)
      .filter(([, meta]) => meta.tier === "count")
      .map(([code]) => code);
    expect(counted.sort()).toEqual([
      "pick_winner",
      "reserve_after_in",
      "score_side_mismatch",
      "service_court_repeat",
      "tiebreak_score_off_six_all",
      "winner_disputed",
    ]);
    // “Net or out?” is a hint on the point's last stroke only.
    expect(netHitTier(true)).toBe("hint");
    expect(netHitTier(false)).toBe("hidden");
  });

  test("a hidden mark never reaches the rows: the default output carries none", () => {
    // The fixture raises every hidden code, so this is not vacuous.
    const hiddenSeen = new Set(
      [...Object.values(cleanMarks.points), ...Object.values(cleanMarks.shots)]
        .flat()
        .filter((m) => m.tier === "hidden")
        .map((m) => m.code),
    );
    expect([...hiddenSeen]).toEqual(
      expect.arrayContaining([
        "same_player_consecutive",
        "phantom_strokes_dropped",
        "out_ball_rally_continued",
      ]),
    );

    const shown = [
      ...Object.values(shownMarks.points),
      ...Object.values(shownMarks.shots),
    ];
    for (const list of shown) {
      // No row is left holding an empty list.
      expect(list.length).toBeGreaterThan(0);
      for (const m of list) expect(m.tier).not.toBe("hidden");
    }
    // Exactly the full reading with the hidden marks taken out.
    const strip = (into: Record<string, LabelMark[]>) =>
      Object.fromEntries(
        Object.entries(into)
          .map(([id, list]) => [id, list.filter((m) => m.tier !== "hidden")])
          .filter(([, list]) => list.length > 0),
      );
    expect(shownMarks.points).toEqual(strip(cleanMarks.points));
    expect(shownMarks.shots).toEqual(strip(cleanMarks.shots));
  });

  test("hiding the chips takes nothing from the slots or the serve sides", () => {
    // `same_player_consecutive`'s missing-stroke slot and `serveSides` are
    // built beside the marks, not from them.
    expect(shownMarks.suggestions).toEqual(cleanMarks.suggestions);
    expect(
      shownMarks.suggestions.filter((s) => s.kind === "missing_shot").length,
    ).toBeGreaterThan(0);
    expect(shownMarks.serveSides).toEqual(cleanMarks.serveSides);
  });

  test("“Net or out?” is a hint on the point's last stroke only", () => {
    const rally = rallyOf(1, [
      ["A", "serve"],
      ["B", "groundstroke"],
      ["A", "groundstroke"],
    ]);
    const netHit = (at: number[]): Array<Partial<DerivedPoint>> => [
      {
        shots: rally.strokes.map((s, i) => ({
          ...shotOf(s, i),
          flags: at.includes(i) ? [SHOT_FLAGS.NET_HIT_CONTRADICTS_HEIGHT] : [],
        })),
      },
    ];
    const [first, , last] = rally.strokes.map((s) => `s${s.eventId}`);

    // On the last stroke: a hint, on that shot.
    const onLast = marksFor([rally], ["A"], netHit([2]));
    expect(onLast.shots).toEqual({
      [last]: [
        {
          code: "net_hit_contradicts_height",
          tier: "hint",
          scope: "shot",
          params: {},
        },
      ],
    });

    // Mid-rally: nothing at all in what the console is handed…
    const mid = marksFor([rally], ["A"], netHit([0, 2]));
    expect(Object.keys(mid.shots)).toEqual([last]);
    // …and hidden in the full reading.
    const full = buildLabelMarks(
      transcriptOf([rally], ["A"], netHit([0, 2])),
      [rally],
      labelRows([rally]),
      { hidden: true },
    );
    expect(full.shots[first].map((m) => m.tier)).toEqual(["hidden"]);
    expect(full.shots[last].map((m) => m.tier)).toEqual(["hint"]);
  });
});
