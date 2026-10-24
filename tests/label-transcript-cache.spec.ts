/**
 * The labels console's transcript cache (src/lib/services/labels/
 * transcript-cache.ts) under `buildJobMarks`: a hit downloads nothing, any
 * key part changing misses and rebuilds, only a reconciled build is written,
 * the join onto the live rows is never cached, and a cache that fails leaves
 * the load exactly as it was without one.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import {
  analyzeResults,
  buildTranscript,
  DERIVATION_VERSION,
  type MatchScore,
  type RawSplitStepStroke,
} from "@/lib/services/splitstep/derivation";
import {
  buildLabelMarks,
  type MarkablePoint,
} from "@/lib/services/labels/marks";
import { buildLabelSeed } from "@/lib/services/labels/seed";
import { buildJobMarks } from "@/lib/data/labels-server";
import {
  reviveRallies,
  serializeRallies,
  stableStringify,
  transcriptFingerprint,
  TRANSCRIPT_CACHE_TABLE,
  writeTranscriptCache,
} from "@/lib/services/labels/transcript-cache";
import type { AdminClient } from "@/lib/supabase/admin";

const JOB_ID = "22222222-2222-4222-8222-222222222222";
const MATCH_ID = "33333333-3333-4333-8333-333333333333";

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

const FORMAT = { ad_scoring: true, best_of: 3 };

const JOB_ROW = {
  id: JOB_ID,
  match_id: MATCH_ID,
  results_object_key: "results.json",
  start_time_seconds: 0,
  initial_top_player_is_player1: null,
  ad_scoring: true,
  trajectories_object_key: null as string | null,
  vendor_request: null,
};

const MATCH_ROW = {
  id: MATCH_ID,
  score: SCORE as unknown,
  initial_top_player_is_player1: null,
  format: FORMAT as unknown,
  player1_name: "Jordan Lee",
  player2_name: "Elena Vargas",
};

interface Fake {
  db: AdminClient;
  downloads: number;
  upserts: number;
  /** The one cached row, as the fake table holds it; settable by a test. */
  row: Record<string, unknown> | null;
  /** When set, the cache read answers with this error. */
  readError: string | null;
  /** When set, the cache write answers with this error. */
  writeError: string | null;
}

/**
 * The persist module's reads (`.single()` for the job and the match, the
 * results file from Storage) plus the cache table: `.maybeSingle()` on read,
 * `.upsert()` on write, one row in memory.
 */
function fakeClient(
  job: Record<string, unknown> = JOB_ROW,
  match: Record<string, unknown> = MATCH_ROW,
  strokes: RawSplitStepStroke[] = clean,
): Fake {
  const fake: Fake = {
    db: null as unknown as AdminClient,
    downloads: 0,
    upserts: 0,
    row: null,
    readError: null,
    writeError: null,
  };
  const client = {
    from(table: string) {
      const chain = {
        select: () => chain,
        eq: () => chain,
        single: async () => ({
          data: table === "processing_jobs" ? job : match,
          error: null,
        }),
        maybeSingle: async () => {
          if (table !== TRANSCRIPT_CACHE_TABLE) {
            throw new Error(`unexpected maybeSingle on ${table}`);
          }
          if (fake.readError)
            return { data: null, error: { message: fake.readError } };
          // A JSON round trip, as jsonb hands the row back.
          return {
            data: fake.row ? JSON.parse(JSON.stringify(fake.row)) : null,
            error: null,
          };
        },
        upsert: async (
          values: Record<string, unknown>,
          options: { onConflict: string },
        ) => {
          if (table !== TRANSCRIPT_CACHE_TABLE) {
            throw new Error(`unexpected upsert on ${table}`);
          }
          expect(options.onConflict).toBe("job_id");
          fake.upserts += 1;
          if (fake.writeError) return { error: { message: fake.writeError } };
          fake.row = JSON.parse(JSON.stringify(values));
          return { error: null };
        },
      };
      return chain;
    },
    storage: {
      from: () => ({
        download: async (key: string) => {
          fake.downloads += 1;
          return {
            data: {
              text: async () =>
                key === "results.json" ? JSON.stringify(strokes) : "[]",
            },
            error: null,
          };
        },
      }),
    },
  };
  fake.db = client as unknown as AdminClient;
  return fake;
}

