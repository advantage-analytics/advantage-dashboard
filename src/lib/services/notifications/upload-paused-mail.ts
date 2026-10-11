import type { SupabaseClient } from "@supabase/supabase-js";
import {
  sendEmail,
  uploadPausedEmail,
  type EmailMessage,
} from "@/lib/services/email";
import {
  UPLOAD_ABANDONED_AFTER,
  UPLOAD_PAUSED_AFTER_MS,
} from "@/lib/data/match-analysis";
import { describeContext } from "./analysis-mail";
import {
  claimSend,
  getNotificationPrefs,
  type NotificationPrefs,
} from "./should-notify";

const LOG = "[notifications:upload-paused]";

/** Emails per run. A sweep every five minutes never has a backlog worth more. */
const MAX_PER_RUN = 25;

/**
 * Paused jobs read per run. Wider than `MAX_PER_RUN` because a job stays
 * paused — and so keeps being read — for up to six hours after it was mailed;
 * the already-mailed ones are dropped before the cap, or they would fill it
 * and starve the uploads that paused after them.
 */
const MAX_CANDIDATES = 200;

export interface StalledUploadSweepResult {
  /** Jobs this run failed, or null when the reaper itself could not run. */
  reaped: number | null;
  /** Uploads that have gone quiet and are still live. */
  paused: number;
  sent: number;
}

export interface StalledUploadSweepDeps {
  now: () => number;
  prefs: (userIds: string[]) => Promise<Map<string, NotificationPrefs>>;
  claim: (dedupeKey: string) => Promise<boolean>;
  send: (message: EmailMessage) => Promise<{ ok: boolean; error?: string }>;
}

const productionDeps: StalledUploadSweepDeps = {
  now: () => Date.now(),
  prefs: getNotificationPrefs,
  claim: claimSend,
  send: sendEmail,
};

interface PausedRow {
  id: string;
  match_id: string | null;
  created_by: string | null;
  upload_progress_percent: number | null;
}

/**
 * Tell people their upload has gone quiet, and end the ones that cannot
 * finish.
 *
 * A video uploads from the browser tab; when the tab closes or the computer
 * sleeps, nothing server-side notices. The job sat at "Uploading 27%" until
 * its owner next loaded a page, and nobody was told. Two things happen here,
 * on a schedule and with the service-role client, whoever is or is not
 * looking:
 *
 *   1. **Twenty minutes quiet → one email.** The job stays `uploading`: a tab
 *      whose computer wakes up carries on, so nothing is failed and nothing
 *      is lost. The surfaces read the same silence as "Upload paused"
 *      (`isUploadPaused()`), and the match page offers to start again.
 *   2. **Six hours quiet → `reap_stalled_uploads()` fails it.** The upload
 *      credential has expired by then, so no tab can finish it. No second
 *      email: the person was told at twenty minutes, and the screens say it.
 *
 * Who is NOT mailed:
 *   - a job that has never recorded progress — a `pending` one with no file,
 *     where nothing was uploading and so nothing paused;
 *   - the uploader of a team match who is no longer in that program;
 *   - anyone with "Email me if analysis fails" off.
 *
 * Once per job (`upload_paused:<job_id>`). An upload that resumes and pauses
 * again does not mail twice.
 *
 * `db` must be the service-role client: the reaper is `security invoker`, and
 * through a user's session it only ever sees that user's own jobs.
 *
 * Never throws — the route reports what it did.
 */
