import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { purgeMatchStorage } from "@/lib/services/matches/purge-match-storage";
import type { AttachmentPurgeDeps } from "@/lib/services/match-video/purge";
import { RESULTS_BUCKET } from "@/lib/services/splitstep/config";
import {
  ballPathsObjectKey,
  ballPathsUserSegment,
} from "@/lib/services/splitstep/object-keys";

/**
 * T23 — the results-bucket lane of `purgeMatchStorage`.
 *
 * A deleted match must take its strokes, players, trajectories and derived
 * ball-paths files with it, from a FIXED list: recorded keys verbatim plus
 * `ballPathsObjectKey` return values, never a listing or a prefix. The fake
 * client is modelled on `fakeCaller` in `tests/match-video-purge.spec.ts`; it
 * has no `list`, so a sweep would throw rather than pass.
 */

const MATCH = "11111111-1111-4111-8111-111111111111";
const OTHER_MATCH = "22222222-2222-4222-8222-222222222222";
const JOB = "33333333-3333-4333-8333-333333333333";
const OTHER_JOB = "44444444-4444-4444-8444-444444444444";
const UPLOADER = "55555555-5555-4555-8555-555555555555";

type JobRow = Record<string, unknown>;

function fakeCaller(jobs: JobRow[], options: { removeError?: string } = {}) {
  const selects: Array<{ table: string; columns: string }> = [];
  const removed: Array<{ bucket: string; paths: string[] }> = [];
  const client = {
    from(table: string) {
      return {
        select(columns: string) {
          selects.push({ table, columns });
          return {
            async in(column: string, ids: string[]) {
              const rows = table === "processing_jobs" ? jobs : [];
              return {
                data: rows.filter((r) => ids.includes(r[column] as string)),
                error: null,
              };
            },
          };
        },
      };
    },
    storage: {
      from(bucket: string) {
        return {
          async remove(paths: string[]) {
            removed.push({ bucket, paths });
            return options.removeError
              ? { error: { message: options.removeError } }
              : { error: null };
          },
        };
      },
    },
  };
  return { client: client as unknown as SupabaseClient, selects, removed };
}

/** The attachment lane is not under test: it sees no rows and does nothing. */
const attachments = {
  async listAttachments() {
    return [];
  },
  cleanup: {},
  async schedule() {},
} as unknown as AttachmentPurgeDeps;

async function purge(
  jobs: JobRow[],
  options: { removeError?: string } = {},
  matchIds: string[] = [MATCH],
) {
  const caller = fakeCaller(jobs, options);
  const result = await purgeMatchStorage(
    caller.client,
    matchIds,
    "match delete",
    { attachments },
  );
  return { ...caller, result };
}

/** The single RESULTS_BUCKET removal, asserted duplicate-free, as a sorted set. */
function resultsPaths(removed: Array<{ bucket: string; paths: string[] }>) {
  const calls = removed.filter((r) => r.bucket === RESULTS_BUCKET);
  expect(calls).toHaveLength(1);
  const paths = calls[0].paths;
  expect(new Set(paths).size).toBe(paths.length);
  for (const path of paths) {
    expect(typeof path).toBe("string");
    expect(path).not.toBe("");
    expect(path.endsWith("/")).toBe(false);
    expect(path).not.toContain("*");
  }
  return [...paths].sort();
}

function job(overrides: JobRow = {}): JobRow {
  return {
    id: JOB,
    match_id: MATCH,
    created_by: UPLOADER,
    video_object_key: null,
    trimmed_object_key: null,
    results_object_key: `results/${UPLOADER}/${MATCH}/${JOB}.json`,
    players_object_key: `results/${UPLOADER}/${MATCH}/${JOB}.players.json`,
    trajectories_object_key: `results/${UPLOADER}/${MATCH}/${JOB}.trajectories.json`,
    ...overrides,
  };
}

const originalLog = console.log;
test.beforeEach(() => {
  console.log = () => {};
});
test.afterEach(() => {
  console.log = originalLog;
});

