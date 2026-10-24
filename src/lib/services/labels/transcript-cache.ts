/**
 * The labels console's cache of a job's derived transcript.
 *
 * `buildJobMarks` (src/lib/data/labels-server.ts) needs the transcript and the
 * rallies the CURRENT derivation code builds from the job's vendor files, and
 * building them means two Storage downloads and a full derivation on every
 * load of a session — on a `force-dynamic` page, so no Next cache holds it
 * across Vercel invocations. `label_transcript_cache` is the durable spot:
 * one row per job, holding the built transcript and rallies as jsonb under a
 * key made of every input the build reads. A load whose key matches the row
 * downloads nothing; a load whose key differs in any part rebuilds and
 * replaces the row.
 *
 * Only the build is cached. The join onto the session's live label rows
 * (`buildLabelMarks`) runs on every load, because the rows are what the
 * labeller is changing.
 *
 * Written only after a build whose `transcript.ok` is true — a refused or
 * failed build writes nothing, so the cache never serves a transcript the
 * console would not have shown. (`DERIVATION_VERSION` carries an
 * "-unreconciled" suffix on every build today; that is the code's version,
 * not the build's outcome, and it is part of the key, not the gate.)
 *
 * Never breaks a load: a cache read or write that fails is logged and the
 * build proceeds — or stands — exactly as it would without the table.
 */

import { createHash } from "node:crypto";

import type { AdminClient } from "@/lib/supabase/admin";
import {
  DERIVATION_VERSION,
  type SplitStepRally,
  type Transcript,
} from "@/lib/services/splitstep/derivation";
import {
  buildTranscriptForJob,
  readJobAndMatch,
  type MatchRow,
  type StoredJobRow,
} from "@/lib/services/splitstep/persist-transcript";

const LOG = "[labels:transcript-cache]";
export const TRANSCRIPT_CACHE_TABLE = "label_transcript_cache";

/** Every input the build reads, as the row stores it. */
export interface TranscriptCacheKey {
  job_id: string;
  derivation_version: string;
  results_object_key: string;
  /** '' when the job stored no trajectories file. */
  trajectories_object_key: string;
  /** sha256 hex of the match's `score` and `format` and the job's `ad_scoring`. */
  fingerprint: string;
}

/** What a hit — or a fresh build — hands `buildJobMarks`. */
export interface CachedTranscript {
  transcript: Transcript;
  rallies: SplitStepRally[];
}

/**
 * JSON with object keys in a fixed order, so the same score typed into a
 * different key order fingerprints the same. Arrays keep their order — a
 * score's sets are ordered.
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

/**
 * The fingerprint of the inputs the build folds under: the match's entered
 * score and format (`best_of`, `ad_scoring`, `play_on_lets`, …) and the job's
 * own `ad_scoring`, which beats the format's (`resolveAdScoring`).
 */
export function transcriptFingerprint(input: {
  score: unknown;
  format: unknown;
  ad_scoring: boolean | null | undefined;
}): string {
  return createHash("sha256")
    .update(
      stableStringify({
        score: input.score ?? null,
        format: input.format ?? null,
        ad_scoring: input.ad_scoring ?? null,
      }),
    )
    .digest("hex");
}

/** The key for a job and its match, under the current derivation code. */
export function transcriptCacheKey(
  job: StoredJobRow,
  match: MatchRow,
  derivationVersion: string = DERIVATION_VERSION,
): TranscriptCacheKey {
  return {
    job_id: job.id,
    derivation_version: derivationVersion,
    results_object_key: job.results_object_key,
    trajectories_object_key: job.trajectories_object_key ?? "",
    fingerprint: transcriptFingerprint({
      score: match.score,
      format: match.format,
      ad_scoring: job.ad_scoring,
    }),
  };
}

/**
 * A rally as the row stores it. `serves` is dropped: it is the same stroke
 * objects as `strokes` filtered to serves, and a JSON round trip would turn
 * the shared references into copies — which `marks.ts` compares by identity
 * (`rally.strokes.indexOf(serve)`). `reviveRallies` rebuilds it from
 * `strokes`, the way rallies.ts built it.
 */
type StoredRally = Omit<SplitStepRally, "serves">;

export function serializeRallies(rallies: readonly SplitStepRally[]): unknown {
  return rallies.map(({ serves: _serves, ...rally }) => rally);
}

