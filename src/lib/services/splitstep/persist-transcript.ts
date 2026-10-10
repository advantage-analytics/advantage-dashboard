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

import type { createAdminClient } from "@/lib/supabase/admin";
import {
  analyzeResults,
  buildTranscript,
  DERIVATION_VERSION,
  lineCallsFor,
  type LineCalls,
  type MatchScore,
  type SplitStepRally,
  type SplitStepStroke,
  type Transcript,
} from "./derivation";
import { RESULTS_BUCKET } from "./config";
import { HAND_LABELLED_FLAG } from "./derivation/flags";

const LOG = "[splitstep:persist]";

export type PersistOutcome =
  | {
      ok: true;
      matchId: string;
      transcript: Transcript;
      pointsWritten: number;
      shotsWritten: number;
    }
  | {
      ok: false;
      reason: string;
      transcript: Transcript | null;
      failure: PersistFailure;
      /**
       * Refused because the match's rows were applied from hand labels
       * (`scripts/label-apply.ts`) and `allowOverwriteLabels` was not passed.
       * Decided before the delete, so the labelled rows are untouched.
       */
      labelsProtected?: true;
    };

/**
 * Why a persist did not land, for the caller to record on the job.
 *
 * `"refused"` — deterministic: the inputs cannot produce a trustworthy
 * transcript (it did not reconcile, the job holds no results, the match
 * already carries another provider's rows). Running it again gives the same
 * answer. `"error"` — the transcript may be fine but a read or write failed
 * on the way (a Supabase or Storage error, an exception); a rebuild can
 * succeed. Stated at each return rather than inferred from `transcript`,
 * because a DB error before the build (job read, results download) also
 * leaves `transcript` null.
 */
export type PersistFailure = "refused" | "error";

interface JobRow {
  id: string;
  match_id: string;
  results_object_key: string | null;
  start_time_seconds: number | string | null;
  initial_top_player_is_player1: boolean | null;
  /** What the vendor was told (`Ad`), written from the request object itself. */
  ad_scoring: boolean | null;
  /** The per-frame ball file, when the webhook stored one. */
  trajectories_object_key: string | null;
}

interface MatchRow {
  id: string;
  score: MatchScore | null;
  initial_top_player_is_player1: boolean | null;
  format: { ad_scoring?: boolean; best_of?: number } | null;
}

/**
 * The ad-scoring rule to fold a job's score stream under.
 *
 * The job's value first: `processing_jobs.ad_scoring` is written from the exact
 * request object just before the vendor POST, so it is what the vendor was
 * told. `matches.format` can disagree with it — a match row whose format says
 * ad while its no-ad event's video went up as `Ad:false` — and folding under the
 * match's rule then labels 40-40 by rules the vendor never scored under. The
 * match record is the fallback for a job that predates the column, then ad.
 * Same order as `initialTopIsPlayer1` below and the submit/resubmit paths.
 */
export function resolveAdScoring(
  jobAdScoring: boolean | null | undefined,
  matchFormat: { ad_scoring?: boolean } | null,
): boolean {
  return jobAdScoring ?? matchFormat?.ad_scoring ?? true;
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
}): Promise<{
  transcript: Transcript | null;
  reason: string | null;
  /** Set whenever `transcript` is null or not ok; see {@link PersistFailure}. */
  failure: PersistFailure | null;
  job: JobRow | null;
  /**
   * The vendor's results JSON exactly as parsed from Storage, set whenever the
   * download succeeded. The label seed (src/lib/services/labels) freezes each
   * raw stroke next to its label row, and reading it here means one download
   * serves both the transcript and the seed.
   */
  raw?: unknown;
  /**
   * The rallies the transcript was built from (`analyzeResults(raw).rallies`),
   * set whenever `raw` is. The labels console's marks (src/lib/services/labels/
   * marks.ts) read the rally beside the derived point — a serve called out, a
   * stroke the derivation dropped — so the same download serves them too.
   */
  rallies?: SplitStepRally[];
}> {
  const { supabase, jobId } = params;

  const { data: job, error: jobError } = await supabase
    .from("processing_jobs")
    .select(
      "id, match_id, results_object_key, start_time_seconds, initial_top_player_is_player1, ad_scoring, trajectories_object_key",
    )
    .eq("id", jobId)
    .single<JobRow>();

  if (jobError || !job) {
    return {
      transcript: null,
      reason: `job not found: ${jobError?.message}`,
      failure: "error",
      job: null,
    };
  }
  if (!job.results_object_key) {
    return {
      transcript: null,
      reason: "job has no stored results",
      failure: "refused",
      job,
    };
  }

  const { data: match, error: matchError } = await supabase
    .from("matches")
    .select("id, score, initial_top_player_is_player1, format")
    .eq("id", job.match_id)
    .single<MatchRow>();

  if (matchError || !match) {
    return {
      transcript: null,
      reason: `match not found: ${matchError?.message}`,
      failure: "error",
      job,
    };
  }

  const { data: blob, error: readError } = await supabase.storage
    .from(RESULTS_BUCKET)
    .download(job.results_object_key);

  if (readError || !blob) {
    return {
      transcript: null,
      reason: `could not read results: ${readError?.message ?? "no data"}`,
      failure: "error",
      job,
    };
  }

  // The trim offset belongs here and only here: `points.video_time` and
  // `shots.video_time` are what the player seeks against, and the player seeks
  // in the ORIGINAL video while the vendor timestamps the trimmed one.
  const startTimeSeconds = Number(job.start_time_seconds ?? 0);
  const raw: unknown = JSON.parse(await blob.text());
  const analysis = analyzeResults(raw, {
    startTimeSeconds: Number.isFinite(startTimeSeconds) ? startTimeSeconds : 0,
  });

  const transcript = buildTranscript({
    rallies: analysis.rallies,
    labels: analysis.players,
    score: match.score,
    initialTopIsPlayer1:
      job.initial_top_player_is_player1 ?? match.initial_top_player_is_player1,
    // Under no-ad, 40-40 is a deciding point and BOTH players hold game point,
    // so the wrong rule drops (or invents) the most pressured point in a game.
    // See resolveAdScoring for why the job's value beats the match record's.
    adScoring: resolveAdScoring(job.ad_scoring, match.format),
    bestOf: match.format?.best_of ?? 3,
    lineCalls: await lineCallsForJob({
      supabase,
      jobId: job.id,
      objectKey: job.trajectories_object_key,
      strokes: analysis.strokes,
    }),
  });

  return {
    transcript,
    reason: transcript.reason,
    failure: transcript.ok ? null : "refused",
    job,
    raw,
    rallies: analysis.rallies,
  };
}

