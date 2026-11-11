import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { choosePlaybackFile } from "@/lib/data/match-video-choice";
import type { AttachmentPurgeDeps } from "@/lib/services/match-video/purge";
import { purgeMatchStorage } from "@/lib/services/matches/purge-match-storage";
import {
  MAX_DELETE_ATTEMPTS,
  claimR2Deletes,
  confirmR2Deletes,
  isPlaybackCopyKey,
  parseDrainRequest,
  queueR2Deletes,
} from "@/lib/services/video-storage/delete-queue";
import {
  mintSampleVideo,
  mintStoredPlayback,
  sampleVideoStore,
  storeOf,
} from "@/lib/services/video-storage/stores";

/**
 * The /pr-check fixes on the R2 playback branch (docs/r2-video-storage-plan.md):
 * - deleting a match queues its R2 copy, since the app holds only R2's read
 *   token, and a drainer's word alone never dequeues anything;
 * - a copy R2 cannot confirm is looked for in Azure under the same key;
 * - `VIDEO_READ_STORE=azure` makes every surface read Azure.
 */

const MATCH = "11111111-1111-4111-8111-111111111111";
const OTHER_MATCH = "22222222-2222-4222-8222-222222222222";
const UID = "55555555-5555-4555-8555-555555555555";
const COPY = `playback/${UID}/${MATCH}/original.mp4`;
const UPLOAD = `videos/${UID}/${MATCH}/original.mov`;