/** Label-shaped rows from the seed, with ids synthesised from the vendor ids. */
function labelPoints(prefix = "point"): MarkablePoint[] {
  const transcript = buildTranscript({
    rallies: analysis.rallies,
    labels: analysis.players,
    score: SCORE,
    initialTopIsPlayer1: null,
    adScoring: true,
    bestOf: 3,
  });
  return buildLabelSeed(transcript, clean).points.map((point) => ({
    id: `${prefix}-${point.point_index}`,
    vendorRallyIds: point.vendor_rally_ids,
    shots: point.shots.map((shot) => ({
      id: `${prefix}-shot-${shot.event_id}`,
      eventId: shot.event_id,
    })),
  }));
}

/** `console.warn` captured for one call, then restored. */
async function capturingWarnings<T>(
  run: () => Promise<T>,
): Promise<{ result: T; warnings: unknown[][] }> {
  const warnings: unknown[][] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args);
  };
  try {
    return { result: await run(), warnings };
  } finally {
    console.warn = original;
  }
}

test.describe("buildJobMarks reads the cache before building", () => {
  test("the first load builds and writes; the second downloads nothing and marks the same", async () => {
    const fake = fakeClient();
    const points = labelPoints();

    const first = (await buildJobMarks(fake.db, JOB_ID))(points);
    expect(fake.downloads).toBe(1);
    expect(fake.upserts).toBe(1);
    expect(fake.row).toMatchObject({
      job_id: JOB_ID,
      derivation_version: DERIVATION_VERSION,
      results_object_key: "results.json",
      trajectories_object_key: "",
      fingerprint: transcriptFingerprint({
        score: SCORE,
        format: FORMAT,
        ad_scoring: true,
      }),
    });

    fake.downloads = 0;
    const second = (await buildJobMarks(fake.db, JOB_ID))(points);
    expect(fake.downloads).toBe(0);
    expect(fake.upserts).toBe(1);
    expect(second).toEqual(first);

    const fresh = buildTranscript({
      rallies: analysis.rallies,
      labels: analysis.players,
      score: SCORE,
      initialTopIsPlayer1: null,
      adScoring: true,
      bestOf: 3,
    });
    expect(fresh.ok).toBe(true);
    expect(second).toEqual(buildLabelMarks(fresh, analysis.rallies, points));
    expect(Object.keys(second.points).length).toBeGreaterThan(0);

    // Row size, for the record: one cached fixture match.
    const row = fake.row as { transcript: unknown; rallies: unknown };
    console.log("[label-transcript-cache] fixture row size", {
      transcriptBytes: JSON.stringify(row.transcript).length,
      ralliesBytes: JSON.stringify(row.rallies).length,
      points: analysis.rallies.length,
    });
  });

  test("a stored row under another derivation version misses and is rebuilt", async () => {
    const fake = fakeClient();
    await buildJobMarks(fake.db, JOB_ID);
    fake.row = { ...fake.row, derivation_version: "0.0.1-other" };
    fake.downloads = 0;
    await buildJobMarks(fake.db, JOB_ID);
    expect(fake.downloads).toBe(1);
    expect(fake.upserts).toBe(2);
    expect(fake.row?.derivation_version).toBe(DERIVATION_VERSION);
  });

  test("a new results file misses", async () => {
    const fake = fakeClient();
    await buildJobMarks(fake.db, JOB_ID);
    fake.row = { ...fake.row, results_object_key: "results-v1.json" };
    fake.downloads = 0;
    await buildJobMarks(fake.db, JOB_ID);
    expect(fake.downloads).toBe(1);
    expect(fake.upserts).toBe(2);
  });

  test("a trajectories file arriving misses, and the rebuild downloads both files", async () => {
    const fake = fakeClient();
    await buildJobMarks(fake.db, JOB_ID);
    fake.downloads = 0;
    const withTrajectories = fakeClient({
      ...JOB_ROW,
      trajectories_object_key: "results.trajectories.json",
    });
    withTrajectories.row = fake.row;
    await buildJobMarks(withTrajectories.db, JOB_ID);
    expect(withTrajectories.downloads).toBe(2);
    expect(withTrajectories.upserts).toBe(1);
    expect(withTrajectories.row?.trajectories_object_key).toBe(
      "results.trajectories.json",
    );
  });

  test("an edited match score misses", async () => {
    const fake = fakeClient();
    await buildJobMarks(fake.db, JOB_ID);
    const edited = fakeClient(JOB_ROW, {
      ...MATCH_ROW,
      score: { ...SCORE, player1: [...SCORE.player1].reverse() },
    });
    edited.row = fake.row;
    await buildJobMarks(edited.db, JOB_ID);
    expect(edited.downloads).toBe(1);
    expect(edited.upserts).toBe(1);
  });

  test("a changed match format misses", async () => {
    const fake = fakeClient();
    await buildJobMarks(fake.db, JOB_ID);
    const edited = fakeClient(JOB_ROW, {
      ...MATCH_ROW,
      format: { ...FORMAT, best_of: 5 },
    });
    edited.row = fake.row;
    await buildJobMarks(edited.db, JOB_ID);
    expect(edited.downloads).toBe(1);
  });

  test("a changed job ad_scoring misses", async () => {
    const fake = fakeClient();
    await buildJobMarks(fake.db, JOB_ID);
    const edited = fakeClient({ ...JOB_ROW, ad_scoring: false });
    edited.row = fake.row;
    await buildJobMarks(edited.db, JOB_ID);
    expect(edited.downloads).toBe(1);
  });

  test("the same score in another key order is the same fingerprint", () => {
    expect(
      transcriptFingerprint({
        score: { player1: [6, 3], player2: [4, 6], winner: "player1" },
        format: { ad_scoring: true, best_of: 3 },
        ad_scoring: true,
      }),
    ).toBe(
      transcriptFingerprint({
        score: { winner: "player1", player2: [4, 6], player1: [6, 3] },
        format: { best_of: 3, ad_scoring: true },
        ad_scoring: true,
      }),
    );
    expect(stableStringify({ b: 1, a: [2, { d: 3, c: undefined }] })).toBe(
      '{"a":[2,{"d":3}],"b":1}',
    );
    expect(
      transcriptFingerprint({ score: null, format: null, ad_scoring: null }),
    ).not.toBe(
      transcriptFingerprint({ score: null, format: null, ad_scoring: true }),
    );
  });
});

