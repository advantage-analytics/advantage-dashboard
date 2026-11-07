/**
 * Practice copies: paid test sessions for reviewer applicants. One completed
 * analyst session is the answer key; each applicant gets their own
 * `kind = 'practice'` session of the same job, assigned to them, and works it
 * in `/label` like any other. They submit it; nobody publishes it. Grading
 * (practice-grading.ts) compares each submission with the key.
 *
 * The copy is seeded the way any new session is (seed-session.ts): the job's
 * stored results file, derived with CURRENT code — no vendor request, no new
 * billing. `results_object_key` is the job's (the key's own); the
 * `derivation_version` is the code that actually built the pre-fill, which can
 * be newer than the key's. Grading judges a "missed fix" against each copy's
 * own pre-fill, so that gap never counts against an applicant.
 *
 * Scoped to one set (`practice_set_number`): only the AI points whose first
 * stroke falls inside the key's set — its first to last labelled stroke,
 * padded a few seconds and never past a neighbouring set — are written, so
 * the console shows that set and nothing else. Set 1 carries its own entered
 * score as `final_score`, so the console's "score doesn't add up" check
 * still works on the one set; a later set starts from `start_score` and is
 * marked as ending early.
 *
 * Admin-only (`requireAdmin`) and service-role, the same shape as
 * assign-session.ts. Writes only `label_sessions`, `label_points` and
 * `label_shots`, and only the copies' own rows: the key and the match are
 * read, never written. A copy that fails part-way is deleted (its rows
 * cascade), so no half-seeded session reaches an applicant.
 */

import { readAllPages } from "@/lib/data/admin-range-read";
import { parseMatchScore, readBestOf } from "@/lib/data/labels-server";
import { requireAdmin } from "@/lib/services/programs/admin-guard";
import { buildTranscriptForJob } from "@/lib/services/splitstep/persist-transcript";
import {
  DERIVATION_VERSION,
  type RawSplitStepStroke,
} from "@/lib/services/splitstep/derivation";
import { createAdminClient, type AdminClient } from "@/lib/supabase/admin";
import { ADMIN_REQUIRED } from "./edit-session";
import { labellerName } from "./assign-session";
import { normaliseId } from "./operations-session";
import { buildLabelSeed, type LabelSeed } from "./seed";
import { writeSeedRows } from "./seed-session";
import type { LabelSide, LabelStartScore, MatchScore } from "./session";

const LOG = "[labels:practice]";

/** Seconds of film either side of the key's set that still count as the set. */
export const PRACTICE_WINDOW_PAD_SECONDS = 4;

/** How many copies one call may create. Eight testers, with room. */
export const MAX_PRACTICE_COPIES = 20;

export const PRACTICE_SOURCE_NOT_KEY =
  "Practice copies are made from a completed analyst session only.";
export const PRACTICE_NO_SET =
  "The answer key has no labelled points in that set.";

export interface PracticeDependencies {
  requireAdmin: () => Promise<{ id: string } | null>;
  createAdminClient: () => AdminClient;
  now?: () => number;
}
const defaults: PracticeDependencies = { requireAdmin, createAdminClient };

/** What happened for one applicant. */
export type PracticeCopyOutcome =
  | { labellerId: string; name: string; ok: true; sessionId: string }
  | { labellerId: string; name: string; ok: false; error: string };

export type CreatePracticeCopiesResult =
  { ok: true; copies: PracticeCopyOutcome[] } | { error: string };

/** A stretch of film, in the label rows' `video_time` seconds. */
export interface PracticeWindow {
  start: number;
  end: number;
}

/** One live key point with its live strokes' times, as the window reads it. */
export interface KeyPointTimes {
  setNumber: number | null;
  times: readonly number[];
}

/**
 * The film window the key's set `setNumber` occupies: from its first to its
 * last live stroke, padded by `pad` seconds but never reaching into the set
 * before or after (it stops halfway across the gap). Null when the set has no
 * timed stroke. Pure.
 */
