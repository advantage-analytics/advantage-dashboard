/**
 * `GET /api/matches/[matchId]/ball-paths` — the derived ball-paths file for
 * anyone who can SEE the match.
 *
 * VISIBILITY FIRST, SERVICE ROLE SECOND. The handler asks
 * {@link authorizeMatchVisibility} — sign-in, then the match through the
 * CALLER's RLS client — before anything else, and hands its refusal back
 * unchanged, so no-session and invisible-or-absent answer exactly as
 * `GET /api/matches/[matchId]/video` does. Only after that does the loader
 * run, and the loader is the only thing here that touches the service-role
 * client. The route builds that client lazily, so a refused caller never
 * constructs one. The service role answers "which file", never "may you".
 *
 * NO FILE IS AN ANSWER, NOT AN ERROR. Every older match, every SwingVision
 * import and every job whose `trajectories_url` was null has no ball-paths
 * object. The room fetches on open, and a 404 would put a red line in the
 * console for a normal state — so those answer 200 with an empty file, the
 * same reasoning as playback's `{ attachment: null }`.
 *
 * THE STORED TEXT IS THE BODY. The file was serialised once, by
 * ball-paths-store.ts. It goes out as that text — never parsed and
 * re-serialised here — so what the client reads is byte-for-byte what was
 * derived, and a few hundred KB are not round-tripped through `JSON.parse`
 * on every open.
 *
 * Injected ({@link BallPathsAccessDeps}) so the whole ladder runs in a spec
 * with no session, no database and no storage.
 */

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  authorizeMatchVisibility,
  type MatchVideoAccessDeps,
} from "@/lib/services/match-video/access";
import {
  errorResponse,
  transportError,
  type HttpResult,
} from "@/lib/services/match-video/http";

import { RESULTS_BUCKET } from "./config";
import {
  ballPathsObjectKey,
  ballPathsUserSegment,
  resultsKeyUserSegment,
} from "./object-keys";

const LOG = "[ball-paths-access]";

/** What a visible match with no stored file answers. Version 1, no strokes. */
export const EMPTY_BALL_PATHS_BODY = '{"version":1,"strokes":[]}';

/**
 * The same header `match-video/http.ts` stamps on every answer. `private`
 * because access is per-caller; `no-store` because a re-derivation overwrites
 * the object in place and membership can be revoked.
 */
const HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "private, no-store",
} as const;

export interface BallPathsAccessDeps extends MatchVideoAccessDeps {
  /**
   * The stored file's TEXT for a match, or `null` when there is none — a
   * normal outcome, inside the `ok` case. Called only after visibility
   * passes, with the id of the row the caller was shown.
   */
  loadBallPathsBody(matchId: string): Promise<HttpResult<string | null>>;
}

export async function handleGetBallPaths(
  matchId: string,
  deps: BallPathsAccessDeps,
): Promise<NextResponse> {
  const access = await authorizeMatchVisibility(matchId, deps);
  if (!access.ok) {
    console.log(`${LOG} refused — ${access.error.detail}`, { matchId });
    return errorResponse(access.error);
  }

  let loaded: HttpResult<string | null>;
  try {
    loaded = await deps.loadBallPathsBody(access.value.match.id);
  } catch (cause) {
    console.error(`${LOG} unhandled failure`, { matchId, cause });
    return errorResponse(transportError("internal_error", "unhandled"));
  }
  if (!loaded.ok) return errorResponse(loaded.error);

  // `new NextResponse(text)`, not `NextResponse.json`: the stored text is the
  // body as it stands.
  return new NextResponse(loaded.value ?? EMPTY_BALL_PATHS_BODY, {
    status: 200,
    headers: HEADERS,
  });
}

/* -------------------------------------------------------------------------
 * Production wiring
 * ---------------------------------------------------------------------- */

/**
 * The match's most recent completed job, then its ball-paths object, through
 * the SERVICE-ROLE client. `processing_jobs` RLS is per-creator, so a coach
 * reading a player's match could not see the row through their own client;
 * it is safe here because {@link handleGetBallPaths} has already been told,
 * by the caller's client, that the match exists for them.
 *
 * "Most recent" is `completed_at` descending, nulls last — not `created_at`.
 * A re-submitted match has more than one job row, and the one whose data the
 * match now shows is the one that FINISHED last; a slow first job can finish
 * after a quick retry that was created later. `created_at` breaks a tie.
 *
 * The key's user segment is the JOB's `created_by`, never the caller's id —
 * and goes through `ballPathsUserSegment`, as the writer's does, so a job
 * whose uploader has left the team is still found. A file written BEFORE they
 * left sits under their uuid instead, which `created_by` no longer names; the
 * recorded `results_object_key` does, through `resultsKeyUserSegment`.
 */
export function supabaseBallPathsBody(
  admin: SupabaseClient,
): BallPathsAccessDeps["loadBallPathsBody"] {
  return async (matchId) => {
    const { data: job, error: jobError } = await admin
      .from("processing_jobs")
      .select("id, created_by, results_object_key")
      .eq("match_id", matchId)
      .eq("status", "completed")
      .order("completed_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{
        id: string;
        created_by: string | null;
        results_object_key: string | null;
      }>();

    if (jobError) {
      console.error(`${LOG} could not read the match's jobs`, {
        matchId,
        sqlstate: jobError.code,
        message: jobError.message,
      });
      return {
        ok: false,
        error: transportError("internal_error", "job_read_failed"),
      };
    }
    if (!job) return { ok: true, value: null };

    // A FIXED, ORDERED candidate list — no bucket listing, no prefix. Every
    // entry is a return value of `ballPathsObjectKey`, built only from the row
    // this query returned for the already-authorised match id.
    //
    //   1. under `ballPathsUserSegment(created_by)` — where the writer puts a
    //      file TODAY, so after the uploader left a re-derivation lands under
    //      the fallback segment and is the fresher file;
    //   2. the sibling of the recorded results key — the older file, written
    //      under the uploader's uuid before `created_by` was nulled.
    //
    // A Set de-duplicates: an uploader who is still here yields one candidate.
    const segments = new Set<string>([ballPathsUserSegment(job.created_by)]);
    const siblingSegment = resultsKeyUserSegment({
      resultsObjectKey: job.results_object_key,
      matchId,
      jobId: job.id,
    });
    if (siblingSegment !== null) segments.add(siblingSegment);

    for (const userId of segments) {
      const objectKey = ballPathsObjectKey({ userId, matchId, jobId: job.id });

      const { data, error } = await admin.storage
        .from(RESULTS_BUCKET)
        .download(objectKey);

      if (!error && data) return { ok: true, value: await data.text() };

      // A download error carries no parsed body, so "not there" and "could
      // not ask" are told apart only by the wrapped response's status — and
      // storage has answered a missing object with both 400 and 404. Missing
      // moves on to the next candidate; all missing is the empty file: the
      // court falls back to estimated bounces, which is what it does today.
      const status = (error as { originalError?: { status?: number } } | null)
        ?.originalError?.status;
      if (status === 400 || status === 404) continue;

      // Anything else STOPS the ladder: logged and answered empty, exactly
      // what a single candidate has always done. It does not fall through to
      // the next candidate, because "could not ask" about the fresher file is
      // not "it is absent" — serving the older sibling then would show a
      // superseded derivation as if it were current.
      console.warn(`${LOG} ball-paths download failed; answering empty`, {
        matchId,
        jobId: job.id,
        status,
        message: error?.message,
      });
      return { ok: true, value: null };
    }

    return { ok: true, value: null };
  };
}
