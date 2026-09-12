/**
 * The decision half of `/api/splitstep/jobs` — everything between the request
 * and the vendor, with its I/O handed in.
 *
 * Split from `route.ts` (T16) for the reason `upload-url/handler.ts` was: so
 * `tests/job-submission-authorization.spec.ts` can run the whole ladder —
 * sign-in, ownership, submittability, the upload contract on the ROW, then
 * the quota question — against fixtures, with the quota RPC and the vendor
 * POST replaced by stubs that spend and send nothing. Next reserves a route
 * file's exports for the handler names, so this is a sibling module rather
 * than an extra export; `route.ts` supplies the real session, service-role,
 * workspace, roster, Azure and vendor seams and nothing else.
 *
 * ORDER, unchanged from the route this came out of, with one step added:
 * verify ownership → is it submittable → load the match → the three vendor
 * answers → build the payload → the match's billing workspace →
 * `uploadEligibility()` (T16, new) → reserve quota → mint URL → submit →
 * record. Quota is reserved BEFORE the vendor is called, because an allowance
 * only checked afterwards cannot refuse anything; the contract is asked
 * BEFORE quota, because a reservation refused on eligibility would have to be
 * handed straight back. Every failure past the reservation hands it back.
 *
 * WHAT A REFUSAL DOES TO THE JOB. Nothing. Every return before the `try`
 * leaves the row exactly as it was found — `uploaded`, no `attempt_count`
 * bump, no vendor answers written — because `uploaded` is the one state a
 * retry needs nothing re-uploaded from. The caller records the sentence in
 * `error_message` (`submit-match-video.ts`) and `isSubmitStalled()` offers
 * "Try again" once the row has sat still. A RETRYABLE refusal (a roster or
 * status read that failed) answers 503, a decided one 403; both leave the
 * job where a retry can pick it up. Only a failure past the reservation —
 * inside the `try` — marks the job `failed`, and that was already so.
 */

import { NextResponse } from "next/server";

import { buildSplitStepJobRequest } from "@/lib/services/splitstep/job-request";
import type { SplitStepJobRequest } from "@/lib/services/splitstep/job-request";
import { athleteOnRow } from "@/lib/services/splitstep/match-athlete";
import type { QuotaReservation } from "@/lib/services/splitstep/quota";
import { parseWebhookPayload } from "@/lib/services/splitstep/webhook-payload";
import type { VendorVideoUrl } from "@/lib/services/splitstep/video-url/types";
import { uploadEligibility } from "@/lib/workspace/upload-eligibility";
import type { RosterIdentity } from "@/lib/workspace/upload-eligibility";
import {
  billingWorkspaceFor,
  NO_BILLING_WORKSPACE_REFUSAL,
  type Workspace,
} from "@/lib/workspace/types";

const LOG = "[splitstep-submit]";

/** The columns of `processing_jobs` this decision reads. */
export interface SubmitJobRow {
  id: string;
  match_id: string;
  created_by: string | null;
  status: string;
  external_job_id: string | null;
  video_object_key: string | null;
  start_time_seconds: number | null;
  end_time_seconds: number | null;
  attempt_count: number | null;
  initial_top_player_is_player1: boolean | null;
  ad_scoring: boolean | null;
  fixed_camera: boolean | null;
}

/** The columns of `matches` this decision reads. */
export interface SubmitJobMatch {
  id: string;
  player1_name: string;
  player2_name: string;
  score: { player1: number[]; player2: number[] } | null;
  match_type: string | null;
  /** The workspace this match belongs to. NULL = personal. */
  program_id: string | null;
  /**
   * The athlete on the row — a `program_players.id`, or on an older row a
   * login id; the uploader's own login on a personal match. NULL is nobody.
   */
  player1_id: string | null;
  /** Set when the row is a scheduled line's match. */
  event_entry_id: string | null;
  /** `ad_scoring` lives in here, not in a column of its own. */
  format: { ad_scoring?: boolean } | null;
  fixed_camera: boolean | null;
  initial_top_player_is_player1: boolean | null;
}

/** What the route writes to the job row, at each of its three moments. */
export interface SubmitJobPatch {
  status?: string;
  billable_seconds?: number;
  attempt_count?: number;
  initial_top_player_is_player1?: boolean;
  ad_scoring?: boolean;
  fixed_camera?: boolean;
  external_job_id?: string;
  submitted_at?: string;
  video_url_expires_at?: string | null;
  error_message?: string | null;
}

export type SubmitJobDeploymentConfig =
  { ok: true; webhookUrl: string } | { ok: false; missing: string };

