/**
 * SplitStep results webhook.
 *
 * The vendor POSTs here when a job changes state. Expect at least two
 * deliveries per job (`job_queued`, then `job_completed`), plus retries.
 *
 * NOTHING SLOW BEFORE THE 200. Webhook senders retry on timeout, so inline work
 * produces duplicate deliveries against partial state. The shape is therefore:
 * verify → record → return 200 → do everything else in after().
 *
 * Derivation runs in that after() block, NOT in a Supabase Edge Function as the
 * spec's §2 diagram assumed. That design was written against the 60s Vercel
 * ceiling and an unmeasured workload. The ceiling is real — maxDuration is set
 * explicitly below — but the workload is not: parsing and grading a full match
 * takes about 3 ms and the whole write lands well under two seconds, none of it
 * on the vendor's critical path because the response has already gone. An Edge
 * Function would have meant a second copy of the derivation in Deno, and the
 * player mapping and shot numbering are precisely the subtleties that drift
 * between two copies — each of which misattributes an entire match when it does.
 *
 * What DOES still need building is reprocessing: when DERIVATION_VERSION bumps,
 * every stored match must be rebuilt and no webhook will fire for those jobs
 * again. That wants a paged cron route calling the same deriveAndPublish().
 *
 * A completion carries FOUR urls, all short-lived (7-day) SAS:
 *   • `strokes_url` — the stroke-by-stroke results JSON, downloaded and written
 *     to the `match-results` bucket. This was `sas_url` until September 2026;
 *     the parser accepts both, and the column is still `sas_url`.
 *   • `players_url` / `trajectories_url` — per-frame player tracking and ball
 *     trajectory (September 2026 API; trajectories may be null). Nothing derives
 *     from them yet, so they are fetched LAST in after(), best-effort, once the
 *     work the user actually sees has finished. A miss is recoverable by hand
 *     from the url on the job row for a week.
 *   • `trimmed_video_url` — their trimmed, re-encoded video. Recorded on the job
 *     row and NOT downloaded: it is a lower-bitrate copy that arrived without an
 *     audio track. The video we keep is the athlete's own upload, cut to the
 *     selected window in the browser before upload (lib/video/trim.ts), and it
 *     is never deleted when the job completes.
 *
 * Nothing slow happens before the response. The vendor confirmed a 30s
 * connection timeout and NO retry policy, which makes their timeout the hard
 * deadline: a delivery we fail to answer in time is gone permanently, and a
 * non-2xx buys nothing because nothing retries it. The only work before the 200
 * is recording the envelope, which is what makes everything else recoverable.
 */

import {
  pipelineLog,
  redactSignedUrls,
} from "@/lib/services/splitstep/pipeline-log";
import { NextRequest, NextResponse, after } from "next/server";
import { createHash } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  SIGNATURE_HEADERS,
  verifyWebhookAuth,
} from "@/lib/services/splitstep/webhook-auth";
import {
  parseVendorJson,
  parseWebhookPayload,
  unreadableWebhookReason,
} from "@/lib/services/splitstep/webhook-payload";
import { selectDeliveryStorageKeys } from "@/lib/services/splitstep/delivery-storage-keys";
import { RESULTS_BUCKET } from "@/lib/services/splitstep/config";
import {
  isAllowedResultUrl,
  resultUrlHostname,
} from "@/lib/services/splitstep/result-url-policy";
import { releaseQuota } from "@/lib/services/splitstep/quota";
import {
  isDownloadFailure,
  resubmitJob,
} from "@/lib/services/splitstep/resubmit-job";
import { gradeResults } from "@/lib/services/splitstep/grade-results";
import { secureResults } from "@/lib/services/splitstep/secure-results";
import { deriveAndPublish } from "@/lib/services/splitstep/derive-and-publish";
import { deriveAndStoreBallPaths } from "@/lib/services/splitstep/ball-paths-store";
import {
  archiveTrimmedVideo,
  archiveVendorJson,
} from "@/lib/services/splitstep/vendor-archive";
import {
  notifyAnalysisOutcome,
  notifyUnreadableWebhook,
} from "@/lib/services/notifications/analysis-mail";
import { askOnArrival } from "@/lib/services/ask/arrival";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Set explicitly rather than inherited. The route is bounded by design, but the
 * results download is a network call against a vendor host with no published
 * latency guarantee, and an unset maxDuration silently takes the platform
 * default — which is exactly the kind of thing that is invisible until the one
 * delivery that matters times out.
 */
