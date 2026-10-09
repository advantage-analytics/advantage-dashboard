import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import {
  analyzeResults,
  buildTranscript,
  type MatchScore,
  type Transcript,
} from "@/lib/services/splitstep/derivation";
import {
  buildTranscriptForJob,
  persistTranscript,
  playerMappingFlipped,
  resolveAdScoring,
} from "@/lib/services/splitstep/persist-transcript";
import type { createAdminClient } from "@/lib/supabase/admin";

/**
 * Which ad-scoring rule a job's transcript is folded under.
 *
 * The vendor scores the video under `processing_jobs.ad_scoring` — the `Ad` it
 * was sent — and `matches.format` can disagree with it (job b74a1e04 went up
 * no-ad under a match row that says ad). Folding under the match's rule labels
 * every 40-40 by rules the vendor never scored under, and nothing on screen
 * looks wrong. The pressure rule itself is covered in splitstep-transcript;
 * this file pins where its input comes from.
 */

const clean = JSON.parse(
  readFileSync(
    path.join(__dirname, "fixtures", "splitstep", "clean-match.json"),
    "utf8",
  ),
);

test.describe("resolveAdScoring", () => {
  test("the job's value wins over the match format", () => {
    expect(resolveAdScoring(false, { ad_scoring: true })).toBe(false);
    expect(resolveAdScoring(true, { ad_scoring: false })).toBe(true);
  });

  test("a null job value falls back to the match format", () => {
    expect(resolveAdScoring(null, { ad_scoring: true })).toBe(true);
    expect(resolveAdScoring(null, { ad_scoring: false })).toBe(false);
    expect(resolveAdScoring(undefined, { ad_scoring: false })).toBe(false);
  });

  test("with neither, the default stays ad scoring", () => {
    expect(resolveAdScoring(null, null)).toBe(true);
    expect(resolveAdScoring(null, {})).toBe(true);
  });
});

/**
 * A stand-in for the admin client: records each table's select and answers
 * with the given rows, and serves `results` as the stored vendor JSON.
 */
function stubClient(rows: {
  job: Record<string, unknown>;
  match: Record<string, unknown>;
  results: unknown;
}) {
  const selects: Record<string, string> = {};
  const client = {
    from(table: string) {
      return {
        select(columns: string) {
          selects[table] = columns;
          return {
            eq: () => ({
              single: async () => ({
                data: table === "processing_jobs" ? rows.job : rows.match,
                error: null,
              }),
            }),
          };
        },
      };
    },
    storage: {
      from: () => ({
        download: async () => ({
          data: { text: async () => JSON.stringify(rows.results) },
          error: null,
        }),
      }),
    },
  };
  return {
    selects,
    supabase: client as unknown as ReturnType<typeof createAdminClient>,
  };
}

const JOB = {
  id: "job",
  match_id: "match",
  results_object_key: "results.json",
  start_time_seconds: 0,
  initial_top_player_is_player1: null,
};

const analysis = analyzeResults(clean, { startTimeSeconds: 0 });

/**
 * The fixture's own folded score. The committed payload has no ground truth,
 * so the entered score is what the fold produces — self-consistent, so every
 * transcript below reconciles and none leans on the unreconciled bypass.
 */
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

const MATCH = {
  id: "match",
  score: SCORE,
  initial_top_player_is_player1: null,
};

const pressure = (t: Transcript | null) =>
  (t?.points ?? []).map((p) => [
    p.is_break_point,
    p.is_set_point,
    p.is_match_point,
  ]);

/** The same fixture, folded directly under a stated rule. */
function foldedUnder(adScoring: boolean) {
  return buildTranscript({
    rallies: analysis.rallies,
    labels: analysis.players,
    score: SCORE,
    initialTopIsPlayer1: null,
    adScoring,
    bestOf: 3,
  });
}

test.describe("buildTranscriptForJob", () => {
  test("fetches ad_scoring with the job, and its false beats the match format's true", async () => {
    // A column missing from the select reads as undefined, which silently
    // falls back to the match format — exactly the bug this replaced.
    const { selects, supabase } = stubClient({
      job: { ...JOB, ad_scoring: false },
      match: { ...MATCH, format: { ad_scoring: true, best_of: 3 } },
      results: clean,
    });
    const { transcript } = await buildTranscriptForJob({
      supabase,
      jobId: "job",
    });
    expect(selects.processing_jobs.split(/,\s*/)).toContain("ad_scoring");
    expect(pressure(transcript)).toEqual(pressure(foldedUnder(false)));
  });

  test("the fixture's pressure flags depend on the rule", () => {
    // Otherwise the test above and the one below would pass whichever rule was used.
    expect(foldedUnder(true).ok).toBe(true);
    expect(foldedUnder(false).ok).toBe(true);
    expect(pressure(foldedUnder(false))).not.toEqual(
      pressure(foldedUnder(true)),
    );
  });

  test("a null job value folds under the match format", async () => {
    const { supabase } = stubClient({
      job: { ...JOB, ad_scoring: null },
      match: { ...MATCH, format: { ad_scoring: true, best_of: 3 } },
      results: clean,
    });
    const { transcript } = await buildTranscriptForJob({
      supabase,
      jobId: "job",
    });
    expect(pressure(transcript)).toEqual(pressure(foldedUnder(true)));
  });
});

