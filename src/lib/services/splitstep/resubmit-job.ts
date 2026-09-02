/**
 * Resubmission — recovery from a *failed* vendor job.
 *
 * A resubmission is a NEW `processing_jobs` row linked to its parent via
 * `resubmitted_from_job_id`, never a status rewind on the old one:
 * `splitstep_status_rank()` exists specifically to stop jobs moving backwards,
 * and this model works with it rather than against it. The webhook's
 * match-fallback matcher picks "newest job wins", so deliveries for the new
 * submission route themselves correctly without any change there.
 *
 * Two callers share this function and nothing else may write the lineage
 * columns:
 *   • the webhook's `job_failed` branch (auto — one automatic attempt per
 *     chain, download-step failures only)
 *   • POST /api/splitstep/jobs/[jobId]/resubmit (manual — "Retry analysis")
 *
 * ── Video recovery, and why there is no "re-stage" branch ────────────────────
 * The planning doc for this feature said to re-stage from "the R2 original"
 * when the SAS was stale. R2 is retired; the only copy of a failed job's video
 * is the Azure blob itself — and nothing deletes it on failure (the webhook's
 * failed branch releases quota and stops; the reclaim sweeper only examines
 * jobs with a trimmed copy, which a failed job never has). Signing a SAS is a
 * local operation, so the reuse-vs-restage split collapses: if the blob
 * exists, mint a fresh 14-day SAS bound to the child row; if it does not, the
 * job is unrecoverable and says so.
 *
 * ── Quota ────────────────────────────────────────────────────────────────────
 * The parent's reservation was released when it failed, so the child reserves
 * again. Both paths run the full `reserveQuota()` policy gauntlet —
 * `canSubmitVideo` and the upload-permission checks, not just the cap
 * arithmetic. The auto path has no session, so it cannot ask
 * `getWorkspaceContext()`; instead `resolveAutoRetryWorkspace()` re-derives an
 * equivalent `Workspace` from `program_members`/`programs` AT RETRY TIME. That
 * "at retry time" is load-bearing: an auto-retry fires on a later webhook or
 * poll, arbitrarily after the original submission, and permission is not a
 * fact fixed at submission — a program's claim can be rejected in that
 * window, or a coach can flip a specific player's "Can send video" off
 * (`program_members.upload_enabled`), exactly the bug `quota.ts`'s own
 * comments describe fixing once already. Re-deriving fresh state, rather than
 * trusting whatever the original submission's `processing_usage` row implies,
 * is what keeps a revoked permission actually stopping the spend it revokes.
 *
 * ── The vendor POST fragment ─────────────────────────────────────────────────
 * Steps mint → POST → parse id → record queued mirror api/splitstep/jobs
 * steps 7–8. Change one and change the other; they are annotated on both
 * sides. Extracting a shared core was weighed and deferred — the route
 * interleaves its copy with HTTP concerns, and rewriting the proven submit
 * path to deduplicate ~50 lines is the riskier trade.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { buildSplitStepJobRequest } from './job-request';
import { parseWebhookPayload } from './webhook-payload';
import { resolveSplitstepDeploymentConfig } from './deployment-config';
import { createVideoUrlStrategy, videoContainerClient } from './video-url';
import { releaseQuota, reserveQuota } from './quota';
import { adoptOrphanedDeliveries } from './adopt-deliveries';
import type { Workspace } from '@/lib/workspace/types';

const LOG = '[splitstep-resubmit]';

/** 1 original + 2 resubmissions. Enforced here and nowhere else. */
export const MAX_TOTAL_ATTEMPTS = 3;

/** Statuses that mean "this row will never move again on its own". */
const TERMINAL_STATUSES = ['failed', 'completed', 'derivation_failed'];

/**
 * The ONE failure class the system retries on its own.
 *
 * A download failure with a valid SAS means the file, submission and metadata
 * are all good — retrying is nearly free and nearly always works. Step
 * outranks code because the one real failure arrived as INTERNAL_ERROR at
 * step 'downloading_video'; a bare INTERNAL_ERROR elsewhere says "contact
 * support", video-quality rejections can never succeed on retry, and unknown
 * codes surface without retrying. Exported so the webhook route and the
 * reconciler classify with the same rule — this is the load-bearing line,
 * and two copies of it is how one site silently widens the retry class.
 */
