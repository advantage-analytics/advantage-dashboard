import { expect, test } from "@playwright/test";

import {
  getPostHogServerConfig,
  isLocalProductionServer,
} from "../src/lib/posthog-logs";

/**
 * A production build run outside Vercel reports nothing server-side (PostHog
 * issue 01a19a80: a scratch Server Action thrown against a local `next start`
 * landed as a production error). Vercel deployments still report.
 */

test("a local production build is off", () => {
  expect(isLocalProductionServer({ NODE_ENV: "production" })).toBe(true);
});

test("Vercel production and preview deployments report", () => {
  expect(isLocalProductionServer({ NODE_ENV: "production", VERCEL: "1" })).toBe(
    false,
  );
});

test("NEXT_PUBLIC_POSTHOG_IN_DEV=true opts a local build back in", () => {
  expect(
    isLocalProductionServer({
      NODE_ENV: "production",
      NEXT_PUBLIC_POSTHOG_IN_DEV: "true",
    }),
  ).toBe(false);
});

test("`next dev` is left to isPostHogOffInDev", () => {
  expect(isLocalProductionServer({ NODE_ENV: "development" })).toBe(false);
});

test("getPostHogServerConfig is null on a local production server", () => {
  // Restore only the keys this test touches: swapping in a copy of the whole
  // object would replace Node's env with a plain one for every later spec the
  // worker runs.
  const env: Record<string, string | undefined> = process.env;
  const keys = [
    "NODE_ENV",
    "VERCEL",
    "NEXT_PUBLIC_POSTHOG_IN_DEV",
    "NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN",
    "NEXT_PUBLIC_POSTHOG_HOST",
  ];
  const saved = keys.map((key) => [key, env[key]] as const);
  try {
    env.NODE_ENV = "production";
    env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN = "phc_test";
    env.NEXT_PUBLIC_POSTHOG_HOST = "https://us.i.posthog.com";
    delete env.VERCEL;
    delete env.NEXT_PUBLIC_POSTHOG_IN_DEV;
    expect(getPostHogServerConfig()).toBeNull();
    env.VERCEL = "1";
    expect(getPostHogServerConfig()).not.toBeNull();
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete env[key];
      else env[key] = value;
    }
  }
});
