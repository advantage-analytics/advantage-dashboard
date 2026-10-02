import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { isUuid } from "@/lib/services/match-video/access";
import { isPlainObject } from "@/lib/services/match-video/http";
import { PurgeRefusedError } from "@/lib/services/matches/purge-match-storage";

/**
 * The match DELETE route against fakes, recording effect order. Same
 * transpile harness as `tests/admin-match-delete-protection.spec.ts`: the
 * route file is compiled to CommonJS and its imports answered from `mocks`,
 * so GET and PATCH's dependencies can be empty objects — only DELETE runs.
 *
 * `purgeThrows` picks what the purge throws: the real `PurgeRefusedError` of
 * either kind, or a plain `Error` standing in for anything unexpected. Each
 * carries a message the route must NOT forward.
 */
const LEAKY = "internal: admin_claim_match_storage_purge said no";

function harness(scenario: {
  deleteError?: { message: string } | null;
  purgeThrows?: "protected" | "unavailable" | "unexpected";
}) {
  const effects: string[] = [];
  const released: string[][] = [];
  const matchId = "5b0c7a52-3f4e-4d7a-9a41-0f2d6c1e8b90";
  const lookup = {
    select: () => lookup,
    eq: () => lookup,
    maybeSingle: async () => ({ data: { id: matchId }, error: null }),
    delete: () => {
      effects.push("delete");
      return deletion;
    },
  };
  // A thenable chain: `.delete().eq().eq()` resolves when awaited.
  const deletion = {
    eq: () => deletion,
    then: (
      resolve: (value: { error: unknown }) => unknown,
      reject: (reason: unknown) => unknown,
    ) =>
      Promise.resolve({ error: scenario.deleteError ?? null }).then(
        resolve,
        reject,
      ),
  };
  const session = {
    auth: {
      getUser: async () => ({
        data: { user: { id: "owner" } },
        error: null,
      }),
    },
    from: (table: string) => {
      expect(table).toBe("matches");
      return lookup;
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
    "@/lib/supabase/server": { createClient: async () => session },
    "@/lib/supabase/admin": {
      createAdminClient: () => ({
        rpc: async (name: string, args: { p_match_ids: string[] }) => {
          expect(name).toBe("admin_release_match_storage_purge");
          effects.push("release");
          released.push(args.p_match_ids);
          return { data: args.p_match_ids.length, error: null };
        },
      }),
    },
    "@/lib/services/match-video/access": { isUuid },
    "@/lib/services/match-video/http": { isPlainObject },
    "@/lib/services/matches/purge-match-storage": {
      PurgeRefusedError,
      purgeMatchStorage: async (_client: unknown, ids: string[]) => {
        effects.push("purge");
        expect(ids).toEqual([matchId]);
        if (scenario.purgeThrows === "unexpected") throw new Error(LEAKY);
        if (scenario.purgeThrows) {
          throw new PurgeRefusedError(scenario.purgeThrows, LEAKY, {
            message: "rpc exploded",
          });
        }
      },
    },
    // The shared release helper, forwarding to the same admin-client RPC the
    // route used to call inline — the effect order this spec asserts on
    // comes from that RPC mock, not from this wrapper.
    "@/lib/services/matches/release-storage-purge-claim": {
      releaseStoragePurgeClaims: async (
        client: { rpc: (name: string, args: unknown) => Promise<unknown> },
        matchIds: string[],
      ) => {
        if (matchIds.length === 0) return;
        await client.rpc("admin_release_match_storage_purge", {
          p_match_ids: matchIds,
        });
      },
    },
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
    exports: {} as {
      DELETE: (
        req: unknown,
        ctx: { params: Promise<{ matchId: string }> },
      ) => Promise<{ body: { ok?: boolean; error?: string }; status: number }>;
    },
  };
  new Function("require", "module", "exports", code)(
    (name: string) => mocks[name] ?? {},
    m,
    m.exports,
  );
  return {
    run: () => m.exports.DELETE({}, { params: Promise.resolve({ matchId }) }),
    effects,
    released,
    matchId,
  };
}

test("a failed row delete releases the purge claim, after the purge and the delete", async () => {
  const h = harness({ deleteError: { message: "deadlock detected" } });
  const response = await h.run();
  expect(response.status).toBe(500);
  // The 500 is the route's public sentence (serverError keeps the raw
  // Supabase text out of the response), and says nothing about the release.
  expect(response.body).toEqual({ error: "Could not delete the match" });
  expect(JSON.stringify(response.body)).not.toContain("deadlock detected");
  expect(h.effects).toEqual(["purge", "delete", "release"]);
  expect(h.released).toEqual([[h.matchId]]);
});

test("a completed delete releases nothing — the claim cascades with the row", async () => {
  const h = harness({});
  const response = await h.run();
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ ok: true });
  expect(h.effects).toEqual(["purge", "delete"]);
  expect(h.released).toEqual([]);
});

test("a protected refusal is a 409 with the console sentence: no delete, no release", async () => {
  const h = harness({ purgeThrows: "protected" });
  const response = await h.run();
  expect(response.status).toBe(409);
  expect(response.body).toEqual({
    error:
      "Matches recorded or analyzed through the admin console cannot be deleted here.",
  });
  expect(JSON.stringify(response.body)).not.toContain(LEAKY);
  expect(h.effects).toEqual(["purge"]);
  expect(h.released).toEqual([]);
});

for (const kind of ["unavailable", "unexpected"] as const) {
  test(`an ${kind} purge failure is a 503 that forwards no message: no delete, no release`, async () => {
    const h = harness({ purgeThrows: kind });
    const response = await h.run();
    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      error: "Match deletion is unavailable. Try again.",
    });
    expect(JSON.stringify(response.body)).not.toContain(LEAKY);
    expect(JSON.stringify(response.body)).not.toContain("rpc exploded");
    expect(h.effects).toEqual(["purge"]);
    expect(h.released).toEqual([]);
  });
}
