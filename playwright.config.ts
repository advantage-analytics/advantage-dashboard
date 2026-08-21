import { defineConfig } from '@playwright/test';

/**
 * Playwright is this repo's only test runner. Most specs here are pure logic
 * tests over library code and never open a browser, so no `use.browserName`
 * or webServer is configured — adding one would make every run depend on
 * browser binaries that these tests do not need.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  reporter: process.env.CI ? 'dot' : 'list',
});
