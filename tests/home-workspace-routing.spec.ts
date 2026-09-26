import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { expect, test } from "@playwright/test";
import ts from "typescript";

// Execute the actual route entrypoints with request dependencies stubbed. Stop
// at the first data read: a mismatched workspace must redirect before any of
// its home data is loaded. No credentials or live database writes are needed.
function homeRoute(
  route: "(home)" | "team",
  kind: "personal" | "team" | null,
  role = "owner",
) {
  const source = readFileSync(
    resolve(`src/app/dashboard/${route}/page.tsx`),
    "utf8",
  );
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  });
  const dataReads: string[] = [];
  const exports: { default?: () => Promise<unknown> } = {};
  runInNewContext(outputText, {
    exports,
    require: (id: string) => {
      if (id === "next/navigation") {
        return {
          redirect: (path: string) => {
            throw new Error(`redirect:${path}`);
          },
        };
      }
      if (id === "@/lib/workspace/active-workspace-server") {
        return {
          getWorkspaceContext: async () =>
            kind ? { active: { kind, role }, viewer: { id: "viewer" } } : null,
        };
      }
      return new Proxy(
        {},
        {
          get: (_target, name) => () => {
            dataReads.push(`${id}:${String(name)}`);
            throw new Error("home-data-started");
          },
        },
      );
    },
  });
  return { render: exports.default!, dataReads };
}

for (const role of ["owner", "coach", "staff", "player"]) {
  test(`dashboard entry sends a team ${role} to Team Home before personal reads`, async () => {
    const route = homeRoute("(home)", "team", role);
    await expect(route.render()).rejects.toThrow("redirect:/dashboard/team");
    expect(route.dataReads).toEqual([]);
  });
}

test("personal workspace proceeds to its own home data", async () => {
  const route = homeRoute("(home)", "personal");
  await expect(route.render()).rejects.toThrow("home-data-started");
  expect(route.dataReads).toEqual(["@/lib/supabase/server:createClient"]);
});

test("Team Home sends a personal workspace back before team reads", async () => {
  const route = homeRoute("team", "personal");
  await expect(route.render()).rejects.toThrow("redirect:/dashboard");
  expect(route.dataReads).toEqual([]);
});

for (const home of ["(home)", "team"] as const) {
  test(`${home} sends a signed-out request to login before data reads`, async () => {
    const route = homeRoute(home, null);
    await expect(route.render()).rejects.toThrow("redirect:/login");
    expect(route.dataReads).toEqual([]);
  });
}
