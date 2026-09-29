import { expect, test } from "@playwright/test";
import { NextRequest } from "next/server";

import { createLoader } from "./fixtures/vm-modules";

/**
 * Which workspace a manual "Retry analysis" is billed to (T7).
 *
 * The route reads the job's match to learn its `program_id`, then resolves the
 * billing workspace from it. A failed read used to arrive as `program_id: null`
 * and `billingWorkspaceFor()` answered the personal workspace, so a team
 * match's retry was charged to the player's own allowance. The route now
 * refuses on a read error (503) and on a missing match (404) before it resolves
 * a workspace, and `resubmitJob()` is never reached.
 *
 * Driven through the vm loader with the Supabase clients, the workspace lookup
 * and `resubmitJob` stubbed; `@/lib/workspace/types` (where
 * `billingWorkspaceFor` lives) is the real module.
 */

const USER = "u-owner";
const JOB = "11111111-1111-4111-8111-111111111111";
const MATCH = "m-1";
const PROGRAM = "program-1";

type Row = Record<string, unknown>;

interface Scenario {
  match: { data: Row | null; error: { message: string } | null };
  available: { id: string; kind: "personal" | "team"; name: string }[];
}

function loadRoute(scenario: Scenario) {
  const calls: { workspace: { id: string } }[] = [];
  const logged: { message: string; detail: unknown }[] = [];
  const reads: string[] = [];

  const admin = {
    from(table: string) {
      reads.push(table);
      const builder = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () =>
          table === "processing_jobs"
            ? {
                data: { id: JOB, created_by: USER, match_id: MATCH },
                error: null,
              }
            : scenario.match,
      };
      return builder;
    },
  };

  const loader = createLoader({
    stubs: {
      "@/lib/supabase/server": {
        createClient: async () => ({
          auth: {
            getUser: async () => ({
              data: { user: { id: USER } },
              error: null,
            }),
          },
        }),
      },
      "@/lib/supabase/admin": { createAdminClient: () => admin },
      "@/lib/workspace/active-workspace-server": {
        getWorkspaceContext: async () => ({ available: scenario.available }),
      },
      "@/lib/services/splitstep/pipeline-log": {
        pipelineLog: {
          info: () => {},
          warn: () => {},
          error: (message: string, detail: unknown) =>
            logged.push({ message, detail }),
        },
      },
      "@/lib/services/splitstep/resubmit-job": {
        resubmitJob: async (args: { workspace: { id: string } }) => {
          calls.push(args);
          return { ok: true, jobId: JOB, externalJobId: "ext-1" };
        },
      },
    },
  });

  const POST = loader.load(
    "src/app/api/splitstep/jobs/[jobId]/resubmit/route.ts",
  ).POST as (
    request: NextRequest,
    ctx: { params: Promise<{ jobId: string }> },
  ) => Promise<Response>;

  return {
    calls,
    logged,
    reads,
    post: (jobId: string = JOB) =>
      POST(
        new NextRequest(
          `http://localhost/api/splitstep/jobs/${jobId}/resubmit`,
          { method: "POST" },
        ),
        { params: Promise.resolve({ jobId }) },
      ),
  };
}

const PERSONAL = { id: USER, kind: "personal" as const, name: "Me" };
const TEAM = { id: PROGRAM, kind: "team" as const, name: "Team" };

test.describe("resubmit route billing", () => {
  test("a jobId that is not a UUID → 404 before any read, resubmitJob unreached", async () => {
    const { post, calls, reads } = loadRoute({
      match: { data: null, error: null },
      available: [PERSONAL, TEAM],
    });

    const res = await post("not-a-uuid");

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Job not found" });
    expect(reads).toEqual([]);
    expect(calls).toEqual([]);
  });

  test("a matches read error → 503, logged, resubmitJob unreached", async () => {
    const { post, calls, logged } = loadRoute({
      match: { data: null, error: { message: "connection reset" } },
      available: [PERSONAL, TEAM],
    });

    const res = await post();

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      error: "Could not load the match. Try again.",
    });
    expect(calls).toEqual([]);
    expect(logged).toEqual([
      {
        message: "[splitstep-resubmit-route] match lookup failed",
        detail: { jobId: JOB, error: "connection reset" },
      },
    ]);
  });

  test("a read that succeeds with no row → 404, never billed to the personal workspace", async () => {
    const { post, calls } = loadRoute({
      match: { data: null, error: null },
      available: [PERSONAL, TEAM],
    });

    const res = await post();

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Job not found" });
    expect(calls).toEqual([]);
  });

  test("a team match bills the team workspace", async () => {
    const { post, calls } = loadRoute({
      match: { data: { program_id: PROGRAM }, error: null },
      available: [PERSONAL, TEAM],
    });

    const res = await post();

    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0].workspace.id).toBe(PROGRAM);
  });
});