test.describe("only a reconciled build is written", () => {
  test("a job without stored results throws and writes nothing", async () => {
    const fake = fakeClient({ ...JOB_ROW, results_object_key: null });
    await expect(buildJobMarks(fake.db, JOB_ID)).rejects.toThrow(
      "job has no stored results",
    );
    expect(fake.upserts).toBe(0);
    expect(fake.downloads).toBe(0);
  });

  test("a build whose transcript is not ok throws and writes nothing", async () => {
    // One player label only: buildTranscript refuses it (`ok: false`).
    const onePlayer = clean.filter(
      (stroke) => stroke.pred_player_id === clean[0].pred_player_id,
    );
    const fake = fakeClient(JOB_ROW, MATCH_ROW, onePlayer);
    await expect(buildJobMarks(fake.db, JOB_ID)).rejects.toThrow(
      /expected two player labels/,
    );
    expect(fake.downloads).toBe(1);
    expect(fake.upserts).toBe(0);
    expect(fake.row).toBeNull();
  });

  test("writeTranscriptCache is a no-op for a transcript that is not ok", async () => {
    const fake = fakeClient();
    const transcript = buildTranscript({
      rallies: analysis.rallies,
      labels: analysis.players,
      score: SCORE,
      initialTopIsPlayer1: null,
    });
    await writeTranscriptCache(
      fake.db,
      {
        job_id: JOB_ID,
        derivation_version: DERIVATION_VERSION,
        results_object_key: "results.json",
        trajectories_object_key: "",
        fingerprint: "x",
      },
      { transcript: { ...transcript, ok: false }, rallies: analysis.rallies },
    );
    expect(fake.upserts).toBe(0);
  });
});