test.describe("playerMappingFlipped: a rebuild may not swap the players", () => {
  // A rebuild after a score edit re-runs the fold, and the fold names player1
  // from the entered score before it asks the camera. A score typed from the
  // opponent's side would move every statistic to the other player with
  // nothing on screen looking wrong, so persistTranscript refuses it.
  const points = (servers: boolean[]) =>
    servers.map((server_is_player1, i) => ({
      point_number: i + 1,
      server_is_player1,
    }));
  const stored = points([true, true, true, false, false, false, true, true]);

  test("the same mapping is not a flip", () => {
    expect(playerMappingFlipped(stored, stored)).toBe(false);
  });

  test("every server reversed is a flip", () => {
    const reversed = stored.map((p) => ({
      ...p,
      server_is_player1: !p.server_is_player1,
    }));
    expect(playerMappingFlipped(stored, reversed)).toBe(true);
  });

  test("a few relabelled servers are not a flip", () => {
    // A derivation-version change may relabel a frozen stretch.
    const nudged = stored.map((p, i) =>
      i < 2 ? { ...p, server_is_player1: !p.server_is_player1 } : p,
    );
    expect(playerMappingFlipped(stored, nudged)).toBe(false);
  });

  test("nothing stored, or no shared point numbers, is not a flip", () => {
    expect(playerMappingFlipped([], stored)).toBe(false);
    const elsewhere = stored.map((p) => ({
      ...p,
      point_number: p.point_number + 100,
      server_is_player1: !p.server_is_player1,
    }));
    expect(playerMappingFlipped(stored, elsewhere)).toBe(false);
  });
});

/**
 * A stand-in for the whole persist path: the job and match reads, the stored
 * results, the two `points` counts (imported rows, then hand-labelled rows)
 * and the delete. The delete answers with an error, so a run that gets past
 * the guards stops there without needing the inserts stubbed.
 */
function persistClient(counts: { imported: number; labelled: number }) {
  const calls: { table: string; op: string; contains?: unknown }[] = [];
  const client = {
    from(table: string) {
      const call: { table: string; op: string; contains?: unknown } = {
        table,
        op: "select",
      };
      calls.push(call);
      const answer = async () => {
        if (call.op === "delete") {
          return { error: { message: "stop after the guards" } };
        }
        if (table === "points") {
          return {
            count: call.contains ? counts.labelled : counts.imported,
            error: null,
          };
        }
        return { data: null, error: null };
      };
      const builder = {
        select: () => builder,
        delete: () => {
          call.op = "delete";
          return builder;
        },
        eq: () => builder,
        contains: (_column: string, value: unknown) => {
          call.contains = value;
          return builder;
        },
        single: async () => ({
          data:
            table === "processing_jobs"
              ? { ...JOB, ad_scoring: true }
              : { ...MATCH, format: { ad_scoring: true, best_of: 3 } },
          error: null,
        }),
        then: (
          resolve: (v: unknown) => unknown,
          reject?: (e: unknown) => unknown,
        ) => answer().then(resolve, reject),
      };
      return builder;
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
  return {
    calls,
    supabase: client as unknown as ReturnType<typeof createAdminClient>,
  };
}

test.describe("persistTranscript: hand labels are not overwritten", () => {
  test("refuses, before the delete, when a point is flagged hand_labelled", async () => {
    const { calls, supabase } = persistClient({ imported: 0, labelled: 56 });
    const out = await persistTranscript({ supabase, jobId: "job" });

    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.failure).toBe("refused");
    expect(out.labelsProtected).toBe(true);
    expect(out.reason).toContain("allowOverwriteLabels");
    expect(calls.find((c) => c.op === "delete")).toBeUndefined();
    expect(calls.find((c) => c.contains)?.contains).toEqual(["hand_labelled"]);
  });

  test("allowOverwriteLabels skips the check and reaches the delete", async () => {
    const { calls, supabase } = persistClient({ imported: 0, labelled: 56 });
    const out = await persistTranscript({
      supabase,
      jobId: "job",
      allowOverwriteLabels: true,
    });

    expect(calls.find((c) => c.contains)).toBeUndefined();
    expect(calls.find((c) => c.op === "delete")).toBeDefined();
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.labelsProtected).toBeUndefined();
    expect(out.reason).toContain("stop after the guards");
  });

  test("a match with no hand labels passes the check", async () => {
    const { calls, supabase } = persistClient({ imported: 0, labelled: 0 });
    const out = await persistTranscript({ supabase, jobId: "job" });

    expect(calls.find((c) => c.op === "delete")).toBeDefined();
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.labelsProtected).toBeUndefined();
  });

  test("a dry run never asks", async () => {
    const { calls, supabase } = persistClient({ imported: 0, labelled: 56 });
    const out = await persistTranscript({
      supabase,
      jobId: "job",
      dryRun: true,
    });

    expect(out.ok).toBe(true);
    expect(calls.filter((c) => c.table === "points")).toEqual([]);
  });
});
