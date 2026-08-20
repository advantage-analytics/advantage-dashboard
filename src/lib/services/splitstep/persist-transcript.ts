/**
 * Write a derived transcript to `points` and `shots`.
 *
 * The only module here that mutates match data. Everything it writes carries
 * `derived = true`, which is what makes a rebuild possible without ever
 * touching a row that arrived from a file import.
 *
 * It does NOT call `calculate_match_stats`. Publishing statistics is a separate
 * decision from recording the transcript: several stat families are not
 * measurable from this vendor's output at all (aces cannot be separated from
 * service winners; the return family is contaminated by phantom strokes on
 * points that actually ended on the serve), so the call has to be paired with a
 * suppression pass that does not exist yet. Writing rows now and publishing
 * later is safe; the reverse is not.
 */

import type { createAdminClient } from '@/lib/supabase/admin';
import {
  analyzeResults,
  buildTranscript,
  DERIVATION_VERSION,
  type MatchScore,
  type Transcript,
} from './derivation';
import { RESULTS_BUCKET } from './config';

const LOG = '[splitstep:persist]';

export type PersistOutcome =
  | { ok: true; transcript: Transcript; pointsWritten: number; shotsWritten: number }
  | { ok: false; reason: string; transcript: Transcript | null };

interface JobRow {
  id: string;
  match_id: string;
  results_object_key: string | null;
  start_time_seconds: number | string | null;
  initial_top_player_is_player1: boolean | null;
}

interface MatchRow {
  id: string;
  score: MatchScore | null;
  initial_top_player_is_player1: boolean | null;
}

/**
 * Build the transcript for a job without writing anything.
 *
 * Exported so a caller can inspect what would be written — the sane thing to do
 * before the first real match, and the basis of a dry run.
 */
export async function buildTranscriptForJob(params: {
  supabase: ReturnType<typeof createAdminClient>;
  jobId: string;
}): Promise<{ transcript: Transcript | null; reason: string | null; job: JobRow | null }> {
  const { supabase, jobId } = params;

  const { data: job, error: jobError } = await supabase
    .from('processing_jobs')
    .select('id, match_id, results_object_key, start_time_seconds, initial_top_player_is_player1')
    .eq('id', jobId)
    .single<JobRow>();

  if (jobError || !job) {
    return { transcript: null, reason: `job not found: ${jobError?.message}`, job: null };
  }
  if (!job.results_object_key) {
    return { transcript: null, reason: 'job has no stored results', job };
  }

  const { data: match, error: matchError } = await supabase
    .from('matches')
    .select('id, score, initial_top_player_is_player1')
    .eq('id', job.match_id)
    .single<MatchRow>();

  if (matchError || !match) {
    return { transcript: null, reason: `match not found: ${matchError?.message}`, job };
  }

  const { data: blob, error: readError } = await supabase.storage
    .from(RESULTS_BUCKET)
    .download(job.results_object_key);

  if (readError || !blob) {
    return {
      transcript: null,
      reason: `could not read results: ${readError?.message ?? 'no data'}`,
      job,
    };
  }

  // The trim offset belongs here and only here: `points.video_time` and
  // `shots.video_time` are what the player seeks against, and the player seeks
  // in the ORIGINAL video while the vendor timestamps the trimmed one.
  const startTimeSeconds = Number(job.start_time_seconds ?? 0);
  const analysis = analyzeResults(JSON.parse(await blob.text()), {
    startTimeSeconds: Number.isFinite(startTimeSeconds) ? startTimeSeconds : 0,
  });

  const transcript = buildTranscript({
    rallies: analysis.rallies,
    labels: analysis.players,
    score: match.score,
    initialTopIsPlayer1:
      job.initial_top_player_is_player1 ?? match.initial_top_player_is_player1,
  });

  return { transcript, reason: transcript.reason, job };
}

/**
 * Persist a job's transcript, replacing any rows a previous run wrote.
 *
 * Never throws — it is called from the webhook's `after()`, where an exception
 * aborts every step queued behind it.
 */