test("the jobs read selects the id, match, uploader and all three recorded results keys", async () => {
  const { selects } = await purge([job()]);
  const read = selects.find((s) => s.table === "processing_jobs");
  const columns = read!.columns.split(",").map((c) => c.trim());
  for (const column of [
    "id",
    "match_id",
    "created_by",
    "video_object_key",
    "trimmed_object_key",
    "results_object_key",
    "players_object_key",
    "trajectories_object_key",
  ]) {
    expect(columns).toContain(column);
  }
});

test("full case: one remove, holding the three recorded keys plus the ball-paths key", async () => {
  const row = job();
  const { removed, result } = await purge([row]);

  expect(result).toBeUndefined();
  expect(resultsPaths(removed)).toEqual(
    [
      row.results_object_key,
      row.players_object_key,
      row.trajectories_object_key,
      ballPathsObjectKey({
        userId: ballPathsUserSegment(UPLOADER),
        matchId: MATCH,
        jobId: JOB,
      }),
    ].sort(),
  );
});

test("two jobs sharing keys still produce one de-duplicated remove", async () => {
  const { removed } = await purge([job(), job()]);
  expect(resultsPaths(removed)).toHaveLength(4);
});

test("null players and trajectories keys contribute nothing — no null, empty or recomputed stand-in", async () => {
  const row = job({ players_object_key: null, trajectories_object_key: null });
  const { removed } = await purge([row]);

  const paths = resultsPaths(removed);
  expect(paths).toEqual(
    [
      row.results_object_key,
      ballPathsObjectKey({ userId: UPLOADER, matchId: MATCH, jobId: JOB }),
    ].sort(),
  );
  expect(paths.some((p) => p.includes(".players."))).toBe(false);
  expect(paths.some((p) => p.includes(".trajectories."))).toBe(false);
});

test("an adopted delivery's orphaned/… keys are removed verbatim, and yield no sibling", async () => {
  const row = job({
    results_object_key: "orphaned/ext-9/delivery-1.json",
    players_object_key: "orphaned/ext-9/delivery-1.players.json",
    trajectories_object_key: "orphaned/ext-9/delivery-1.trajectories.json",
  });
  const { removed } = await purge([row]);

  const paths = resultsPaths(removed);
  expect(paths).toEqual(
    [
      "orphaned/ext-9/delivery-1.json",
      "orphaned/ext-9/delivery-1.players.json",
      "orphaned/ext-9/delivery-1.trajectories.json",
      ballPathsObjectKey({ userId: UPLOADER, matchId: MATCH, jobId: JOB }),
    ].sort(),
  );
  expect(paths.filter((p) => p.endsWith(".ball-paths.json"))).toHaveLength(1);
});

test("a null created_by removes the ball-paths key under the former-member segment", async () => {
  const row = job({
    created_by: null,
    results_object_key: `results/${ballPathsUserSegment(null)}/${MATCH}/${JOB}.json`,
    players_object_key: null,
    trajectories_object_key: null,
  });
  const { removed } = await purge([row]);

  expect(resultsPaths(removed)).toEqual(
    [
      row.results_object_key,
      ballPathsObjectKey({
        userId: ballPathsUserSegment(null),
        matchId: MATCH,
        jobId: JOB,
      }),
    ].sort(),
  );
});

test("uploader-left drift: both the former-member key and the uuid-segment sibling of the results key go", async () => {
  // Written under the uploader's uuid; `created_by` nulled when they left.
  const row = job({
    created_by: null,
    players_object_key: null,
    trajectories_object_key: null,
  });
  const { removed } = await purge([row]);

  expect(resultsPaths(removed)).toEqual(
    [
      `results/${UPLOADER}/${MATCH}/${JOB}.json`,
      ballPathsObjectKey({
        userId: ballPathsUserSegment(null),
        matchId: MATCH,
        jobId: JOB,
      }),
      ballPathsObjectKey({ userId: UPLOADER, matchId: MATCH, jobId: JOB }),
    ].sort(),
  );
  expect(resultsPaths(removed)).toContain(
    `results/${UPLOADER}/${MATCH}/${JOB}.ball-paths.json`,
  );
});