interface PointServer {
  point_number: number;
  server_is_player1: boolean;
}

/**
 * Whether two transcripts of one match name the players the other way round.
 *
 * Both are built from the same rallies in the same order, and each rally's
 * server is a fact of the footage, so `server_is_player1` agrees point for
 * point unless the label-to-player mapping itself changed. A majority vote
 * rather than point one alone: a derivation-version change may relabel a few
 * servers (a frozen stretch), but never most of them.
 */
export function playerMappingFlipped(
  before: readonly PointServer[],
  after: readonly PointServer[],
): boolean {
  const was = new Map(before.map((p) => [p.point_number, p.server_is_player1]));
  let compared = 0;
  let flipped = 0;
  for (const point of after) {
    const previous = was.get(point.point_number);
    if (previous === undefined) continue;
    compared += 1;
    if (previous !== point.server_is_player1) flipped += 1;
  }
  return compared > 0 && flipped * 2 > compared;
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
  /**
   * Refuse a transcript that names the players the other way round from the
   * rows already stored. Set when a published match is rebuilt after its
   * score was edited: the fold names player1 from the entered score before it
   * asks the camera, so a score typed from the opponent's side would move
   * every statistic to the wrong player with nothing on screen looking wrong.
   * The check runs before the delete, so a refusal leaves the match as it was.
   */
  keepPlayerMapping?: boolean;
  /**
   * Replace rows that were applied from a hand-labelling session (points
   * flagged `hand_labelled`). Off by default: those rows are what the
   * labeller saw on the video, and a re-derive from the vendor's file would
   * silently put the vendor's version back. Pass it only on purpose
   * (`scripts/splitstep-derive.ts --force-over-labels`).
   */
  allowOverwriteLabels?: boolean;
}): Promise<PersistOutcome> {
  const {
    supabase,
    jobId,
    dryRun = false,
    keepPlayerMapping = false,
    allowOverwriteLabels = false,
  } = params;

  try {
    const { transcript, reason, failure, job } = await buildTranscriptForJob({
      supabase,
      jobId,
    });

    if (!transcript || !transcript.ok || !job) {
      console.error(`${LOG} refused`, { jobId, reason });
      return {
        ok: false,
        reason: reason ?? "transcript could not be built",
        transcript,
        failure: failure ?? "refused",
      };
    }

    // Refuse to overwrite hand labels. Checked before the delete, so a refusal
    // leaves the labelled rows exactly as they were, and before the dry-run
    // return, so a dry run says up front that --write would be refused.
    if (!allowOverwriteLabels) {
      const { count: labelledCount, error: labelledError } = await supabase
        .from("points")
        .select("id", { count: "exact", head: true })
        .eq("match_id", job.match_id)
        .contains("flags", [HAND_LABELLED_FLAG]);
      if (labelledError) {
        return {
          ok: false,
          reason: `could not check for hand-labelled points: ${labelledError.message}`,
          transcript,
          failure: "refused",
        };
      }
      if ((labelledCount ?? 0) > 0) {
        return {
          ok: false,
          reason:
            "hand labels applied — pass allowOverwriteLabels to replace them",
          transcript,
          failure: "refused",
          labelsProtected: true,
        };
      }
    }

    if (dryRun) {
      return {
        ok: true,
        matchId: job.match_id,
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
      .from("points")
      .select("id", { count: "exact", head: true })
      .eq("match_id", job.match_id)
      .eq("derived", false);

    if (importedError) {
      return {
        ok: false,
        reason: `could not check existing points: ${importedError.message}`,
        transcript,
        failure: "error",
      };
    }
    if ((importedCount ?? 0) > 0) {
      return {
        ok: false,
        reason: `match already holds ${importedCount} imported point(s); refusing to mix providers`,
        transcript,
        failure: "refused",
      };
    }

    if (keepPlayerMapping) {
      const { data: previous, error: previousError } = await supabase
        .from("points")
        .select("point_number, server_is_player1")
        .eq("match_id", job.match_id)
        .eq("derived", true);
      if (previousError) {
        // Nothing has been written yet, so this is a refusal, not a failure
        // mid-write: the caller keeps the published rows.
        return {
          ok: false,
          reason: `could not read the previous points: ${previousError.message}`,
          transcript,
          failure: "refused",
        };
      }
      if (
        playerMappingFlipped(
          (previous ?? []) as PointServer[],
          transcript.points,
        )
      ) {
        return {
          ok: false,
          reason:
            "player_mapping_changed: the new score would swap which player the statistics belong to",
          transcript,
          failure: "refused",
        };
      }
    }

    // Rebuild rather than upsert. `shots.point_id` is ON DELETE CASCADE, so
    // removing the derived points takes their shots with them and there is no
    // window where a point exists without its strokes.
    const { error: deleteError } = await supabase
      .from("points")
      .delete()
      .eq("match_id", job.match_id)
      .eq("derived", true);

    if (deleteError) {
      return {
        ok: false,
        reason: `could not clear previous rows: ${deleteError.message}`,
        transcript,
        failure: "error",
      };
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
      is_break_point: p.is_break_point,
      is_set_point: p.is_set_point,
      is_match_point: p.is_match_point,
      set_score: p.set_score,
      game_score: p.game_score,
      point_score: p.point_score,
      video_time: p.video_time,
      duration: p.duration,
      flags: p.flags,
      derived: true,
    }));

    const { data: inserted, error: pointsError } = await supabase
      .from("points")
      .insert(pointRows)
      .select("id, point_number");

    if (pointsError || !inserted) {
      return {
        ok: false,
        reason: `points insert failed: ${pointsError?.message}`,
        transcript,
        failure: "error",
      };
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
        bounce_video_time: s.bounce_video_time,
        zone: s.zone,
        flags: s.flags,
        derived: true,
      }));
    });

    if (
      shotRows.length !==
      transcript.points.reduce((n, p) => n + p.shots.length, 0)
    ) {
      return {
        ok: false,
        reason: "internal: a point lost its id during insert",
        transcript,
        failure: "error",
      };
    }

    const { error: shotsError } = await supabase.from("shots").insert(shotRows);
    if (shotsError) {
      // Leave nothing half-written: without the shots the points are a timeline
      // with no strokes, which renders as a match where nobody hit anything.
      await supabase
        .from("points")
        .delete()
        .eq("match_id", job.match_id)
        .eq("derived", true);
      return {
        ok: false,
        reason: `shots insert failed: ${shotsError.message}`,
        transcript,
        failure: "error",
      };
    }

    // Stamped only now. `resolveAnalysisStatus()` reads a non-null version on a
    // completed job as "Analyzed", so it must not be set until the rows it
    // refers to actually exist.
    await supabase
      .from("processing_jobs")
      .update({ derivation_version: DERIVATION_VERSION })
      .eq("id", jobId);

    console.log(`${LOG} wrote transcript`, {
      jobId,
      matchId: job.match_id,
      points: pointRows.length,
      shots: shotRows.length,
    });

    return {
      ok: true,
      matchId: job.match_id,
      transcript,
      pointsWritten: pointRows.length,
      shotsWritten: shotRows.length,
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(`${LOG} threw`, { jobId, reason });
    return { ok: false, reason, transcript: null, failure: "error" };
  }
}

/**
 * Our own line calls for a job, from its stored trajectories file.
 *
 * Best-effort by design: a job with no file, or one that fails to download or
 * parse, derives exactly as it did before trajectories were read — only from
 * the strokes file. Logged, never thrown, so it cannot refuse a match.
 */
async function lineCallsForJob(params: {
  supabase: ReturnType<typeof createAdminClient>;
  jobId: string;
  objectKey: string | null;
  strokes: SplitStepStroke[];
}): Promise<LineCalls | undefined> {
  const { supabase, jobId, objectKey, strokes } = params;
  if (!objectKey) return undefined;
  try {
    const { data, error } = await supabase.storage
      .from(RESULTS_BUCKET)
      .download(objectKey);
    if (error || !data) throw new Error(error?.message ?? "no data");
    return lineCallsFor(strokes, JSON.parse(await data.text()));
  } catch (err) {
    console.error(`${LOG} trajectories unreadable, deriving without them`, {
      jobId,
      objectKey,
      error: err instanceof Error ? err.message : String(err),
    });
    return undefined;
  }
}
