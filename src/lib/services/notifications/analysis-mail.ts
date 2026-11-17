import type { SupabaseClient } from "@supabase/supabase-js";
import {
  analysisFailedEmail,
  analysisFailedInternalEmail,
  analysisReadyEmail,
  analysisVerifiedEmail,
  sendEmail,
  webhookUnreadableInternalEmail,
  INTERNAL_ALERTS_ADDRESS,
} from "@/lib/services/email";
import { programDisplayName } from "@/lib/data/programs-server";
import {
  formatScoreText,
  playedSets,
  scoreSetsFrom,
  type RawMatchScore,
} from "@/lib/ui/score-format";
import {
  chainAttempts,
  classifyFailure,
  jobRecoveryFacts,
  type RecoveryClass,
} from "@/lib/data/match-analysis";
import { verificationPendingFor } from "@/lib/data/match-verification";
import {
  jobVideoSeconds,
  type JobVideoSpan,
} from "@/lib/services/labels/video-seconds";
import { alreadySent, claimSend, getNotificationPrefs } from "./should-notify";
import { readReprocessParent } from "@/lib/services/splitstep/reprocess";

const LOG = "[notifications:analysis]";

export type AnalysisOutcome = "ready" | "failed";

/**
 * The Stage fact on the internal failure alert.
 *
 * `derivation_failed` is our own step after a vendor success, so it stands
 * alone; a vendor `failed` carries the step it named, when it named one.
 * Pure so it is testable offline.
 */
export function analysisFailureStage(job: {
  status: string | null;
  error_step: string | null;
}): string {
  if (job.status === "derivation_failed") return "derivation_failed";
  return job.error_step ? `failed · ${job.error_step}` : "failed";
}

/**
 * Tell the uploader their analysis finished — or did not.
 *
 * Runs after the job row has already settled (`completed`, `failed` or
 * `derivation_failed`); this only reads. It answers the two switches on
 * Settings › Preferences that have promised this email since the page shipped,
 * and it is keyed per job and outcome in `notification_sends`, so a vendor
 * redelivery, a polled failure landing after a webhook, or a derivation re-run
 * from the CLI cannot produce a second copy.
 *
 * Never throws. It runs inside the webhook's `after()` behind steps that
 * secure expiring assets, and inside `deriveAndPublish()`'s try — an exception
 * here must not be mistaken for a derivation failure.
 */
