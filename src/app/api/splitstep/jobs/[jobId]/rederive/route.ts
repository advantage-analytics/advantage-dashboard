/**
 * Rebuild a job's statistics from the results the vendor already delivered —
 * the recovery for a `derivation_failed` row whose build crashed
 * (`DERIVATION_ERROR`), and the rebuild after an analysed match's score is
 * edited. No vendor call and no allowance.
 *
 * Wiring only: the session, the service-role client and `deriveAndPublish()`.
 * The ladder and its reasoning are in `handler.ts`.
 */

import type { NextRequest } from "next/server";

import { deriveAndPublish } from "@/lib/services/splitstep/derive-and-publish";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import {
  handleRederive,
  type RederiveDeps,
  type RederiveJobRow,
} from "./handler";

export const runtime = "nodejs";

/**
 * Derivation writes the transcript, runs two stats RPCs and waits (bounded) on
 * the review — the webhook's own `after()` budget, for the same work.
 */
export const maxDuration = 60;

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;

  const supabase = await createClient();
  // Lazily, so a signed-out caller never constructs the service-role client.
  let admin: ReturnType<typeof createAdminClient> | null = null;
  const adminClient = () => (admin ??= createAdminClient());

  const deps: RederiveDeps = {
    async currentUserId() {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();
      return error || !user ? null : user.id;
    },

    async loadJob(id) {
      const { data, error } = await adminClient()
        .from("processing_jobs")
        .select(
          "id, created_by, status, derivation_version, error_code, error_category, error_step, external_job_id, updated_at, video_object_key, results_object_key",
        )
        .eq("id", id)
        .maybeSingle();
      return {
        job: (data as RederiveJobRow | null) ?? null,
        error: error?.message ?? null,
      };
    },

    async claimJob(id, from) {
      const { data, error } = await adminClient()
        .from("processing_jobs")
        .update({ status: "deriving" })
        .eq("id", id)
        .eq("status", from)
        .select("id");
      return {
        claimed: (data?.length ?? 0) > 0,
        error: error?.message ?? null,
      };
    },

    async derive(id, deadline) {
      const outcome = await deriveAndPublish({
        supabase: adminClient(),
        jobId: id,
        deadline,
      });
      return outcome.ok ? { ok: true } : { ok: false, reason: outcome.reason };
    },
  };

  return handleRederive(jobId, deps, { maxDurationSeconds: maxDuration });
}
