import { defineConfig } from "@playwright/test";

/**
 * Playwright is this repo's only test runner. Most specs here are pure logic
 * tests over library code and never open a browser, so no `use.browserName`
 * or webServer is configured — adding one would make every run depend on
 * browser binaries that these tests do not need.
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
});