function withEnv<T>(vars: Record<string, string | undefined>, run: () => T): T {
  const previous = { ...process.env };
  try {
    for (const [k, v] of Object.entries(vars)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    return run();
  } finally {
    process.env = previous;
  }
}

const AZURE_ENV = {
  AZURE_STORAGE_ACCOUNT: "devstoreaccount1",
  AZURE_STORAGE_KEY: Buffer.from("k".repeat(32)).toString("base64"),
  AZURE_STORAGE_CONTAINER: "advantage-videos",
  AZURE_STORAGE_ENDPOINT: undefined,
};
const R2_ENV = {
  R2_ACCOUNT_ID: "0123456789abcdef0123456789abcdef",
  R2_BUCKET_VIDEOS: "advantage-video",
  R2_READ_ACCESS_KEY_ID: "READKEY",
  R2_READ_SECRET_ACCESS_KEY: "readsecret",
};

/* ---------------------------------------------------------------- chooser */

const r2Job = {
  video_object_key: UPLOAD,
  trimmed_object_key: null,
  start_time_seconds: 0,
  playback_object_key: COPY,
  playback_status: "ready",
  playback_store: "r2",
};

test("a copy R2 cannot confirm is played from Azure under the same key, not the raw upload", async () => {
  const asked: string[] = [];
  const choice = await choosePlaybackFile([r2Job], async (name, store) => {
    asked.push(`${store}:${name}`);
    return store === "azure"; // R2 down; Azure still holds both files
  });
  expect(choice).toEqual({
    blobName: COPY,
    store: "azure",
    startTimeSeconds: 0,
    source: "playback",
  });
  expect(asked).toEqual([`r2:${COPY}`, `azure:${COPY}`]);
});

test("with the copy in neither store, the upload plays", async () => {
  const choice = await choosePlaybackFile(
    [r2Job],
    async (name, store) => store === "azure" && name === UPLOAD,
  );
  expect(choice).toMatchObject({ blobName: UPLOAD, source: "upload" });
});

test("VIDEO_READ_STORE=azure: the chooser never asks R2", async () => {
  const asked: string[] = [];
  const choice = await withEnv({ VIDEO_READ_STORE: "azure" }, () =>
    choosePlaybackFile([r2Job], async (name, store) => {
      asked.push(`${store}:${name}`);
      return store === "azure" && name === UPLOAD;
    }),
  );
  expect(asked.some((a) => a.startsWith("r2:"))).toBe(false);
  expect(choice).toMatchObject({ store: "azure", source: "upload" });
});

test("VIDEO_READ_STORE=azure: every signer signs Azure, sample included", () => {
  withEnv(
    {
      ...AZURE_ENV,
      ...R2_ENV,
      VIDEO_READ_STORE: "azure",
      SAMPLE_VIDEO_STORE: "r2",
    },
    () => {
      expect(storeOf("r2")).toBe("azure");
      expect(sampleVideoStore()).toBe("azure");
      const host = (u: string) => new URL(u).host;
      expect(
        host(mintStoredPlayback({ key: COPY, store: "r2" }).playbackUrl),
      ).toBe("devstoreaccount1.blob.core.windows.net");
      expect(
        host(
          mintSampleVideo({ blobName: "sample/match-v1.mp4", ttlSeconds: 1800 })
            .playbackUrl,
        ),
      ).toBe("devstoreaccount1.blob.core.windows.net");
    },
  );
  // And with the switch off, the same calls sign R2.
  withEnv(
    {
      ...AZURE_ENV,
      ...R2_ENV,
      VIDEO_READ_STORE: undefined,
      SAMPLE_VIDEO_STORE: "r2",
    },
    () => {
      expect(
        new URL(mintStoredPlayback({ key: COPY, store: "r2" }).playbackUrl)
          .host,
      ).toBe(`${R2_ENV.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`);
      expect(sampleVideoStore()).toBe("r2");
    },
  );
});

/* ------------------------------------------------------------ delete queue */

function fakeQueueDb(
  rows: Map<string, Record<string, unknown>>,
  calls: { updates: number } = { updates: 0 },
) {
  const all = () => [...rows.values()];
  const db = {
    from() {
      return {
        select() {
          return {
            async in(_c: string, keys: string[]) {
              return {
                data: all().filter((r) =>
                  keys.includes(r.object_key as string),
                ),
                error: null,
              };
            },
            lt(_c: string, max: number) {
              const picked = all().filter((r) => (r.attempts as number) < max);
              const page = {
                order: () => page,
                limit: async (n: number) => ({
                  data: picked.slice(0, n),
                  error: null,
                }),
              };
              return page;
            },
            or(filter: string) {
              const [, max, before] =
                /attempts\.gte\.(\d+),queued_at\.lt\.(.+)$/.exec(filter) ?? [];
              const picked = all().filter(
                (r) =>
                  (r.attempts as number) >= Number(max) ||
                  String(r.queued_at) < before,
              );
              return {
                limit: async (n: number) => ({
                  data: picked.slice(0, n),
                  error: null,
                }),
              };
            },
          };
        },
        async upsert(values: Record<string, unknown>[]) {
          for (const v of values) {
            if (!rows.has(v.object_key as string)) {
              rows.set(v.object_key as string, { ...v, attempts: 0 });
            }
          }
          return { error: null };
        },
        update(values: Record<string, unknown>) {
          calls.updates += 1;
          return {
            async eq(_c: string, key: string) {
              Object.assign(rows.get(key) ?? {}, values);
              return { error: null };
            },
          };
        },
        delete() {
          return {
            async eq(_c: string, key: string) {
              rows.delete(key);
              return { error: null };
            },
          };
        },
      };
    },
  };
  return db as unknown as SupabaseClient;
}

test("only playback-copy keys can be queued", async () => {
  expect(isPlaybackCopyKey(COPY)).toBe(true);
  for (const key of [
    UPLOAD,
    "trimmed/u/m/j.mp4",
    "sample/match-v1.mp4",
    "playback/../x.mp4",
    "playback/u/m/o.mov",
  ]) {
    expect(isPlaybackCopyKey(key)).toBe(false);
  }
  const rows = new Map<string, Record<string, unknown>>();
  const { queued } = await queueR2Deletes(
    fakeQueueDb(rows),
    [COPY, COPY, UPLOAD, "sample/match-v1.mp4"],
    "account delete",
  );
  expect(queued).toBe(1);
  expect([...rows.keys()]).toEqual([COPY]);
});

test("a row leaves the queue only when the object is confirmed gone", async () => {
  const gone = `playback/${UID}/${OTHER_MATCH}/original.mp4`;
  const rows = new Map<string, Record<string, unknown>>([
    [COPY, { object_key: COPY, attempts: 1 }],
    [gone, { object_key: gone, attempts: 1 }],
  ]);
  const result = await confirmR2Deletes(
    fakeQueueDb(rows),
    [COPY, gone, UPLOAD],
    async (key) => key === COPY, // the drainer claimed both; one is still there
  );
  expect(result).toEqual({ removed: 1, remaining: 1 });
  expect([...rows.keys()]).toEqual([COPY]);
  expect(rows.get(COPY)?.last_error).toMatch(/still present/);
  // Only a key still present after the drainer's delete costs an attempt.
  expect(rows.get(COPY)?.attempts).toBe(2);
});

test("a HEAD that fails on our side costs the row no attempt", async () => {
  const rows = new Map<string, Record<string, unknown>>([
    [COPY, { object_key: COPY, attempts: 3 }],
  ]);
  const result = await confirmR2Deletes(fakeQueueDb(rows), [COPY], async () => {
    throw new Error("R2 down");
  });
  expect(result).toEqual({ removed: 0, remaining: 1 });
  expect(rows.get(COPY)?.attempts).toBe(3);
});

test("a claim is read-only, and stuck rows are reported", async () => {
  const now = Date.UTC(2026, 10, 10);
  const old = `playback/${UID}/${OTHER_MATCH}/original.mp4`;
  const capped = `playback/${UID}/33333333-3333-4333-8333-333333333333/original.mp4`;
  const rows = new Map<string, Record<string, unknown>>([
    [
      COPY,
      { object_key: COPY, attempts: 0, queued_at: new Date(now).toISOString() },
    ],
    [
      old,
      {
        object_key: old,
        attempts: 1,
        queued_at: new Date(now - 8 * 864e5).toISOString(),
      },
    ],
    [
      capped,
      {
        object_key: capped,
        attempts: MAX_DELETE_ATTEMPTS,
        queued_at: new Date(now).toISOString(),
      },
    ],
  ]);
  const calls = { updates: 0 };
  const logged: unknown[][] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => logged.push(args);
  let keys: string[];
  try {
    keys = await claimR2Deletes(fakeQueueDb(rows, calls), 50, now);
    // A replayed claim changes nothing either.
    await claimR2Deletes(fakeQueueDb(rows, calls), 50, now);
  } finally {
    console.error = original;
  }
  expect(keys.sort()).toEqual([COPY, old].sort());
  expect(calls.updates).toBe(0);
  expect(rows.get(COPY)?.attempts).toBe(0);
  expect(String(logged[0]?.[0])).toMatch(/2 queued R2 deletion\(s\) stuck/);
  expect(JSON.stringify(logged[0]?.[1])).toContain(capped);
});

test("drain requests are refused outside the ten-minute window", () => {
  const now = Date.UTC(2026, 10, 10, 12);
  expect(
    parseDrainRequest({ action: "claim", ts: now - 9 * 60e3 }, now, 50),
  ).toEqual({
    action: "claim",
  });
  expect(
    parseDrainRequest({ action: "claim", ts: now - 11 * 60e3 }, now, 50),
  ).toBeNull();
  expect(
    parseDrainRequest({ action: "claim", ts: now + 11 * 60e3 }, now, 50),
  ).toBeNull();
  expect(parseDrainRequest({ action: "claim" }, now, 50)).toBeNull();
  expect(
    parseDrainRequest({ action: "done", keys: [COPY], ts: now }, now, 50),
  ).toEqual({ action: "done", keys: [COPY] });
  expect(
    parseDrainRequest(
      { action: "done", keys: new Array(51).fill(COPY), ts: now },
      now,
      50,
    ),
  ).toBeNull();
  expect(
    parseDrainRequest({ action: "done", keys: [1], ts: now }, now, 50),
  ).toBeNull();
  expect(parseDrainRequest({ action: "delete", ts: now }, now, 50)).toBeNull();
});

/* ------------------------------------------------------------------ purge */

function fakeCaller(jobs: Record<string, unknown>[]) {
  const client = {
    from(table: string) {
      return {
        select() {
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
    storage: { from: () => ({ remove: async () => ({ error: null }) }) },
  };
  return client as unknown as SupabaseClient;
}
const attachments = {
  async listAttachments() {
    return [];
  },
  cleanup: {},
  async schedule() {},
} as unknown as AttachmentPurgeDeps;
const claimPurge = async () => ({ data: true, error: null });

async function purgeWith(jobs: Record<string, unknown>[]) {
  const queued: Array<{ keys: string[]; by: string }> = [];
  const errors: string[] = [];
  const [log, error] = [console.log, console.error];
  console.log = () => {};
  console.error = (...args: unknown[]) => errors.push(String(args[0]));
  try {
    const caller = fakeCaller(jobs);
    await withEnv({ AZURE_STORAGE_ACCOUNT: undefined }, () =>
      purgeMatchStorage(caller, [MATCH], "account delete", {
        attachments,
        claimPurge,
        sharedKeyReader: caller,
        queueR2Deletes: async (keys, by) => {
          queued.push({ keys, by });
          return { queued: keys.length, error: null };
        },
      }),
    );
  } finally {
    console.log = log;
    console.error = error;
  }
  return { queued, errors };
}

const purgeJob = (overrides: Record<string, unknown> = {}) => ({
  id: "33333333-3333-4333-8333-333333333333",
  match_id: MATCH,
  created_by: UID,
  video_object_key: UPLOAD,
  trimmed_object_key: null,
  playback_object_key: COPY,
  playback_store: "r2",
  results_object_key: null,
  players_object_key: null,
  trajectories_object_key: null,
  ...overrides,
});

test("deleting a match queues its R2 copy even when every Azure delete fails", async () => {
  // No Azure configured here, so every Azure delete rejects.
  const { queued, errors } = await purgeWith([purgeJob()]);
  expect(queued).toEqual([{ keys: [COPY], by: "account delete" }]);
  expect(
    errors.some((e) => e.includes("could not remove 2 video blob(s)")),
  ).toBe(true);
  expect(errors.some((e) => e.includes("video cleanup threw"))).toBe(false);
});

test("a copy another match still uses is not queued", async () => {
  const { queued } = await purgeWith([
    purgeJob(),
    purgeJob({
      id: "44444444-4444-4444-8444-444444444444",
      match_id: OTHER_MATCH,
    }),
  ]);
  expect(queued).toEqual([]);
});

test("no 'remain in R2' alarm for a copy that was never in R2", async () => {
  const errors: string[] = [];
  const [log, error] = [console.log, console.error];
  console.log = () => {};
  console.error = (...args: unknown[]) => errors.push(String(args[0]));
  try {
    const caller = fakeCaller([purgeJob({ playback_store: null })]);
    await withEnv({ AZURE_STORAGE_ACCOUNT: undefined }, () =>
      purgeMatchStorage(caller, [MATCH], "match delete", {
        attachments,
        claimPurge,
        sharedKeyReader: caller,
        queueR2Deletes: async () => ({ queued: 0, error: "table missing" }),
      }),
    );
  } finally {
    console.log = log;
    console.error = error;
  }
  expect(errors.some((e) => e.includes("remain in R2"))).toBe(false);
});

test("a deployment without R2 queues nothing for a copy never marked R2", async () => {
  const queued: string[][] = [];
  const caller = fakeCaller([purgeJob({ playback_store: null })]);
  const [log, error] = [console.log, console.error];
  console.log = () => {};
  console.error = () => {};
  try {
    await withEnv(
      { AZURE_STORAGE_ACCOUNT: undefined, R2_READ_ACCESS_KEY_ID: undefined },
      () =>
        purgeMatchStorage(caller, [MATCH], "match delete", {
          attachments,
          claimPurge,
          sharedKeyReader: caller,
          queueR2Deletes: async (keys) => {
            queued.push(keys);
            return { queued: keys.length, error: null };
          },
        }),
    );
  } finally {
    console.log = log;
    console.error = error;
  }
  expect(queued).toEqual([]);
});
