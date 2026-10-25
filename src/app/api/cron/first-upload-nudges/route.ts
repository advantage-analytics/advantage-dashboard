/**
 * `GET /api/cron/first-upload-nudges` — the two "add your first match" emails
 * to people who signed up and have not. The work is `sweepFirstUploadNudges`
 * (`services/notifications/first-upload-mail.ts`); this file is the wiring.
 *
 * A `vercel.json` cron, once a day at 17:00 UTC — the US morning, when a
 * player reads mail. Vercel crons run in Production only, so a preview never
 * mails anyone. Excluded from the proxy matcher with the rest of `api/cron`.
 *
 * The service-role client is built only after the bearer has matched, as on
 * the other cron routes, so an unauthorized request never constructs it.
 */

import { NextResponse } from "next/server";

import { authorizeCronRequest } from "@/lib/services/match-video/cleanup-schedule";
import { sweepFirstUploadNudges } from "@/lib/services/notifications/first-upload-mail";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** At most 40 short emails a run. */
export const maxDuration = 60;

export async function GET(request: Request) {
  const auth = authorizeCronRequest(request, process.env.CRON_SECRET);
  if (!auth.ok) {
    if (auth.refusal === "secret_not_configured") {
      console.error(
        "[first-upload-nudges] CRON_SECRET is not set — refusing every call",
      );
    } else {
      console.warn("[first-upload-nudges] refused", { refusal: auth.refusal });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await sweepFirstUploadNudges(createAdminClient());
  console.info("[first-upload-nudges] swept", { ...result });
  return NextResponse.json(result);
}
