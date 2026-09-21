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

type Job = { id: string; created_by: string | null };

function fakeAdmin(opts: {
  job: Job | null;
  objects?: Record<string, string>;
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
      "select:id, created_by",
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