export async function sweepStalledUploads(
  db: SupabaseClient,
  deps: StalledUploadSweepDeps = productionDeps,
): Promise<StalledUploadSweepResult> {
  const result: StalledUploadSweepResult = {
    reaped: null,
    paused: 0,
    sent: 0,
  };

  try {
    const { data: reaped, error: reapError } = await db.rpc(
      "reap_stalled_uploads",
      { p_stale_after: UPLOAD_ABANDONED_AFTER },
    );
    if (reapError) {
      console.error(`${LOG} could not reap`, { error: reapError.message });
    } else {
      result.reaped = typeof reaped === "number" ? reaped : 0;
    }

    const quietSince = new Date(
      deps.now() - UPLOAD_PAUSED_AFTER_MS,
    ).toISOString();
    const { data, error } = await db
      .from("processing_jobs")
      .select("id, match_id, created_by, upload_progress_percent")
      .eq("status", "uploading")
      .not("upload_progress_percent", "is", null)
      .lt("updated_at", quietSince)
      .order("updated_at", { ascending: true })
      .limit(MAX_CANDIDATES);

    if (error) {
      console.error(`${LOG} could not read paused uploads`, {
        error: error.message,
      });
      return result;
    }

    const paused = ((data ?? []) as PausedRow[]).filter(
      (row) => row.match_id !== null && row.created_by !== null,
    );
    result.paused = paused.length;
    if (paused.length === 0) return result;

    // Drop the ones already mailed before spending the cap, or a read, on
    // them. `claimSend()` below is still what makes a send happen once; this
    // is only what keeps a mailed job from being looked up again every run.
    const { data: mailed, error: mailedError } = await db
      .from("notification_sends")
      .select("dedupe_key")
      .in(
        "dedupe_key",
        paused.map((row) => claimKey(row.id)),
      );
    if (mailedError) {
      console.error(`${LOG} could not read sent mail`, {
        error: mailedError.message,
      });
      return result;
    }
    const alreadyMailed = new Set(
      (mailed ?? []).map((row) => row.dedupe_key as string),
    );
    const rows = paused
      .filter((row) => !alreadyMailed.has(claimKey(row.id)))
      .slice(0, MAX_PER_RUN);
    if (rows.length === 0) return result;

    const prefs = await deps.prefs([
      ...new Set(rows.map((row) => row.created_by as string)),
    ]);

    for (const row of rows) {
      if (await notifyPausedUpload(db, row, prefs, deps)) result.sent += 1;
    }
  } catch (error) {
    console.error(`${LOG} threw`, {
      reason: error instanceof Error ? error.message : String(error),
    });
  }

  return result;
}

/** One email per job, however many times it pauses. */
function claimKey(jobId: string): string {
  return `upload_paused:${jobId}`;
}

async function notifyPausedUpload(
  db: SupabaseClient,
  row: PausedRow,
  prefs: Map<string, NotificationPrefs>,
  deps: StalledUploadSweepDeps,
): Promise<boolean> {
  const uploaderId = row.created_by as string;
  const matchId = row.match_id as string;

  if (!prefs.get(uploaderId)?.notifyAnalysisFailed) return false;

  const [{ data: match }, { data: user }] = await Promise.all([
    db
      .from("matches")
      .select("player1_name, player2_name, date, program_id")
      .eq("id", matchId)
      .maybeSingle(),
    db.from("users").select("email").eq("id", uploaderId).maybeSingle(),
  ]);

  const to = (user?.email as string | null)?.trim();
  if (!to || !match) return false;

  // A team match names its players and its program. Someone who uploaded it
  // and has since left the program can no longer open it, so they are not
  // sent its details either. A personal match is the uploader's own.
  const programId = match.program_id as string | null;
  if (programId) {
    const { data: membership, error: memberError } = await db
      .from("program_members")
      .select("user_id")
      .eq("program_id", programId)
      .eq("user_id", uploaderId)
      .limit(1);
    if (memberError || (membership?.length ?? 0) === 0) return false;
  }

  // Claimed after the cheap reads and before the render, like the analysis
  // mail: a claim that then finds no address would block a later, correct send.
  if (!(await deps.claim(claimKey(row.id)))) return false;

  const percent = row.upload_progress_percent ?? 0;
  const sent = await deps.send(
    uploadPausedEmail({
      to,
      matchId,
      matchTitle: `${match.player1_name} vs. ${match.player2_name}`,
      matchContext: await describeContext(db, {
        programId,
        date: match.date as string | null,
      }),
      // 0 is the cut's heartbeat, not a position worth quoting.
      pausedPercent: percent > 0 ? Math.floor(percent) : null,
    }),
  );
  if (!sent.ok) {
    console.warn(`${LOG} email not delivered`, {
      jobId: row.id,
      error: sent.error,
    });
    return false;
  }
  return true;
}