test.describe("the join is never cached", () => {
  test("two loads with different points produce different marks from one cached row", async () => {
    const fake = fakeClient();
    await buildJobMarks(fake.db, JOB_ID);
    fake.downloads = 0;

    const a = labelPoints("a");
    const b = labelPoints("b");
    const marksA = (await buildJobMarks(fake.db, JOB_ID))(a);
    const marksB = (await buildJobMarks(fake.db, JOB_ID))(b);
    expect(fake.downloads).toBe(0);
    expect(fake.upserts).toBe(1);

    expect(marksA).not.toEqual(marksB);
    expect(Object.keys(marksA.points).every((id) => id.startsWith("a-"))).toBe(
      true,
    );
    expect(Object.keys(marksB.points).every((id) => id.startsWith("b-"))).toBe(
      true,
    );
    expect(Object.keys(marksA.points).length).toBe(
      Object.keys(marksB.points).length,
    );

    // A subset of the rows reads as a subset of the marks: the join follows
    // the request's points, not the cached transcript's.
    const half = a.slice(0, Math.ceil(a.length / 2));
    const marksHalf = (await buildJobMarks(fake.db, JOB_ID))(half);
    expect(fake.downloads).toBe(0);
    for (const id of Object.keys(marksHalf.points)) {
      expect(half.some((p) => p.id === id)).toBe(true);
    }
    expect(Object.keys(marksHalf.points).length).toBeLessThan(
      Object.keys(marksA.points).length,
    );
  });

  test("rallies survive the round trip with `serves` rebuilt from `strokes` by identity", () => {
    const stored = JSON.parse(
      JSON.stringify(serializeRallies(analysis.rallies)),
    ) as unknown;
    const revived = reviveRallies(stored);
    expect(revived).not.toBeNull();
    expect(revived).toHaveLength(analysis.rallies.length);
    for (const [i, rally] of revived!.entries()) {
      expect(rally.serves.map((s) => s.eventId)).toEqual(
        analysis.rallies[i].serves.map((s) => s.eventId),
      );
      // marks.ts asks `rally.strokes.indexOf(serve)`: the serve must be the
      // same object as its stroke, not a copy.
      for (const serve of rally.serves) {
        expect(rally.strokes.indexOf(serve)).toBeGreaterThanOrEqual(0);
      }
    }
    expect(reviveRallies(null)).toBeNull();
    expect(reviveRallies([{ rallyId: "x" }])).toBeNull();
  });
});

test.describe("a cache that fails never breaks a load", () => {
  test("a read error is logged and the build proceeds, then writes", async () => {
    const fake = fakeClient();
    fake.readError = "relation does not exist";
    const points = labelPoints();
    const { result, warnings } = await capturingWarnings(() =>
      buildJobMarks(fake.db, JOB_ID),
    );
    expect(Object.keys(result(points).points).length).toBeGreaterThan(0);
    expect(fake.downloads).toBe(1);
    expect(fake.upserts).toBe(1);
    expect(warnings).toHaveLength(1);
    expect(warnings[0][0]).toBe(
      "[labels:transcript-cache] read failed, building without the cache",
    );
  });

  test("a write error is logged and the marks still come back", async () => {
    const fake = fakeClient();
    fake.writeError = "permission denied";
    const points = labelPoints();
    const { result, warnings } = await capturingWarnings(() =>
      buildJobMarks(fake.db, JOB_ID),
    );
    expect(Object.keys(result(points).points).length).toBeGreaterThan(0);
    expect(fake.row).toBeNull();
    expect(warnings).toHaveLength(1);
    expect(warnings[0][0]).toBe(
      "[labels:transcript-cache] write failed, the next load rebuilds",
    );
  });

  test("a stored row that does not parse is a miss, not a throw", async () => {
    const fake = fakeClient();
    await buildJobMarks(fake.db, JOB_ID);
    fake.row = { ...fake.row, rallies: "not an array" };
    fake.downloads = 0;
    const { warnings } = await capturingWarnings(() =>
      buildJobMarks(fake.db, JOB_ID),
    );
    expect(fake.downloads).toBe(1);
    expect(fake.upserts).toBe(2);
    expect(warnings[0][0]).toBe(
      "[labels:transcript-cache] stored row does not parse, rebuilding",
    );
  });
});
