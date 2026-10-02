import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

import { analysisReadyEmail } from "@/lib/services/email/templates/analysis";
import { emailOrigin, PRODUCTION_APP_URL } from "@/lib/site-url";
import { withEnv } from "./fixtures/with-env";

/**
 * `emailOrigin()` — the origin of every link that leaves in an email.
 *
 * Preview shares production's database and its `NEXT_PUBLIC_SITE_URL` is the
 * `.dev` domain, so when a preview deployment settled a real athlete's job the
 * "analysis ready" email linked them to `www.advantage-analytics.dev`. What this
 * pins: a deployed build, preview included, only ever links to the production
 * app, whatever that deployment's own URL is; and no email template or
 * notification goes back to building links from `siteUrl()`.
 */

const ENV_KEYS = [
  "NEXT_PUBLIC_SITE_URL",
  "VERCEL_ENV",
  "VERCEL_URL",
  "VERCEL_PROJECT_PRODUCTION_URL",
  "NODE_ENV",
] as const;

const PREVIEW_ENV = {
  VERCEL_ENV: "preview",
  NEXT_PUBLIC_SITE_URL: "https://www.advantage-analytics.dev",
  VERCEL_URL: "advantage-dashboard-git-splitstep-integration.vercel.app",
  VERCEL_PROJECT_PRODUCTION_URL: "advantage-analytics.dev",
};

test.describe("emailOrigin", () => {
  test("production: the production app, even with a stray site URL", async () => {
    await withEnv(
      ENV_KEYS,
      {
        VERCEL_ENV: "production",
        NEXT_PUBLIC_SITE_URL: "https://www.advantage-analytics.dev",
      },
      async () => {
        expect(emailOrigin()).toBe("https://app.advantage-analytics.com");
      },
    );
  });

  test("preview: the production app, not the preview's own domain", async () => {
    await withEnv(ENV_KEYS, PREVIEW_ENV, async () => {
      expect(emailOrigin()).toBe(PRODUCTION_APP_URL);
    });
  });

  test("local: falls back to siteUrl(), localhost included", async () => {
    await withEnv(
      ENV_KEYS,
      { NEXT_PUBLIC_SITE_URL: "http://localhost:3002/" },
      async () => {
        expect(emailOrigin()).toBe("http://localhost:3002");
      },
    );
  });

  test("the analysis-ready email sent from preview links only to the app", async () => {
    await withEnv(ENV_KEYS, PREVIEW_ENV, async () => {
      const message = analysisReadyEmail({
        to: "player@example.com",
        matchId: "7f3d3e63-a81a-41bd-8661-a664d8c39740",
        matchTitle: "Alex Rivera vs. Jordan Chen",
        matchContext: "Oct 2, 2026",
        score: "6-4 6-3",
      });
      const body = `${message.html}\n${message.text}`;
      expect(body).toContain(
        "https://app.advantage-analytics.com/dashboard/matches/7f3d3e63-a81a-41bd-8661-a664d8c39740",
      );
      expect(body).not.toMatch(/advantage-analytics\.dev|vercel\.app/);
    });
  });
});

test.describe("email links never come from siteUrl()", () => {
  const ROOT = join(__dirname, "..", "src", "lib", "services");
  const dirs = ["email/templates", "notifications"];
  const files = [
    ...dirs.flatMap((dir) =>
      readdirSync(join(ROOT, dir))
        .filter((name) => name.endsWith(".ts"))
        .map((name) => join(dir, name)),
    ),
    "programs/claim-verification.ts",
  ];

  for (const file of files) {
    test(file, () => {
      const source = readFileSync(join(ROOT, file), "utf8");
      expect(source).not.toMatch(/\bsiteUrl\(/);
    });
  }
});
