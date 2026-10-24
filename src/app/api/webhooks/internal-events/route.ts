/**
 * `POST /api/webhooks/internal-events` — mail the internal alerts inbox about
 * a new signup or a new upload. The work is `notifyInternalEvent`
 * (`services/notifications/internal-activity-mail.ts`); this file is the
 * wiring.
 *
 * Called by Postgres: triggers on `public.users`, `processing_jobs` and
 * `match_files` post `{ kind, id }` here through `pg_net`, set up by the
 * `internal_activity_alerts` migration, with the same
 * `Authorization: Bearer $CRON_SECRET` the cron routes take, read there from
 * Vault (`cron_secret`). Excluded from the proxy matcher with the rest of
 * `api/webhooks`.
 *
 * Answers 200 for every authorized call, sent or not: `pg_net` never retries,
 * so a failure status would change nothing but the log.
 */

import { NextResponse } from "next/server";

import { authorizeCronRequest } from "@/lib/services/match-video/cleanup-schedule";
import {
  errorResponse,
  jsonResponse,
  transportError,
} from "@/lib/services/match-video/http";
import {
  notifyInternalEvent,
  parseInternalEvent,
} from "@/lib/services/notifications/internal-activity-mail";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = authorizeCronRequest(request, process.env.CRON_SECRET);
  if (!auth.ok) {
    if (auth.refusal === "secret_not_configured") {
      console.error(
        "[internal-events] CRON_SECRET is not set — refusing every call",
      );
    } else {
      console.warn("[internal-events] refused", { refusal: auth.refusal });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const event = parseInternalEvent(await request.json().catch(() => null));
  if (!event) {
    return errorResponse(transportError("invalid_request", "bad_event"));
  }

  const outcome = await notifyInternalEvent(createAdminClient(), event);
  return jsonResponse({ outcome });
}