export interface SubmitJobDeps {
  /** The signed-in login, or null. */
  currentUserId(): Promise<string | null>;
  /** Can this deployment finish a job at all — `resolveSplitstepDeploymentConfig()`. */
  deploymentConfig(): SubmitJobDeploymentConfig;
  /**
   * The job by id, through a client that can see every row — the handler
   * distinguishes "not yours" from "does not exist" itself (both answer 404).
   */
  loadJob(
    jobId: string,
  ): Promise<{ job: SubmitJobRow | null; error: string | null }>;
  /** The job's match, through the same client. */
  loadMatch(
    matchId: string,
  ): Promise<{ match: SubmitJobMatch | null; error: string | null }>;
  /** Every workspace the caller holds — `getWorkspaceContext().available`. */
  availableWorkspaces(): Promise<Workspace[]>;
  /**
   * The program's ELIGIBLE roster as `uploadEligibility()` wants it —
   * `loadEligibleRoster()`. `null` when the read failed, which refuses with a
   * retry rather than passing on a list nobody has.
   */
  loadRoster(programId: string): Promise<readonly RosterIdentity[] | null>;
  /** The one seam that spends. `reserveQuota()`; tests stub it. */
  reserveQuota(params: {
    jobId: string;
    userId: string;
    workspace: Workspace;
    seconds: number;
  }): Promise<QuotaReservation>;
  /** `releaseQuota()` — hands a reservation back on any failure past it. */
  releaseQuota(jobId: string): Promise<void>;
  /** A partial update of the job row, keyed on its id. */
  updateJob(
    jobId: string,
    patch: SubmitJobPatch,
  ): Promise<{ error: string | null }>;
  /** `createVideoUrlStrategy(admin).mint()` — the vendor's read SAS. */
  mintVendorUrl(input: {
    jobId: string;
    objectKey: string;
  }): Promise<VendorVideoUrl>;
  /** `createVideoUrlStrategy(admin).markUrlRetired()` — bookkeeping only. */
  markUrlRetired(jobId: string): Promise<void>;
  /**
   * The one seam that reaches the vendor: the POST, with the body already
   * carrying `VideoUrl`. Returns the raw response; the handler parses it.
   */
  submitToVendor(
    body: SplitStepJobRequest,
  ): Promise<{ ok: boolean; status: number; text: string }>;
  /**
   * Runs after the response is sent, on a submission the vendor accepted:
   * the early-delivery adoption in `route.ts`. Deliberately outside the
   * handler's `try`, for the reason given there.
   */
  afterSubmitted(input: { jobId: string; externalJobId: string }): void;
}

interface SubmitBody {
  jobId?: string;
  /**
   * Camera-relative at the FIRST FRAME, not player1/player2. Players change
   * ends every odd game; this refers only to the start. Get it wrong and every
   * statistic belongs to the wrong player, with nothing in the UI looking off.
   *
   * OPTIONAL, and that is new. This comment used to say "not persisted on
   * processing_jobs — no column exists", which stopped being true when
   * migration 20260807072714 added all three columns and this route started
   * writing them at submit. So the wizard still sends them on a first submit,
   * where the columns are still null; a resubmission sends none of them and
   * the row supplies the answers instead.
   *
   * That is what makes retry safe. The alternative — asking again — would put
   * the three questions that silently misattribute a whole match in front of
   * somebody whose only intent was to press "try again".
   */
  initialTopPlayerIsPlayer1?: boolean;
  adScoring?: boolean;
  fixedCamera?: boolean;
}

