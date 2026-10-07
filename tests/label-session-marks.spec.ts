import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import {
  analyzeResults,
  buildTranscript,
  type MatchScore,
  type RawSplitStepStroke,
} from "@/lib/services/splitstep/derivation";
import {
  buildLabelMarks,
  type LabelMarks,
  type MarkablePoint,
} from "@/lib/services/labels/marks";
import { buildLabelSeed } from "@/lib/services/labels/seed";
import {
  buildJobMarks,
  getLabelSession,
  parseFinalScore,
  parseMatchScore,
  type SessionDependencies,
} from "@/lib/data/labels-server";
import type { AdminClient } from "@/lib/supabase/admin";

/**
 * The session loader's marks (T36): built only when the session has
 * `marks_enabled` and a job, from the job's raw results file with the current
 * derivation code, and never at the cost of the console — a failure is logged
 * and the session still opens with `marks: null`. Plus the three fields the
 * "Score doesn't add up" banner reads off the session.
 */

const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const JOB_ID = "22222222-2222-4222-8222-222222222222";
const MATCH_ID = "33333333-3333-4333-8333-333333333333";

const SESSION_ROW = {
  id: SESSION_ID,
  job_id: JOB_ID,
  match_id: MATCH_ID,
  status: "labelling",
  derivation_version: "0.7.0-unreconciled",
  ad_scoring: null,
  marks_enabled: true,
  final_score: [
    [6, 4],
    [3, 6],
  ],
  video_ends_early: false,
};

const MATCH_ROW = {
  id: MATCH_ID,
  player1_name: "Jordan Lee",
  player2_name: "Elena Vargas",
  score: { player1: [6, 3], player2: [4, 6], winner: "player1" },
};

// Two points stored out of index order, so the loader's sort is what the
// marks builder sees.
const POINT_ROWS = [
  {
    id: "p-0002",
    point_index: 1,
    vendor_rally_ids: [1002],
    set_number: 1,
    game_number: 1,
    server: "p1",
    serve_side: "ad",
    winner: "p1",
    ending: "ace",
    ended_by: "p1",
    game_type: "game",
    status: "unchanged",
    status_before_delete: null,
    checked_at: null,
    note: null,
    dismissed: [],
    seed: null,
  },
  {
    id: "p-0001",
    point_index: 0,
    vendor_rally_ids: [1001],
    set_number: 1,
    game_number: 1,
    server: "p1",
    serve_side: "deuce",
    winner: "p2",
    ending: "error",
    ended_by: "p1",
    game_type: "game",
    status: "unchanged",
    status_before_delete: null,
    checked_at: null,
    note: null,
    dismissed: [],
    seed: null,
  },
];

const SHOT_ROWS = [
  {
    id: "s-serve",
    label_point_id: "p-0001",
    event_id: 101,
    after_event_id: null,
    status: "kept",
    status_before_delete: null,
    delete_reason: null,
    hitter: "p1",
    stroke: "first_serve",
    result: "in",
    spin: null,
    contact_x: null,
    contact_y: null,
    landing_x: null,
    landing_y: null,
    video_time: 10,
    site_removal: null,
    site_removal_restored_at: null,
    seed: null,
  },
];

const FIXTURE_MARKS: LabelMarks = {
  points: {
    "p-0001": [
      {
        code: "winner_disputed",
        tier: "count",
        scope: "point",
        params: { scoreWinner: "p2", lastStrokeWinner: "p1" },
      },
    ],
  },
  shots: {},
  suggestions: [],
  serveSides: {},
};

/**
 * A stand-in for the admin client answering the loader's reads: one row for
 * the session and the match, the point and shot rows through `readAllPages`'s
 * `.range()`, and nothing for `processing_jobs` (the session has no scoring
 * of its own, so the loader asks the job and gets null).
 */
function stubSessionClient(
  session: Record<string, unknown> | null = SESSION_ROW,
) {
  const selects: Record<string, string[]> = {};
  const rowsFor = (table: string): unknown[] => {
    if (table === "label_points") return POINT_ROWS;
    if (table === "label_shots") return SHOT_ROWS;
    return [];
  };
  const singleFor = (table: string): unknown => {
    if (table === "label_sessions") return session;
    if (table === "matches") return MATCH_ROW;
    return null;
  };
  const client = {
    from(table: string) {
      const chain = {
        select(columns: string) {
          (selects[table] ??= []).push(columns);
          return chain;
        },
        eq: () => chain,
        order: () => chain,
        maybeSingle: async () => ({ data: singleFor(table), error: null }),
        range: async () => ({ data: rowsFor(table), error: null }),
      };
      return chain;
    },
  };
  return { selects, db: client as unknown as AdminClient };
}

