"use server";

import { revalidatePath } from "next/cache";

import { checkAdmin } from "@/lib/services/programs/admin-guard";
import {
  adminResubmitFailedAnalysis,
  type AdminResubmitInput,
  type AdminResubmitResult,
} from "@/lib/services/splitstep/admin-resubmit";
import { resubmitJob } from "@/lib/services/splitstep/resubmit-job";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Retry a FAILED Advantage Intelligence analysis on the uploader's behalf.
 *
 * Admin only, and the check is made here, per call: a server action is a
 * public POST endpoint, so the admin layout having rendered proves nothing.
 * `adminResubmitFailedAnalysis()` asks `checkAdmin()` before it reads a job
 * or builds the service-role client, and says what else it refuses.
 *
 * Billed to the match's own workspace, like the automatic retry — never to a
 * workspace of the admin's. Not the free reprocess of a completed analysis;
 * that is POST /api/admin/splitstep/reprocess.
 *
 * Takes `{ jobId }`, or `{ matchId }` for the match's newest job. Answers
 * `{ ok: true, jobId, externalJobId }` or `{ ok: false, error, code }`, where
 * `error` is the sentence to show.
 */
export async function resubmitFailedAnalysisAction(
  input: AdminResubmitInput,
): Promise<AdminResubmitResult> {
  const result = await adminResubmitFailedAnalysis(input, {
    checkAdmin,
    createAdminClient,
    resubmit: resubmitJob,
  });

  if (result.ok) {
    // Today lists the failed job; the matches table and a match's own page
    // show its status. All of them sit under the admin layout.
    revalidatePath("/admin", "layout");
  }
  return result;
}