export const maxDuration = 60;

const LOG = "[splitstep-webhook]";

/**
 * Kept back from `maxDuration` when derivation waits on the review: enough for
 * the `completed` write and the ready mail that follow it.
 */
const DEADLINE_HEADROOM_MS = 8_000;

/* Bucket for raw provider results (created by the 20260805005801 migration).
   Imported rather than re-declared: the verification script reads the same
   bucket, and two literals would drift silently. */

/** Ceiling on the strokes fetch, leaving headroom inside maxDuration. */
const RESULTS_FETCH_TIMEOUT_MS = 25_000;

/**
 * Ceiling on each per-frame file. These run last, after derivation, in what is
 * left of the 60s budget; a frame-per-row file for a long match is tens of
 * megabytes, so the two are fetched in parallel and each gets its own clock
 * rather than sharing one. Whatever does not land in time stays fetchable by
 * hand from `players_url` / `trajectories_url` on the job row.
 */
const FRAME_DATA_FETCH_TIMEOUT_MS = 20_000;

/**
 * The players file's clock. It starts at the top of the after() block and
 * runs beside derivation, so it may take most of the invocation; what does
 * not land goes to the daily archive-vendor-files cron.
 */
const PLAYERS_FETCH_TIMEOUT_MS = 45_000;

/**
 * Tighter clock for the trajectories file when it is fetched ahead of
 * derivation (~4 MB). Past it, derivation runs on the strokes file alone and
 * the url stays on the row, as for any other per-frame miss.
 */
const TRAJECTORIES_BEFORE_DERIVE_TIMEOUT_MS = 8_000;

/**
 * Headers worth keeping, without dragging a credential into the database.
 *
 * Every candidate signature header is redacted along with `cookie`. The NAMES
 * still land in the row, which is the part that identifies where the vendor
 * puts the signature; the values never do.
 */
function safeHeaders(request: NextRequest): Record<string, string> {
  const redacted = new Set<string>([...SIGNATURE_HEADERS, "cookie"]);

  const out: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    out[key] = redacted.has(key.toLowerCase()) ? "[redacted]" : value;
  });
  return out;
}

