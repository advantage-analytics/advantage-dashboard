/**
 * Ask for a published video match's Advantage Intelligence summary.
 *
 * The SwingVision import has always done this: `process-match` invokes the
 * `generate-insights` Edge Function once its stats are written, and that
 * function stores `matches.insights` (a summary, strengths and weaknesses for
 * each player). The video pipeline publishes its stats in `deriveAndPublish`
 * and never made the call, so no video match had an insight — the match
 * report's insight card had nothing to show for any of them.
 *
 * Same function, same body, same best-effort contract as `process-match`: a
 * failure is logged and swallowed. The statistics are already published and
 * the job already `completed`; a missing summary must never turn that into a
 * failed analysis.
 */

const LOG = "[splitstep:insights]";

/** The one call this needs from a Supabase client, so a test can stub it. */
export interface InsightsInvoker {
  functions: {
    invoke(
      name: string,
      options: { body: { matchId: string } },
    ): Promise<{ error: unknown }>;
  };
}

export async function requestMatchInsights(params: {
  supabase: InsightsInvoker;
  matchId: string;
}): Promise<{ ok: boolean }> {
  const { supabase, matchId } = params;
  try {
    const { error } = await supabase.functions.invoke("generate-insights", {
      body: { matchId },
    });
    if (error) {
      console.error(`${LOG} generate-insights failed`, {
        matchId,
        error: error instanceof Error ? error.message : String(error),
      });
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    console.error(`${LOG} generate-insights threw`, {
      matchId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { ok: false };
  }
}

/** Longest a job waits on its review before publishing without it. */
export const INSIGHTS_CAP_MS = 35_000;

/**
 * How long to wait on the review: the cap, or whatever is left before
 * `deadline` (epoch ms) if that is sooner. No deadline, no ceiling but the cap.
 */
export function insightsWaitMs(
  deadline: number | undefined,
  now: number = Date.now(),
): number {
  if (deadline === undefined) return INSIGHTS_CAP_MS;
  return Math.max(0, Math.min(INSIGHTS_CAP_MS, deadline - now));
}

/**
 * Waits for a review request to settle, for at most `ms`. True when it settled
 * in time (whether or not it succeeded), false when the wait ran out — the
 * request itself is not cancelled here.
 */
export async function waitForInsights(
  request: Promise<unknown>,
  ms: number,
): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), ms);
  });
  try {
    return await Promise.race([
      request.then(
        () => true,
        () => true,
      ),
      timedOut,
    ]);
  } finally {
    clearTimeout(timer);
  }
}
