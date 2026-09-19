/**
 * `GET /api/cron/cleanup-match-videos` — the daily attachment cleanup sweep.
 *
 * Scheduled by `vercel.json` at 05:00 UTC and called with
 * `Authorization: Bearer $CRON_SECRET`. This file is the wiring only: the
 * bearer check, the refusal ladder and the reporting live in
 * `lib/services/match-video/cleanup-schedule.ts`, so they are tested without
 * Supabase or Azure anywhere near them.
 *
 * The service-role client is built INSIDE the callback, which the handler
 * invokes only after the secret has matched. An unauthorized request
 * therefore never constructs it, never opens a connection and never reaches
 * storage.
 *
 * `runtime = "nodejs"` is explicit, as on every other server route here.
 * It is also the default, but this handler needs Node's crypto
 * primitives for the constant-time bearer check and the Azure SDK for the
 * deletes, and an implicit default is exactly the kind of thing that changes
 * underneath a route nobody looks at.
 */

import {
  handleCleanupCron,
  CLEANUP_CRON_REASON,
} from "@/lib/services/match-video/cleanup-schedule";
import {
  productionCleanupDeps,
  runMatchVideoCleanup,
} from "@/lib/services/match-video/cleanup";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A full batch is fifty rows of a few short storage calls each over four
 * lanes. Set explicitly rather than inherited: the platform default is
 * invisible until the one sweep that needs the headroom is cut off midway,
 * and a cut-off sweep leaves rows leased until their fifteen-minute lease
 * lapses.
 */
export const maxDuration = 60;

export async function GET(request: Request) {
  return handleCleanupCron(request, {
    runCleanup: () =>
      runMatchVideoCleanup(productionCleanupDeps(createAdminClient()), {
        reason: CLEANUP_CRON_REASON,
      }),
  });
}
