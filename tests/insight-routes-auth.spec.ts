import { expect, test } from "@playwright/test";

import { createLoader } from "./fixtures/vm-modules";

/**
 * The anonymous and wrong-workspace refusals on the three read-side routes
 * that sit in front of a paid or metered resource (T16).
 *
 * `/api/home-insight` and `/api/team-insight` end in an LLM call and
 * `/api/splitstep/hours-left` ends in a service-role quota read. Each must
 * refuse before it gets there, and nothing but the auth seams answers here:
 * the LLM adapter, the performance and team-home loaders, the quota peek and
 * the admin client are recording fakes, so every refusal asserts the
 * expensive call was never made. Nothing opens a database, a socket or a
 * model.
 *
 * The insight routes answer plain-text bodies today, so those cases assert
 * status only — a later change to a JSON error shape must not break them.
 * `hours-left` already answers `{ error: "Not signed in" }`, which is pinned.
 */

interface Calls {
  getLLMStream: unknown[][];
  peekQuota: unknown[][];
  createAdminClient: number;
  loaders: string[];
}

function newCalls(): Calls {
  return { getLLMStream: [], peekQuota: [], createAdminClient: 0, loaders: [] };
}

/** A Supabase client whose session is absent: `getUser` errors, user is null. */
function anonymousClient() {
  return {
    auth: {
      getUser: async () => ({
        data: { user: null },
        error: { message: "Auth session missing" },
      }),
    },
  };
}

/** The seams every route reaches for once it is past its auth gate. */
function guardedStubs(calls: Calls) {
  return {
    "@/lib/llm/adapter": {
      createLLMObservabilityContext: () => ({}),
      getLLMStream: async (...args: unknown[]) => {
        calls.getLLMStream.push(args);
        throw new Error("the LLM adapter must not be reached");
      },
    },
    "@/lib/data/performance-server": {
      getOverallPerformance: async () => {
        calls.loaders.push("getOverallPerformance");
        throw new Error("performance must not be loaded");
      },
      getTopKpiMovers: () => [],
    },
    "@/lib/data/team-home-server": {
      getTeamHomeData: async () => {
        calls.loaders.push("getTeamHomeData");
        throw new Error("team home must not be loaded");
      },
      insightCardsFrom: () => [],
    },
    "@/lib/services/splitstep/quota": {
      peekQuota: async (...args: unknown[]) => {
        calls.peekQuota.push(args);
        throw new Error("the quota peek must not be reached");
      },
      monthlyCapSecondsFor: () => 0,
    },
    "@/lib/supabase/admin": {
      createAdminClient: () => {
        calls.createAdminClient += 1;
        throw new Error("the service-role client must not be built");
      },
    },
  };
}

function expectNothingGuardedRan(calls: Calls) {
  expect(calls.getLLMStream).toEqual([]);
  expect(calls.peekQuota).toEqual([]);
  expect(calls.createAdminClient).toBe(0);
  expect(calls.loaders).toEqual([]);
}

// ── /api/home-insight ───────────────────────────────────────────────────────

test.describe("/api/home-insight", () => {
  test("no session → 401, no performance read, no LLM call", async () => {
    const calls = newCalls();
    const loader = createLoader({
      stubs: {
        ...guardedStubs(calls),
        "@/lib/supabase/server": {
          createClient: async () => anonymousClient(),
        },
      },
      globals: { Response },
    });
    const { POST } = loader.load("src/app/api/home-insight/route.ts") as {
      POST: () => Promise<Response>;
    };

    const res = await POST();

    expect(res.status).toBe(401);
    expectNothingGuardedRan(calls);
  });
});

// ── /api/team-insight ───────────────────────────────────────────────────────

function loadTeamInsight(calls: Calls, workspace: unknown) {
  const loader = createLoader({
    stubs: {
      ...guardedStubs(calls),
      "@/lib/workspace/active-workspace-server": {
        getWorkspaceContext: async () => workspace,
      },
      "@/lib/services/splitstep/config": {
        currentBillingMonth: () => "2026-09",
      },
    },
    globals: { Response },
  });
  return (
    loader.load("src/app/api/team-insight/route.ts") as {
      POST: () => Promise<Response>;
    }
  ).POST;
}

test.describe("/api/team-insight", () => {
  test("no workspace → 401, no team read, no LLM call", async () => {
    const calls = newCalls();
    const POST = loadTeamInsight(calls, null);

    const res = await POST();

    expect(res.status).toBe(401);
    expectNothingGuardedRan(calls);
  });

  test("a personal workspace → 404 Not a program, no team read, no LLM call", async () => {
    const calls = newCalls();
    const POST = loadTeamInsight(calls, {
      viewer: { id: "u-1" },
      active: { kind: "personal", id: "u-1", name: "Me" },
    });

    const res = await POST();

    expect(res.status).toBe(404);
    expect(await res.text()).toBe("Not a program");
    expectNothingGuardedRan(calls);
  });
});

// ── /api/splitstep/hours-left ───────────────────────────────────────────────

test.describe("/api/splitstep/hours-left", () => {
  test("no workspace → 401 Not signed in, no admin client, no quota peek", async () => {
    const calls = newCalls();
    const loader = createLoader({
      stubs: {
        ...guardedStubs(calls),
        "@/lib/workspace/active-workspace-server": {
          getWorkspaceContext: async () => null,
        },
        "@/lib/services/splitstep/pipeline-log": {
          pipelineLog: { error: () => {}, warn: () => {}, info: () => {} },
        },
      },
      globals: { Response },
    });
    const { GET } = loader.load(
      "src/app/api/splitstep/hours-left/route.ts",
    ) as {
      GET: () => Promise<Response>;
    };

    const res = await GET();

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Not signed in" });
    expectNothingGuardedRan(calls);
  });
});
