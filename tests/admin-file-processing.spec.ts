/**
 * One narrow guard on process-match's admin-console claim, kept apart from
 * `tests/process-match-guards.spec.ts` because that spec never pairs a forged
 * body `userId` with a user token on an unclaimed console match: here the
 * claim must carry the token's verified actor (`p_service: false`), answer the
 * attempt's state, and read no table at all. Everything else this file used to
 * cover lives in the guards spec: the refusal of `_admin-console/` paths and
 * their escaped aliases ("the console namespace and its escaped aliases are
 * refused for every non-claim call") and the sha-256 mismatch that fails a
 * claimed attempt before parsing ("a claimed file whose bytes no longer hash
 * to the validated sha256 ..."). Add new process-match cases there, not here.
 */
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { webcrypto } from "node:crypto";

// Execute the real Edge entry boundary without a deployed Supabase project.
function edge(claim: unknown) {
  let handler!: (request: Request) => Promise<Response>;
  const calls: { name: string; args: unknown }[] = [];
  const source = readFileSync(
    "supabase/functions/process-match/index.ts",
    "utf8",
  ).replace(/^import .*;\n/gm, "");
  const code = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  }).outputText;
  const client = {
    auth: {
      getUser: async (token: string) => ({
        data: {
          user: token === "user-token" ? { id: "verified-actor" } : null,
        },
        error: null,
      }),
    },
    rpc: async (name: string, args: unknown) => {
      calls.push({ name, args });
      return { data: claim, error: null };
    },
    from: () => {
      throw new Error("unexpected legacy read");
    },
  };
  const context = {
    crypto: webcrypto,
    exports: {},
    require: () => ({}),
    createClient: () => client,
    Deno: {
      serve: (fn: typeof handler) => (handler = fn),
      env: {
        get: (name: string) =>
          name === "SUPABASE_SERVICE_ROLE_KEY"
            ? "service-key"
            : "https://test.invalid",
      },
    },
    Request,
    Response,
    console: { log() {}, error() {} },
  };
  vm.runInNewContext(code, context);
  return {
    calls,
    run: (body: unknown, token = "user-token") =>
      handler(
        new Request("https://test.invalid/process-match", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        }),
      ),
  };
}
const body = {
  matchId: "match",
  userId: "forged-user",
  fileNames: ["forged.xlsx"],
  sourceProvider: "swing-vision",
};
test("Edge always claims by match, deriving actor from token even without operation identifiers", async () => {
  const h = edge({
    claimed: false,
    state: "processing",
    operationId: "op",
    itemId: "item",
  });
  const response = await h.run(body);
  expect(await response.json()).toMatchObject({
    state: "processing",
    operationId: "op",
  });
  expect(h.calls).toEqual([
    {
      name: "admin_claim_match_file",
      args: {
        p_match_id: "match",
        p_actor_id: "verified-actor",
        p_service: false,
      },
    },
  ]);
});
