import { readdirSync, readFileSync } from "node:fs";
import * as path from "node:path";

import { expect, test } from "@playwright/test";
import {
  AuthApiError,
  AuthRetryableFetchError,
  AuthUnknownError,
} from "@supabase/supabase-js";

import {
  ADMIN_RETRY_BUDGET_MS,
  LIVE_HOOK_BUDGET_FLOOR_MS,
  SIGN_IN_RETRY_BUDGET_MS,
  authErrorDetails,
  isTransientAuthError,
  retryAuthCall,
  retryDelayMs,
} from "./fixtures/live-db";

test("Auth diagnostics retain opaque error status without request data", () => {
  const error = Object.assign(new AuthRetryableFetchError("{}", 502), {
    request: { authorization: "secret", password: "secret" },
  });
  expect(authErrorDetails(error)).toBe(
    "{} [AuthRetryableFetchError, status=502]",
  );
  expect(authErrorDetails(new AuthApiError("denied", 403, "not_admin"))).toBe(
    "denied [AuthApiError, status=403, code=not_admin]",
  );
});

/**
 * The live-DB fixture's retry rules, offline.
 *
 * The live specs cannot prove these themselves: whether a run meets a 429 or a
 * 504 depends on what else hit the project that minute. So the rules that
 * decide what gets retried, how long a wait is, and when the fixture gives up
 * are pinned here with fake clocks and no network.
 *
 * The last test guards the one assumption the hook extension rests on — see
 * `LIVE_HOOK_BUDGET_FLOOR_MS` in `fixtures/live-db.ts`.
 */

test.describe("which auth failures are retried", () => {
  test("load: rate limits, server errors, gateway and network failures", () => {
    expect(
      isTransientAuthError(
        new AuthApiError(
          "Request rate limit reached",
          429,
          "over_request_rate_limit",
        ),
      ),
    ).toBe(true);
    expect(
      isTransientAuthError(
        new AuthApiError(
          "unable to fetch records: timeout",
          500,
          "unexpected_failure",
        ),
      ),
    ).toBe(true);
    expect(
      isTransientAuthError(
        new AuthApiError("timed out", 408, "request_timeout"),
      ),
    ).toBe(true);
    expect(
      isTransientAuthError(new AuthRetryableFetchError("Gateway Timeout", 504)),
    ).toBe(true);
    expect(
      isTransientAuthError(new AuthRetryableFetchError("fetch failed", 0)),
    ).toBe(true);
    expect(
      isTransientAuthError(
        new AuthUnknownError("<html>", new Error("not json")),
      ),
    ).toBe(true);
  });

  test("answers are never retried", () => {
    expect(
      isTransientAuthError(
        new AuthApiError("already registered", 422, "email_exists"),
      ),
    ).toBe(false);
    expect(
      isTransientAuthError(
        new AuthApiError(
          "Invalid login credentials",
          400,
          "invalid_credentials",
        ),
      ),
    ).toBe(false);
    expect(
      isTransientAuthError(
        new AuthApiError("User not found", 404, "user_not_found"),
      ),
    ).toBe(false);
    expect(
      isTransientAuthError(new AuthApiError("not admin", 403, "not_admin")),
    ).toBe(false);
    expect(isTransientAuthError(new Error("boom"))).toBe(false);
    expect(isTransientAuthError(null)).toBe(false);
  });
});

test.describe("backoff", () => {
  test("starts at 1–2s and doubles into a 7.5–15s band", () => {
    expect(retryDelayMs(0, 0)).toBe(1_000);
    expect(retryDelayMs(0, 1)).toBe(2_000);
    expect(retryDelayMs(1, 0)).toBe(2_000);
    expect(retryDelayMs(2, 1)).toBe(8_000);
    expect(retryDelayMs(3, 0)).toBe(7_500);
    expect(retryDelayMs(3, 1)).toBe(15_000);
    expect(retryDelayMs(20, 0.5)).toBe(11_250);
  });

  test("budgets: sign-ins can outwait another run's burst, admin calls a 5xx spell", () => {
    expect(SIGN_IN_RETRY_BUDGET_MS).toBeGreaterThanOrEqual(5 * 60_000);
    expect(ADMIN_RETRY_BUDGET_MS).toBeGreaterThanOrEqual(3 * 60_000);
  });
});