export function practiceWindow(
  points: readonly KeyPointTimes[],
  setNumber: number,
  pad = PRACTICE_WINDOW_PAD_SECONDS,
): PracticeWindow | null {
  const inSet: number[] = [];
  const before: number[] = [];
  const after: number[] = [];
  for (const point of points) {
    if (point.setNumber === null) continue;
    const bucket =
      point.setNumber === setNumber
        ? inSet
        : point.setNumber < setNumber
          ? before
          : after;
    bucket.push(...point.times);
  }
  if (inSet.length === 0) return null;
  const first = Math.min(...inSet);
  const last = Math.max(...inSet);
  const prevEnd = before.length > 0 ? Math.max(...before) : -Infinity;
  const nextStart = after.length > 0 ? Math.min(...after) : Infinity;
  return {
    start: Math.max(first - pad, (prevEnd + first) / 2),
    end: Math.min(last + pad, (last + nextStart) / 2),
  };
}

/**
 * The seed's points whose first timed stroke falls inside `window`, with
 * `point_index` renumbered from 0 in order. A point with no timed stroke
 * cannot be placed and is left out. Pure.
 */
export function seedInWindow(
  seed: LabelSeed,
  window: PracticeWindow,
): LabelSeed {
  const kept = seed.points.filter((point) => {
    const times = point.shots
      .map((shot) => shot.video_time)
      .filter((t): t is number => typeof t === "number");
    if (times.length === 0) return false;
    const first = Math.min(...times);
    return first >= window.start && first <= window.end;
  });
  return {
    points: kept
      .sort((a, b) => a.point_index - b.point_index)
      .map((point, index) => ({ ...point, point_index: index })),
  };
}

/** Each side's games in set `setNumber` of the entered score, or null. Pure. */
export function enteredSetGames(
  score: MatchScore | null,
  setNumber: number,
): [number, number] | null {
  const p1 = score?.player1?.[setNumber - 1];
  const p2 = score?.player2?.[setNumber - 1];
  return typeof p1 === "number" && typeof p2 === "number" ? [p1, p2] : null;
}

/**
 * The session fields a copy of set `setNumber` starts with. Set 1 starts at
 * the beginning and carries its own entered score, so the "score doesn't add
 * up" check runs on that set alone. A later set starts from the sets each
 * side had won (`start_score`) with `server` serving, and is marked as
 * ending early, since the sets after it are not on the copy. Pure.
 */
export function practiceSessionFields(
  score: MatchScore | null,
  setNumber: number | null,
  server: LabelSide,
): {
  final_score: number[][] | null;
  video_ends_early: boolean | null;
  start_score: LabelStartScore | null;
} {
  if (setNumber === null) {
    return { final_score: null, video_ends_early: null, start_score: null };
  }
  if (setNumber === 1) {
    const games = enteredSetGames(score, 1);
    return {
      final_score: games ? [games] : null,
      video_ends_early: games ? false : null,
      start_score: null,
    };
  }
  const sets: [number, number] = [0, 0];
  for (let set = 1; set < setNumber; set++) {
    const games = enteredSetGames(score, set);
    if (!games || games[0] === games[1]) continue;
    sets[games[0] > games[1] ? 0 : 1] += 1;
  }
  return {
    final_score: null,
    video_ends_early: true,
    start_score: { sets, games: [0, 0], points: [0, 0], server },
  };
}

interface KeySessionRow {
  id: string;
  kind: string;
  status: string;
  job_id: string | null;
  match_id: string;
  ad_scoring: boolean | null;
}

interface KeyPointRow {
  id: string;
  set_number: number | null;
  server: LabelSide | null;
  point_index: number;
}

