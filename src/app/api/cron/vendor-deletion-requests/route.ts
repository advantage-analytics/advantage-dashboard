/**
 * `GET /api/cron/vendor-deletion-requests` — once a day, asks SplitStep to
 * delete the video of matches users deleted (Privacy Policy 1.5 §5, §8). The
 * sweep is `sweepVendorDeletionRequests` (splitstep/vendor-deletion.ts).
 *
 * Scheduled by `vercel.json` and called with `Authorization: Bearer
 * $CRON_SECRET`, checked before the service-role client is built.
 */

import { NextResponse } from "next/server";

import { authorizeCronRequest } from "@/lib/services/match-video/cleanup-schedule";
import { sweepVendorDeletionRequests } from "@/lib/services/splitstep/vendor-deletion";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: Request) {
  const auth = authorizeCronRequest(request, process.env.CRON_SECRET);
  if (!auth.ok) {
    if (auth.refusal === "secret_not_configured") {
      console.error(
        "[vendor-deletion-requests] CRON_SECRET is not set — refusing every call",
      );
    } else {
      console.warn("[vendor-deletion-requests] refused", {
        refusal: auth.refusal,
      });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await sweepVendorDeletionRequests(createAdminClient());
  console.info("[vendor-deletion-requests] swept", { ...result });
  return NextResponse.json(result, {
    status:
      result.outcome === "sent" || result.outcome === "nothing_pending"
        ? 200
        : 500,
  });
}
