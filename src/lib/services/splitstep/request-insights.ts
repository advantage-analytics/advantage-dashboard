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