function depsWith(
  db: AdminClient,
  buildMarks: SessionDependencies["buildMarks"],
): SessionDependencies {
  return {
    requireAdmin: (async () => ({ id: "admin" })) as never,
    createAdminClient: () => db,
    loadVideo: async () => null,
    buildMarks,
  };
}

/** `console.error` captured for one call, then restored. */
async function capturingErrors<T>(
  run: () => Promise<T>,
): Promise<{ result: T; errors: unknown[][] }> {
  const errors: unknown[][] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    errors.push(args);
  };
  try {
    return { result: await run(), errors };
  } finally {
    console.error = original;
  }
}

test.describe("getLabelSession's marks", () => {
  test("a session with marks_enabled builds them from its job, over the points in point_index order", async () => {
    const { db } = stubSessionClient();
    const calls: { jobId: string; pointIds: string[]; shotIds: string[] }[] =
      [];
    const result = await getLabelSession(
      SESSION_ID,
      depsWith(db, async (_db, jobId) => (points) => {
        calls.push({
          jobId,
          pointIds: points.map((p) => p.id),
          shotIds: points.flatMap((p) => p.shots.map((s) => s.id)),
        });
        return FIXTURE_MARKS;
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(calls).toEqual([
      {
        jobId: JOB_ID,
        pointIds: ["p-0001", "p-0002"],
        shotIds: ["s-serve"],
      },
    ]);
    expect(result.marks).toEqual(FIXTURE_MARKS);
    expect(result.session.marksEnabled).toBe(true);
  });

  test("a session with marks_enabled off never calls the builder and carries null", async () => {
    const { db } = stubSessionClient({ ...SESSION_ROW, marks_enabled: false });
    let called = 0;
    const { result, errors } = await capturingErrors(() =>
      getLabelSession(
        SESSION_ID,
        depsWith(db, async () => {
          called += 1;
          return () => FIXTURE_MARKS;
        }),
      ),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(called).toBe(0);
    expect(result.marks).toBeNull();
    expect(result.session.marksEnabled).toBe(false);
    expect(result.session.points.map((p) => p.id)).toEqual([
      "p-0001",
      "p-0002",
    ]);
    expect(errors).toEqual([]);
  });

  test("a session whose job is gone has no file to derive from", async () => {
    const { db } = stubSessionClient({ ...SESSION_ROW, job_id: null });
    let called = 0;
    const result = await getLabelSession(
      SESSION_ID,
      depsWith(db, async () => {
        called += 1;
        return () => FIXTURE_MARKS;
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(called).toBe(0);
    expect(result.marks).toBeNull();
  });

  test("a builder that throws is logged and leaves the session usable with marks: null", async () => {
    const { db } = stubSessionClient();
    const { result, errors } = await capturingErrors(() =>
      getLabelSession(
        SESSION_ID,
        depsWith(db, async () => {
          throw new Error("could not read results: blob missing");
        }),
      ),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.marks).toBeNull();
    expect(result.session.points).toHaveLength(2);
    expect(result.session.points[0].shots.map((s) => s.id)).toEqual([
      "s-serve",
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0][0]).toBe("[labels] marks unavailable");
    expect(errors[0][1]).toMatchObject({
      sessionId: SESSION_ID,
      jobId: JOB_ID,
      message: "could not read results: blob missing",
    });
  });

  test("the loader selects the banner's fields and the session carries them", async () => {
    const { db, selects } = stubSessionClient();
    const result = await getLabelSession(
      SESSION_ID,
      depsWith(db, async () => () => FIXTURE_MARKS),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const sessionColumns = selects.label_sessions[0].split(/,\s*/);
    expect(sessionColumns).toContain("final_score");
    expect(sessionColumns).toContain("video_ends_early");
    expect(selects.matches[0].split(/,\s*/)).toContain("score");
    expect(result.session.finalScore).toEqual([
      [6, 4],
      [3, 6],
    ]);
    expect(result.session.videoEndsEarly).toBe(false);
    expect(result.session.matchScore).toEqual({
      player1: [6, 3],
      player2: [4, 6],
      winner: "player1",
    });
  });

  test("nothing in the loader reads a flags column", () => {
    const source = readFileSync(
      path.join(__dirname, "..", "src", "lib", "data", "labels-server.ts"),
      "utf8",
    );
    const selected = [...source.matchAll(/\.select\(\s*"([^"]*)"/g)].map(
      (m) => m[1],
    );
    expect(selected.length).toBeGreaterThan(0);
    for (const columns of selected) {
      expect(columns.split(/,\s*/)).not.toContain("flags");
    }
    // No string literal names the column either, however it is selected.
    expect(source).not.toMatch(/"[^"\n]*\bflags\b[^"\n]*"/);
  });
});

test.describe("the banner's fields", () => {
  test("parseFinalScore accepts [p1, p2] pairs and nothing else", () => {
    expect(parseFinalScore(null)).toBeNull();
    expect(parseFinalScore(undefined)).toBeNull();
    expect(parseFinalScore([])).toEqual([]);
    expect(
      parseFinalScore([
        [6, 4],
        [7, 6],
      ]),
    ).toEqual([
      [6, 4],
      [7, 6],
    ]);
    expect(parseFinalScore([[6, 4, 2]])).toBeNull();
    expect(parseFinalScore([[6, "4"]])).toBeNull();
    expect(parseFinalScore({ player1: [6], player2: [4] })).toBeNull();
    expect(parseFinalScore("6-4")).toBeNull();
  });

  test("parseMatchScore keeps a record's score and refuses a malformed one", () => {
    expect(parseMatchScore(null)).toBeNull();
    expect(parseMatchScore({ player1: [6], player2: ["4"] })).toBeNull();
    expect(parseMatchScore({ player1: [6] })).toBeNull();
    expect(parseMatchScore({ player1: [6, 3], player2: [4, 6] })).toEqual({
      player1: [6, 3],
      player2: [4, 6],
    });
  });
});

/* -------------------------------------------------------------------------
 * The default builder, over the clean fixture
 * ---------------------------------------------------------------------- */

const clean = JSON.parse(
  readFileSync(
    path.join(__dirname, "fixtures", "splitstep", "clean-match.json"),
    "utf8",
  ),
) as RawSplitStepStroke[];

const analysis = analyzeResults(clean, { startTimeSeconds: 0 });

/** The fixture's own folded score, so the transcript reconciles. */
const SCORE: MatchScore = (() => {
  const probe = buildTranscript({
    rallies: analysis.rallies,
    labels: analysis.players,
    score: { player1: [], player2: [] },
    initialTopIsPlayer1: null,
  });
  const [p1, p2] = analysis.players;
  const sets = probe.reconciliation.foldedSets;
  return {
    player1: sets.map((s) => s[p1] ?? 0),
    player2: sets.map((s) => s[p2] ?? 0),
  };
})();

const JOB_ROW = {
  id: JOB_ID,
  match_id: MATCH_ID,
  results_object_key: "results.json",
  start_time_seconds: 0,
  initial_top_player_is_player1: null,
  ad_scoring: true,
  trajectories_object_key: null,
};

/**
 * The persist module's reads: `.single()` for the job and the match, the
 * results file from Storage.
 */
function stubJobClient(job: Record<string, unknown>) {
  const client = {
    from(table: string) {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({
              data:
                table === "processing_jobs"
                  ? job
                  : {
                      id: MATCH_ID,
                      score: SCORE,
                      initial_top_player_is_player1: null,
                      format: { ad_scoring: true, best_of: 3 },
                    },
              error: null,
            }),
          }),
        }),
      };
    },
    storage: {
      from: () => ({
        download: async () => ({
          data: { text: async () => JSON.stringify(clean) },
          error: null,
        }),
      }),
    },
  };
  return client as unknown as AdminClient;
}

/** Label-shaped rows from the seed, with ids synthesised from the vendor ids. */
function labelPointsFrom(): MarkablePoint[] {
  const transcript = buildTranscript({
    rallies: analysis.rallies,
    labels: analysis.players,
    score: SCORE,
    initialTopIsPlayer1: null,
    adScoring: true,
    bestOf: 3,
  });
  return buildLabelSeed(transcript, clean).points.map((point) => ({
    id: `point-${point.point_index}`,
    vendorRallyIds: point.vendor_rally_ids,
    shots: point.shots.map((shot) => ({
      id: `shot-${shot.event_id}`,
      eventId: shot.event_id,
    })),
  }));
}

test.describe("buildJobMarks", () => {
  test("derives the job's file with the current code and joins the marks onto the rows", async () => {
    const points = labelPointsFrom();
    const join = await buildJobMarks(stubJobClient(JOB_ROW), JOB_ID);
    const marks = join(points);
    const transcript = buildTranscript({
      rallies: analysis.rallies,
      labels: analysis.players,
      score: SCORE,
      initialTopIsPlayer1: null,
      adScoring: true,
      bestOf: 3,
    });
    expect(transcript.ok).toBe(true);
    expect(marks).toEqual(
      buildLabelMarks(transcript, analysis.rallies, points),
    );
    expect(Object.keys(marks.points).length).toBeGreaterThan(0);
    for (const id of Object.keys(marks.points)) {
      expect(points.some((p) => p.id === id)).toBe(true);
    }
  });

  test("a job without stored results throws, which the loader turns into marks: null", async () => {
    const db = stubJobClient({ ...JOB_ROW, results_object_key: null });
    await expect(buildJobMarks(db, JOB_ID)).rejects.toThrow(
      "job has no stored results",
    );
  });
});
