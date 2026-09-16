import { expect, test } from "@playwright/test";

import {
  requestMatchInsights,
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