export async function persistTranscript(params: {
  supabase: ReturnType<typeof createAdminClient>;
  jobId: string;
  /** Build but do not write. Returns the transcript for inspection. */
  dryRun?: boolean;
}): Promise<PersistOutcome> {
  const { supabase, jobId, dryRun = false } = params;

  try {
    const { transcript, reason, job } = await buildTranscriptForJob({ supabase, jobId });

    if (!transcript || !transcript.ok || !job) {
      console.error(`${LOG} refused`, { jobId, reason });
      return { ok: false, reason: reason ?? 'transcript could not be built', transcript };
    }

    if (dryRun) {
      return {
        ok: true,
        transcript,
        pointsWritten: 0,
        shotsWritten: 0,
      };
    }

    // Refuse to touch a match that already holds imported rows. Mixing two
    // providers' transcripts in one match would produce a timeline nobody can
    // interpret, and the delete below is deliberately scoped so it could never
    // remove them.
    const { count: importedCount, error: importedError } = await supabase
      .from('points')
      .select('id', { count: 'exact', head: true })
      .eq('match_id', job.match_id)
      .eq('derived', false);

    if (importedError) {
      return { ok: false, reason: `could not check existing points: ${importedError.message}`, transcript };
    }
    if ((importedCount ?? 0) > 0) {
      return {
        ok: false,
        reason: `match already holds ${importedCount} imported point(s); refusing to mix providers`,
        transcript,
      };
    }

    // Rebuild rather than upsert. `shots.point_id` is ON DELETE CASCADE, so
    // removing the derived points takes their shots with them and there is no
    // window where a point exists without its strokes.
    const { error: deleteError } = await supabase
      .from('points')
      .delete()
      .eq('match_id', job.match_id)
      .eq('derived', true);

    if (deleteError) {
      return { ok: false, reason: `could not clear previous rows: ${deleteError.message}`, transcript };
    }

    const pointRows = transcript.points.map((p) => ({
      match_id: job.match_id,
      point_number: p.point_number,
      set_number: p.set_number,
      game_number: p.game_number,
      server_is_player1: p.server_is_player1,
      won_by_player1: p.won_by_player1,
      rally_length: p.rally_length,
      result_type: p.result_type,
      video_time: p.video_time,
      duration: p.duration,
      flags: p.flags,
      derived: true,
    }));

    const { data: inserted, error: pointsError } = await supabase
      .from('points')
      .insert(pointRows)
      .select('id, point_number');

    if (pointsError || !inserted) {
      return { ok: false, reason: `points insert failed: ${pointsError?.message}`, transcript };
    }

    // Map back by point_number rather than by insertion order: the client does
    // not promise the returned rows keep the order they were sent in, and a
    // silent misalignment here would attach every rally's strokes to the wrong
    // point.
    const idByNumber = new Map<number, string>();
    for (const row of inserted as Array<{ id: string; point_number: number }>) {
      idByNumber.set(row.point_number, row.id);
    }

    const shotRows = transcript.points.flatMap((p) => {
      const pointId = idByNumber.get(p.point_number);
      if (!pointId) return [];
      return p.shots.map((s) => ({
        point_id: pointId,
        shot_number: s.shot_number,
        is_player1: s.is_player1,
        shot_type: s.shot_type,
        spin_type: s.spin_type,
        speed_mph: s.speed_mph,
        contact_x: s.contact_x,
        contact_y: s.contact_y,
        landing_x: s.landing_x,
        landing_y: s.landing_y,
        result: s.result,
        video_time: s.video_time,
        zone: s.zone,
        flags: s.flags,
        derived: true,
      }));
    });

    if (shotRows.length !== transcript.points.reduce((n, p) => n + p.shots.length, 0)) {
      return { ok: false, reason: 'internal: a point lost its id during insert', transcript };
    }

    const { error: shotsError } = await supabase.from('shots').insert(shotRows);
    if (shotsError) {
      // Leave nothing half-written: without the shots the points are a timeline
      // with no strokes, which renders as a match where nobody hit anything.
      await supabase.from('points').delete().eq('match_id', job.match_id).eq('derived', true);
      return { ok: false, reason: `shots insert failed: ${shotsError.message}`, transcript };
    }

    // Stamped only now. `resolveAnalysisStatus()` reads a non-null version on a
    // completed job as "Analyzed", so it must not be set until the rows it
    // refers to actually exist.
    await supabase
      .from('processing_jobs')
      .update({ derivation_version: DERIVATION_VERSION })
      .eq('id', jobId);

    console.log(`${LOG} wrote transcript`, {
      jobId,
      matchId: job.match_id,
      points: pointRows.length,
      shots: shotRows.length,
    });

    return {
      ok: true,
      transcript,
      pointsWritten: pointRows.length,
      shotsWritten: shotRows.length,
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(`${LOG} threw`, { jobId, reason });
    return { ok: false, reason, transcript: null };
  }
}
