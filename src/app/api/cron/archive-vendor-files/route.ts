/**
 * `GET /api/cron/archive-vendor-files` — the daily second chance for vendor
 * files a webhook delivery failed to keep: the players and trajectories JSON
 * and the trimmed video, while their 7-day urls are still live. The sweep
 * itself is `archiveMissingVendorFiles` (vendor-archive.ts), the same one
 * scripts/splitstep-archive-vendor-files.ts runs by hand.
 *
 * Scheduled by `vercel.json` and called with `Authorization: Bearer
 * $CRON_SECRET`, checked by the cleanup cron's `authorizeCronRequest` before
 * the service-role client is built. Soonest expiry first; it stops starting
 * downloads ten seconds short of `maxDuration`, and what is left goes the next
 * day, with days of url left for every file but the oldest.
 */

import { NextResponse } from "next/server";

import { authorizeCronRequest } from "@/lib/services/match-video/cleanup-schedule";
import { pipelineLog } from "@/lib/services/splitstep/pipeline-log";
import { archiveMissingVendorFiles } from "@/lib/services/splitstep/vendor-archive";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/**
 * Long enough for several large JSON downloads a run (an 80 MB players file
 * takes seconds, not tens), so a day with a few misses is cleared that day.
 */
export const maxDuration = 300;

/** Per-file download clock; the deadline below stops new ones in time. */
const FETCH_TIMEOUT_MS = 45_000;

export async function GET(request: Request) {
  const auth = authorizeCronRequest(request, process.env.CRON_SECRET);
  if (!auth.ok) {
    pipelineLog.warn("[archive-vendor-files] refused", {
      refusal: auth.refusal,
    });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const lines = await archiveMissingVendorFiles({
    supabase: createAdminClient(),
    write: true,
    timeoutMs: FETCH_TIMEOUT_MS,
    deadline: Date.now() + (maxDuration - 15) * 1000,
  });
  for (const line of lines) {
    if (line.outcome === "expired") continue;
    const log =
      line.outcome === "failed" ? pipelineLog.error : pipelineLog.info;
    log(`[archive-vendor-files] ${line.kind} ${line.outcome}`, { ...line });
  }
  const tally = (outcome: string) =>
    lines.filter((l) => l.outcome === outcome).length;
  return NextResponse.json({
    stored: tally("stored"),
    copying: tally("copying"),
    failed: tally("failed"),
    skipped: tally("skipped"),
  });
}
