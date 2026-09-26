import { expect, test } from "@playwright/test";

import { originFromHeaders } from "@/lib/site-url";
import { withEnv } from "./fixtures/with-env";

/**
 * `originFromHeaders()` — the pure half of `requestOrigin()`, the resolver for
 * every link a person reads on screen, every redirect, and every Supabase
 * `redirectTo`. `siteUrl()` stays the resolver for anything that lands in an
 * email or runs without a request (cron, vendor webhooks).
 *
 * What this pins: a dev server on port 3002 prints port 3002, not whatever
 * `.env.local` says; behind Vercel's proxy the forwarded host wins over the
 * internal one; and a request with no host at all — which HTTP/1.1 forbids,
 * but the type allows — still gets the configured origin rather than a throw.
 *
 * Pure, so no browser and no dev server, the same as `tests/site-url.spec.ts`.
 */

function headersOf(entries: Record<string, string>): Headers {
  return new Headers(entries);
}

const ENV_KEYS = ["NEXT_PUBLIC_SITE_URL", "VERCEL_ENV", "NODE_ENV"] as const;

test.describe("originFromHeaders · the origin the request is on", () => {
  test("a dev server on another port reports that port, whatever the env says", async () => {
    await withEnv(
      ENV_KEYS,
      { NEXT_PUBLIC_SITE_URL: "http://localhost:3000" },
      async () => {
        expect(originFromHeaders(headersOf({ host: "localhost:3002" }))).toBe(
          "http://localhost:3002",
        );
      },
    );
  });

  test("loopback hosts default to http; anything else to https", () => {
    expect(originFromHeaders(headersOf({ host: "127.0.0.1:3002" }))).toBe(
      "http://127.0.0.1:3002",
    );
    expect(originFromHeaders(headersOf({ host: "[::1]:3002" }))).toBe(
      "http://[::1]:3002",
    );
    expect(
      originFromHeaders(headersOf({ host: "app.advantage-analytics.com" })),
    ).toBe("https://app.advantage-analytics.com");
  });

  test("x-forwarded-proto is honoured over the loopback guess", () => {
    expect(
      originFromHeaders(
        headersOf({ host: "localhost:3002", "x-forwarded-proto": "https" }),
      ),
    ).toBe("https://localhost:3002");
  });

  test("behind a proxy the forwarded host wins over the internal one", () => {
    expect(
      originFromHeaders(
        headersOf({
          host: "10.0.0.7:3000",
          "x-forwarded-host": "app.advantage-analytics.com",
          "x-forwarded-proto": "https",
        }),
      ),
    ).toBe("https://app.advantage-analytics.com");
  });

  test("a comma-joined chain of hops takes the first, trimmed", () => {
    expect(
      originFromHeaders(
        headersOf({
          "x-forwarded-host": " app.advantage-analytics.com , edge.internal",
          "x-forwarded-proto": "https, http",
        }),
      ),
    ).toBe("https://app.advantage-analytics.com");
  });

  test("an empty forwarded host falls through to host, not to an empty origin", () => {
    expect(
      originFromHeaders(
        headersOf({ "x-forwarded-host": "", host: "localhost:3002" }),
      ),
    ).toBe("http://localhost:3002");
  });

  test("no host at all falls back to the configured site URL", async () => {
    // No trailing slash here on purpose: stripping one is `siteUrl()`'s own
    // behavior, already pinned by `tests/site-url.spec.ts`. This test only
    // needs to show the fallback happens at all.
    await withEnv(
      ENV_KEYS,
      { NEXT_PUBLIC_SITE_URL: "https://custom.example.com" },
      async () => {
        expect(originFromHeaders(headersOf({}))).toBe(
          "https://custom.example.com",
        );
      },
    );
  });
});
