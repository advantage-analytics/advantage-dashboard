import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { VisibleMatchRow } from "@/lib/services/match-video/access";
import {
  handleGetBallPaths,
  supabaseBallPathsBody,
  type BallPathsAccessDeps,
} from "@/lib/services/splitstep/ball-paths-access";

/**
 * `GET /api/matches/[matchId]/ball-paths`, run against fakes — no session
 * cookie, no Supabase, no storage. The first half drives the decision
 * (`handleGetBallPaths`) and counts loader calls, because the point of the
 * ladder is that a refused caller never reaches the service-role seam. The
 * second half drives the production loader against a hand-rolled admin client
 * to pin which job it picks and which key it reads.
 */

const VIEWER = randomUUID();
const VISIBLE_MATCH = randomUUID();
const HIDDEN_MATCH = randomUUID();

const MATCHES: Record<string, VisibleMatchRow> = {
  [VISIBLE_MATCH]: {
    id: VISIBLE_MATCH,
    // Not the viewer: a coach reading a player's match is the normal case.
    created_by: randomUUID(),
    program_id: randomUUID(),
    source_provider: "splitstep",
  },
};

/**
 * Deliberately NOT what `JSON.stringify` would produce — odd spacing, a
 * trailing newline — so a handler that parsed and re-serialised would fail
 * the byte-identity assertion.
 */
const STORED_TEXT =
  '{ "version": 1,\n  "strokes": [ { "contactTime": 130.0, "bounceTime": 130.70, "samples": [] } ] }\n';

function harness(opts: { userId: string | null; stored?: string | null }) {
  const loaderCalls: string[] = [];
  const deps: BallPathsAccessDeps = {
    currentUserId: async () => opts.userId,
    loadVisibleMatch: async (matchId) => ({
      match: MATCHES[matchId] ?? null,
      error: null,
    }),
    activeWorkspace: async () => null,
    loadBallPathsBody: async (matchId) => {
      loaderCalls.push(matchId);
      return { ok: true, value: opts.stored ?? null };
    },
  };
  return { deps, loaderCalls };
}

test.describe("handleGetBallPaths", () => {
  test("no session is refused and the loader is never called", async () => {
    const { deps, loaderCalls } = harness({ userId: null, stored: "{}" });

    const response = await handleGetBallPaths(VISIBLE_MATCH, deps);

    expect(response.status).toBe(401);
    expect((await response.json()).code).toBe("unauthenticated");
    expect(loaderCalls).toHaveLength(0);
  });

  test("an invisible match is 404 and the loader is never called", async () => {
    const { deps, loaderCalls } = harness({ userId: VIEWER, stored: "{}" });

    const response = await handleGetBallPaths(HIDDEN_MATCH, deps);

    expect(response.status).toBe(404);
    expect((await response.json()).code).toBe("match_not_found");
    expect(loaderCalls).toHaveLength(0);
  });

  test("a visible match with no file is 200 with empty strokes", async () => {
    const { deps, loaderCalls } = harness({ userId: VIEWER, stored: null });

    const response = await handleGetBallPaths(VISIBLE_MATCH, deps);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('{"version":1,"strokes":[]}');
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(response.headers.get("cache-control")).toMatch(/^private/);
    expect(loaderCalls).toEqual([VISIBLE_MATCH]);
  });

  test("a visible match with a file is 200 with the stored text verbatim", async () => {
    const { deps, loaderCalls } = harness({
      userId: VIEWER,
      stored: STORED_TEXT,
    });

    const response = await handleGetBallPaths(VISIBLE_MATCH, deps);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(STORED_TEXT);
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(response.headers.get("cache-control")).toMatch(/^private/);
    expect(loaderCalls).toEqual([VISIBLE_MATCH]);
  });

  test("a loader failure is its own error, not an empty file", async () => {
    const { deps } = harness({ userId: VIEWER });
    deps.loadBallPathsBody = async () => {
      throw new Error("boom");
    };

    const response = await handleGetBallPaths(VISIBLE_MATCH, deps);

    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toMatch(/^private/);
  });
});

/* -------------------------------------------------------------------------
 * Production loader
 * ---------------------------------------------------------------------- */

type Job = {
  id: string;
  created_by: string | null;
  results_object_key?: string | null;
};

