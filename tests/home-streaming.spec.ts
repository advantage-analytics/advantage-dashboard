import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { test, expect } from "@playwright/test";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import ts from "typescript";

function route(matchRows: { id: string; date: string }[], failure = false) {
  const pending = new Promise<never>(() => {});
  const reads: string[] = [];
  const exports: { default?: () => Promise<React.ReactElement> } = {};
  const placeholder = (name: string) =>
    Object.assign(() => null, { displayName: name });
  const query: Record<string, unknown> = {};
  for (const key of ["from", "select", "eq", "single", "maybeSingle"])
    query[key] = () => query;
  query.then = (fn: (v: unknown) => unknown) =>
    Promise.resolve(fn({ data: {} }));
  const source = readFileSync(
    resolve("src/app/dashboard/(home)/page.tsx"),
    "utf8",
  );
  runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText,
    {
      exports,
      require: (id: string) => {
        if (id === "react") return React;
        if (id === "react/jsx-runtime") return jsx;
        if (id === "next/navigation")
          return {
            redirect() {
              throw new Error("unexpected redirect");
            },
          };
        if (id.includes("active-workspace-server"))
          return {
            getWorkspaceContext: async () => ({
              active: { kind: "personal" },
              viewer: { id: "viewer" },
            }),
          };
        if (id === "@/lib/supabase/server")
          return { createClient: async () => ({ from: () => query }) };
        if (id.includes("personal-matches-server"))
          return {
            getPersonalMatches: async () => {
              if (failure) throw new Error("database failed");
              return matchRows;
            },
          };
        if (id.includes("performance-server"))
          return {
            getOverallPerformance: () => {
              reads.push("performance");
              return pending;
            },
          };
        if (id.includes("personal-kpis-server"))
          return {
            getPersonalSeasonKpis: () => {
              reads.push("kpis");
              return pending;
            },
          };
        if (id.includes("usage-server"))
          return {
            getPersonalUsage: () => {
              reads.push("usage");
              return pending;
            },
          };
        if (id.includes("personal-activity-server"))
          return {
            getPersonalActivity: () =>
              Promise.resolve({ days: [], monthLabels: [], sessionCount: 0 }),
          };
        if (id.includes("player-identity-server"))
          return { getMyPlayerIds: async () => ["viewer"] };
        if (id.includes("home-recent-data"))
          return {
            countViewerWins: () => 0,
            loadRecentMatches: () => {
              reads.push("recent");
              return pending;
            },
          };
        if (id.includes("home-serve-data"))
          return {
            loadHomeServes: () => {
              reads.push("serves");
              return pending;
            },
          };
        if (id.includes("splitstep/config"))
          return { currentBillingMonth: () => "2026-09" };
        return new Proxy({}, { get: (_, name) => placeholder(String(name)) });
      },
    },
  );
  return { render: exports.default!, reads };
}

function contentProps(node: React.ReactElement): Record<string, unknown> {
  const props = node.props as {
    hasMatches?: boolean;
    children?: React.ReactElement | React.ReactElement[];
  };
  if (typeof props.hasMatches === "boolean") return props;
  for (const child of React.Children.toArray(props.children)) {
    if (React.isValidElement(child)) {
      const found = contentProps(child);
      if ("hasMatches" in found) return found;
    }
  }
  return {};
}

test("Home returns its frame while independent analytics and serve reads remain pending", async () => {
  const home = route([{ id: "personal-match", date: "2026-09-01" }]);
  const result = await Promise.race([
    home.render(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("page waited for widget data")), 1000),
    ),
  ]);
  expect(contentProps(result).hasMatches).toBe(true);
  expect(home.reads).toEqual(
    expect.arrayContaining([
      "performance",
      "kpis",
      "usage",
      "recent",
      "serves",
    ]),
  );
});

test("Empty account selects day zero before analytics and skips recent/serve/usage reads", async () => {
  const home = route([]);
  const result = await home.render();
  expect(contentProps(result).hasMatches).toBe(false);
  expect(home.reads).not.toContain("recent");
  expect(home.reads).not.toContain("serves");
  expect(home.reads).not.toContain("usage");
  expect(home.reads).not.toContain("performance");
  expect(home.reads).not.toContain("kpis");
});

test("Failed base query cannot become a first-match offer", async () => {
  const home = route([], true);
  await expect(home.render()).rejects.toThrow("database failed");
  expect(home.reads).toEqual([]);
});

test("Recent matches does not wait for full-history performance", () => {
  const source = readFileSync(
    resolve("src/app/dashboard/(home)/page.tsx"),
    "utf8",
  );
  const recentRegion = source.match(
    /async function Recent[\s\S]*?async function Activity/,
  )?.[0];
  expect(recentRegion).toBeTruthy();
  expect(recentRegion).toContain("wonCount");
  expect(recentRegion).not.toContain("performance");
});
