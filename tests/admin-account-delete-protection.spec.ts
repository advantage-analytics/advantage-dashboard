import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import ts from "typescript";

type Failure = { code?: string; message: string } | null;

/**
 * One `deleteAccount()` run against fakes, recording every side effect in
 * order. The defaults describe the claim-refusal cases the first tests pin;
 * `prepare: "ok"` walks past the claim into the cleanup, where `matches`,
 * `purgeThrows`, `matchDelete` and `authDelete` pick the step that fails.
 */
function harness(
  scenario: {
    signedIn?: boolean;
    prepare?: "ok" | "retained" | "owner" | Failure;
    matches?: { ids: string[] } | { error: Failure };
    purgeThrows?: boolean;
    matchDelete?: Failure;
    authDelete?: Failure;
  } = {},
) {
  const effects: string[] = [];
  const released: string[][] = [];
  const prepare = scenario.prepare ?? "owner";
  const matches = scenario.matches ?? { ids: ["match-1", "match-2"] };
  const session = {
    auth: {
      getUser: async () => ({
        data: { user: scenario.signedIn === false ? null : { id: "actor" } },
        error: null,
      }),
    },
    rpc: async (name: string) => {
      if (name === "release_my_account_deletion_claim") {
        effects.push("release-account");
        return { data: true, error: null };
      }
      effects.push("prepare");
      expect(name).toBe("prepare_my_account_deletion");
      if (prepare === "ok") return { data: [], error: null };
      return {
        data: null,
        error:
          prepare === "retained"
            ? { code: "22023", message: "console-history-protected" }
            : prepare === "owner"
              ? { code: "42501" }
              : prepare,
      };
    },
  };
  // A thenable chain: `.delete().eq()` / `.delete().in()` resolve when awaited.
  const deletion = (table: string, error: Failure) => {
    const chain = {
      eq: () => chain,
      in: () => chain,
      then: (
        resolve: (value: { error: Failure }) => unknown,
        reject: (reason: unknown) => unknown,
      ) => Promise.resolve({ error }).then(resolve, reject),
    };
    effects.push(`delete-${table}`);
    return chain;
  };
  const admin = {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          is: async () => {
            effects.push("list-matches");
            return "error" in matches
              ? { data: null, error: matches.error }
              : { data: matches.ids.map((id) => ({ id })), error: null };
          },
        }),
      }),
      delete: () =>
        deletion(
          table,
          table === "matches" ? (scenario.matchDelete ?? null) : null,
        ),
    }),
    rpc: async (name: string, args: { p_match_ids: string[] }) => {
      expect(name).toBe("admin_release_match_storage_purge");
      effects.push("release-purge");
      released.push(args.p_match_ids);
      return { data: args.p_match_ids.length, error: null };
    },
    auth: {
      admin: {
        deleteUser: async () => {
          effects.push("delete-auth");
          return { data: null, error: scenario.authDelete ?? null };
        },
      },
    },
  };
  const mocks: Record<string, unknown> = {
    "@/lib/supabase/server": { createClient: async () => session },
    "@/lib/supabase/admin": {
      createAdminClient: () => {
        effects.push("admin-client");
        return admin;
      },
    },
    "@/lib/services/matches/purge-match-storage": {
      purgeMatchStorage: async () => {
        effects.push("purge");
        if (scenario.purgeThrows) {
          throw new Error(
            "Matches recorded or analyzed through the admin console cannot be deleted here.",
          );
        }
      },
    },
    "next/cache": { revalidatePath: () => {} },
    "next/navigation": {
      redirect: () => {
        effects.push("redirect");
      },
    },
  };
  const code = ts.transpileModule(
    readFileSync("src/components/dashboard/settings/actions.ts", "utf8"),
    {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    },
  ).outputText;
  const m = {
    exports: {} as {
      deleteAccount: () => Promise<{ ok: boolean; error?: string } | void>;
    },
  };
  new Function("require", "module", "exports", code)(
    (name: string) => mocks[name] ?? {},
    m,
    m.exports,
  );
  return { run: () => m.exports.deleteAccount(), effects, released };
}

