/**
 * Cancel an Advantage Intelligence analysis that is still waiting in the
 * vendor's queue: `DELETE {SPLITSTEP_API_URL}/{external_job_id}`, then the
 * `cancel_processing_job` RPC (row → `cancelled`, allowance released).
 *
 * Wiring only: same-origin, the session, the vendor call and the service-role
 * RPC. The ladder and its reasoning are in `handler.ts`.
 */

import type { NextRequest } from "next/server";

import {
  checkSameOrigin,
  errorResponse,
} from "@/lib/services/match-video/http";
import { resolveSplitstepVendorApiConfig } from "@/lib/services/splitstep/deployment-config";
import { siteUrl } from "@/lib/site-url";
import { lazyAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import {
  handleCancelJob,
  readVendorDelete,
  VENDOR_DELETE_TIMEOUT_MS,
  type CancelJobDeps,
  type CancelJobRow,
} from "./handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const origin = checkSameOrigin(request, [siteUrl()]);
  if (origin) return errorResponse(origin);

  const { jobId } = await params;
  const supabase = await createClient();
  // Lazy, so a signed-out or refused caller never constructs the service role.
  const admin = lazyAdminClient();

  const deps: CancelJobDeps = {
    async currentUserId() {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();
      return error || !user ? null : user.id;
    },

    async loadJob(id) {
      const { data, error } = await admin
        .from("processing_jobs")
        .select("id, created_by, status, external_job_id")
        .eq("id", id)
        .maybeSingle();
      return {
        job: (data as CancelJobRow | null) ?? null,
        error: error?.message ?? null,
      };
    },

    async deleteAtVendor(externalJobId) {
      const config = resolveSplitstepVendorApiConfig();
      if (!config.ok) {
        return {
          kind: "unreachable",
          reason: `unconfigured: ${config.missing}`,
        };
      }
      const url = `${config.apiUrl.replace(/\/$/, "")}/${encodeURIComponent(externalJobId)}`;
      try {
        const response = await fetch(url, {
          method: "DELETE",
          headers: { "X-Api-Key": config.apiKey },
          signal: AbortSignal.timeout(VENDOR_DELETE_TIMEOUT_MS),
          cache: "no-store",
        });
        // Read the body ourselves: a success may be plain text, an error is
        // the vendor's `{ job_id, error }` envelope — not a webhook payload.
        const text = await response.text().catch(() => "");
        return readVendorDelete(response.status, text);
      } catch (error) {
        const name = error instanceof Error ? error.name : "unknown";
        return {
          kind: "unreachable",
          reason: name === "TimeoutError" ? "timeout" : `network_${name}`,
        };
      }
    },

    async markCancelled(id, userId) {
      const { data, error } = await admin.rpc("cancel_processing_job", {
        p_job_id: id,
        p_user_id: userId,
      });
      return {
        status: typeof data === "string" ? data : null,
        error: error?.message ?? null,
      };
    },
  };

  return handleCancelJob(jobId, deps);
}
