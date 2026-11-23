import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { test, expect } from "@playwright/test";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import ts from "typescript";

const SOURCE = readFileSync(
  resolve("src/app/dashboard/(home)/page.tsx"),
  "utf8",
);

/** The personal Home's entrypoint with every read stubbed and recorded. */
function route(feed?: unknown) {
  const pending = new Promise<never>(() => {});
  const reads: string[] = [];
  const exports: { default?: () => Promise<React.ReactElement> } = {};
  const placeholder = (name: string) =>
    Object.assign(() => null, { displayName: name });
  const read =
    (name: string, value: Promise<unknown> = pending) =>
    () => {
      reads.push(name);
      return value;
    };
  runInNewContext(
    ts.transpileModule(SOURCE, {
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
              viewer: { id: "viewer", name: "Viewer", firstName: "Viewer" },
            }),
          };
        if (id.includes("home-feed-server"))
          return {
            getHomeFeed: read("feed", feed ? Promise.resolve(feed) : undefined),
          };
        if (id.includes("usage-server"))
          return { getPersonalUsage: read("usage") };
        if (id.includes("personal-kpis-server"))
          return { getPersonalSeasonKpis: read("kpis") };
        if (id.includes("ask-server"))
          return { getAskPins: read("pins", Promise.resolve([])) };
        if (id.includes("splitstep/config"))
          return { currentBillingMonth: () => "2026-09" };
        return new Proxy({}, { get: (_, name) => placeholder(String(name)) });
      },
    },
  );
  return { render: exports.default!, reads };
}

function find(
  node: unknown,
  name: string,
): React.ReactElement<Record<string, unknown>> | undefined {
  if (!React.isValidElement<Record<string, unknown>>(node)) return;
  const type = node.type as { name?: string; displayName?: string };
  if (type.name === name || type.displayName === name) return node;
  for (const value of Object.values(node.props)) {
    for (const child of Array.isArray(value) ? value : [value]) {
      const result = find(child, name);
      if (result) return result;
    }
  }
}
test("Home returns its frame while every read is still pending", async () => {
  const home = route();
  const result = await Promise.race([
    home.render(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("page waited for widget data")), 1000),
    ),
  ]);
  expect(find(result, "HomeFeedFrame")).toBeDefined();
  expect(home.reads).toEqual(["feed", "usage", "kpis", "pins"]);
});

test("The action cards hold the lead slot at every stage, with no read behind them", async () => {
  const start = find(await route().render(), "StartCards");
  expect(
    (start?.props.cards as { title: string }[]).map((card) => card.title),
  ).toEqual(["New match", "Join your team", "Ask about your game"]);
  // No lead card, no separate day-zero page and no presence read.
  expect(SOURCE).not.toContain("lead-card");
  expect(SOURCE).not.toContain("DayZero");
  expect(SOURCE).not.toContain("getWorkspacePresence");
});

test("The title, pilot card and list share one match read", () => {
  expect(SOURCE.match(/getHomeFeed\(\)/g)).toHaveLength(1);
});