/** A fake clock the sleeps advance, so a retry loop runs in microseconds. */
function fakeClock() {
  let t = 0;
  const sleeps: number[] = [];
  return {
    sleeps,
    now: () => t,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      t += ms;
    },
  };
}

const rateLimited = {
  data: null,
  error: new AuthApiError(
    "Request rate limit reached",
    429,
    "over_request_rate_limit",
  ),
};
const ok = { data: { user: { id: "u1" } }, error: null };

test.describe("retryAuthCall", () => {
  test("retries load until the call succeeds, and reports the attempts", async () => {
    const clock = fakeClock();
    const responses = [rateLimited, rateLimited, ok];
    const outcome = await retryAuthCall(async () => responses.shift()!, {
      budgetMs: 60_000,
      now: clock.now,
      sleep: clock.sleep,
      random: () => 0,
    });

    expect(outcome.result).toBe(ok);
    expect(outcome.attempts).toBe(3);
    expect(clock.sleeps).toEqual([1_000, 2_000]);
    expect(outcome.waitedMs).toBe(3_000);
  });

  test("returns an answer at once, without waiting", async () => {
    const clock = fakeClock();
    const taken = {
      data: null,
      error: new AuthApiError("already registered", 422, "email_exists"),
    };
    let calls = 0;
    const outcome = await retryAuthCall(
      async () => {
        calls += 1;
        return taken;
      },
      { budgetMs: 60_000, now: clock.now, sleep: clock.sleep },
    );

    expect(outcome.result).toBe(taken);
    expect(calls).toBe(1);
    expect(clock.sleeps).toEqual([]);
  });

  test("gives up with the last error once the next wait would pass the budget", async () => {
    const clock = fakeClock();
    let calls = 0;
    const outcome = await retryAuthCall(
      async () => {
        calls += 1;
        return rateLimited;
      },
      { budgetMs: 10_000, now: clock.now, sleep: clock.sleep, random: () => 1 },
    );

    // Waits of 2s, 4s: 6s spent; the next 8s wait would reach 14s > 10s.
    expect(clock.sleeps).toEqual([2_000, 4_000]);
    expect(calls).toBe(3);
    expect(outcome.attempts).toBe(3);
    expect(outcome.result.error).toBe(rateLimited.error);
  });
});

test.describe("hook budget floor", () => {
  test("no live-DB spec sets a hook budget above the floor the fixture extends from", () => {
    const testsDir = path.resolve(__dirname);
    const liveSpecs = readdirSync(testsDir)
      .filter((file) => file.endsWith(".spec.ts"))
      .map((file) => path.join(testsDir, file))
      .filter((file) =>
        readFileSync(file, "utf8").includes("./fixtures/live-db"),
      )
      .filter((file) => !file.endsWith("live-db-auth-retry.spec.ts"));

    // A real list, so a moved fixture import cannot make this pass vacuously.
    expect(liveSpecs.length).toBeGreaterThanOrEqual(10);

    const offenders: string[] = [];
    for (const file of liveSpecs) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(/\.setTimeout\(([^)]*)\)/g)) {
        const literal = match[1].replace(/_/g, "").trim();
        const ms = /^\d+$/.test(literal) ? Number(literal) : Number.NaN;
        // An expression the guard cannot read is an offender too: the floor
        // is only safe while every budget is a number someone can check.
        if (!(ms <= LIVE_HOOK_BUDGET_FLOOR_MS)) {
          offenders.push(`${path.basename(file)}: setTimeout(${match[1]})`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