function fakeAdmin(opts: {
  job: Job | null;
  objects?: Record<string, string>;
  /** Keys whose download fails with this HTTP status instead of "missing". */
  failing?: Record<string, number>;
}) {
  const calls: string[] = [];
  const downloads: { bucket: string; key: string }[] = [];

  const query = {
    select(columns: string) {
      calls.push(`select:${columns}`);
      return query;
    },
    eq(column: string, value: string) {
      calls.push(`eq:${column}=${value}`);
      return query;
    },
    order(column: string, options: Record<string, unknown>) {
      calls.push(`order:${column}:${JSON.stringify(options)}`);
      return query;
    },
    limit(count: number) {
      calls.push(`limit:${count}`);
      return query;
    },
    maybeSingle: async () => ({ data: opts.job, error: null }),
  };

  const admin = {
    from(table: string) {
      calls.push(`from:${table}`);
      return query;
    },
    storage: {
      from(bucket: string) {
        return {
          async download(key: string) {
            downloads.push({ bucket, key });
            const failure = opts.failing?.[key];
            if (failure !== undefined) {
              return {
                data: null,
                error: {
                  message: "storage unreachable",
                  originalError: { status: failure },
                },
              };
            }
            const text = opts.objects?.[key];
            return text === undefined
              ? {
                  data: null,
                  error: {
                    message: "Object not found",
                    originalError: { status: 400 },
                  },
                }
              : { data: new Blob([text]), error: null };
          },
        };
      },
    },
  };

  return { admin: admin as unknown as SupabaseClient, calls, downloads };
}