export async function handleSubmitJob(
  request: Request,
  deps: SubmitJobDeps,
): Promise<NextResponse> {
  // 1. Who is calling.
  const userId = await deps.currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let body: SubmitBody;
  try {
    body = (await request.json()) as SubmitBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { jobId, initialTopPlayerIsPlayer1, adScoring, fixedCamera } = body;

  if (!jobId) {
    return NextResponse.json({ error: "jobId is required" }, { status: 400 });
  }

  // The orientation check used to sit here, before anything was loaded. It has
  // moved below the job AND match lookups, so a RESUBMISSION can take the
  // answer from a row instead of the body — see `effective*`. Still refused
  // rather than defaulted, just later and from three sources instead of one.

  // Before touching the database or an allowance: can this deployment finish
  // the job at all?
  const config = deps.deploymentConfig();
  if (!config.ok) {
    console.error(`${LOG} refusing — deployment not configured`, {
      missing: config.missing,
    });
    return NextResponse.json(
      { error: "Analysis is not configured on this deployment." },
      { status: 503 },
    );
  }

  // 2. Load the job and prove the caller owns it.
  const { job, error: jobError } = await deps.loadJob(jobId);

  if (jobError) {
    console.error(`${LOG} job lookup failed`, { jobId, error: jobError });
    return NextResponse.json(
      { error: "Could not load the job" },
      { status: 500 },
    );
  }

  // Same 404 for "does not exist" and "not yours" — never confirm the existence
  // of another user's job.
  if (!job || job.created_by !== userId) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  // 3. Is it actually submittable?
  if (job.external_job_id) {
    return NextResponse.json(
      { error: "This match has already been submitted for analysis." },
      { status: 409 },
    );
  }

  if (job.status !== "uploaded") {
    return NextResponse.json(
      {
        error:
          job.status === "uploading"
            ? "The video is still uploading. Try again once it finishes."
            : `This job is ${job.status} and cannot be submitted.`,
      },
      { status: 409 },
    );
  }

  if (!job.video_object_key) {
    return NextResponse.json(
      { error: "No video is attached to this job." },
      { status: 409 },
    );
  }

  if (job.start_time_seconds === null || job.end_time_seconds === null) {
    return NextResponse.json(
      { error: "This job has no trim window set." },
      { status: 409 },
    );
  }

  // 4. Match metadata — players, scores, the singles/doubles gate, and (T16)
  //    whose match this is.
  const { match, error: matchError } = await deps.loadMatch(job.match_id);

  if (matchError || !match) {
    return NextResponse.json(
      { error: "Could not load the match for this job." },
      { status: 500 },
    );
  }

  // ── The three vendor answers: body, then job, then match ──────────────────
  //
  // A first submit carries them in the body — the wizard has just asked. A
  // RESUBMISSION carries none, because the only caller that knows them is a
  // wizard that closed long ago, and re-asking would put the three questions
  // that silently misattribute every statistic in front of somebody whose only
  // intent was to press "try again".
  //
  // Three sources because two were not enough, and the reason is worth keeping.
  // Migration 20260807072714 added these columns to `processing_jobs` so the
  // answers would outlive the request — but this route only WRITES them at
  // submit, and the outer catch marks a failed submit `failed`, not
  // `uploaded`. So a job still sitting at `uploaded` is precisely one where the
  // route was never reached or returned early, and its job columns are null.
  // The retry case and the populated-job case are disjoint.
  //
  // The match row is what closes that gap: the wizard writes
  // `initial_top_player_is_player1`, `fixed_camera` and `format.ad_scoring`
  // when it creates the match, before any upload begins. Those are the answers
  // the person actually gave.
  //
  // Order is most-specific-first. Body is an explicit statement of intent; the
  // job row is what the last attempt used; the match row is what was originally
  // answered.
  const effectiveTopPlayer =
    typeof initialTopPlayerIsPlayer1 === "boolean"
      ? initialTopPlayerIsPlayer1
      : (job.initial_top_player_is_player1 ??
        match.initial_top_player_is_player1);
  const effectiveAdScoring =
    typeof adScoring === "boolean"
      ? adScoring
      : (job.ad_scoring ?? match.format?.ad_scoring);
  const effectiveFixedCamera =
    typeof fixedCamera === "boolean"
      ? fixedCamera
      : (job.fixed_camera ?? match.fixed_camera);

  if (typeof effectiveTopPlayer !== "boolean") {
    // Refused rather than defaulted. A default here is a coin flip on which
    // player every statistic belongs to. Reaching this means neither the job
    // nor the match recorded an orientation, which is a match created before
    // those columns existed — a human has to answer again.
    return NextResponse.json(
      { error: "initialTopPlayerIsPlayer1 is required and must be a boolean" },
      { status: 400 },
    );
  }

  // 5. Build and validate before anything is spent. buildSplitStepJobRequest
  //    enforces singles-only, a trim consistent with the score, and the
  //    top-player-first ordering of SetGameScores.
  const built = buildSplitStepJobRequest({
    matchId: job.match_id,
    videoUrl: "",
    allowEmptyVideoUrl: true,
    webhookUrl: config.webhookUrl,
    player1Name: match.player1_name,
    player2Name: match.player2_name,
    initialTopPlayerIsPlayer1: effectiveTopPlayer,
    startTimeSeconds: Number(job.start_time_seconds),
    endTimeSeconds: Number(job.end_time_seconds),
    player1Scores: match.score?.player1 ?? [],
    player2Scores: match.score?.player2 ?? [],
    // Passed through, NOT defaulted. These used to fall back to `true` here
    // while the wizard's own default was `false` — two silent, opposite guesses
    // at fields that change how the vendor reads the match. The builder refuses
    // a non-boolean now, so an omission becomes a 422 the caller can act on.
    adScoring: effectiveAdScoring ?? undefined,
    fixedCamera: effectiveFixedCamera ?? undefined,
    matchType: match.match_type,
  });

  if (!built.ok) {
    return NextResponse.json(
      { error: "This match cannot be analysed yet.", details: built.errors },
      { status: 422 },
    );
  }

  const vendorRequest = built.request;
  const billableSeconds = Math.ceil(
    vendorRequest.EndTime - vendorRequest.StartTime,
  );

  // 6. The match's workspace, then (T16) the upload contract, then the
  //    allowance. Refuses here, before a job is spent.
  //
  // Billed to the MATCH's workspace, not whichever one the caller happens to
  // have selected. A coach can switch workspaces between starting an upload and
  // submitting it, and the budget that pays for a match is the one the match
  // belongs to. `billingWorkspaceFor()` is that rule, lifted out of this file so
  // `/api/splitstep/upload-url` asks its permission question about the same
  // workspace this one charges — a check aimed at a different budget is a check
  // that only looks enforced.
  const billingWorkspace = billingWorkspaceFor(
    await deps.availableWorkspaces(),
    match.program_id,
  );

  if (!billingWorkspace) {
    return NextResponse.json(
      { error: NO_BILLING_WORKSPACE_REFUSAL },
      { status: 403 },
    );
  }

  // T16: the upload contract, asked about the ROW — approval, role, line, and
  // whose match this is — before a second of anyone's allowance is reserved.
  // This is the last server seam a match passes through and the one that
  // spends; until now it never read `player1_id`. Ownership above proves the
  // caller created the job; `reserveQuota()` below proves the workspace's
  // budget is open to them; neither proves the athlete on the row is a live
  // player on THIS program's roster or that the program's claim has been
  // approved. The live `matches_block_client_regraft` accepts any member of
  // the program as the athlete, staff included, never reads `programs.status`,
  // and is skipped outright for the service-role client this route loads
  // through — so a coach's own login on the row, an id from another program's
  // roster, or a program still waiting on its claim would all reach the spend.
  // The same `athleteOnRow()` mapping and roster read as `upload-url`, so the
  // two seams cannot disagree about a row — and an older row carrying a
  // player's login id rather than their profile id is still that player,
  // resolved by the roster, never rewritten.
  //
  // NOT the quota question. `reserveQuota()` still owns "may this workspace's
  // allowance be spent" and asks it unchanged below; this asks whether a match
  // may be recorded here at all, which is the layer under it.
  const roster =
    billingWorkspace.kind === "team"
      ? await deps.loadRoster(billingWorkspace.id)
      : undefined;

  const eligibility = uploadEligibility({
    workspace: billingWorkspace,
    viewerId: userId,
    athlete: athleteOnRow(match, userId),
    roster,
    attachesToLine: match.event_entry_id !== null,
  });

  if (!eligibility.ok) {
    console.log(`${LOG} refused — ${eligibility.reason}`, {
      jobId: job.id,
      matchId: match.id,
      workspaceId: billingWorkspace.id,
      role: billingWorkspace.role,
    });
    // The job is left exactly as found — `uploaded`, untouched — see the
    // header. A reading that could not be obtained (`retryable`) is the
    // roster RPC failing, not a decision about the person: 503 says "try
    // again" where 403 says "no". Both go back as `error`, the field
    // `submit-match-video.ts` records and the wizard shows.
    return NextResponse.json(
      { error: eligibility.message },
      { status: eligibility.retryable ? 503 : 403 },
    );
  }

  const reservation = await deps.reserveQuota({
    jobId: job.id,
    userId,
    workspace: billingWorkspace,
    seconds: billableSeconds,
  });

  if (!reservation.ok) {
    console.log(
      `${LOG} refused — ${reservation.permission ? "not permitted" : "monthly cap"}`,
      {
        jobId: job.id,
        usedSeconds: reservation.usedSeconds,
        capSeconds: reservation.capSeconds,
      },
    );
    return NextResponse.json(
      {
        error: reservation.message,
        usedSeconds: reservation.usedSeconds,
        capSeconds: reservation.capSeconds,
      },
      // 429 is what an exhausted allowance means and it keeps that meaning. A
      // player the program has not authorised is a 403: nothing about waiting
      // for the month to roll over changes the answer.
      { status: reservation.permission ? 403 : 429 },
    );
  }

  // Everything past here must hand the reservation back on failure.
  try {
    // Record what we are about to send. These three have no other home, and
    // the orientation especially must survive the request: Phase 2 maps
    // top-of-frame strokes back onto player1/player2 and has no other
    // authoritative source for which was which.
    await deps.updateJob(job.id, {
      status: "submitting",
      billable_seconds: billableSeconds,
      // Counted, not pinned. This was `1`, which reset the tally on every
      // resubmission and made "how many times has this been tried" a
      // question the column could not answer.
      attempt_count: (job.attempt_count ?? 0) + 1,
      initial_top_player_is_player1: effectiveTopPlayer,
      ad_scoring: vendorRequest.Ad,
      fixed_camera: vendorRequest.FixedCamera,
    });

    // 7. Mint the vendor URL — a read-only SAS on our Azure blob. There is no
    //    processing-started signal; the first thing we hear is the webhook.
    const vendorUrl = await deps.mintVendorUrl({
      jobId: job.id,
      objectKey: job.video_object_key,
    });

    // 8. Submit.
    const response = await deps.submitToVendor({
      ...vendorRequest,
      VideoUrl: vendorUrl.url,
    });

    const rawResponse = response.text;

    if (!response.ok) {
      throw new Error(
        `Provider returned ${response.status}: ${rawResponse.slice(0, 500)}`,
      );
    }

    // Same defensive read the webhook uses. Their response shape is
    // unconfirmed, and parseWebhookPayload already walks nested objects and
    // every casing we have guessed at — a second, narrower copy here would
    // reject shapes the webhook would happily accept.
    let externalJobId: string | null = null;
    try {
      externalJobId = parseWebhookPayload(
        JSON.parse(rawResponse),
      ).externalJobId;
    } catch {
      console.warn(`${LOG} provider response was not JSON`, {
        jobId: job.id,
        body: rawResponse.slice(0, 500),
      });
    }

    if (!externalJobId) {
      // Without it the webhook has nothing to match on, so the job would be
      // accepted and then permanently orphaned. Better to fail loudly now.
      throw new Error(
        "Provider accepted the job but returned no job id — the webhook would " +
          "have nothing to match against.",
      );
    }

    await deps.updateJob(job.id, {
      status: "queued",
      external_job_id: externalJobId,
      submitted_at: new Date().toISOString(),
      video_url_expires_at: vendorUrl.expiresAt?.toISOString() ?? null,
      error_message: null,
    });

    console.log(`${LOG} submitted`, {
      jobId: job.id,
      externalJobId,
      billableSeconds,
    });

    // Pick up any delivery that beat this write — the `after()` block in
    // `route.ts`. Deliberately NOT inside the try above: a throw there runs
    // the catch block, which releases quota and retires the video URL. Undoing
    // a submission the vendor has already accepted, because a bookkeeping
    // fixup failed, would be far worse than the orphan it is fixing.
    deps.afterSubmitted({ jobId: job.id, externalJobId });

    return NextResponse.json({
      jobId: job.id,
      externalJobId,
      status: "queued",
      billableSeconds,
      usedSeconds: reservation.usedSeconds,
      capSeconds: reservation.capSeconds,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    console.error(`${LOG} submission failed`, { jobId: job.id, message });

    // Hand the allowance back and record the credential as retired. Each step
    // is isolated rather than chained: createVideoUrlStrategy() throws
    // SYNCHRONOUSLY when the Azure storage config is incomplete, so a
    // `.catch()` on revoke()'s promise never sees it — and an escape here would
    // skip the one write that matters, leaving the job stuck at 'submitting'
    // forever with the caller getting an unhandled error instead of the 502
    // below.
    await deps.releaseQuota(job.id);

    try {
      await deps.markUrlRetired(job.id);
    } catch {
      /* Best effort, and worth little: this is bookkeeping only — a SAS cannot
         be withdrawn, which is why the method is not called revoke(). It costs
         nothing here because we are on the path where the POST never reached
         the vendor, so nobody outside this system has seen the URL. See
         video-url/azure-sas.ts. */
    }

    const { error: markError } = await deps.updateJob(job.id, {
      status: "failed",
      error_message: message,
    });

    if (markError) {
      console.error(`${LOG} could not mark the job failed`, {
        jobId: job.id,
        error: markError,
      });
    }

    return NextResponse.json(
      { error: "Could not submit this match for analysis.", detail: message },
      { status: 502 },
    );
  }
}
