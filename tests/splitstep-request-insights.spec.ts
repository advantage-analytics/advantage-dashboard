import { expect, test } from "@playwright/test";

import {
  INSIGHTS_CAP_MS,
  insightsWaitMs,
  requestMatchInsights,
  waitForInsights,
  type InsightsInvoker,
} from "@/lib/services/splitstep/request-insights";

/**
 * The video pipeline's request for a match's Advantage Intelligence summary.
 * Pure and offline: the Supabase client is a stub recording what was asked.
 */

function stub(result: () => Promise<{ error: unknown }>) {
  const calls: { name: string; body: { matchId: string } }[] = [];
  const supabase: InsightsInvoker = {
    functions: {
      invoke(name, options) {
        calls.push({ name, body: options.body });
        return result();
      },
    },
  };
  return { supabase, calls };
}

test.describe("requestMatchInsights", () => {
  test("invokes generate-insights with the match id, as process-match does", async () => {
    const { supabase, calls } = stub(async () => ({ error: null }));
    const outcome = await requestMatchInsights({ supabase, matchId: "m-1" });
    expect(calls).toEqual([
      { name: "generate-insights", body: { matchId: "m-1" } },
    ]);
    expect(outcome).toEqual({ ok: true });
  });

  test("an error from the function is reported, never thrown", async () => {
    const { supabase } = stub(async () => ({
      error: new Error("Gemini API failed"),
    }));
    await expect(
      requestMatchInsights({ supabase, matchId: "m-1" }),
    ).resolves.toEqual({ ok: false });
  });

  test("a rejected invoke is reported, never thrown", async () => {
    const { supabase } = stub(async () => {
      throw new Error("network down");
    });
    await expect(
      requestMatchInsights({ supabase, matchId: "m-1" }),
    ).resolves.toEqual({ ok: false });
  });
});

test.describe("waiting on the review before `completed`", () => {
  test("the wait is the cap when there is no deadline", () => {
    expect(insightsWaitMs(undefined)).toBe(INSIGHTS_CAP_MS);
  });

  test("a near deadline shortens the wait, a passed one ends it", () => {
    expect(insightsWaitMs(1_000 + 12_000, 1_000)).toBe(12_000);
    expect(insightsWaitMs(1_000 + INSIGHTS_CAP_MS * 2, 1_000)).toBe(
      INSIGHTS_CAP_MS,
    );
    expect(insightsWaitMs(500, 1_000)).toBe(0);
  });

  test("a review that settles in time is waited for", async () => {
    await expect(
      waitForInsights(
        new Promise((r) => setTimeout(() => r({ ok: true }), 10)),
        1_000,
      ),
    ).resolves.toBe(true);
  });

  test("a hung review gives up at the cap instead of holding `completed`", async () => {
    const started = Date.now();
    await expect(waitForInsights(new Promise(() => {}), 50)).resolves.toBe(
      false,
    );
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  test("a rejected request still releases the wait", async () => {
    await expect(
      waitForInsights(Promise.reject(new Error("boom")), 1_000),
    ).resolves.toBe(true);
  });
});