/** Validate the request, read the key, build the pre-fill once, then one copy per applicant. Never throws. */
export async function createPracticeCopies(
  input: { sourceSessionId: unknown; setNumber: unknown; labellerIds: unknown },
  deps: PracticeDependencies = defaults,
): Promise<CreatePracticeCopiesResult> {
  const admin = await deps.requireAdmin();
  if (!admin) return { error: ADMIN_REQUIRED };

  const sourceId = normaliseId(input.sourceSessionId);
  if (!sourceId) return { error: "Invalid session id." };
  const setNumber =
    input.setNumber === null || input.setNumber === undefined
      ? null
      : Number(input.setNumber);
  if (
    setNumber !== null &&
    (!Number.isInteger(setNumber) || setNumber < 1 || setNumber > 5)
  ) {
    return { error: "Pick a set from 1 to 5, or the whole match." };
  }
  if (!Array.isArray(input.labellerIds) || input.labellerIds.length === 0) {
    return { error: "Pick at least one labeller." };
  }
  const labellerIds = [
    ...new Set(input.labellerIds.map((id) => normaliseId(id))),
  ];
  if (labellerIds.some((id) => id === null)) {
    return { error: "Invalid user id." };
  }
  if (labellerIds.length > MAX_PRACTICE_COPIES) {
    return { error: `At most ${MAX_PRACTICE_COPIES} copies at a time.` };
  }

  try {
    const db = deps.createAdminClient();

    const { data: key, error: keyError } = await db
      .from("label_sessions")
      .select("id, kind, status, job_id, match_id, ad_scoring")
      .eq("id", sourceId)
      .maybeSingle<KeySessionRow>();
    if (keyError)
      return { error: `Could not read the session: ${keyError.message}` };
    if (!key) return { error: "Session not found." };
    if (key.kind !== "analyst" || key.status !== "complete" || !key.job_id) {
      return { error: PRACTICE_SOURCE_NOT_KEY };
    }

    const { data: users, error: usersError } = await db
      .from("users")
      .select("id, email, first_name, last_name, is_labeller")
      .in("id", labellerIds as string[]);
    if (usersError)
      return { error: `Could not read the labellers: ${usersError.message}` };
    const userById = new Map(
      (
        (users ?? []) as {
          id: string;
          email: string | null;
          first_name: string | null;
          last_name: string | null;
          is_labeller: boolean | null;
        }[]
      ).map((u) => [u.id, u]),
    );

    // The key's set: its live points' sets and live strokes' times.
    const [keyPoints, keyShots] = await Promise.all([
      readAllPages<KeyPointRow>(
        db
          .from("label_points")
          .select("id, set_number, server, point_index")
          .eq("session_id", key.id)
          .neq("status", "deleted")
          .order("point_index"),
        "Could not read the key's points",
      ),
      readAllPages<{ label_point_id: string; video_time: number | null }>(
        db
          .from("label_shots")
          .select("label_point_id, video_time")
          .eq("session_id", key.id)
          .neq("status", "deleted")
          .order("id"),
        "Could not read the key's strokes",
      ),
    ]);
    const timesByPoint = new Map<string, number[]>();
    for (const shot of keyShots) {
      if (typeof shot.video_time !== "number") continue;
      const list = timesByPoint.get(shot.label_point_id) ?? [];
      list.push(shot.video_time);
      timesByPoint.set(shot.label_point_id, list);
    }

    let window: PracticeWindow | null = null;
    let firstServer: LabelSide = "p1";
    if (setNumber !== null) {
      window = practiceWindow(
        keyPoints.map((p) => ({
          setNumber: p.set_number,
          times: timesByPoint.get(p.id) ?? [],
        })),
        setNumber,
      );
      if (!window) return { error: PRACTICE_NO_SET };
      firstServer =
        keyPoints.find((p) => p.set_number === setNumber && p.server)?.server ??
        "p1";
    }

    // The pre-fill, built once for every copy.
    const built = await buildTranscriptForJob({
      supabase: db,
      jobId: key.job_id,
    });
    if (!built.job) return { error: built.reason ?? "Job not found." };
    if (!built.transcript || !built.transcript.ok) {
      return {
        error: `The AI output could not be rebuilt: ${built.reason ?? "unknown reason"}`,
      };
    }
    if (!built.job.results_object_key || !Array.isArray(built.raw)) {
      return { error: "The job has no readable results file." };
    }
    const matchScore = parseMatchScore(built.match?.score ?? null);
    const fullSeed = buildLabelSeed(
      built.transcript,
      built.raw as RawSplitStepStroke[],
      {
        score: built.match?.score ?? null,
        bestOf: readBestOf(built.match?.format),
      },
    );
    const seed = window ? seedInWindow(fullSeed, window) : fullSeed;
    if (seed.points.length === 0) {
      return { error: "The AI output has no points in that set." };
    }
    const fields = practiceSessionFields(matchScore, setNumber, firstServer);
    const stamp = new Date((deps.now ?? Date.now)()).toISOString();

    const copies: PracticeCopyOutcome[] = [];
    for (const labellerId of labellerIds as string[]) {
      const user = userById.get(labellerId);
      const name = user
        ? labellerName(user.first_name, user.last_name, user.email)
        : "Unknown user";
      if (!user) {
        copies.push({ labellerId, name, ok: false, error: "No such user." });
        continue;
      }
      if (user.is_labeller !== true) {
        copies.push({
          labellerId,
          name,
          ok: false,
          error: "That person is not a labeller.",
        });
        continue;
      }

      const { data: session, error: insertError } = await db
        .from("label_sessions")
        .insert({
          kind: "practice",
          job_id: key.job_id,
          match_id: key.match_id,
          results_object_key: built.job.results_object_key,
          derivation_version: DERIVATION_VERSION,
          practice_source_session_id: key.id,
          practice_set_number: setNumber,
          labeller: labellerId,
          assigned_to: labellerId,
          assigned_at: stamp,
          status: "labelling",
          started_at: stamp,
          // The analyst's correction of the match's scoring stands on the copy.
          ad_scoring: key.ad_scoring,
          ...fields,
        })
        .select("id")
        .single<{ id: string }>();
      if (insertError || !session) {
        copies.push({
          labellerId,
          name,
          ok: false,
          error:
            insertError?.code === "23505"
              ? "Already has a practice copy of this match."
              : `Could not create the copy: ${insertError?.message ?? "no row returned"}`,
        });
        continue;
      }

      const written = await writeSeedRows(db, session.id, seed);
      if (written.error) {
        await db.from("label_sessions").delete().eq("id", session.id);
        copies.push({ labellerId, name, ok: false, error: written.error });
        continue;
      }
      copies.push({ labellerId, name, ok: true, sessionId: session.id });
    }

    console.log(`${LOG} created`, {
      sourceSessionId: key.id,
      setNumber,
      points: seed.points.length,
      created: copies.filter((c) => c.ok).length,
    });
    return { ok: true, copies };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`${LOG} threw`, { message });
    return { error: `Could not create practice copies: ${message}` };
  }
}

export const NOT_A_PRACTICE_COPY = "Only a practice copy can be deleted here.";

/**
 * Delete one practice copy and its own rows (points, strokes, history and
 * beats cascade). The delete is matched on `kind = 'practice'`, so no id —
 * not even the key's — can take an analyst session or anything of the match
 * with it. Admin-only. Never throws.
 */
export async function deletePracticeCopy(
  sessionId: unknown,
  deps: PracticeDependencies = defaults,
): Promise<{ ok: true } | { error: string }> {
  const admin = await deps.requireAdmin();
  if (!admin) return { error: ADMIN_REQUIRED };
  const id = normaliseId(sessionId);
  if (!id) return { error: "Invalid session id." };
  try {
    const { data, error } = await deps
      .createAdminClient()
      .from("label_sessions")
      .delete()
      .eq("id", id)
      .eq("kind", "practice")
      .select("id");
    if (error) return { error: `Could not delete the copy: ${error.message}` };
    if (!data || data.length === 0) return { error: NOT_A_PRACTICE_COPY };
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`${LOG} delete threw`, { message });
    return { error: `Could not delete the copy: ${message}` };
  }
}