export async function notifyAnalysisOutcome(params: {
  supabase: SupabaseClient;
  jobId: string;
  outcome: AnalysisOutcome;
  /**
   * Ask's first answer about the match (`src/lib/services/ask/arrival.ts`),
   * when the outcome is `ready` and it was written in time: its headline
   * goes on the mail with a second button into the conversation. Absent or
   * null, the mail reads as it always has.
   */
  ask?: { headline: string; conversationId: string } | null;
}): Promise<void> {
  const { supabase, jobId, outcome, ask = null } = params;
  try {
    const { data: job, error: jobError } = await supabase
      .from("processing_jobs")
      .select(
        "created_by, match_id, status, error_code, error_category, error_step, error_message, video_object_key, results_object_key, completed_at, start_time_seconds, end_time_seconds, billable_seconds",
      )
      .eq("id", jobId)
      .maybeSingle();

    if (jobError || !job) {
      console.warn(`${LOG} job not readable, nobody mailed`, {
        jobId,
        error: jobError?.message,
      });
      return;
    }

    const uploaderId = job.created_by as string | null;
    const matchId = job.match_id as string | null;

    // The internal copy runs first and on its own: it ignores the uploader's
    // preferences and still fires when the uploader's account is gone.
    if (outcome === "failed" && matchId) {
      await notifyInternalFailure(supabase, {
        jobId,
        matchId,
        uploaderId,
        stage: analysisFailureStage({
          status: job.status as string | null,
          error_step: job.error_step as string | null,
        }),
        errorCode: (job.error_code as string | null) || null,
        errorMessage: (job.error_message as string | null) || null,
      });
    }

    // A retained match whose uploader deleted their account has nobody to tell.
    if (!uploaderId || !matchId) return;

    // An admin reprocess (splitstep/reprocess.ts) is invisible to the
    // athlete: their report was already "ready", and a reprocess that fails
    // leaves it standing. The internal failure copy above still went out.
    if ((await readReprocessParent(supabase, jobId)).reprocess) {
      console.log(`${LOG} reprocess job — athlete not mailed`, {
        jobId,
        outcome,
      });
      return;
    }

    // Which recovery class the athlete-facing copy should use — decided the
    // same way the matches list and match page decide it (classifyFailure()),
    // so the email never disagrees with what the UI is already showing.
    // `attemptsUsed` is the real chain count (chainAttempts() over every job
    // row on this match), not a stand-in, because it is what separates a
    // plain "retry" from the "tried three times, contact us" wait_or_ask
    // copy — a mistake here would tell someone to press a button the retry
    // route will refuse.
    let failureClass: RecoveryClass | null = null;
    if (outcome === "failed") {
      const facts = jobRecoveryFacts({
        status: job.status as string,
        error_code: job.error_code as string | null,
        error_category: job.error_category as string | null,
        error_step: job.error_step as string | null,
        hasVideo: Boolean(job.video_object_key),
        hasResults: Boolean(job.results_object_key),
      });
      const { data: chainRows } = await supabase
        .from("processing_jobs")
        .select("id, resubmitted_from_job_id, status")
        .eq("match_id", matchId);
      const attemptsUsed = chainRows ? chainAttempts(chainRows, jobId) : 1;
      failureClass = classifyFailure({ ...facts, attemptsUsed });

      // `stats_unavailable` is a deterministic derivation refusal, not a
      // failure — the match renders normally with its unreconciled-score
      // caveat (T18), so there is nothing to email the athlete about.
      if (failureClass === "stats_unavailable") {
        console.warn(
          `${LOG} stats_unavailable — no athlete email (by design)`,
          {
            jobId,
          },
        );
        return;
      }

      if (!failureClass) {
        console.warn(
          `${LOG} failed outcome but the job didn't classify as a failure, athlete email skipped`,
          { jobId, status: job.status },
        );
        return;
      }
    }

    const key =
      outcome === "ready" ? "notifyAnalysisReady" : "notifyAnalysisFailed";
    const prefs = await getNotificationPrefs([uploaderId]);
    if (!prefs.get(uploaderId)?.[key]) return;

    const [{ data: match }, { data: user }] = await Promise.all([
      supabase
        .from("matches")
        .select("player1_name, player2_name, score, date, program_id")
        .eq("id", matchId)
        .maybeSingle(),
      supabase.from("users").select("email").eq("id", uploaderId).maybeSingle(),
    ]);

    const to = (user?.email as string | null)?.trim();
    if (!to || !match) return;

    // Claimed after the cheap reads and before the render: a claim that then
    // finds no address would leave a row that blocks a later, correct send.
    if (!(await claimSend(`analysis_${outcome}:${jobId}`))) return;

    const matchTitle = `${match.player1_name} vs. ${match.player2_name}`;
    const matchContext = await describeContext(supabase, {
      programId: match.program_id as string | null,
      date: match.date as string | null,
    });

    const message =
      outcome === "ready"
        ? analysisReadyEmail({
            to,
            matchId,
            matchTitle,
            matchContext,
            score:
              formatScoreText(
                playedSets(scoreSetsFrom(match.score as RawMatchScore | null)),
              ) || "Score not entered",
            ask,
            verificationPending: readyVerificationPending(job),
          })
        : analysisFailedEmail({
            to,
            matchId,
            matchTitle,
            matchContext,
            // Non-null: outcome === "failed" always sets failureClass above,
            // or returns before reaching here.
            failureClass: failureClass as RecoveryClass,
            errorCode: (job.error_code as string | null) || null,
            errorMessage: (job.error_message as string | null) || null,
          });

    const sent = await sendEmail(message);
    if (!sent.ok) {
      console.warn(`${LOG} ${outcome} email not delivered`, {
        jobId,
        error: sent.error,
      });
    }
  } catch (error) {
    console.error(`${LOG} threw`, {
      jobId,
      outcome,
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Whether the ready mail may say "Verification pending": the report's own
 * rule (`verificationPendingFor`), fed from the job that just completed. No
 * labeller holds a match whose results landed seconds ago, so `labelling` is
 * false; `results_at` is the job's `completed_at`, or now when the row has not
 * been stamped yet (`deriveAndPublish` writes `completed` just before this).
 */
export function readyVerificationPending(
  job: JobVideoSpan & { completed_at: string | null },
  now: Date = new Date(),
): boolean {
  return verificationPendingFor({
    results_at: job.completed_at ?? now.toISOString(),
    has_video: jobVideoSeconds(job) > 0,
    labelling: false,
  });
}

/**
 * "Your match is Verified by Advantage" — to the player who already had the
 * ready mail for this job, after a label publish verified the match.
 *
 * The caller (`writeLabelSessionComplete`) calls this only on a session's
 * FIRST publish (`published_at` was null) that verified a match which was NOT
 * verified before it. Here the rest of the rule:
 *
 *  - no other label session on the match has ever published. Together with
 *    the caller's check this makes it the match's first verification: a
 *    re-publish, a retry after a publish that took the badge off and then
 *    failed to verify, and anything published before this shipped (job
 *    94581238, whose player was told by hand) never mail;
 *  - only after a ready mail went out for the match (`readyMailJob`): the
 *    session's own job, else whichever of the match's jobs was announced (a
 *    match analysed again after its session was seeded). No ready mail (the
 *    switch was off, the account had no address, an admin reprocess) means
 *    the player was never told about the automatic numbers, so there is
 *    nothing to correct. Read with `alreadySent`, never claimed: that key is
 *    the ready mail's;
 *  - the same switch as the ready mail, "Email me when analysis is ready",
 *    read now: someone who turned it off since gets nothing;
 *  - to that job's uploader, once per job, `analysis_verified:<job_id>`,
 *    claimed after the cheap reads for the same reason `notifyAnalysisOutcome`
 *    does.
 *
 * Never throws: it runs after the labels are published and the session is
 * closed, and a failure here must not read as a failed publish.
 */
export async function notifyAnalysisVerified(params: {
  supabase: SupabaseClient;
  /** The label session's own job (`label_sessions.job_id`). */
  jobId: string;
  /** The match the publish verified (`label_sessions.match_id`). */
  matchId: string;
  /** The session that was just published. */
  sessionId: string;
}): Promise<void> {
  const { supabase, jobId, matchId, sessionId } = params;
  try {
    // Only the match's first verification is news. Any other label session
    // on this match that has ever published means the player's report was
    // verified before (and possibly told so by hand) — this publish is a
    // correction to a verified match, not the check the ready mail promised.
    const { data: earlier, error: earlierError } = await supabase
      .from("label_sessions")
      .select("id")
      .eq("match_id", matchId)
      .neq("id", sessionId)
      .not("published_at", "is", null)
      .limit(1);
    if (earlierError || (earlier?.length ?? 0) > 0) {
      console.log(`${LOG} match published before — no verified mail`, {
        matchId,
        error: earlierError?.message,
      });
      return;
    }

    const announced = await readyMailJob(supabase, { jobId, matchId });
    if (!announced) {
      console.log(`${LOG} verified, but no ready mail went out — none sent`, {
        jobId,
        matchId,
      });
      return;
    }

    const uploaderId = announced.createdBy;
    if (!uploaderId) return;

    const prefs = await getNotificationPrefs([uploaderId]);
    if (!prefs.get(uploaderId)?.notifyAnalysisReady) return;

    const [{ data: match }, { data: user }] = await Promise.all([
      supabase
        .from("matches")
        .select("player1_name, player2_name")
        .eq("id", matchId)
        .maybeSingle(),
      supabase.from("users").select("email").eq("id", uploaderId).maybeSingle(),
    ]);

    const to = (user?.email as string | null)?.trim();
    if (!to || !match) return;

    if (!(await claimSend(`analysis_verified:${announced.id}`))) return;

    const sent = await sendEmail(
      analysisVerifiedEmail({
        to,
        matchId,
        matchTitle: `${match.player1_name} vs. ${match.player2_name}`,
      }),
    );
    if (!sent.ok) {
      console.warn(`${LOG} verified email not delivered`, {
        jobId,
        error: sent.error,
      });
    }
  } catch (error) {
    console.error(`${LOG} verified notice threw`, {
      jobId,
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * The job whose ready mail announced this match, with its uploader, or null
 * when none did. The session's own job first; otherwise the match's other
 * jobs, newest first, since a match analysed again after its session was
 * seeded announced the newer one.
 */
async function readyMailJob(
  supabase: SupabaseClient,
  input: { jobId: string; matchId: string },
): Promise<{ id: string; createdBy: string | null } | null> {
  const { data: jobs, error } = await supabase
    .from("processing_jobs")
    .select("id, created_by, created_at")
    .eq("match_id", input.matchId)
    .order("created_at", { ascending: false });
  if (error || !jobs) return null;

  const ordered = [
    ...jobs.filter((job) => job.id === input.jobId),
    ...jobs.filter((job) => job.id !== input.jobId),
  ];
  // One read per job, together: the order above still picks the winner.
  const sent = await Promise.all(
    ordered.map((job) => alreadySent(`analysis_ready:${job.id as string}`)),
  );
  const index = sent.indexOf(true);
  if (index >= 0) {
    const job = ordered[index];
    return {
      id: job.id as string,
      createdBy: (job.created_by as string | null) ?? null,
    };
  }
  return null;
}

/**
 * Mail `INTERNAL_ALERTS_ADDRESS` that one job failed.
 *
 * Keyed `analysis_failed_internal:<job_id>`, apart from the athlete's
 * `analysis_failed:<job_id>`, so neither send can spend the other's claim.
 * Claimed before the reads: the alerts inbox always exists, so there is no
 * "claimed but nobody to mail" case to guard against.
 *
 * Never throws: it has its own try so a failure here cannot skip the
 * athlete's email that runs after it.
 */
async function notifyInternalFailure(
  supabase: SupabaseClient,
  input: {
    jobId: string;
    matchId: string;
    uploaderId: string | null;
    stage: string;
    errorCode: string | null;
    errorMessage: string | null;
  },
): Promise<void> {
  const { jobId, matchId, uploaderId } = input;
  try {
    if (!(await claimSend(`analysis_failed_internal:${jobId}`))) return;

    const [{ data: match }, { data: user }] = await Promise.all([
      supabase
        .from("matches")
        .select("player1_name, player2_name")
        .eq("id", matchId)
        .maybeSingle(),
      uploaderId
        ? supabase
            .from("users")
            .select("email, first_name, last_name")
            .eq("id", uploaderId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const uploaderName =
      [
        (user?.first_name as string | null)?.trim(),
        (user?.last_name as string | null)?.trim(),
      ]
        .filter(Boolean)
        .join(" ") || null;

    const sent = await sendEmail(
      analysisFailedInternalEmail({
        to: INTERNAL_ALERTS_ADDRESS,
        jobId,
        matchId,
        matchTitle: match
          ? `${match.player1_name} vs. ${match.player2_name}`
          : `Match ${matchId}`,
        stage: input.stage,
        errorCode: input.errorCode,
        errorMessage: input.errorMessage,
        uploaderName,
        uploaderEmail: (user?.email as string | null)?.trim() || null,
      }),
    );

    if (!sent.ok) {
      console.warn(`${LOG} internal failure alert not delivered`, {
        jobId,
        error: sent.error,
      });
    }
  } catch (error) {
    console.error(`${LOG} internal failure alert threw`, {
      jobId,
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * "Stanford Men's Tennis · 14 Sep 2026", or the date alone for a personal
 * match. UTC on purpose — the same rule every email date follows
 * (`docs/email-system.md` §5).
 */
export async function describeContext(
  supabase: SupabaseClient,
  input: { programId: string | null; date: string | null },
): Promise<string> {
  const when = input.date
    ? new Date(input.date).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      })
    : null;

  if (!input.programId) return when ?? "Personal match";

  const { data: program } = await supabase
    .from("programs")
    .select("school_name, team")
    .eq("id", input.programId)
    .maybeSingle();

  const name = program
    ? programDisplayName(
        program.school_name as string,
        (program.team as string | null) ?? null,
      )
    : null;

  return [name, when].filter(Boolean).join(" · ") || "Team match";
}

/**
 * Tell the alerts inbox that a signed SplitStep delivery could not be read.
 *
 * Once per reason per UTC day (`claimSend`), not per delivery: a new vendor
 * event we do not map — a heartbeat, a cancel echo — would otherwise mail once
 * for every job, every time. The first delivery of the day is the one named;
 * the rest are in `splitstep_webhook_deliveries` under the same reason. Never
 * throws: it runs in the webhook's `after()`, where an exception would only
 * cost the log line.
 */
export async function notifyUnreadableWebhook(
  input: {
    deliveryId: string;
    reason: string;
    externalJobId: string | null;
    bodyExcerpt: string;
  },
  now: Date = new Date(),
): Promise<void> {
  try {
    const day = now.toISOString().slice(0, 10);
    if (!(await claimSend(`webhook_unreadable:${input.reason}:${day}`))) return;
    const sent = await sendEmail(
      webhookUnreadableInternalEmail({ to: INTERNAL_ALERTS_ADDRESS, ...input }),
    );
    if (!sent.ok) {
      console.warn(`${LOG} unreadable-webhook alert not delivered`, {
        deliveryId: input.deliveryId,
        error: sent.error,
      });
    }
  } catch (error) {
    console.error(`${LOG} unreadable-webhook alert threw`, {
      deliveryId: input.deliveryId,
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}
