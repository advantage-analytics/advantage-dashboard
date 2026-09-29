import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

/**
 * The match route's two loading states, in source order (T29). The layout
 * reads a cheap status hint first — covered by the group `loading.tsx`'s
 * neutral ground — then streams the skeleton the hint picks over the match
 * load. A `notFound()` after the `<Suspense` would run under a committed
 * boundary; a `getMatchDetailData(` before it would block the skeleton.
 */

const LAYOUT = readFileSync(
  "src/app/dashboard/matches/(detail)/[matchId]/layout.tsx",
  "utf8",
);
/** Where the JSX element opens — a line starting `<Suspense`, not a comment. */
const SUSPENSE = LAYOUT.search(/^\s*<Suspense\b/m);
/** A call, not a `getMatchDetailData()` mention in a comment. */
const CALL = /getMatchDetailData\((?!\))/;

const LOADING = readFileSync(
  "src/app/dashboard/matches/(detail)/loading.tsx",
  "utf8",
);

test("the hint and its notFound() come before the Suspense boundary", () => {
  const params = LAYOUT.indexOf("await params");
  const hint = LAYOUT.indexOf("await getMatchPageHint(matchId)");
  const guard = LAYOUT.indexOf("notFound();", hint);
  const suspense = SUSPENSE;
  expect(params).toBeGreaterThan(-1);
  expect(hint).toBeGreaterThan(params);
  // The hint is the first await after params.
  expect(LAYOUT.slice(params + 1, hint)).not.toContain("await ");
  expect(guard).toBeGreaterThan(hint);
  expect(suspense).toBeGreaterThan(guard);
});

test("the fallback is picked by the hint's kind", () => {
  const suspense = LAYOUT.slice(SUSPENSE);
  expect(suspense).toMatch(
    /hint\.kind === "steps" \?\s*\(?\s*<AnalysisStepsPending \/>\s*\)?\s*:\s*\(?\s*<MatchReportSkeleton \/>/,
  );
  // Inside the same fixed-height box as before.
  const box = LAYOUT.indexOf("h-[calc(100vh-var(--header-h))]");
  expect(box).toBeGreaterThan(-1);
  expect(SUSPENSE).toBeGreaterThan(box);
});

test("the match load runs only after the boundary", () => {
  const load = LAYOUT.search(CALL);
  expect(load).toBeGreaterThan(SUSPENSE);
  expect(LAYOUT.slice(load + 1).search(CALL)).toBe(-1);
  const tail = LAYOUT.slice(load);
  expect(tail).toContain("notFound();");
  expect(tail).toContain("key={match.id}");
  expect(tail).toContain("<ClearRetryOnSuccess");
  expect(tail).toContain("{children}");
});

test("getMatchDetailData is called only by the layout and the page", () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? walk(path) : [path];
    });
  const callers = walk("src")
    .filter((path) => /\.tsx?$/.test(path))
    .filter((path) => CALL.test(readFileSync(path, "utf8")))
    .map((path) => path.split("\\").join("/"))
    .sort();
  expect(callers).toEqual([
    "src/app/dashboard/matches/(detail)/[matchId]/layout.tsx",
    "src/app/dashboard/matches/(detail)/[matchId]/page.tsx",
  ]);
  expect(readFileSync("src/lib/data/match-detail-server.ts", "utf8")).toMatch(
    /export const getMatchDetailData = cache\(/,
  );
});

test("the group loading state is neutral", () => {
  expect(LOADING).not.toContain("MatchReportSkeleton");
  expect(LOADING).not.toContain("AnalysisStepsPending");
  expect(LOADING).toContain("<PendingFrame");
  expect(LOADING).not.toContain("PendingBar");
});