test.describe("supabaseBallPathsBody", () => {
  test("picks the most recently COMPLETED job and reads its key verbatim", async () => {
    const uploader = randomUUID();
    const key = `results/${uploader}/${VISIBLE_MATCH}/job-2.ball-paths.json`;
    const { admin, calls, downloads } = fakeAdmin({
      job: { id: "job-2", created_by: uploader },
      objects: { [key]: STORED_TEXT },
    });

    const loaded = await supabaseBallPathsBody(admin)(VISIBLE_MATCH);

    expect(loaded).toEqual({ ok: true, value: STORED_TEXT });
    expect(calls).toEqual([
      "from:processing_jobs",
      "select:id, created_by, results_object_key",
      `eq:match_id=${VISIBLE_MATCH}`,
      "eq:status=completed",
      'order:completed_at:{"ascending":false,"nullsFirst":false}',
      'order:created_at:{"ascending":false}',
      "limit:1",
    ]);
    expect(downloads).toEqual([{ bucket: "match-results", key }]);
  });

  test("a job whose uploader left is read under the writer's fallback segment", async () => {
    const key = `results/former-member/${VISIBLE_MATCH}/job-9.ball-paths.json`;
    const { admin, downloads } = fakeAdmin({
      job: { id: "job-9", created_by: null },
      objects: { [key]: STORED_TEXT },
    });

    const loaded = await supabaseBallPathsBody(admin)(VISIBLE_MATCH);

    expect(loaded).toEqual({ ok: true, value: STORED_TEXT });
    expect(downloads[0].key).toBe(key);
  });

  test("no completed job answers null without touching storage", async () => {
    const { admin, downloads } = fakeAdmin({ job: null });

    expect(await supabaseBallPathsBody(admin)(VISIBLE_MATCH)).toEqual({
      ok: true,
      value: null,
    });
    expect(downloads).toHaveLength(0);
  });

  test("a missing object answers null", async () => {
    const { admin } = fakeAdmin({
      job: { id: "job-1", created_by: randomUUID() },
    });

    expect(await supabaseBallPathsBody(admin)(VISIBLE_MATCH)).toEqual({
      ok: true,
      value: null,
    });
  });

  /* ---- T25: the sibling of the recorded results key ------------------- */

  const bp = (segment: string, jobId: string, matchId = VISIBLE_MATCH) =>
    `results/${segment}/${matchId}/${jobId}.ball-paths.json`;
  const recorded = (segment: string, jobId: string, matchId = VISIBLE_MATCH) =>
    `results/${segment}/${matchId}/${jobId}.json`;

  /** Runs the loader with `console.warn` captured. */
  async function loadQuietly(admin: SupabaseClient) {
    const warnings: unknown[][] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => warnings.push(args);
    try {
      const loaded = await supabaseBallPathsBody(admin)(VISIBLE_MATCH);
      return { loaded, warnings };
    } finally {
      console.warn = original;
    }
  }

  test("an uploader who left: the file under their uuid is found after former-member is tried first", async () => {
    const uploader = randomUUID();
    const { admin, downloads } = fakeAdmin({
      job: {
        id: "job-7",
        created_by: null,
        results_object_key: recorded(uploader, "job-7"),
      },
      objects: { [bp(uploader, "job-7")]: STORED_TEXT },
    });

    const { loaded, warnings } = await loadQuietly(admin);

    expect(loaded).toEqual({ ok: true, value: STORED_TEXT });
    expect(downloads).toEqual([
      { bucket: "match-results", key: bp("former-member", "job-7") },
      { bucket: "match-results", key: bp(uploader, "job-7") },
    ]);
    expect(warnings).toHaveLength(0);
  });

  test("the former-member file wins when both exist", async () => {
    const uploader = randomUUID();
    const { admin, downloads } = fakeAdmin({
      job: {
        id: "job-7",
        created_by: null,
        results_object_key: recorded(uploader, "job-7"),
      },
      objects: {
        [bp("former-member", "job-7")]: STORED_TEXT,
        [bp(uploader, "job-7")]: '{"version":1,"strokes":["older"]}',
      },
    });

    const { loaded } = await loadQuietly(admin);

    expect(loaded).toEqual({ ok: true, value: STORED_TEXT });
    expect(downloads).toEqual([
      { bucket: "match-results", key: bp("former-member", "job-7") },
    ]);
  });

  test("created_by matching the results key's segment makes exactly one download", async () => {
    const uploader = randomUUID();
    for (const objects of [{ [bp(uploader, "job-3")]: STORED_TEXT }, {}]) {
      const { admin, downloads } = fakeAdmin({
        job: {
          id: "job-3",
          created_by: uploader,
          results_object_key: recorded(uploader, "job-3"),
        },
        objects,
      });

      await loadQuietly(admin);

      expect(downloads).toEqual([
        { bucket: "match-results", key: bp(uploader, "job-3") },
      ]);
    }
  });

  for (const [name, key] of [
    [
      "an orphaned/… key",
      `orphaned/${randomUUID()}/${VISIBLE_MATCH}/job-5.json`,
    ],
    ["another match's key", recorded(randomUUID(), "job-5", HIDDEN_MATCH)],
    ["another job's key", recorded(randomUUID(), "job-6")],
    [
      "a .players.json key",
      `results/${randomUUID()}/${VISIBLE_MATCH}/job-5.players.json`,
    ],
    ["a null key", null],
  ] as const) {
    test(`a recorded results key that is ${name} adds no second candidate`, async () => {
      const { admin, downloads } = fakeAdmin({
        job: { id: "job-5", created_by: null, results_object_key: key },
      });

      const { loaded } = await loadQuietly(admin);

      expect(loaded).toEqual({ ok: true, value: null });
      expect(downloads).toEqual([
        { bucket: "match-results", key: bp("former-member", "job-5") },
      ]);
    });
  }

  for (const status of [400, 404]) {
    test(`every candidate missing (${status}) answers null with no console.warn`, async () => {
      const uploader = randomUUID();
      const { admin, downloads } = fakeAdmin({
        job: {
          id: "job-8",
          created_by: null,
          results_object_key: recorded(uploader, "job-8"),
        },
        failing: {
          [bp("former-member", "job-8")]: status,
          [bp(uploader, "job-8")]: status,
        },
      });

      const { loaded, warnings } = await loadQuietly(admin);

      expect(loaded).toEqual({ ok: true, value: null });
      expect(downloads.map((d) => d.key)).toEqual([
        bp("former-member", "job-8"),
        bp(uploader, "job-8"),
      ]);
      expect(warnings).toHaveLength(0);
    });
  }

  test("a first candidate that could not be ASKED stops the ladder: one warn, empty, no sibling read", async () => {
    const uploader = randomUUID();
    const { admin, downloads } = fakeAdmin({
      job: {
        id: "job-8",
        created_by: null,
        results_object_key: recorded(uploader, "job-8"),
      },
      objects: { [bp(uploader, "job-8")]: STORED_TEXT },
      failing: { [bp("former-member", "job-8")]: 503 },
    });

    const { loaded, warnings } = await loadQuietly(admin);

    expect(loaded).toEqual({ ok: true, value: null });
    expect(downloads.map((d) => d.key)).toEqual([bp("former-member", "job-8")]);
    expect(warnings).toHaveLength(1);
  });

  test("the loader lists no bucket and spells no key itself", () => {
    const raw = readFileSync(
      path.join(
        process.cwd(),
        "src/lib/services/splitstep/ball-paths-access.ts",
      ),
      "utf8",
    );
    expect(raw).not.toContain(".list(");
    const source = raw
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(source).not.toContain("results/");
    expect(source).not.toContain("former-member");
    expect(source).not.toContain(".ball-paths.json");
  });
});

/* -------------------------------------------------------------------------
 * Route file
 * ---------------------------------------------------------------------- */

test("the route file is GET-only wiring on the node runtime", () => {
  const source = readFileSync(
    path.join(
      process.cwd(),
      "src/app/api/matches/[matchId]/ball-paths/route.ts",
    ),
    "utf8",
  );

  const exported = [
    ...source.matchAll(/^export\s+(?:async\s+)?(?:function|const)\s+(\w+)/gm),
  ]
    .map((m) => m[1])
    .sort();
  expect(exported).toEqual(["GET", "dynamic", "runtime"]);
  expect(source).toContain('export const runtime = "nodejs"');
  expect(source).toContain('export const dynamic = "force-dynamic"');
  expect(source).toContain("lazyAdminClient()");
  expect(source).not.toContain("createAdminClient");
});
