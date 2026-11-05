import { authorizeCronRequest } from "@/lib/services/match-video/cleanup-schedule";
import { jsonResponse } from "@/lib/services/match-video/http";
import { checkAdmin } from "@/lib/services/programs/admin-guard";
import { resubmitJob } from "@/lib/services/splitstep/resubmit-job";
import { createAdminClient } from "@/lib/supabase/admin";

import { handleReprocess, type ReprocessAuth } from "./handler";

export const runtime = "nodejs";
/** Up to 25 vendor POSTs at a 30s timeout each, sequentially. */
export const maxDuration = 300;

/**
 * A bearer header is judged on its own: right secret or 401, never a fall
 * through to the session cookie. No header → the signed-in admin check.
 */
async function authorize(request: Request): Promise<ReprocessAuth> {
  if (request.headers.get("authorization") !== null) {
    const cron = authorizeCronRequest(request, process.env.CRON_SECRET);
    return cron.ok ? { ok: true, actor: "cron" } : { ok: false, status: 401 };
  }
  const admin = await checkAdmin();
  return admin.ok ? { ok: true, actor: admin.id } : admin;
}

export async function POST(request: Request) {
  const supabase = createAdminClient();
  const { status, body } = await handleReprocess(request, {
    authorize,
    supabase,
    reprocess: ({ jobId, requestedBy }) =>
      resubmitJob({
        supabase,
        jobId,
        auto: false,
        reprocess: true,
        requestedBy,
      }),
  });
  return jsonResponse(body, status);
}
