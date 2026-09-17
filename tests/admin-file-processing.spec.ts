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
  vm.runInNewContext(
    code + "\nglobalThis.readCombined = createCombinedSheets;",
    context,
  );
  return {
    readCombined: (
      context as unknown as {
        readCombined: (args: unknown) => Promise<unknown>;
      }
    ).readCombined,
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
test("legacy match cannot borrow console files, including encoded paths and forged prefix userId", async () => {
  for (const patch of [
    { fileNames: ["_admin-console/op/item/hash.xlsx"] },
    { fileNames: ["%5fadmin-console/op/item/hash.xlsx"] },
    { fileNames: ["folder/../_admin-console/op/item/hash.xlsx"] },
    { fileNames: ["folder\\_admin-console\\hash.xlsx"] },
    { userId: "_admin-console/op/item", fileNames: ["hash.xlsx"] },
  ]) {
    const h = edge(null);
    const result = await h.run({ ...body, ...patch });
    expect(result.status).toBe(500);
    expect(await result.json()).toMatchObject({
      error: "Console files require their durable processing claim.",
    });
    expect(h.calls).toHaveLength(1);
  }
});

test("processor rejects changed bytes before parsing or analysis writes", async () => {
  const h = edge(null);
  await expect(
    h.readCombined({
      supabase: {
        storage: {
          from: () => ({
            download: async () => ({
              data: new Blob(["tampered"]),
              error: null,
            }),
          }),
        },
      },
      userId: "actor",
      fileNames: ["_admin-console/op/item/file.xlsx"],
      expectedSha256: "a".repeat(64),
    }),
  ).rejects.toThrow("Validated file bytes changed; review required.");
});
