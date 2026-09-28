import { expect, test } from "@playwright/test";
import { NextRequest } from "next/server";

import { searchCustomPrograms } from "@/lib/data/programs-server";
import { createLoader } from "./fixtures/vm-modules";
import { withConsoleErrors } from "./fixtures/with-console-errors";

/**
 * The custom-org typeahead, offline (T1).
 *
 * `searchCustomPrograms` is the loader behind `/api/programs/custom-search`:
 * the two-character floor has to hold BEFORE the RPC is called (the SQL
 * enforces it too, but the round trip on the first keystroke is the point),
 * the four columns `search_custom_programs` projects map by name, and the
 * owner's display goes through `titleCaseName` like the college search's.
 *
 * The route is driven through the vm loader with `@/lib/supabase/server`
 * stubbed: no session is a 401, a short term is an empty page without an RPC
 * call, and every answer carries `Cache-Control: private, no-store` — never
 * the shared `s-maxage` of the public `/api/programs/search`. Nothing here
 * opens a database; the live half is `custom-program-search-rls.spec.ts`.
 */

type RpcCall = { fn: string; args: Record<string, unknown> };

function fakeClient(
  rows: Record<string, unknown>[] | null,
  opts: { user?: { id: string } | null; error?: { message: string } } = {},
) {
  const calls: RpcCall[] = [];
  const user = opts.user === undefined ? { id: "u-1" } : opts.user;
  const client = {
    auth: {
      getUser: async () => ({
        data: { user },
        error: user ? null : { message: "Auth session missing" },
      }),
    },
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      return opts.error
        ? { data: null, error: opts.error }
        : { data: rows, error: null };
    },
  };
  return { client, calls };
}

const ROW = {
  program_id: "11111111-2222-4333-8444-555555555555",
  school_name: "Centennial Tennis Club",
  org_type: "club",
  owner_display: "elena v.",
};

// ── searchCustomPrograms ─────────────────────────────────────────────────────

test("a term under two characters returns [] without calling the RPC", async () => {
  const { client, calls } = fakeClient([ROW]);
  const supabase = client as never;

  expect(await searchCustomPrograms(supabase, "")).toEqual([]);
  expect(await searchCustomPrograms(supabase, "c")).toEqual([]);
  // Whitespace does not count towards the floor.
  expect(await searchCustomPrograms(supabase, "  c  ")).toEqual([]);
  expect(calls).toEqual([]);
});

test("rows map by name and the owner display is title-cased", async () => {
  const { client, calls } = fakeClient([
    ROW,
    {
      ...ROW,
      program_id: "no-owner",
      org_type: "academy",
      owner_display: null,
    },
  ]);

  const results = await searchCustomPrograms(
    client as never,
    "  Cent ",
    "club",
  );

  expect(calls).toEqual([
    {
      fn: "search_custom_programs",
      args: { p_term: "Cent", p_org_type: "club", p_limit: 8 },
    },
  ]);
  expect(results).toEqual([
    {
      programId: ROW.program_id,
      name: "Centennial Tennis Club",
      orgType: "club",
      ownerDisplay: "Elena V.",
    },
    {
      programId: "no-owner",
      name: "Centennial Tennis Club",
      orgType: "academy",
      ownerDisplay: null,
    },
  ]);
  // The projection is closed: a row carries exactly these four keys.
  for (const row of results) {
    expect(Object.keys(row).sort()).toEqual([
      "name",
      "orgType",
      "ownerDisplay",
      "programId",
    ]);
  }
});

test("an org type outside the four custom kinds is sent as null", async () => {
  const { client, calls } = fakeClient([]);
  const supabase = client as never;

  await searchCustomPrograms(supabase, "cent", "college");
  await searchCustomPrograms(supabase, "cent", "");
  await searchCustomPrograms(supabase, "cent", undefined);
  await searchCustomPrograms(supabase, "cent", "high_school");

  expect(calls.map((c) => c.args.p_org_type)).toEqual([
    null,
    null,
    null,
    "high_school",
  ]);
});

test("an RPC error is logged and answered with []", async () => {
  const { client } = fakeClient(null, {
    error: { message: "permission denied" },
  });

  const { result, errors } = await withConsoleErrors(() =>
    searchCustomPrograms(client as never, "cent"),
  );

  expect(result).toEqual([]);
  expect(errors).toHaveLength(1);
});

// ── GET /api/programs/custom-search ─────────────────────────────────────────

type RouteHandler = (request: NextRequest) => Promise<Response>;

function loadRoute(client: unknown): RouteHandler {
  const loader = createLoader({
    stubs: { "@/lib/supabase/server": { createClient: async () => client } },
    globals: { URL },
  });
  return loader.load("src/app/api/programs/custom-search/route.ts")
    .GET as RouteHandler;
}

function request(query: string) {
  return new NextRequest(`http://localhost/api/programs/custom-search${query}`);
}

const PRIVATE = "private, no-store";

test("route: no session is a 401 and never reaches the RPC", async () => {
  const { client, calls } = fakeClient([ROW], { user: null });
  const res = await loadRoute(client)(request("?q=centennial"));

  expect(res.status).toBe(401);
  expect(res.headers.get("cache-control")).toBe(PRIVATE);
  expect(calls).toEqual([]);
});

test("route: a term under two characters is an empty page, no RPC", async () => {
  const { client, calls } = fakeClient([ROW]);
  const res = await loadRoute(client)(request("?q=c"));

  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ results: [] });
  expect(res.headers.get("cache-control")).toBe(PRIVATE);
  expect(calls).toEqual([]);
});

test("route: a signed-in search answers the mapped rows, privately", async () => {
  const { client, calls } = fakeClient([ROW]);
  const res = await loadRoute(client)(request("?q=cent&type=club"));

  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({
    results: [
      {
        programId: ROW.program_id,
        name: "Centennial Tennis Club",
        orgType: "club",
        ownerDisplay: "Elena V.",
      },
    ],
  });
  const cacheControl = res.headers.get("cache-control");
  expect(cacheControl).toBe(PRIVATE);
  expect(cacheControl).not.toContain("s-maxage");
  expect(calls).toEqual([
    {
      fn: "search_custom_programs",
      args: { p_term: "cent", p_org_type: "club", p_limit: 8 },
    },
  ]);
});
