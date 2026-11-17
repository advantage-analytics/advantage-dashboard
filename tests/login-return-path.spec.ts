import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { safeNext } from "@/lib/auth/safe-next";

/**
 * A signed-out visitor to a dashboard or team-setup page signs in and lands on
 * the page they asked for. A plain `redirect("/login")` dropped it: an emailed
 * "Upload your match" link (2026-11-17) took a signed-out player to Home after
 * sign-in, one step short of the page the email was about. Every gate in these
 * areas goes through `loginRedirectPath()`, which carries the request path the
 * proxy recorded as `?next=`, clamped by `safeNext()`.
 */

const AREAS = ["src/app/dashboard", "src/app/claim/team"];

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

test("no dashboard or team-setup gate sends people to a bare /login", () => {
  const bare = AREAS.flatMap(sources).filter((file) =>
    /redirect\(\s*["']\/login["']\s*\)/.test(readFileSync(file, "utf8")),
  );
  expect(bare).toEqual([]);
});

test("the dashboard and team-setup layouts return people to the page they asked for", () => {
  const dashboard = readFileSync("src/app/dashboard/layout.tsx", "utf8");
  expect(dashboard).toContain(
    'redirect(await loginRedirectPath("/dashboard"))',
  );
  const claimTeam = readFileSync("src/app/claim/team/layout.tsx", "utf8");
  expect(claimTeam).toContain(
    'redirect(await loginRedirectPath("/claim/team"))',
  );
});

test("an emailed deep link survives the round trip, and an off-site one does not", () => {
  expect(safeNext("/dashboard/matches/new")).toBe("/dashboard/matches/new");
  expect(safeNext("/dashboard/matches/new?draft=abc")).toBe(
    "/dashboard/matches/new?draft=abc",
  );
  expect(safeNext("/claim/team")).toBe("/claim/team");
  expect(safeNext("https://evil.example/dashboard")).toBe("/dashboard");
  expect(safeNext("//evil.example")).toBe("/dashboard");
});