for (const drift of [
  {
    name: "a different match id in the path",
    key: `results/${UPLOADER}/${OTHER_MATCH}/${JOB}.json`,
  },
  {
    name: "a different job id in the path",
    key: `results/${UPLOADER}/${MATCH}/${OTHER_JOB}.json`,
  },
  {
    name: "a job id that only ends with this one",
    key: `results/${UPLOADER}/${MATCH}/x${JOB}.json`,
  },
  {
    name: "an extra leading segment",
    key: `archive/results/${UPLOADER}/${MATCH}/${JOB}.json`,
  },
  {
    name: "an extra trailing segment",
    key: `results/${UPLOADER}/${MATCH}/${JOB}.json/x`,
  },
  {
    name: "an empty user segment",
    key: `results//${MATCH}/${JOB}.json`,
  },
  {
    name: "another suffix",
    key: `results/${UPLOADER}/${MATCH}/${JOB}.players.json`,
  },
]) {
  test(`no sibling from a results key with ${drift.name}`, async () => {
    const row = job({
      created_by: null,
      results_object_key: drift.key,
      players_object_key: null,
      trajectories_object_key: null,
    });
    const { removed } = await purge([row]);

    // The recorded key verbatim, and only the key recomputed from created_by.
    expect(resultsPaths(removed)).toEqual(
      [
        drift.key,
        ballPathsObjectKey({
          userId: ballPathsUserSegment(null),
          matchId: MATCH,
          jobId: JOB,
        }),
      ].sort(),
    );
  });
}

for (const broken of [
  { name: "a missing id", row: { id: undefined } },
  { name: "a null id", row: { id: null } },
  { name: "an empty id", row: { id: "" } },
]) {
  test(`blast radius: ${broken.name} contributes no computed key`, async () => {
    const row = job(broken.row);
    if (broken.row.id === undefined) delete row.id;
    const { removed } = await purge([row]);

    expect(resultsPaths(removed)).toEqual(
      [
        row.results_object_key,
        row.players_object_key,
        row.trajectories_object_key,
      ].sort(),
    );
  });
}

test("blast radius: a missing, null or empty match_id contributes no computed key", async () => {
  // The real read filters by match_id, so such a row cannot come back from
  // it; this client returns them anyway to pin the guard itself.
  for (const matchId of [undefined, null, ""]) {
    const row = job({ match_id: matchId });
    if (matchId === undefined) delete row.match_id;
    const caller = fakeCaller([]);
    const client = caller.client as unknown as {
      from: (table: string) => unknown;
    };
    const from = client.from.bind(client);
    client.from = (table: string) =>
      table === "processing_jobs"
        ? { select: () => ({ in: async () => ({ data: [row], error: null }) }) }
        : from(table);

    await purgeMatchStorage(caller.client, [MATCH], "match delete", {
      attachments,
    });

    const paths = resultsPaths(caller.removed);
    expect(paths).toEqual(
      [
        row.results_object_key,
        row.players_object_key,
        row.trajectories_object_key,
      ].sort(),
    );
    expect(paths.some((p) => p.endsWith(".ball-paths.json"))).toBe(false);
  }
});

test("blast radius: the module lists no bucket and builds its keys only through ballPathsObjectKey", () => {
  const raw = readFileSync(
    "src/lib/services/matches/purge-match-storage.ts",
    "utf8",
  );
  expect(raw).not.toContain(".list(");
  // Code only — the comments name these shapes in order to forbid them.
  const source = raw
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  // No hand-built results key, segment or suffix anywhere in the code.
  expect(source).not.toContain("results/");
  expect(source).not.toContain("ball-paths");
  expect(source).not.toContain("former-member");
  expect(source).toContain("ballPathsObjectKey(");
  expect(source).toContain("ballPathsUserSegment(");
  // One remove per bucket.
  expect(source.match(/\.from\(RESULTS_BUCKET\)/g)).toHaveLength(1);
});

test("a failed remove logs once and the purge still resolves to undefined", async () => {
  const errors: string[] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]) => errors.push(String(args[0]));

  let outcome: Awaited<ReturnType<typeof purge>>;
  try {
    outcome = await purge([job()], { removeError: "bucket unreachable" });
  } finally {
    console.error = originalError;
  }

  expect(outcome.result).toBeUndefined();
  expect(resultsPaths(outcome.removed)).toHaveLength(4);
  expect(errors).toHaveLength(1);
  expect(errors[0]).toContain("results cleanup failed for");
});
