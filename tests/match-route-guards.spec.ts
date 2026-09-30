import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { isUuid } from "@/lib/services/match-video/access";
import { isPlainObject } from "@/lib/services/match-video/http";
import { normalizeMatchPatch } from "@/lib/matches/patch-match";
import { takenRoundCodes } from "@/lib/matches/round-options";
import { resolveAnalysisStatus } from "@/lib/data/match-analysis";
import { rosterPlayerOptions } from "@/lib/data/roster-shared";

/**
 * `/api/matches/[matchId]`'s guards, against fakes. Same transpile harness as
 * `tests/match-delete-claim-release.spec.ts`: the route file is compiled to
 * CommonJS and its imports answered from `mocks`. The pure rule modules
 * (`isUuid`, `isPlainObject`, `normalizeMatchPatch`, …) are the real ones;
 * only Supabase, Next and the purge are faked.
 *
 * `calls` records every Supabase touch — the client's creation included — so
 * "before any Supabase call" is an assertion, not a hope.
 */

type Read = { data: unknown; error: { message: string } | null };
type Response = { body: Record<string, unknown>; status: number };
type Handler = (
  req: unknown,
  ctx: { params: Promise<{ matchId: string }> },
) => Promise<Response>;

const MATCH_ID = "5b0c7a52-3f4e-4d7a-9a41-0f2d6c1e8b90";
const PROGRAM_ID = "c7d1e2f3-0a1b-4c2d-8e3f-405162738495";
const PICKED_PLAYER = "1f2e3d4c-5b6a-4978-8a69-5b4c3d2e1f00";
const RAW = "relation processing_jobs: connection reset by peer";

const personalMatch = {
  id: MATCH_ID,
  score: null,
  format: null,
  program_id: null,
  event_entry_id: null,
  source_provider: null,
  match_type: null,
  round: null,
  player1_id: "owner",
};

