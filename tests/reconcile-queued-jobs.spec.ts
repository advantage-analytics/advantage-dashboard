import { expect, test } from "@playwright/test";

import { createLoader } from "./fixtures/vm-modules";

/**
 * `refreshQueuedJobs` — learning which queued jobs the vendor has started.
 *
 * The vendor sends no "processing" webhook; its `GET /jobs` list is the only
 * source (api-docs.html, "Listing In-Flight Jobs"). Under test, against an
 * in-memory `processing_jobs` table and a stubbed fetch:
 *
 *  - a queued job the list reports as `job_processing` moves to `processing`,
 *    and the same write stamps `vendor_started_at` from the vendor's per-job
 *    `updated_at` (falling back to now when it is missing);
 *  - a job the list still reports `queued` is left alone;
 *  - a job ABSENT from the list is left alone (finished or failed is the
 *    webhook's call, never inferred from absence);
 *  - the move is guarded on `status = queued`, so a webhook landing meanwhile
 *    wins;
 *  - one list request serves every row, and a second read within a minute
 *    reuses it;
 *  - a failed or oddly shaped list changes nothing.
 */

const NOW = new Date("2026-09-30T05:10:00.000Z");

type Row = Record<string, unknown> & { id: string };

function row(id: string, status = "queued"): Row {
  return {
    id,
    match_id: `m-${id}`,
    external_job_id: `ext-${id}`,
    status,
  };
}

function fakeSupabase(rows: Row[], beforeUpdate?: (rows: Row[]) => void) {
  function builder(mode: "select" | "update", patch?: Record<string, unknown>) {
    const filters: ((r: Row) => boolean)[] = [];
    const b = {
      eq(col: string, v: unknown) {
        filters.push((r) => r[col] === v);
        return b;
      },
      not(col: string, op: string, v: unknown) {
        if (op !== "is" || v !== null) throw new Error("unexpected not()");
        filters.push((r) => r[col] !== null);
        return b;
      },
      in(col: string, vs: unknown[]) {
        filters.push((r) => vs.includes(r[col]));
        return b;
      },
      select() {
        return b;
      },
      then(resolve: (v: unknown) => void) {
        if (mode === "update") beforeUpdate?.(rows);
        const hit = rows.filter((r) => filters.every((f) => f(r)));
        if (mode === "update") for (const r of hit) Object.assign(r, patch);
        resolve({ data: hit.map((r) => ({ ...r })), error: null });
      },
    };
    return b;
  }
  return {
    from: () => ({
      select: () => builder("select"),
      update: (patch: Record<string, unknown>) => builder("update", patch),
    }),
  };
}

function load(respond: () => { status: number; body: unknown }) {
  const requests: string[] = [];
  const fetch = async (url: string) => {
    requests.push(url);
    const { status, body } = respond();
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    };
  };
  const loader = createLoader({
    globals: { Error, URL, fetch, AbortSignal },
    stubs: {
      "next/server": { after: () => undefined },
      "./quota": { releaseQuota: async () => undefined },
      "./resubmit-job": {
        isDownloadFailure: () => false,
        resubmitJob: async () => ({ ok: false }),
      },
      "@/lib/services/notifications/analysis-mail": {
        notifyAnalysisOutcome: async () => undefined,
      },
      "./deployment-config": {
        resolveSplitstepVendorApiConfig: () => ({
          ok: true,
          apiUrl: "https://vendor.test/jobs/",
          apiKey: "k",
        }),
      },
    },
  });
  const mod = loader.load("src/lib/services/splitstep/reconcile.ts");
  return {
    refresh: mod.refreshQueuedJobs as (p: {
      supabase: unknown;
      matchIds: string[];
      now?: Date;
    }) => Promise<number>,
    requests,
  };
}

const list = (...jobs: ([string, string] | [string, string, unknown])[]) => ({
  status: 200,
  body: {
    jobs: jobs.map(([id, status, updatedAt]) => ({
      job_id: `ext-${id}`,
      video_id: `m-${id}`,
      status,
      updated_at:
        updatedAt === undefined ? "2026-09-30T05:02:03+00:00" : updatedAt,
    })),
  },
});

