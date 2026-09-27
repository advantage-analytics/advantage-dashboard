import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import ts from "typescript";

/**
 * The match DELETE route against fakes, recording effect order. Same
 * transpile harness as `tests/admin-match-delete-protection.spec.ts`: the
 * route file is compiled to CommonJS and its imports answered from `mocks`,
 * so GET and PATCH's dependencies can be empty objects — only DELETE runs.
 */
function harness(scenario: {
  deleteError?: { message: string } | null;
  purgeThrows?: boolean;
}) {
  const effects: string[] = [];
  const released: string[][] = [];
  const matchId = "match-1";
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
    "@/lib/services/matches/purge-match-storage": {
      purgeMatchStorage: async (_client: unknown, ids: string[]) => {
        effects.push("purge");
        expect(ids).toEqual([matchId]);
        if (scenario.purgeThrows) {
          throw new Error(
            "Matches recorded or analyzed through the admin console cannot be deleted here.",
          );
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
  // The 500 still names the delete failure, not anything about the release.
  expect(response.body).toEqual({ error: "deadlock detected" });
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

test("the 409 purge refusal is unchanged: no delete, no release", async () => {
  const h = harness({ purgeThrows: true });
  const response = await h.run();
  expect(response.status).toBe(409);
  expect(response.body).toEqual({
    error:
      "Matches recorded or analyzed through the admin console cannot be deleted here.",
  });
  expect(h.effects).toEqual(["purge"]);
  expect(h.released).toEqual([]);
});