// "missing protection result" keeps the original harness's reading of a null
// result: it fell through to the 42501 owner refusal, so it does here too.
for (const [name, prepare] of [
  ["retained console actor", "retained"],
  ["unavailable protection contract", { message: "missing RPC" }],
  ["missing protection result", "owner"],
] as const) {
  test(`${name} refuses before membership release or storage deletion`, async () => {
    const h = harness({ prepare });
    expect((await h.run())?.ok).toBe(false);
    expect(h.effects).toEqual(["prepare"]);
  });
}
test("ordinary actor reaches existing owner refusal after protection check", async () => {
  const h = harness({ prepare: "owner" });
  expect(await h.run()).toMatchObject({
    ok: false,
    error: expect.stringContaining("Transfer ownership"),
  });
  expect(h.effects).toEqual(["prepare"]);
});
test("unauthenticated caller cannot invoke the service protection lookup", async () => {
  const h = harness({ prepare: "retained", signedIn: false });
  expect((await h.run())?.ok).toBe(false);
  expect(h.effects).toEqual([]);
});

/* =========================================================================
 * Releasing the claims a failed deletion took (T27)
 * ====================================================================== */

test("a failed matches read releases the account claim and nothing else", async () => {
  const h = harness({
    prepare: "ok",
    matches: { error: { message: "connection reset" } },
  });
  expect(await h.run()).toMatchObject({
    ok: false,
    error: expect.stringContaining("could not read your matches"),
  });
  // No purge ran, so there is no purge claim to give back.
  expect(h.effects).toEqual([
    "prepare",
    "admin-client",
    "list-matches",
    "release-account",
  ]);
  expect(h.released).toEqual([]);
});

test("a purge refusal releases both claims after the purge", async () => {
  const h = harness({ prepare: "ok", purgeThrows: true });
  expect(await h.run()).toMatchObject({
    ok: false,
    error: expect.stringContaining("cannot be deleted here"),
  });
  expect(h.effects).toEqual([
    "prepare",
    "admin-client",
    "list-matches",
    "purge",
    "release-account",
    "release-purge",
  ]);
  expect(h.released).toEqual([["match-1", "match-2"]]);
});

test("a failed match delete releases both claims and keeps its message", async () => {
  const h = harness({
    prepare: "ok",
    matchDelete: { message: "deadlock detected" },
  });
  expect(await h.run()).toMatchObject({
    ok: false,
    error: expect.stringContaining("could not delete your matches"),
  });
  expect(h.effects).toEqual([
    "prepare",
    "admin-client",
    "list-matches",
    "purge",
    "delete-matches",
    "release-account",
    "release-purge",
  ]);
  expect(h.released).toEqual([["match-1", "match-2"]]);
});

test("a failed auth delete releases both claims after every deletion step", async () => {
  const h = harness({
    prepare: "ok",
    authDelete: { message: "auth unavailable" },
  });
  expect(await h.run()).toMatchObject({
    ok: false,
    error: expect.stringContaining("Contact support"),
  });
  expect(h.effects).toEqual([
    "prepare",
    "admin-client",
    "list-matches",
    "purge",
    "delete-matches",
    "delete-processing_jobs",
    "delete-processing_usage",
    "delete-auth",
    "release-account",
    "release-purge",
  ]);
  expect(h.released).toEqual([["match-1", "match-2"]]);
});

test("a completed deletion releases nothing — the cascades already did", async () => {
  const h = harness({ prepare: "ok" });
  await h.run();
  expect(h.effects).toEqual([
    "prepare",
    "admin-client",
    "list-matches",
    "purge",
    "delete-matches",
    "delete-processing_jobs",
    "delete-processing_usage",
    "delete-auth",
    "redirect",
  ]);
  expect(h.released).toEqual([]);
});

test("an account with no personal matches releases only the account claim on failure", async () => {
  const h = harness({
    prepare: "ok",
    matches: { ids: [] },
    authDelete: { message: "auth unavailable" },
  });
  expect((await h.run())?.ok).toBe(false);
  // Nothing was claimed for purge, so no purge release is issued.
  expect(h.effects).toEqual([
    "prepare",
    "admin-client",
    "list-matches",
    "purge",
    "delete-processing_jobs",
    "delete-processing_usage",
    "delete-auth",
    "release-account",
  ]);
  expect(h.released).toEqual([]);
});
