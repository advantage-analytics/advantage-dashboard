/**
 * `GET /api/cron/reap-stalled-uploads` — email the uploader of every upload
 * that has gone quiet, and end the ones that can no longer finish. The work is
 * `sweepStalledUploads` (`services/notifications/upload-paused-mail.ts`); this
 * file is the wiring.
 *
 * Not on `vercel.json`: an upload reads as paused after twenty minutes, so the
 * sweep has to run every few minutes, and the plan this deploys on schedules a
 * cron once a day. It is called by Postgres instead — `pg_cron` → `pg_net`,
 * every five minutes, set up by the `schedule_stalled_upload_sweep` migration
 * — with the same `Authorization: Bearer $CRON_SECRET` the Vercel crons send,
 * read there from Vault. Excluded from the proxy matcher with the rest of
 * `api/cron`.
 *
 * The service-role client is built only after the bearer has matched, as on
 * the other cron routes, so an unauthorized request never constructs it.
 */

import { NextResponse } from "next/server";

import { authorizeCronRequest } from "@/lib/services/match-video/cleanup-schedule";
import { sweepStalledUploads } from "@/lib/services/notifications/upload-paused-mail";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** At most 25 short emails a run; the caller gives up after 30 seconds. */
export const maxDuration = 60;

export async function GET(request: Request) {
  const auth = authorizeCronRequest(request, process.env.CRON_SECRET);
  if (!auth.ok) {
    // An unset secret is a misconfiguration, not a stranger: say it loudly,
    // as the cleanup cron does, or the sweep is silently off.
    if (auth.refusal === "secret_not_configured") {
      console.error(
        "[reap-stalled-uploads] CRON_SECRET is not set — refusing every call",
      );
    } else {
      console.warn("[reap-stalled-uploads] refused", { refusal: auth.refusal });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await sweepStalledUploads(createAdminClient());
  if (result.reaped || result.sent) {
    console.info("[reap-stalled-uploads] swept", { ...result });
  }
  return NextResponse.json(result);
}