test("a started job moves to processing; queued and absent ones stay", async () => {
  const rows = [row("a"), row("b"), row("c")];
  const { refresh, requests } = load(() =>
    list(["a", "job_processing"], ["b", "queued"]),
  );

  const moved = await refresh({
    supabase: fakeSupabase(rows),
    matchIds: ["m-a", "m-b", "m-c"],
    now: NOW,
  });

  expect(moved).toBe(1);
  expect(rows.map((r) => r.status)).toEqual(["processing", "queued", "queued"]);
  // Stamped in the same write, from the vendor's own clock, not ours.
  expect(rows.map((r) => r.vendor_started_at)).toEqual([
    "2026-09-30T05:02:03.000Z",
    undefined,
    undefined,
  ]);
  expect(requests).toEqual(["https://vendor.test/jobs"]);
});

test("each started job keeps its own start time; a missing one falls back to now", async () => {
  const rows = [row("a"), row("b")];
  const { refresh } = load(() =>
    list(
      ["a", "job_processing", "2026-09-30T04:58:00+00:00"],
      ["b", "job_processing", null],
    ),
  );

  const moved = await refresh({
    supabase: fakeSupabase(rows),
    matchIds: ["m-a", "m-b"],
    now: NOW,
  });

  expect(moved).toBe(2);
  expect(rows.map((r) => [r.status, r.vendor_started_at])).toEqual([
    ["processing", "2026-09-30T04:58:00.000Z"],
    ["processing", NOW.toISOString()],
  ]);
});

test("a webhook that lands first wins over the list", async () => {
  const rows = [row("a")];
  const { refresh } = load(() => list(["a", "job_processing"]));

  const moved = await refresh({
    supabase: fakeSupabase(rows, (r) => {
      r[0].status = "completed";
    }),
    matchIds: ["m-a"],
    now: NOW,
  });

  expect(moved).toBe(0);
  expect(rows[0].status).toBe("completed");
  expect(rows[0].vendor_started_at).toBeUndefined();
});

test("a job cancelled before the list is read is never moved or stamped", async () => {
  const rows = [row("a")];
  const { refresh } = load(() => list(["a", "job_processing"]));

  const moved = await refresh({
    supabase: fakeSupabase(rows, (r) => {
      r[0].status = "cancelled";
    }),
    matchIds: ["m-a"],
    now: NOW,
  });

  expect(moved).toBe(0);
  expect(rows[0].status).toBe("cancelled");
  expect(rows[0].vendor_started_at).toBeUndefined();
});

test("one list call per minute, whatever the page count", async () => {
  const { refresh, requests } = load(() => list(["a", "queued"]));
  const supabase = fakeSupabase([row("a")]);

  await refresh({ supabase, matchIds: ["m-a"], now: NOW });
  await refresh({
    supabase,
    matchIds: ["m-a"],
    now: new Date(NOW.getTime() + 30_000),
  });
  expect(requests).toHaveLength(1);

  await refresh({
    supabase,
    matchIds: ["m-a"],
    now: new Date(NOW.getTime() + 61_000),
  });
  expect(requests).toHaveLength(2);
});

test("no queued rows on the page means no vendor call", async () => {
  const { refresh, requests } = load(() => list());
  await refresh({
    supabase: fakeSupabase([row("a", "completed")]),
    matchIds: ["m-a"],
    now: NOW,
  });
  expect(requests).toHaveLength(0);
});

for (const [name, response] of [
  ["an error status", { status: 503, body: { error: {} } }],
  ["an unexpected shape", { status: 200, body: { items: [] } }],
] as const) {
  test(`${name} changes nothing`, async () => {
    const rows = [row("a")];
    const { refresh } = load(() => response);
    const moved = await refresh({
      supabase: fakeSupabase(rows),
      matchIds: ["m-a"],
      now: NOW,
    });
    expect(moved).toBe(0);
    expect(rows[0].status).toBe("queued");
  });
}