export async function POST(request: NextRequest) {
  // The clock `maxDuration` runs on. after() work shares it, so derivation is
  // handed a deadline rather than guessing how much of it is left.
  const deadline = Date.now() + maxDuration * 1000 - DEADLINE_HEADROOM_MS;

  // 1. Raw body FIRST, before any parsing or validation can throw. If the
  //    payload differs from the vendor's docs at all, this is the only thing
  //    that will tell us (handoff §3).
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch (err) {
    pipelineLog.error(`${LOG} could not read request body`, err);
    return NextResponse.json({ error: "Unreadable body" }, { status: 400 });
  }

  const redactedBody = redactSignedUrls(rawBody);
  pipelineLog.info(`${LOG} received`, {
    bytes: rawBody.length,
    contentType: request.headers.get("content-type"),
    body: redactedBody.slice(0, 4000),
  });

  // 2. Authenticate. Must run against the exact bytes received — the HMAC is
  //    over the raw body, so re-serializing would break it.
  const auth = verifyWebhookAuth(request, rawBody);
  if (!auth.ok) {
    pipelineLog.error(`${LOG} rejected — ${auth.reason}`);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const verified = auth.verified;

  // 3. Interpret. Never fatal: an unparseable body is still recorded verbatim.
  let parsedJson: unknown = null;
  try {
    parsedJson = rawBody.trim() === "" ? null : parseVendorJson(rawBody);
  } catch {
    pipelineLog.warn(`${LOG} body is not valid JSON — recording raw only`);
  }

  const payload = parseWebhookPayload(parsedJson);
  pipelineLog.info(`${LOG} interpreted`, {
    externalJobId: payload.externalJobId,
    event: payload.event,
    nextStatus: payload.nextStatus,
    matchId: payload.matchId,
    hasStrokesUrl: Boolean(payload.strokesUrl),
    hasPlayersUrl: Boolean(payload.playersUrl),
    hasTrajectoriesUrl: Boolean(payload.trajectoriesUrl),
    hasTrimmedVideoUrl: Boolean(payload.trimmedVideoUrl),
  });

  const fingerprint = createHash("sha256").update(rawBody).digest("hex");
  const supabase = createAdminClient();

  // 4. Record durably. This is the step that must succeed before we return 200 —
  //    it is what makes the envelope, and the urls inside it, recoverable by
  //    hand if everything downstream fails.
  const { data, error } = await supabase
    .rpc("record_splitstep_webhook", {
      p_fingerprint: fingerprint,
      p_raw_body: rawBody,
      p_parsed: parsedJson,
      p_headers: safeHeaders(request),
      p_signature_verified: verified,
      p_external_job_id: payload.externalJobId,
      p_event: payload.event,
      p_next_status: payload.nextStatus,
      p_sas_url: payload.strokesUrl,
      p_trimmed_video_url: payload.trimmedVideoUrl,
      p_error_message: payload.errorMessage,
      p_match_id: payload.matchId,
      p_error_code: payload.errorCode,
      p_error_category: payload.errorCategory,
      p_error_step: payload.errorStep,
      p_players_url: payload.playersUrl,
      p_trajectories_url: payload.trajectoriesUrl,
    })
    .single();

  if (error || !data) {
    // 500 on purpose: a retry is the only path back to this payload, and the
    // record call is idempotent, so being retried costs nothing.
    pipelineLog.error(
      `${LOG} FAILED TO RECORD — returning 500 to invite a retry`,
      {
        error: error?.message,
        fingerprint,
      },
    );
    return NextResponse.json(
      { error: "Failed to record delivery" },
      { status: 500 },
    );
  }

  const record = data as {
    delivery_id: string;
    matched_job_id: string | null;
    match_id: string | null;
    created_by: string | null;
    job_status: string | null;
    results_object_key: string | null;
    already_stored: boolean;
    trimmed_object_key: string | null;
    players_object_key: string | null;
    trajectories_object_key: string | null;
  };

  // A signed delivery we cannot act on is the vendor changing what they send:
  // say so now, not when the status poll calls the job lost. Unsigned ones are
  // not mailed — anyone can post those.
  const unreadable = verified
    ? unreadableWebhookReason(parsedJson, payload)
    : null;
  if (unreadable) {
    pipelineLog.warn(`${LOG} UNREADABLE — ${unreadable}`, {
      deliveryId: record.delivery_id,
    });
    after(() =>
      notifyUnreadableWebhook({
        deliveryId: record.delivery_id,
        reason: unreadable,
        externalJobId: payload.externalJobId,
        bodyExcerpt: redactedBody.slice(0, 600),
      }),
    );
  }

  if (!record.matched_job_id) {
    // Not an error: the payload is safe in splitstep_webhook_deliveries, and a
    // retry would orphan identically, so 200 is honest. Loud because during the
    // pilot this most likely means the vendor's job-id field is not named what
    // the docs say.
    pipelineLog.warn(
      `${LOG} ORPHAN — no processing_jobs row matched this delivery`,
      {
        deliveryId: record.delivery_id,
        externalJobId: payload.externalJobId,
        matchId: payload.matchId,
        // The re-queue fallback (record_splitstep_webhook) runs only on a
        // signed delivery, so false here explains a re-queue that orphaned.
        signatureVerified: verified,
      },
    );
  }

  // 5. Results download — AFTER the response is committed, not before.
  //
  // The vendor has a 30s connection timeout and NO retry policy. Downloading
  // inline meant a slow vendor host could hold the response past their timeout,
  // and a timed-out delivery is gone permanently — there is no second attempt.
  // So the 200 goes out as soon as the envelope is durable, and the fetch runs
  // in after(), still inside this invocation's maxDuration.
  //
  // The old code returned 500 here "to invite a retry". That was wrong: they
  // confirmed no retry policy exists, so a 500 bought nothing and only risked
  // the timeout. Recovery is by hand from the stored strokes url, or via
  // GET {BASE_URL}/jobs/{job_id}, which the docs now expose.
  //
  // Gated on the row, like the failed branch below. A job the user cancelled
  // while it was queued is terminal (`splitstep_status_rank('cancelled') = 9`),
  // and they were told nothing would be analysed. If the vendor had already
  // picked it up when the DELETE raced it, a `job_completed` can still land:
  // the envelope is recorded above, and nothing is secured, graded or derived.
  const completedOnCancelledJob =
    payload.nextStatus === "completed" && record.job_status === "cancelled";
  if (completedOnCancelledJob) {
    pipelineLog.warn(
      `${LOG} SKIPPED — job_completed for a cancelled job; nothing secured or derived`,
      {
        deliveryId: record.delivery_id,
        jobId: record.matched_job_id,
        externalJobId: payload.externalJobId,
      },
    );
  }

  if (payload.nextStatus === "completed" && !completedOnCancelledJob) {
    const deliveryId = record.delivery_id;
    const jobId = record.matched_job_id;

    // Four independent assets with four independent guards — everything the
    // completion links to is kept, for whatever is built on it later. Gating
    // them all on `already_stored`, which is only ever about the strokes JSON,
    // would mean a download that failed once never got another chance, on a
    // url that expires. A miss here is retried daily by the
    // archive-vendor-files cron while the url lives.
    //
    // The trimmed video is a lower-bitrate re-encode without audio; playback
    // prefers the athlete's own upload (match-video-choice.ts), so our copy is
    // the archive and the fallback, never the first choice.
    const strokesUrl = record.already_stored ? null : payload.strokesUrl;
    const playersUrl = record.players_object_key ? null : payload.playersUrl;
    const trajectoriesUrl = record.trajectories_object_key
      ? null
      : payload.trajectoriesUrl;
    const trimmedVideoUrl = record.trimmed_object_key
      ? null
      : payload.trimmedVideoUrl;

    // Pick this delivery's storage keys. The retain/orphan policy and its full
    // rationale live in selectDeliveryStorageKeys.
    const { resultsKey, playersKey, trajectoriesKey, trimmedKey } =
      selectDeliveryStorageKeys({
        jobId,
        createdBy: record.created_by,
        matchId: record.match_id,
        externalJobId: payload.externalJobId,
        deliveryId,
      });

    if (strokesUrl || playersUrl || trajectoriesUrl || trimmedVideoUrl) {
      after(async () => {
        // The trimmed video first: one Start Copy request, and Azure moves the
        // bytes on its own clock, so nothing below waits on it.
        if (trimmedVideoUrl && trimmedKey && jobId) {
          const copied = await archiveTrimmedVideo({
            supabase,
            jobId,
            sourceUrl: trimmedVideoUrl,
            blobName: trimmedKey,
          });
          if (copied.ok) {
            pipelineLog.info(`${LOG} trimmed video copy ${copied.copyStatus}`, {
              jobId,
              blobName: trimmedKey,
            });
          } else {
            pipelineLog.error(
              `${LOG} trimmed video copy FAILED — the archive-vendor-files cron retries while the url lives`,
              { jobId, error: copied.error },
            );
          }
        }

        // The players file, started now and awaited last. It is 30–80 MB, so
        // it runs beside derivation on its own clock instead of in whatever
        // is left after it — the old order lost it on 10 of 14 jobs.
        const playersStored = storeFrameData({
          supabase,
          jobId,
          timeoutMs: PLAYERS_FETCH_TIMEOUT_MS,
          files: [{ kind: "players", url: playersUrl, objectKey: playersKey }],
        });

        // Is the analysis durably ours? Either an earlier delivery stored it or
        // this one does. Tracked rather than assumed, because it is what gates
        // grading and derivation below.
        let resultsSecured = record.already_stored;

        // Set only when this delivery did the download. Left undefined on a
        // redelivery, which makes gradeResults read from storage instead.
        let resultsBody: string | undefined;

        // Where the analysis actually is, which is not always where this
        // request would compute it to be. A delivery that arrived before its
        // job id was known was stored under the `orphaned/…` fallback below;
        // once adopt-deliveries.ts matches it to a job, the row still points
        // at that key. Trust the recorded key over a recomputed one, and the
        // key we just wrote over both.
        let storedKey = record.results_object_key ?? resultsKey;

        if (strokesUrl) {
          // Download, store, finalize and log — extracted to secure-results.ts
          // so the reconciler can run the same step without a delivery.
          const secured = await secureResults({
            supabase,
            deliveryId,
            jobId,
            strokesUrl,
            objectKey: resultsKey,
            timeoutMs: RESULTS_FETCH_TIMEOUT_MS,
            logPrefix: LOG,
          });

          resultsSecured = secured.resultsSecured;

          if (secured.resultsSecured) {
            resultsBody = secured.body;
            storedKey = secured.objectKey;
          }
        }

        // Grade after the results are stored. It is purely informational, so it
        // must never delay securing an asset that expires.
        //
        // The source video is deliberately NOT deleted here any more. It is the
        // file the film room plays and the only way to re-run a job; the old
        // delete-after-results policy is retired (docs/video-pipeline-overview.md).
        //
        // Gated on resultsSecured rather than on this delivery having done the
        // download, so a redelivery still grades a job whose first attempt
        // stored the analysis but failed to grade it.
        //
        // The trajectories file first, though: derivation reads it for its own
        // line calls (derivation/line-calls.ts), so it has to be in the bucket
        // before deriveAndPublish runs. It is ~4 MB on a bounded fetch clock;
        // a miss only means this derivation falls back to the strokes file.
        await storeFrameData({
          supabase,
          jobId,
          timeoutMs: TRAJECTORIES_BEFORE_DERIVE_TIMEOUT_MS,
          files: [
            {
              kind: "trajectories",
              url: trajectoriesUrl,
              objectKey: trajectoriesKey,
            },
          ],
        });

        if (jobId && resultsSecured) {
          await gradeResults({
            supabase,
            jobId,
            objectKey: storedKey,
            body: resultsBody,
          });

          // Then derive. After grading, so `derivation_quality` is already on
          // the row, and after the results store because it is re-runnable by
          // hand from the stored results — everything above secures an asset
          // that expires.
          //
          // Not an Edge Function. Measured at well under two seconds against a
          // route that already declares maxDuration = 60 and has returned its
          // 200 before any of this starts. The spec asked for one against an
          // unmeasured workload; the workload turned out not to need it.
          // The one slow part is the review it waits on before announcing
          // `completed` (~15–25s), bounded by `deadline`.
          //
          // Ask's first question about the match rides along: asked for the
          // uploader beside the review wait, once per match, and its
          // headline goes on the "analysis ready" mail (`ask/arrival.ts`).
          await deriveAndPublish({
            supabase,
            jobId,
            deadline,
            onArrival: ({ matchId, deadline: by }) =>
              askOnArrival({ supabase, jobId, matchId, deadline: by }),
          });
        }

        // The players file, started at the top of this block. Nothing in
        // derivation reads it yet — it is kept so metrics can be built on it
        // without waiting another week for a vendor url.
        await playersStored;

        // Ball paths, after the trajectories file they are derived from is in
        // the bucket — the store function reads it back out by the key recorded
        // on the row. It reports rather than throws, and the try/catch is the
        // second lock: nothing here may reject a callback whose real work is
        // already done. `skipped` is normal (a null trajectories_url, or the
        // store above missing), so it logs as information.
        if (jobId) {
          try {
            const ballPaths = await deriveAndStoreBallPaths({
              supabase,
              jobId,
            });
            if (ballPaths.status === "failed") {
              pipelineLog.error(
                `${LOG} ball paths FAILED — re-run scripts/splitstep-ball-paths.ts --job ${jobId}`,
                { jobId, error: ballPaths.error },
              );
            } else {
              pipelineLog.info(`${LOG} ball paths ${ballPaths.status}`, {
                jobId,
                ...ballPaths,
              });
            }
          } catch (err) {
            pipelineLog.error(`${LOG} ball paths threw`, {
              jobId,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
      });
    }
  }

  // A job the vendor accepted and then failed on kept its reserved minutes
  // forever. releaseQuota had exactly one caller — the submit-failure path in
  // api/splitstep/jobs, which fires only when the POST itself throws — so a
  // failure during processing left the allowance spent with nothing to show
  // for it. Against a 2-hour monthly cap, that is the leak that made automatic
  // submission dangerous rather than merely bold — the vendor's cancel
  // (`DELETE {SPLITSTEP_API_URL}/{id}`, behind POST /api/splitstep/jobs/[jobId]/
  // cancel) only removes a job while it is still queued, and answers 409
  // JOB_NOT_REMOVABLE once processing starts, so it recovers nothing here.
  //
  // Safe to run on a redelivery: release_processing_quota() updates only where
  // `released = false`, so a second failure notice for the same job credits
  // nothing.
  //
  // Nothing is reconciled on success, deliberately. The vendor's completion
  // payload carries no duration, and the reservation is already the trim window
  // we asked them to analyse — so the estimate IS the actual, and calling
  // reconcileQuota() would mean inventing a number to pass it.
  //
  // Gated on the row, not the payload. `job_status` is what the RPC's
  // rank-guarded update left behind — never backwards, never off a terminal
  // state — so a `job_failed` for a job already `completed`, `deriving` or
  // `derivation_failed` leaves it there, and must release no quota, send no
  // failure mail and trigger no resubmit. Keying on `payload.nextStatus` did
  // all three for any delivery that merely claimed a failure.
  //
  // The payload must still say failed too. A late `job_processing` landing on
  // a row that is already `failed` carries no error fields, so it would read
  // as non-retryable and mail "analysis failed" over a job that was quietly
  // auto-resubmitted — the mail that failure deliberately never sent.
  if (
    payload.nextStatus === "failed" &&
    record.job_status === "failed" &&
    record.matched_job_id
  ) {
    const failedJobId = record.matched_job_id;
    // Read once outside after(): the auto-retry decision keys on THIS
    // delivery's error fields, not on whatever the row says by the time the
    // block runs. The classifier itself lives in resubmit-job.ts — one rule,
    // shared with the reconciler's polled-failure path.
    const retryable = isDownloadFailure(payload.errorCode, payload.errorStep);

    after(async () => {
      // Release first: the child's reservation below is a fresh spend against
      // the same budget, and holding both at once could refuse a retry the
      // budget actually has room for.
      await releaseQuota(supabase, failedJobId);
      pipelineLog.info(`${LOG} quota released for failed job`, {
        jobId: failedJobId,
      });

      // Auto-resubmit — this failure class and ONLY this class. A download
      // failure with a valid SAS means the file, submission and metadata are
      // all good, so retrying is nearly free and nearly always works. The one
      // real occurrence arrived as code INTERNAL_ERROR with step
      // 'downloading_video', which is why step outranks code here: a bare
      // INTERNAL_ERROR anywhere else says "contact support", and
      // video-quality rejections can never succeed on retry. Unknown codes
      // are surfaced, never retried.
      //
      // resubmitJob() itself enforces the rest: one automatic attempt per
      // chain, the 3-attempt ceiling, no non-terminal duplicate, and that the
      // source blob still exists.
      // "Email me if analysis fails" — only once the failure is final. A
      // download failure about to be retried is not yet news; the child job
      // will report its own outcome.
      if (!retryable) {
        await notifyAnalysisOutcome({
          supabase,
          jobId: failedJobId,
          outcome: "failed",
        });
        return;
      }

      const result = await resubmitJob({
        supabase,
        jobId: failedJobId,
        auto: true,
      });

      if (result.ok) {
        pipelineLog.info(`${LOG} auto-resubmitted after download failure`, {
          failedJobId,
          newJobId: result.jobId,
          externalJobId: result.externalJobId,
        });
      } else {
        pipelineLog.warn(
          `${LOG} auto-resubmit declined — surfacing to the user`,
          {
            failedJobId,
            reason: result.reason,
            message: result.message,
          },
        );
        await notifyAnalysisOutcome({
          supabase,
          jobId: failedJobId,
          outcome: "failed",
        });
      }
    });
  }

  // Grading AND derivation both run in the completed-branch after() above, and
  // neither is an Edge Function. The spec's §2 design assumed one because of the
  // 60-second Vercel ceiling against an unmeasured workload: parsing and grading
  // is ~3 ms and the whole write is well under two seconds, while after() has
  // already sent the 200, which was the other reason given. A Deno copy of the
  // derivation would have been the more expensive mistake — the player mapping
  // and the shot numbering are exactly the subtleties that drift between two
  // copies, and both misattribute an entire match when they do.
  //
  // Still open, and genuinely needed: reprocessing. When DERIVATION_VERSION
  // bumps, every stored match must be rebuilt and no webhook will ever fire for
  // those jobs again. That wants a paged, authenticated route driven by a
  // scheduler (behind `CRON_SECRET`, excluded from the proxy matcher) calling the same
  // deriveAndPublish() this does, not a second implementation.

  return NextResponse.json({ received: true, deliveryId: record.delivery_id });
}

/**
 * The per-frame files (`players_url`, `trajectories_url`), fetched in parallel
 * and recorded on the job row as each one lands.
 *
 * Best-effort by construction, like every cleanup step in after(): a failure
 * logs the recovery path and moves on, because nothing downstream depends on
 * these bytes yet and the url stays on the row for a week. Entries with no url
 * are skipped — a redelivery whose file is already stored arrives here with
 * null, and so does a completion where the vendor sent `trajectories_url: null`.
 *
 * Recorded per file rather than once: a job that got its players file but not
 * its trajectories should say exactly that, so the redelivery guard in the
 * route re-fetches only what is missing.
 */
async function storeFrameData(params: {
  supabase: ReturnType<typeof createAdminClient>;
  jobId: string | null;
  files: Array<{
    kind: "players" | "trajectories";
    url: string | null;
    objectKey: string;
  }>;
  /** Per-file fetch clock. Defaults to FRAME_DATA_FETCH_TIMEOUT_MS. */
  timeoutMs?: number;
}): Promise<void> {
  const {
    supabase,
    jobId,
    files,
    timeoutMs = FRAME_DATA_FETCH_TIMEOUT_MS,
  } = params;

  await Promise.all(
    files
      .filter((f) => f.url)
      .map(async ({ kind, url, objectKey }) => {
        // The players file is gzipped: a long match's is 60–80 MB and the
        // bucket caps an object at 50 MB (vendor-archive.ts).
        const stored = await archiveVendorJson({
          supabase,
          url: url as string,
          objectKey,
          timeoutMs,
          gzip: kind === "players",
        });

        if (!stored.ok) {
          pipelineLog.error(
            `${LOG} ${kind} download FAILED — the archive-vendor-files cron ` +
              `retries daily while processing_jobs.${kind}_url lives`,
            { jobId, objectKey, error: stored.error },
          );
          return;
        }

        pipelineLog.info(`${LOG} ${kind} stored`, {
          jobId,
          objectKey,
          bytes: stored.bytes,
        });

        // An orphaned delivery has no row to record the key on; the bytes are
        // still safe under the orphaned/ key, which is the point.
        if (!jobId) return;

        const column =
          kind === "players" ? "players_object_key" : "trajectories_object_key";
        const { error } = await supabase
          .from("processing_jobs")
          .update({ [column]: stored.objectKey })
          .eq("id", jobId);

        if (error) {
          // The bytes are stored under a key nothing points at. Loud, because
          // the only way back is reading this line.
          pipelineLog.error(
            `${LOG} ${kind} stored but ${column} was NOT recorded — a redelivery will fetch it again`,
            { jobId, objectKey, error: error.message },
          );
        }
      }),
  );
}

/**
 * Liveness check, so the endpoint URL can be handed over and confirmed
 * reachable before either side has wired anything up. Returns nothing that is
 * not already public knowledge to whoever holds the URL.
 */
export async function GET() {
  return NextResponse.json({
    endpoint: "splitstep-webhook",
    status: "ready",
    method: "POST",
  });
}
