import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import ts from "typescript";

function harness(data: boolean | null, error: unknown = null, signedIn = true) {
  const effects: string[] = [];
  const session = {
    auth: {
      getUser: async () => ({
        data: { user: signedIn ? { id: "session-actor" } : null },
        error: null,
      }),
    },
    rpc: async (name: string) => {
      effects.push("prepare");
      expect(name).toBe("prepare_my_account_deletion");
      return {
        data: null,
        error:
          error ??
          (data === false
            ? { code: "22023", message: "console-history-protected" }
            : { code: "42501" }),
      };
    },
  };
  const mocks: Record<string, unknown> = {
    "@/lib/supabase/server": { createClient: async () => session },
    "@/lib/supabase/admin": {
      createAdminClient: () => {
        effects.push("admin-client");
        return {};
      },
    },
    "@/lib/services/matches/purge-match-storage": {
      purgeMatchStorage: async () => {
        effects.push("purge");
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
      deleteAccount: () => Promise<{ ok: boolean; error?: string }>;
    },
  };
  new Function("require", "module", "exports", code)(
    (name: string) => mocks[name] ?? {},
    m,
    m.exports,
  );
  return { run: () => m.exports.deleteAccount(), effects };
}

for (const [name, data, error] of [
  ["retained console actor", false, null],
  ["unavailable protection contract", null, { message: "missing RPC" }],
  ["missing protection result", null, null],
] as const) {
  test(`${name} refuses before membership release or storage deletion`, async () => {
    const h = harness(data, error);
    expect((await h.run()).ok).toBe(false);
    expect(h.effects).toEqual(["prepare"]);
  });
}
test("ordinary actor reaches existing owner refusal after protection check", async () => {
  const h = harness(true);
  expect(await h.run()).toMatchObject({
    ok: false,
    error: expect.stringContaining("Transfer ownership"),
  });
  expect(h.effects).toEqual(["prepare"]);
});
test("unauthenticated caller cannot invoke the service protection lookup", async () => {
  const h = harness(false, null, false);
  expect((await h.run()).ok).toBe(false);
  expect(h.effects).toEqual([]);
});