function harness(
  scenario: {
    match?: Record<string, unknown> | null;
    jobs?: Read;
    roster?: Read;
  } = {},
) {
  const calls: string[] = [];
  const chain = (table: string) => {
    const q = {
      select: () => q,
      eq: () => q,
      is: () => q,
      order: () => q,
      limit: () => q,
      update: () => {
        calls.push(`update:${table}`);
        return q;
      },
      maybeSingle: async (): Promise<Read> => {
        if (table === "processing_jobs") {
          return scenario.jobs ?? { data: null, error: null };
        }
        if (table === "matches") {
          return { data: scenario.match ?? personalMatch, error: null };
        }
        return { data: null, error: null };
      },
    };
    return q;
  };
  const session = {
    auth: {
      getUser: async () => {
        calls.push("auth");
        return { data: { user: { id: "owner" } }, error: null };
      },
    },
    from: (table: string) => {
      calls.push(`from:${table}`);
      return chain(table);
    },
    rpc: async (name: string) => {
      calls.push(`rpc:${name}`);
      return scenario.roster ?? { data: [], error: null };
    },
  };
  const mocks: Record<string, unknown> = {
    "next/server": {
      NextRequest: class {},
      NextResponse: {
        json: (body: unknown, init?: { status?: number }) => ({
          body,
          status: init?.status ?? 200,
        }),
      },
    },
    "next/cache": { revalidatePath: () => {} },
    "@/lib/supabase/server": {
      createClient: async () => {
        calls.push("createClient");
        return session;
      },
    },
    "@/lib/supabase/admin": {
      createAdminClient: () => {
        calls.push("createAdminClient");
        return session;
      },
    },
    "@/lib/services/matches/purge-match-storage": {
      PurgeRefusedError: class extends Error {},
      purgeMatchStorage: async () => {
        calls.push("purge");
      },
    },
    "@/lib/services/matches/release-storage-purge-claim": {
      releaseStoragePurgeClaims: async () => {},
    },
    "@/lib/data/match-analysis": { resolveAnalysisStatus },
    "@/lib/matches/patch-match": { normalizeMatchPatch },
    "@/lib/matches/round-options": { takenRoundCodes },
    "@/lib/workspace/active-workspace-server": {
      getWorkspaceContext: async () => null,
    },
    "@/lib/workspace/types": { canManageTeamSchedule: () => false },
    "@/lib/data/roster-shared": { rosterPlayerOptions },
    "@/lib/services/match-video/access": { isUuid },
    "@/lib/services/match-video/http": { isPlainObject },
  };
  const code = ts.transpileModule(
    readFileSync("src/app/api/matches/[matchId]/route.ts", "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  const m = {
    exports: {} as { GET: Handler; PATCH: Handler; DELETE: Handler },
  };
  new Function("require", "module", "exports", code)(
    (name: string) => {
      if (!(name in mocks)) throw new Error(`unmocked import: ${name}`);
      return mocks[name];
    },
    m,
    m.exports,
  );

  const ctx = (matchId: string) => ({ params: Promise.resolve({ matchId }) });
  /** A request whose `json()` answers `body`, or throws when it is `THROWS`. */
  const req = (body: unknown) => ({
    json: async () => {
      if (body === THROWS) throw new SyntaxError("Unexpected token");
      return body;
    },
  });
  return {
    calls,
    GET: (matchId = MATCH_ID) => m.exports.GET({}, ctx(matchId)),
    PATCH: (body: unknown, matchId = MATCH_ID) =>
      m.exports.PATCH(req(body), ctx(matchId)),
    DELETE: (matchId = MATCH_ID) => m.exports.DELETE({}, ctx(matchId)),
  };
}

const THROWS = Symbol("invalid JSON");

// Keep the route's serverError logging out of the test output.
const originalConsoleError = console.error;
test.beforeEach(() => {
  console.error = () => {};
});
test.afterEach(() => {
  console.error = originalConsoleError;
});

/* ---------------------------------------------------------------- ids */

const MALFORMED_IDS = [
  "not-a-uuid",
  "",
  "../../etc/passwd",
  `${MATCH_ID}x`,
  "5b0c7a52-3f4e-4d7a-9a41-0f2d6c1e8bzz",
];

for (const method of ["GET", "PATCH", "DELETE"] as const) {
  test(`${method} answers 404 for a malformed id before any Supabase call`, async () => {
    for (const id of MALFORMED_IDS) {
      const h = harness();
      const response =
        method === "PATCH"
          ? await h.PATCH({ tournament_name: "Open" }, id)
          : await h[method](id);
      expect(response.status, id).toBe(404);
      expect(response.body, id).toEqual({ error: "Not found" });
      expect(h.calls, id).toEqual([]);
    }
  });
}

test("a well-formed id still reaches the lookup", async () => {
  const h = harness();
  const response = await h.GET();
  expect(response.status).toBe(200);
  expect(h.calls).toContain("from:matches");
});

/* ------------------------------------------------------------- bodies */

for (const [label, body] of [
  ["null", null],
  ["42", 42],
  ['"x"', "x"],
  ["[]", []],
  ["unparseable JSON", THROWS],
] as const) {
  test(`PATCH answers 400 for a ${label} body, before any read`, async () => {
    const h = harness();
    const response = await h.PATCH(body);
    expect(response.status).toBe(400);
    // The dialog's `{ error, field }` shape — no field for a body refusal.
    expect(response.body).toEqual({ error: "Invalid JSON body" });
    expect(h.calls).toEqual(["createClient", "auth"]);
  });
}

test("PATCH still answers a rule refusal as { error, field }", async () => {
  const h = harness();
  const response = await h.PATCH({ player1_name: "  " });
  expect(response.status).toBe(400);
  expect(response.body).toEqual({
    error: "Enter your player's name.",
    field: "player1_name",
  });
});

/* ------------------------------------------------ analysis read errors */

test("PATCH answers 500 when the analysis read fails, and writes nothing", async () => {
  const h = harness({ jobs: { data: null, error: { message: RAW } } });
  // A false "not analysed" would unlock the format and player edits.
  const response = await h.PATCH({ tournament_name: "Open" });
  expect(response.status).toBe(500);
  expect(response.body).toEqual({ error: "Could not load the match" });
  expect(JSON.stringify(response.body)).not.toContain(RAW);
  expect(h.calls).not.toContain("update:matches");
});

test("GET answers 500 when the analysis read fails", async () => {
  const h = harness({ jobs: { data: null, error: { message: RAW } } });
  const response = await h.GET();
  expect(response.status).toBe(500);
  expect(response.body).toEqual({ error: "Could not load the match" });
});

test("PATCH saves when the analysis read succeeds with no job", async () => {
  const h = harness();
  const response = await h.PATCH({ tournament_name: "Open" });
  expect(response.status).toBe(200);
  expect(h.calls).toContain("update:matches");
});

/* -------------------------------------------------- roster read errors */

test("PATCH answers 500 when the roster read fails, not the off-roster 400", async () => {
  const h = harness({
    match: { ...personalMatch, program_id: PROGRAM_ID },
    roster: { data: null, error: { message: RAW } },
  });
  const response = await h.PATCH({ player1_id: PICKED_PLAYER });
  expect(response.status).toBe(500);
  expect(response.body).toEqual({ error: "Could not load the roster" });
  expect(h.calls).not.toContain("update:matches");
});
