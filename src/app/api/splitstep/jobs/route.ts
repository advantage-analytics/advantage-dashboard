/**
 * Submit an uploaded match video for analysis (spec §3.3).
 *
 * The upload wizard has already created the `processing_jobs` row and put the
 * video in Azure Blob Storage; this is the step that spends an allowance and
 * hands the job to the vendor. Replaces `scripts/splitstep-submit.ts` for real
 * users — the script stays for the smoke test, where hardcoding metadata is the
 * point.
 *
 * Called automatically by the upload wizard the moment a transfer finishes —
 * see useUploadMatchWizard.ts. A submit failure here deliberately does NOT mark
 * the job failed: the bytes are safely in Azure and `status: 'uploaded'` is the
 * one state a retry needs nothing re-uploaded from.
 *
 * The decision lives in `handler.ts`; this file is the wiring — the real
 * session, service-role, workspace, roster, Azure and vendor seams and nothing
 * else — so the refusal ladder can be tested without a database, without a
 * quota spend, and without a vendor call. The order (verify ownership →
 * eligibility → reserve quota → mint URL → submit → record) and its reasoning
 * are in the handler's header.
 */

import { after, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { adoptOrphanedDeliveries } from "@/lib/services/splitstep/adopt-deliveries";
import { loadEligibleRoster } from "@/lib/services/splitstep/eligible-roster";
import {
  isDownloadFailure,
  resubmitJob,
} from "@/lib/services/splitstep/resubmit-job";
import { resolveSplitstepDeploymentConfig } from "@/lib/services/splitstep/deployment-config";
import { createVideoUrlStrategy } from "@/lib/services/splitstep/video-url";
import { releaseQuota, reserveQuota } from "@/lib/services/splitstep/quota";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";

import {
  handleSubmitJob,
  type SubmitJobDeps,
  type SubmitJobMatch,
  type SubmitJobRow,
} from "./handler";

export const runtime = "nodejs";

/**
 * Talking to the vendor is a network call with no published latency guarantee.
 * Set explicitly rather than inheriting the platform default, which is the kind
 * of thing that is invisible until the one submission that matters times out.
 */
export const maxDuration = 60;

const LOG = "[splitstep-submit]";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  // Lazily, so an unauthenticated caller never constructs the service-role
  // client — the handler asks for the user first and returns 401 before any
  // other seam is touched.
  let admin: ReturnType<typeof createAdminClient> | null = null;
  const adminClient = () => (admin ??= createAdminClient());
  let userId: string | null = null;

  // Resolved once the handler has passed the config check; every vendor and
  // storage seam below reads it. `deploymentConfig()` is the only writer.
  let config: ReturnType<typeof resolveSplitstepDeploymentConfig> | null = null;

  const deps: SubmitJobDeps = {
    async currentUserId() {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();
      userId = error || !user ? null : user.id;
      return userId;
    },

    deploymentConfig() {
      config = resolveSplitstepDeploymentConfig();
      return config;
    },

    async loadJob(jobId) {
      const { data, error } = await adminClient()
        .from("processing_jobs")
        .select(
          "id, match_id, created_by, status, external_job_id, video_object_key, start_time_seconds, end_time_seconds, attempt_count, initial_top_player_is_player1, ad_scoring, fixed_camera",
        )
        .eq("id", jobId)
        .maybeSingle();
      return {
        job: (data as SubmitJobRow | null) ?? null,
        error: error?.message ?? null,
      };
    },

    async loadMatch(matchId) {
      const { data, error } = await adminClient()
        .from("matches")
        // `player1_id` and `event_entry_id` for the upload contract — whose
        // match this is, and whether it sits on a line (T16). The rest is the
        // vendor payload and the singles/doubles gate.
        .select(
          "id, player1_name, player2_name, score, match_type, program_id, player1_id, event_entry_id, format, fixed_camera, initial_top_player_is_player1",
        )
        .eq("id", matchId)
        .maybeSingle();
      return {
        match: (data as SubmitJobMatch | null) ?? null,
        error: error?.message ?? null,
      };
    },

    async availableWorkspaces() {
      return (await getWorkspaceContext())?.available ?? [];
    },

    async loadRoster(programId) {
      // The same read `/api/splitstep/upload-url` makes, so the two seams
      // cannot disagree about who is on the roster.
      return loadEligibleRoster({ supabase, programId, userId, log: LOG });
    },

    reserveQuota(params) {
      return reserveQuota({ supabase: adminClient(), ...params });
    },

    releaseQuota(jobId) {
      return releaseQuota(adminClient(), jobId);
    },

    async updateJob(jobId, patch) {
      const { error } = await adminClient()
        .from("processing_jobs")
        .update(patch)
        .eq("id", jobId);
      return { error: error?.message ?? null };
    },

    mintVendorUrl(input) {
      return createVideoUrlStrategy(adminClient()).mint(input);
    },

    markUrlRetired(jobId) {
      return createVideoUrlStrategy(adminClient()).markUrlRetired(jobId);
    },

    async submitToVendor(body) {
      if (!config?.ok) {
        // Unreachable: the handler refuses on `deploymentConfig()` before it
        // can get here. Kept as a throw rather than a silent no-op so a
        // reordering upstream fails the submission instead of sending nothing.
        throw new Error("Vendor configuration was not resolved");
      }
      const response = await fetch(config.apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": config.apiKey,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });
      return {
        ok: response.ok,
        status: response.status,
        text: await response.text(),
      };
    },

    afterSubmitted({ jobId, externalJobId }) {
      const admin = adminClient();

      // Pick up any delivery that beat the `queued` write. The vendor fires
      // `job_queued` on acceptance, and on the first real job it landed 0.9s
      // after our POST — before `external_job_id` existed to match it against,
      // and their payload does not echo `MatchID`, so the usual fallback had
      // nothing to work with.
      //
      // In after(), and deliberately NOT inside the handler's try: a throw
      // there runs the catch block, which releases quota and retires the video
      // URL. Undoing a submission the vendor has already accepted, because a
      // bookkeeping fixup failed, would be far worse than the orphan it is
      // fixing.
      after(async () => {
        try {
          const result = await adoptOrphanedDeliveries({
            supabase: admin,
            jobId,
            externalJobId,
          });

          if (result.adopted === 0) return;

          console.log(
            `${LOG} adopted ${result.adopted} early delivery/deliveries`,
            {
              jobId,
              jobStatus: result.jobStatus,
            },
          );

          // The reason this is not merely cosmetic. A `job_failed` that lost
          // the race never reached the webhook's quota release, so those
          // minutes would stay spent against a 2-hour monthly cap with nothing
          // to show for it. releaseQuota() is idempotent via `released = false`.
          if (result.jobStatus === "failed") {
            await releaseQuota(admin, jobId);
            console.log(`${LOG} quota released for adopted failure`, {
              jobId,
            });

            // Same auto-retry the webhook's own job_failed branch runs for a
            // delivery that arrived on time — an orphan-adopted failure must
            // not silently lose its shot at the identical automatic recovery.
            if (isDownloadFailure(result.errorCode, result.errorStep)) {
              const retry = await resubmitJob({
                supabase: admin,
                jobId,
                auto: true,
              });
              if (retry.ok) {
                console.log(
                  `${LOG} auto-resubmitted an orphan-adopted failure`,
                  {
                    jobId,
                    newJobId: retry.jobId,
                  },
                );
              } else {
                console.warn(
                  `${LOG} auto-resubmit of adopted failure declined`,
                  {
                    jobId,
                    reason: retry.reason,
                  },
                );
              }
            }
          }

          if (result.owedResultsDownload) {
            console.error(
              `${LOG} an adopted delivery carried a results URL that was never ` +
                `downloaded — fetch strokes_url from splitstep_webhook_deliveries by ` +
                `hand; it stays valid about a week`,
              { jobId, externalJobId },
            );
          }
        } catch (err) {
          console.error(`${LOG} could not adopt early deliveries`, {
            jobId,
            externalJobId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      });
    },
  };

  return handleSubmitJob(request, deps);
}
