import { expect, test } from "@playwright/test";

import { siteUrl } from "@/lib/site-url";
import { withEnv } from "./fixtures/with-env";

/**
 * `siteUrl()` — the configured resolver the vendor webhook URL, same-origin
 * checks and `layout.tsx`'s `metadataBase` call, and `emailOrigin()`'s local
 * fallback (`tests/email-origin.spec.ts`). On-screen links,
 * redirects and Supabase `redirectTo`s use `requestOrigin()` instead
 * (`tests/request-origin.spec.ts`).
 *
 * Pure, so no browser and no dev server, the same as `tests/date-value.spec.ts`.
 * What this pins: a deployed build (Vercel sets `VERCEL_ENV`) never falls
 * through to a `localhost:3000` link just because `NEXT_PUBLIC_SITE_URL`
 * wasn't set — it resolves the Vercel-provided URL instead. Only a genuinely
 * local run (no Vercel env at all) reaches the localhost fallback, and that
 * fallback warns if it happens under `NODE_ENV=production` — a deployed build
 * missing its Vercel env entirely.
 *
 * `siteUrl()` reads `process.env` at call time, so each test sets exactly the
 * vars its scenario needs and clears the rest — imported once, module state
 * carries no per-env config.
 */

const ENV_KEYS = [
  "NEXT_PUBLIC_SITE_URL",
  "VERCEL_ENV",
  "VERCEL_URL",
  "VERCEL_PROJECT_PRODUCTION_URL",
  "NODE_ENV",
] as const;

test.describe("siteUrl · Vercel env resolution", () => {
  test("production: uses VERCEL_PROJECT_PRODUCTION_URL", async () => {
    await withEnv(
      ENV_KEYS,
      {
        VERCEL_ENV: "production",
        VERCEL_PROJECT_PRODUCTION_URL: "app.advantage-analytics.com",
      },
      async () => {
        expect(siteUrl()).toBe("https://app.advantage-analytics.com");
      },
    );
  });

  test("preview: uses VERCEL_URL", async () => {
    await withEnv(
      ENV_KEYS,
      {
        VERCEL_ENV: "preview",
        VERCEL_URL: "advantage-dashboard-git-foo.vercel.app",
      },
      async () => {
        expect(siteUrl()).toBe(
          "https://advantage-dashboard-git-foo.vercel.app",
        );
      },
    );
  });

  test("no Vercel env at all: falls back to localhost, silently in dev", async () => {
    await withEnv(ENV_KEYS, { NODE_ENV: "development" }, async () => {
      const warnings: unknown[] = [];
      const spy = (...args: unknown[]) => warnings.push(args);
      const original = console.warn;
      console.warn = spy;
      try {
        expect(siteUrl()).toBe("http://localhost:3000");
        expect(warnings).toHaveLength(0);
      } finally {
        console.warn = original;
      }
    });
  });

  test("localhost fallback under NODE_ENV=production warns once, naming the fix", async () => {
    await withEnv(ENV_KEYS, { NODE_ENV: "production" }, async () => {
      const warnings: unknown[][] = [];
      const original = console.warn;
      console.warn = (...args: unknown[]) => warnings.push(args);
      try {
        expect(siteUrl()).toBe("http://localhost:3000");
        expect(warnings).toHaveLength(1);
        expect(String(warnings[0][0])).toContain("NEXT_PUBLIC_SITE_URL");
      } finally {
        console.warn = original;
      }
    });
  });

  test("NEXT_PUBLIC_SITE_URL wins over any Vercel env, trailing slash stripped", async () => {
    await withEnv(
      ENV_KEYS,
      {
        NEXT_PUBLIC_SITE_URL: "https://custom.example.com/",
        VERCEL_ENV: "production",
        VERCEL_PROJECT_PRODUCTION_URL: "app.advantage-analytics.com",
      },
      async () => {
        expect(siteUrl()).toBe("https://custom.example.com");
      },
    );
  });

  test("NEXT_PUBLIC_SITE_URL with no trailing slash is unchanged", async () => {
    await withEnv(
      ENV_KEYS,
      { NEXT_PUBLIC_SITE_URL: "https://custom.example.com" },
      async () => {
        expect(siteUrl()).toBe("https://custom.example.com");
      },
    );
  });
});