export function isDownloadFailure(
  errorCode: string | null,
  errorStep: string | null
): boolean {
  return errorStep === 'downloading_video' || errorCode === 'VIDEO_UNREACHABLE';
}

export type ResubmitRefusalReason =
  | 'not_found'
  | 'not_failed'
  | 'in_flight_duplicate'
  | 'attempt_ceiling'
  | 'already_auto_resubmitted'
  | 'video_unavailable'
  | 'quota'
  | 'not_configured'
  | 'invalid_metadata'
  | 'submit_failed';

export type ResubmitResult =
  | { ok: true; jobId: string; externalJobId: string }
  | { ok: false; reason: ResubmitRefusalReason; message: string };

interface ParentJob {
  id: string;
  match_id: string;
  created_by: string;
  status: string;
  video_object_key: string | null;
  start_time_seconds: number | null;
  end_time_seconds: number | null;
  initial_top_player_is_player1: boolean | null;
  ad_scoring: boolean | null;
  fixed_camera: boolean | null;
  resubmitted_from_job_id: string | null;
}

export async function resubmitJob(params: {
  /** Service-role client — this runs from webhooks and background paths. */
  supabase: SupabaseClient;
  /** The FAILED job to resubmit from. */
  jobId: string;
  /** True when the system is retrying, false when a user pressed the button. */
  auto: boolean;
  /**
   * Required when `auto` is false: the billing workspace, resolved by the
   * caller from the session (`billingWorkspaceFor`). The full reserveQuota()
   * policy checks run against it.
   */
  workspace?: Workspace;
}): Promise<ResubmitResult> {
  const { supabase, jobId, auto, workspace } = params;

  const config = resolveSplitstepDeploymentConfig();
  if (!config.ok) {
    return {
      ok: false,
      reason: 'not_configured',
      message: 'Analysis is not configured on this deployment.',
    };
  }

  // 1. The parent must exist and be terminally failed. `derivation_failed` is
  //    excluded on purpose: its results already exist and resubmitting the
  //    video would spend quota to recompute what a derivation re-run gets free.
  const { data: parentRow, error: parentError } = await supabase
    .from('processing_jobs')
    .select(
      'id, match_id, created_by, status, video_object_key, start_time_seconds, end_time_seconds, initial_top_player_is_player1, ad_scoring, fixed_camera, resubmitted_from_job_id'
    )
    .eq('id', jobId)
    .maybeSingle();

  if (parentError || !parentRow) {
    return { ok: false, reason: 'not_found', message: 'Job not found.' };
  }
  const parent = parentRow as ParentJob;

  if (parent.status !== 'failed') {
    return {
      ok: false,
      reason: 'not_failed',
      message: `Only a failed analysis can be retried; this one is ${parent.status}.`,
    };
  }

  if (
    !parent.video_object_key ||
    parent.start_time_seconds === null ||
    parent.end_time_seconds === null
  ) {
    // A job that failed before its video finished uploading has no blob to
    // resubmit. The recovery for that class is uploading again, not this.
    return {
      ok: false,
      reason: 'video_unavailable',
      message: 'This job has no completed video upload to retry from.',
    };
  }

  // 2. Walk the chain. Root first, then everything descending from it — the
  //    ceiling is tiny, so a bounded loop beats a recursive CTE the client
  //    cannot express.
  const chain = await loadChain(supabase, parent);
  if (chain === null) {
    return {
      ok: false,
      reason: 'submit_failed',
      message: 'Could not read this job’s retry history.',
    };
  }

  if (chain.length >= MAX_TOTAL_ATTEMPTS) {
    return {
      ok: false,
      reason: 'attempt_ceiling',
      message:
        'This match has been attempted the maximum number of times. ' +
        'Contact support if the analysis keeps failing.',
    };
  }

  if (auto && chain.some((j) => j.auto_resubmitted)) {
    // Exactly one automatic attempt per chain; a second failure surfaces to
    // the user instead of looping against whatever is actually wrong.
    return {
      ok: false,
      reason: 'already_auto_resubmitted',
      message: 'An automatic retry has already been attempted for this match.',
    };
  }

  // 3–5. Three independent reads — none depends on another's result, only on
  // `parent` (already loaded) — run concurrently: the live-duplicate check,
  // the Azure blob existence check, and the match metadata. This is the
  // manual "Retry analysis" button's response time; three round trips
  // (two Postgres, one Azure HEAD) run as one wait instead of three.
  const [liveResult, blobResult, matchResult] = await Promise.all([
    supabase
      .from('processing_jobs')
      .select('id, status')
      .eq('match_id', parent.match_id)
      .not('status', 'in', `(${TERMINAL_STATUSES.join(',')})`),
    videoContainerClient()
      .getBlockBlobClient(parent.video_object_key)
      .exists()
      .then((exists) => ({ ok: true as const, exists }))
      .catch((err) => ({ ok: false as const, err })),
    supabase
      .from('matches')
      .select(
        'id, player1_name, player2_name, score, match_type, program_id, format, fixed_camera, initial_top_player_is_player1'
      )
      .eq('id', parent.match_id)
      .maybeSingle(),
  ]);

  // 3. No concurrent duplicates: nothing non-terminal may exist for this
  //    match. (Not just this chain — a fresh upload in flight for the same
  //    match also makes a retry of the old job wrong.)
  if (liveResult.error) {
    return {
      ok: false,
      reason: 'submit_failed',
      message: 'Could not check for an analysis already in progress.',
    };
  }
  if ((liveResult.data ?? []).length > 0) {
    return {
      ok: false,
      reason: 'in_flight_duplicate',
      message: 'An analysis for this match is already in progress.',
    };
  }

  // 4. The blob must still exist — see the header for why this is the whole
  //    video-recovery question.
  if (!blobResult.ok) {
    console.error(`${LOG} blob existence check failed`, {
      jobId,
      error: blobResult.err instanceof Error ? blobResult.err.message : String(blobResult.err),
    });
    return {
      ok: false,
      reason: 'video_unavailable',
      message: 'Could not verify the video is still available. Try again later.',
    };
  }
  if (!blobResult.exists) {
    return {
      ok: false,
      reason: 'video_unavailable',
      message:
        'The original video is no longer stored, so this analysis cannot be ' +
        'retried. Upload the match again.',
    };
  }

  // 5. Match metadata, for the request build and the answer fallbacks.
  const { data: matchRow, error: matchError } = matchResult;
  if (matchError || !matchRow) {
    return {
      ok: false,
      reason: 'invalid_metadata',
      message: 'Could not load the match for this job.',
    };
  }

  const match = matchRow as {
    player1_name: string;
    player2_name: string;
    score: { player1: number[]; player2: number[] } | null;
    match_type: string | null;
    program_id: string | null;
    format: { ad_scoring?: boolean } | null;
    fixed_camera: boolean | null;
    initial_top_player_is_player1: boolean | null;
  };

  // Job row first, match row second — same fallback order as the submit
  // route, minus the request body no caller here has. The parent's columns
  // are what the failed attempt actually sent, which is exactly what a retry
  // must send again.
  const effectiveTopPlayer =
    parent.initial_top_player_is_player1 ?? match.initial_top_player_is_player1;
  const effectiveAdScoring = parent.ad_scoring ?? match.format?.ad_scoring;
  const effectiveFixedCamera = parent.fixed_camera ?? match.fixed_camera;

  if (typeof effectiveTopPlayer !== 'boolean') {
    // Refused rather than defaulted — a default is a coin flip on which player
    // every statistic belongs to.
    return {
      ok: false,
      reason: 'invalid_metadata',
      message:
        'This match is missing its camera-orientation answer and cannot be ' +
        'retried automatically.',
    };
  }

  const built = buildSplitStepJobRequest({
    matchId: parent.match_id,
    videoUrl: '',
    allowEmptyVideoUrl: true,
    webhookUrl: config.webhookUrl,
    player1Name: match.player1_name,
    player2Name: match.player2_name,
    initialTopPlayerIsPlayer1: effectiveTopPlayer,
    startTimeSeconds: Number(parent.start_time_seconds),
    endTimeSeconds: Number(parent.end_time_seconds),
    player1Scores: match.score?.player1 ?? [],
    player2Scores: match.score?.player2 ?? [],
    adScoring: effectiveAdScoring ?? undefined,
    fixedCamera: effectiveFixedCamera ?? undefined,
    matchType: match.match_type,
  });

  if (!built.ok) {
    return {
      ok: false,
      reason: 'invalid_metadata',
      message: `This match cannot be analysed: ${built.errors.join('; ')}`,
    };
  }

  const vendorRequest = built.request;
  const billableSeconds = Math.ceil(vendorRequest.EndTime - vendorRequest.StartTime);

  // 6. Create the child row BEFORE reserving: the quota ledger keys on the
  //    job id, so the row has to exist first. `uploaded` is honest — the bytes
  //    are in Azure and that status is defined as "ready to submit, nothing to
  //    re-upload". `.select('id').single()` and every later write keys on that
  //    id (useUploadMatchWizard invariant — keying on match_id would touch
  //    every job this match ever had).
  const { data: childRow, error: insertError } = await supabase
    .from('processing_jobs')
    .insert({
      match_id: parent.match_id,
      created_by: parent.created_by,
      provider: 'splitstep',
      status: 'uploaded',
      video_object_key: parent.video_object_key,
      start_time_seconds: parent.start_time_seconds,
      end_time_seconds: parent.end_time_seconds,
      initial_top_player_is_player1: effectiveTopPlayer,
      ad_scoring: vendorRequest.Ad,
      fixed_camera: vendorRequest.FixedCamera,
      resubmitted_from_job_id: parent.id,
      auto_resubmitted: auto,
    })
    .select('id')
    .single();

  if (insertError || !childRow) {
    // 23505 on `processing_jobs_one_live_per_match`: the read-then-insert
    // check above raced another resubmission (the webhook's auto-retry and a
    // user's own click, or two clicks) and lost. The database enforcing this
    // is the actual guard; the read above is only the fast, friendly path in
    // the common case.
    if (insertError?.code === '23505') {
      return {
        ok: false,
        reason: 'in_flight_duplicate',
        message: 'An analysis for this match is already in progress.',
      };
    }
    return {
      ok: false,
      reason: 'submit_failed',
      message: 'Could not create the retry job.',
    };
  }
  const childId = (childRow as { id: string }).id;

  // 7. Reserve quota for the child. The parent's reservation was released on
  //    failure, so this is a fresh spend against the same budget.
  const reserved = await reserveForChild({
    supabase,
    auto,
    workspace,
    parent,
    childId,
    programId: match.program_id,
    seconds: billableSeconds,
  });

  if (!reserved.ok) {
    // The child row did nothing yet — remove it rather than leaving a
    // permanent extra "failed" attempt for a refusal that spent nothing.
    await supabase.from('processing_jobs').delete().eq('id', childId);
    return { ok: false, reason: 'quota', message: reserved.message };
  }

  // 8. Submit. Mirrors api/splitstep/jobs steps 7–8 — annotated there too.
  try {
    await supabase
      .from('processing_jobs')
      .update({
        status: 'submitting',
        billable_seconds: billableSeconds,
        attempt_count: 1,
      })
      .eq('id', childId);

    const vendorUrl = await createVideoUrlStrategy(supabase).mint({
      jobId: childId,
      objectKey: parent.video_object_key,
    });

    const response = await fetch(config.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': config.apiKey },
      body: JSON.stringify({ ...vendorRequest, VideoUrl: vendorUrl.url }),
      signal: AbortSignal.timeout(30_000),
    });

    const rawResponse = await response.text();

    if (!response.ok) {
      throw new Error(
        `Provider returned ${response.status}: ${rawResponse.slice(0, 500)}`
      );
    }

    let externalJobId: string | null = null;
    try {
      externalJobId = parseWebhookPayload(JSON.parse(rawResponse)).externalJobId;
    } catch {
      console.warn(`${LOG} provider response was not JSON`, {
        childId,
        body: rawResponse.slice(0, 500),
      });
    }

    if (!externalJobId) {
      throw new Error(
        'Provider accepted the job but returned no job id — the webhook would ' +
          'have nothing to match against.'
      );
    }

    await supabase
      .from('processing_jobs')
      .update({
        status: 'queued',
        external_job_id: externalJobId,
        submitted_at: new Date().toISOString(),
        video_url_expires_at: vendorUrl.expiresAt?.toISOString() ?? null,
        error_message: null,
      })
      .eq('id', childId);

    console.log(`${LOG} resubmitted`, {
      parentId: parent.id,
      childId,
      externalJobId,
      auto,
      billableSeconds,
    });

    // Same race the submit route closes: the vendor's job_queued can land
    // before external_job_id is written. Not inside the try's failure surface
    // conceptually, but a throw above has already been handled by then.
    try {
      const adoption = await adoptOrphanedDeliveries({
        supabase,
        jobId: childId,
        externalJobId,
      });

      // Same auto-retry the webhook's job_failed branch runs for a delivery
      // that arrived on time — a self-recursive call (this IS resubmitJob),
      // safe because every guard (chain length, one-auto-per-chain, blob
      // existence) re-checks fresh state against `childId` as the new parent,
      // not against any assumption carried over from this call.
      if (
        adoption.jobStatus === 'failed' &&
        isDownloadFailure(adoption.errorCode, adoption.errorStep)
      ) {
        await releaseQuota(supabase, childId);
        const retry = await resubmitJob({ supabase, jobId: childId, auto: true });
        if (retry.ok) {
          console.log(`${LOG} auto-resubmitted an orphan-adopted failure`, {
            childId,
            newJobId: retry.jobId,
          });
        } else {
          console.warn(`${LOG} auto-resubmit of adopted failure declined`, {
            childId,
            reason: retry.reason,
          });
        }
      }
    } catch (err) {
      console.error(`${LOG} could not adopt early deliveries`, {
        childId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return { ok: true, jobId: childId, externalJobId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`${LOG} resubmission failed`, { childId, message });

    await releaseQuota(supabase, childId);
    try {
      await createVideoUrlStrategy(supabase).markUrlRetired(childId);
    } catch {
      /* bookkeeping only — see the submit route's identical block */
    }
    await supabase
      .from('processing_jobs')
      .update({ status: 'failed', error_message: message })
      .eq('id', childId);

    return {
      ok: false,
      reason: 'submit_failed',
      message: 'Could not submit the retry to the analysis provider.',
    };
  }
}

/**
 * Every job in this chain: the root plus all descendants. Returns null on a
 * read error. Bounded — with a ceiling of 3 the loop runs at most a few times,
 * and the bound exists so a data cycle cannot spin it.
 */
async function loadChain(
  supabase: SupabaseClient,
  from: ParentJob
): Promise<{ id: string; status: string; auto_resubmitted: boolean }[] | null> {
  // Up to the root.
  let rootId = from.id;
  let parentId = from.resubmitted_from_job_id;
  for (let i = 0; parentId && i < 10; i++) {
    rootId = parentId;
    const { data, error } = await supabase
      .from('processing_jobs')
      .select('id, resubmitted_from_job_id')
      .eq('id', parentId)
      .maybeSingle();
    if (error) return null;
    parentId = (data as { resubmitted_from_job_id: string | null } | null)
      ?.resubmitted_from_job_id ?? null;
  }

  // Down from the root.
  const { data: rootRow, error: rootError } = await supabase
    .from('processing_jobs')
    .select('id, status, auto_resubmitted')
    .eq('id', rootId)
    .maybeSingle();
  if (rootError || !rootRow) return null;

  const chain = [rootRow as { id: string; status: string; auto_resubmitted: boolean }];
  let frontier = [rootId];
  for (let i = 0; frontier.length > 0 && i < 10; i++) {
    const { data, error } = await supabase
      .from('processing_jobs')
      .select('id, status, auto_resubmitted')
      .in('resubmitted_from_job_id', frontier);
    if (error) return null;
    const next = (data ?? []) as { id: string; status: string; auto_resubmitted: boolean }[];
    const unseen = next.filter((j) => !chain.some((c) => c.id === j.id));
    chain.push(...unseen);
    frontier = unseen.map((j) => j.id);
  }
  return chain;
}

/**
 * Reserve the child's quota. Both paths funnel through `reserveQuota()` — the
 * SAME policy gate a manual first submission uses — so an auto-retry cannot
 * spend a cent that current permission would refuse. See the file header.
 */
async function reserveForChild(params: {
  supabase: SupabaseClient;
  auto: boolean;
  workspace: Workspace | undefined;
  parent: ParentJob;
  childId: string;
  programId: string | null;
  seconds: number;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const { supabase, auto, workspace, parent, childId, programId, seconds } = params;

  const effectiveWorkspace = auto
    ? await resolveAutoRetryWorkspace({ supabase, programId, userId: parent.created_by })
    : workspace;

  if (!effectiveWorkspace) {
    return {
      ok: false,
      message: auto
        ? 'The uploader no longer has permission to submit video for this program.'
        : 'A billing workspace is required to retry this analysis.',
    };
  }

  const reservation = await reserveQuota({
    supabase,
    jobId: childId,
    userId: parent.created_by,
    workspace: effectiveWorkspace,
    seconds,
  });
  return reservation.ok
    ? { ok: true }
    : { ok: false, message: reservation.message };
}

/**
 * Build a fresh, CURRENT-STATE `Workspace` for the auto-retry billing check —
 * there is no session to ask `getWorkspaceContext()` of, because nobody is
 * signed in when a webhook or the reconciler fires this. Re-derives exactly
 * what that function would answer for `userId` right now, from
 * `program_members`/`programs`, mirroring `listProgramWorkspaces()` in
 * `workspace/active-workspace-server.ts` field-for-field so the two cannot
 * silently diverge on what "may submit" means.
 *
 * Returns null when the uploader no longer belongs to the program at all
 * (removed from `program_members` since the original submission) — refused,
 * never defaulted to a permissive shape.
 */
async function resolveAutoRetryWorkspace(params: {
  supabase: SupabaseClient;
  programId: string | null;
  userId: string;
}): Promise<Workspace | null> {
  const { supabase, programId, userId } = params;

  if (programId === null) {
    // Personal workspace: always permitted, matching personalWorkspace() —
    // there is no membership row to consult and the viewer is the only
    // member of their own workspace.
    return {
      id: userId,
      kind: 'personal',
      name: 'Personal',
      timeZone: 'UTC',
      team: null,
      orgType: null,
      role: 'owner',
      mark: '',
      canSubmitVideo: true,
      playersCanUpload: false,
      memberUploadEnabled: true,
    };
  }

  const { data, error } = await supabase
    .from('program_members')
    .select(
      'role, upload_enabled, programs!inner(status, players_can_upload, org_type)'
    )
    .eq('program_id', programId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) return null;

  const row = data as {
    role: string;
    upload_enabled: boolean;
    programs:
      | { status: string; players_can_upload: boolean; org_type: string }
      | { status: string; players_can_upload: boolean; org_type: string }[];
  };
  const program = Array.isArray(row.programs) ? row.programs[0] : row.programs;
  if (!program) return null;

  return {
    id: programId,
    kind: 'team',
    name: 'Program',
    team: null,
    // Not read here: this workspace exists only to price a retry through
    // `reserveQuota()`, which never asks what day it is. UTC rather than a
    // second read for a field this path does not use.
    timeZone: 'UTC',
    // The real value, not a guess: this workspace goes straight into
    // `reserveQuota()`, and a custom org auto-retrying must draw its reduced
    // tier exactly as a fresh manual submission would — see `quotaTierFor()`.
    orgType: program.org_type as Workspace['orgType'],
    role: row.role as Workspace['role'],
    mark: '',
    // Same rule listProgramWorkspaces() uses: 'active' means the claim
    // settled. A claim rejected or paused since the original submission
    // reads false here, exactly as it would for a fresh manual submission.
    canSubmitVideo: program.status === 'active',
    playersCanUpload: program.players_can_upload,
    memberUploadEnabled: Boolean(row.upload_enabled),
  };
}
