import { defineConfig } from "@playwright/test";

import { LIVE_DB_PROJECT, LIVE_DB_SPECS } from "./tests/fixtures/live-db-specs";

const liveSpecGlobs = LIVE_DB_SPECS.map((file) => `**/${file}`);

/**
 * Playwright is this repo's only test runner. Most specs here are pure logic
 * tests over library code and never open a browser, so no `use.browserName`
 * or webServer is configured — adding one would make every run depend on
 * browser binaries that these tests do not need.
 *
 * Two projects. `live-db` holds the specs that create auth users on a live
 * Supabase project and runs them one file at a time on one worker, so their
 * auth calls stay under the per-IP rate limits; `offline` is everything else,
 * fully parallel as before. `globalSetup` takes a machine-wide lock before a
 * run that may write, so two worktrees' live runs queue instead of stacking —
 * see `tests/fixtures/live-db-lock.ts`.
 */
export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  // Live specs share one Supabase project and Auth IP bucket. The CPU-based
  // default overlaps their already-concurrent fixture logins and database
  // writes, causing statement timeouts and exhausted auth retries. Run one
  // suite at a time; explicit race tests still issue concurrent operations.
  workers: 1,
  reporter: process.env.CI ? "dot" : "list",
  globalSetup: "./tests/fixtures/live-db-lock.ts",
  projects: [
    {
      name: LIVE_DB_PROJECT,
      testMatch: liveSpecGlobs,
      workers: 1,
      fullyParallel: false,
    },
    {
      name: "offline",
      testIgnore: liveSpecGlobs,
    },
  ],
});
