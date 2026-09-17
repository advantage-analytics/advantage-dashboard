import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import ts from "typescript";

function harness(data: boolean | null, error: unknown = null) {
  const effects: string[] = [];
  const mocks: Record<string, unknown> = {
    "@/lib/supabase/admin": {
      createAdminClient: () => ({ rpc: async () => ({ data, error }) }),
    },
    "@/lib/services/splitstep/config": { RESULTS_BUCKET: "results" },
    "@/lib/services/splitstep/video-url": {
      deleteVideoBlob: async () => {
        effects.push("blob");
        return { deleted: true };
      },
    },
    "@/lib/services/upload/storage.service": {
      MATCH_DATA_BUCKET: "match-data",
    },
  };
  const code = ts.transpileModule(
    readFileSync("src/lib/services/matches/purge-match-storage.ts", "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  const m = { exports: {} as any };
  new Function("require", "module", "exports", code)(
    (name: string) => mocks[name],
    m,
    m.exports,
  );
  const query: any = {
    select: () => query,
    in: async () => ({
      data: [
        {
          video_object_key: "source",
          trimmed_object_key: "trimmed",
          results_object_key: "result",
          storage_path: "file",
        },
      ],
      error: null,
    }),
  };
  const client = {
    from: () => {
      effects.push("read-keys");
      return query;
    },
    storage: {
      from: () => ({
        remove: async () => {
          effects.push("remove");
          return { error: null };
        },
      }),
    },
  };
  return {
    run: (ids = ["match"]) => m.exports.purgeMatchStorage(client, ids),
    effects,
  };
}

for (const [name, data, error] of [
  ["protected match", false, null],
  ["lookup failure", null, { message: "database unavailable" }],
  ["missing result", null, null],
] as const) {
  test(`${name} prevents every storage read and deletion`, async () => {
    const h = harness(data, error);
    await expect(h.run()).rejects.toThrow();
    expect(h.effects).toEqual([]);
  });
}
test("ordinary match retains storage cleanup", async () => {
  const h = harness(true);
  await h.run();
  expect(h.effects).toContain("blob");
  expect(h.effects).toContain("remove");
});
test("empty account match set has no cleanup effects", async () => {
  const h = harness(true);
  await h.run([]);
  expect(h.effects).toEqual([]);
});
