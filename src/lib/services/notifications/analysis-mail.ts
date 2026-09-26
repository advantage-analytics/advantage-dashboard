import type { SupabaseClient } from "@supabase/supabase-js";
import {
  analysisFailedEmail,
  analysisFailedInternalEmail,
  analysisReadyEmail,
  sendEmail,
  INTERNAL_ALERTS_ADDRESS,
} from "@/lib/services/email";
import { programDisplayName } from "@/lib/data/programs-server";
import {
  formatScoreText,
  playedSets,
  scoreSetsFrom,
  type RawMatchScore,
} from "@/lib/ui/score-format";
import { claimSend, getNotificationPrefs } from "./should-notify";

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
}): Promise<void> {
  const { supabase, jobId, outcome } = params;
  try {
    const { data: job, error: jobError } = await supabase
      .from("processing_jobs")
      .select(
        "created_by, match_id, status, error_code, error_step, error_message, video_object_key",
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
          })
        : analysisFailedEmail({
            to,
            matchId,
            matchTitle,
            matchContext,
            reason: (job.error_message as string | null) || null,
            videoRetained: Boolean(job.video_object_key),
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
async function describeContext(
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
