/**
 * `GET /api/cron/reconcile-vendor-jobs` — find vendor jobs whose webhook never
 * came, without waiting for someone to open a page. The work is the same pair
 * of sweeps the matches list and match detail run on every read
 * (`services/splitstep/reconcile.ts`), unscoped: the status poll for jobs
 * stuck in submitting/queued/processing, then the results sweep for completed
 * jobs whose results never landed. Both send the ready/failed email
 * themselves when a job settles.
 *
 * Before this, a lost completion webhook was noticed only on the uploader's
 * next page load — Cj vs Summer (match fb51a494) sat finished for thirteen
 * hours and was mailed a second after the dashboard opened.
 *
 * Not on `vercel.json`: the plan this deploys on schedules a cron once a day.
 * It is called by Postgres instead — `pg_cron` → `pg_net`, every ten minutes,
 * set up by the `schedule_vendor_job_reconcile` migration — with the same
 * `Authorization: Bearer $CRON_SECRET` the Vercel crons send, read there from
 * Vault. Excluded from the proxy matcher with the rest of `api/cron`.
 *
 * The service-role client is built only after the bearer has matched, as on
 * the other cron routes, so an unauthorized request never constructs it.
 */

import { after, NextResponse } from "next/server";

import { authorizeCronRequest } from "@/lib/services/match-video/cleanup-schedule";
import {
  reconcileVendorJobs,
  recoverUndeliveredResults,
} from "@/lib/services/splitstep/reconcile";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/**
 * The poll is a few concurrent 10-second GETs, then each failure it finds is
 * applied in turn (refund, resubmit, email); the results sweep runs after it
 * in `after()`, past the caller's 30-second timeout, and budgets 40 seconds
 * for a derivation from its own start. Both share this ceiling, so it is set
 * well clear of their sum — a derivation killed midway leaves the job reading
 * as analysing forever.
 */
export const maxDuration = 300;

/**
 * Jobs polled per run. The page path polls three; this one has no render to
 * protect, and the 10-minute poll gap still holds per job.
 */
const POLL_CAP = 10;

export async function GET(request: Request) {
  const auth = authorizeCronRequest(request, process.env.CRON_SECRET);
  if (!auth.ok) {
    // An unset secret is a misconfiguration, not a stranger: say it loudly,
    // as the other crons do, or the sweep is silently off.
    if (auth.refusal === "secret_not_configured") {
      console.error(
        "[reconcile-vendor-jobs] CRON_SECRET is not set — refusing every call",
      );
    } else {
      console.warn("[reconcile-vendor-jobs] refused", {
        refusal: auth.refusal,
      });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const polled = await reconcileVendorJobs({ supabase, cap: POLL_CAP });
  if (polled.polled) {
    console.info("[reconcile-vendor-jobs] polled", { ...polled });
  }

  // A recovered result downloads a file and derives a whole match — seconds
  // the pg_net caller should not hold a connection open for.
  after(async () => {
    try {
      const swept = await recoverUndeliveredResults({ supabase });
      if (swept.claimed) {
        console.info("[reconcile-vendor-jobs] results swept", { ...swept });
      }
    } catch (err) {
      console.error("[reconcile-vendor-jobs] results sweep failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  return NextResponse.json(polled);
}