export function reviveRallies(stored: unknown): SplitStepRally[] | null {
  if (!Array.isArray(stored)) return null;
  const out: SplitStepRally[] = [];
  for (const entry of stored as StoredRally[]) {
    if (
      !entry ||
      typeof entry !== "object" ||
      typeof entry.rallyId !== "number" ||
      !Array.isArray(entry.strokes)
    ) {
      return null;
    }
    out.push({
      ...entry,
      serves: entry.strokes.filter((stroke) => stroke.strokeType === "serve"),
    });
  }
  return out;
}

/** A stored transcript, or null when the column does not hold one. */
function reviveTranscript(stored: unknown): Transcript | null {
  if (!stored || typeof stored !== "object") return null;
  const candidate = stored as Transcript;
  if (candidate.ok !== true || !Array.isArray(candidate.points)) return null;
  return candidate;
}

interface CacheRow extends TranscriptCacheKey {
  transcript: unknown;
  rallies: unknown;
}

/**
 * The row for `key.job_id` when every key part matches, else null. A read
 * that fails or a row that does not parse is a miss, logged.
 */
export async function readTranscriptCache(
  db: AdminClient,
  key: TranscriptCacheKey,
): Promise<CachedTranscript | null> {
  try {
    const { data, error } = await db
      .from(TRANSCRIPT_CACHE_TABLE)
      .select(
        "job_id, derivation_version, results_object_key, trajectories_object_key, fingerprint, transcript, rallies",
      )
      .eq("job_id", key.job_id)
      .maybeSingle<CacheRow>();
    if (error) throw new Error(error.message);
    if (!data) return null;
    if (
      data.derivation_version !== key.derivation_version ||
      data.results_object_key !== key.results_object_key ||
      data.trajectories_object_key !== key.trajectories_object_key ||
      data.fingerprint !== key.fingerprint
    ) {
      return null;
    }
    const transcript = reviveTranscript(data.transcript);
    const rallies = reviveRallies(data.rallies);
    if (!transcript || !rallies) {
      console.warn(`${LOG} stored row does not parse, rebuilding`, {
        jobId: key.job_id,
      });
      return null;
    }
    return { transcript, rallies };
  } catch (cause: unknown) {
    console.warn(`${LOG} read failed, building without the cache`, {
      jobId: key.job_id,
      message: (cause as Error)?.message,
    });
    return null;
  }
}

/**
 * Replace the job's row with this build. Only a reconciled transcript is
 * written; anything else is a no-op. A failed write is logged, never thrown.
 */
export async function writeTranscriptCache(
  db: AdminClient,
  key: TranscriptCacheKey,
  built: CachedTranscript,
): Promise<void> {
  if (!built.transcript.ok) return;
  try {
    const { error } = await db.from(TRANSCRIPT_CACHE_TABLE).upsert(
      {
        ...key,
        transcript: built.transcript,
        rallies: serializeRallies(built.rallies),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "job_id" },
    );
    if (error) throw new Error(error.message);
  } catch (cause: unknown) {
    console.warn(`${LOG} write failed, the next load rebuilds`, {
      jobId: key.job_id,
      message: (cause as Error)?.message,
    });
  }
}

/**
 * The job's transcript and rallies: from the cache when its key matches,
 * otherwise built with `buildTranscriptForJob` and cached when the build
 * reconciled. Throws when the transcript could not be built or did not
 * reconcile, with the build's reason — the same contract `buildJobMarks` had
 * before the cache.
 */
export async function cachedTranscriptForJob(
  db: AdminClient,
  jobId: string,
): Promise<CachedTranscript> {
  const rows = await readJobAndMatch(db, jobId);
  if (!rows.ok) throw new Error(rows.failure.reason);
  const key = transcriptCacheKey(rows.job, rows.match);

  const hit = await readTranscriptCache(db, key);
  if (hit) return hit;

  const { transcript, rallies, reason } = await buildTranscriptForJob({
    supabase: db,
    jobId,
    rows: { job: rows.job, match: rows.match },
  });
  if (!transcript || !transcript.ok || !rallies) {
    throw new Error(reason ?? "transcript could not be built");
  }
  const built = { transcript, rallies };
  await writeTranscriptCache(db, key, built);
  return built;
}
