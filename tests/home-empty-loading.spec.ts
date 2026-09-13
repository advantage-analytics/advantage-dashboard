import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { test, expect } from "@playwright/test";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

// Render the real card entrypoints with inert visual/data dependencies. Effects
// run separately so day zero must both render the empty design and skip reads.
function card(
  file: string,
  hasMatches: boolean,
  refresh?: () => Promise<unknown>,
) {
  const effects: (() => unknown)[] = [];
  let reads = 0;
  const writes: unknown[] = [];
  const handlers = new Map<string, () => void>();
  const cleanups: (() => void)[] = [];
  const marker = (name: string) =>
    function TestMarker() {
      return React.createElement("span", { "data-component": name });
    };
  const exports: { default?: React.ComponentType<Record<string, unknown>> } =
    {};
  const { outputText } = ts.transpileModule(
    readFileSync(resolve(file), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
      },
    },
  );
  runInNewContext(outputText, {
    exports,
    sessionStorage: { getItem: () => null },
    window: {
      addEventListener: (name: string, handler: () => void) =>
        handlers.set(name, handler),
      removeEventListener: (name: string) => handlers.delete(name),
    },
    require: (id: string) => {
      if (id === "react/jsx-runtime") return jsx;
      if (id === "react")
        return {
          ...React,
          useState: (value: unknown) => [
            value,
            (next: unknown) => writes.push(next),
          ],
          useRef: (value: unknown) => ({ current: value }),
          useCallback: (fn: unknown) => fn,
          useMemo: (fn: () => unknown) => fn(),
          useEffect: (effect: () => unknown) => effects.push(effect),
        };
      if (id === "next/navigation")
        return { useRouter: () => ({ refresh() {}, push() {} }) };
      if (id === "@/lib/supabase/client")
        return {
          createClient: () => {
            reads++;
            const query: Record<string, unknown> = {};
            for (const key of [
              "from",
              "select",
              "eq",
              "is",
              "order",
              "limit",
              "in",
            ])
              query[key] = () => query;
            query.then = (done: (value: unknown) => unknown) =>
              Promise.resolve(done({ data: [], error: null }));
            return query;
          },
        };
      if (id.includes("home-serve-data") && refresh)
        return { loadHomeServes: refresh };
      if (id === "framer-motion")
        return {
          useReducedMotion: () => true,
          motion: { div: "div" },
          AnimatePresence: React.Fragment,
        };
      if (id.includes("serve-zones")) return { computeZoneStats: () => ({}) };
      return new Proxy({}, { get: (_, name) => marker(String(name)) });
    },
  });
  const html = renderToStaticMarkup(
    React.createElement(exports.default!, {
      userId: "viewer",
      playerIds: ["viewer"],
      hasMatches,
      matchCount: hasMatches ? 1 : 0,
      wonCount: 0,
      initialEvents: [],
      initialData: { dots: [], matchCount: hasMatches ? 1 : 0 },
    }),
  );
  return {
    html,
    runEffects: () =>
      effects.forEach((effect) => {
        const cleanup = effect();
        if (typeof cleanup === "function") cleanups.push(cleanup as () => void);
      }),
    refresh: () => handlers.get("match-processed")?.(),
    unmount: () => cleanups.forEach((fn) => fn()),
    writes,
    reads: () => reads,
  };
}

for (const spec of [
  {
    file: "src/app/dashboard/(home)/recent-activity.tsx",
    empty: "RecentMatchesEmpty",
    loading: "RecentMatchesSkeletonContent",
  },
  {
    file: "src/components/dashboard/home/serve-placement-home.tsx",
    empty: "ServePlacementQuietStrip",
    loading: "ServePlacementSkeleton",
  },
]) {
  test(`${spec.empty}: known empty account renders immediately without another query`, () => {
    const result = card(spec.file, false);
    expect(result.html).toContain(`data-component="${spec.empty}"`);
    expect(result.html).not.toContain(`data-component="${spec.loading}"`);
    result.runEffects();
    expect(result.reads()).toBe(0);
  });
  test(`${spec.loading}: server-populated widgets do not reload on mount`, () => {
    const result = card(spec.file, true);
    expect(result.html).not.toContain(`data-component="${spec.loading}"`);
    result.runEffects();
    expect(result.reads()).toBe(0);
  });
}

test("Serve completion relies on the page refresh without issuing a leaf query", () => {
  const result = card(
    "src/components/dashboard/home/serve-placement-home.tsx",
    true,
    async () => ({ dots: [], matchCount: 2 }),
  );
  result.runEffects();
  result.refresh();
  expect(result.reads()).toBe(0);
});
