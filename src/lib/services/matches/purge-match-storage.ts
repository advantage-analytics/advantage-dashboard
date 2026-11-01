import { createAdminClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  productionAttachmentPurgeDeps,
  purgeMatchAttachments,
  type AttachmentPurgeDeps,
} from "@/lib/services/match-video/purge";
import { RESULTS_BUCKET } from "@/lib/services/splitstep/config";
import {
  ballPathsObjectKey,
  ballPathsUserSegment,
  resultsKeyUserSegment,
} from "@/lib/services/splitstep/object-keys";
import { deleteVideoBlob } from "@/lib/services/splitstep/video-url";
import { MATCH_DATA_BUCKET } from "@/lib/services/upload/storage.service";

export interface PurgeMatchStorageOptions {
  /**
   * The video-attachment lane's seams. Production builds them from the
   * service-role client; `tests/match-video-purge.spec.ts` injects fakes.
   */
  attachments?: AttachmentPurgeDeps;
  /**
   * The admin console's deletion guard: `admin_claim_match_storage_purge`
   * (codex/admin-uploads T20), a service-role RPC that claims the purge and
   * answers false for a match the console recorded or analysed. The match
   * delete route replaces it with `admin_claim_match_delete`, which claims
   * without refusing. Production asks the service-role client; the offline
   * purge specs (`tests/match-video-purge.spec.ts`,
   * `tests/purge-match-results-keys.spec.ts`) inject an allow-all fake, since
   * they run with no service-role key and are not about this guard —
   * `tests/admin-match-delete-protection.spec.ts` is.
   */
  claimPurge?: (
    matchIds: string[],
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
  /**
   * The client `keysKeptElsewhere` reads every job through — the service
   * role, since a copy of the match may belong to someone the caller cannot
   * read. Specs pass their fake.
   */
  sharedKeyReader?: SupabaseClient;
}

/**
 * Why `purgeMatchStorage` refused before touching any object — thrown only by
 * the purge-claim guard, and always before a claim is taken.
 *
 *   • `protected` — the claim RPC answered `false`: the admin console recorded
 *     or analysed one of these matches, so it may not be deleted here.
 *   • `unavailable` — the guard could not be checked (the RPC failed, or
 *     answered outside its boolean contract). Retrying may succeed.
 *
 * `message` is written for the account-deletion flow, which shows it as is.
 * The match delete route's claim never refuses, so `protected` does not reach
 * it, and any refusal there is its generic 503. `cause` carries the raw RPC
 * error for logs and must never reach a response.
 */
export class PurgeRefusedError extends Error {
  readonly kind: "protected" | "unavailable";

  constructor(
    kind: "protected" | "unavailable",
    message: string,
    cause?: unknown,
  ) {
    super(message, { cause });
    this.name = "PurgeRefusedError";
    this.kind = kind;
  }
}

/** What the results lane reads off a `processing_jobs` row. */
interface ResultsKeyRow {
  id?: unknown;
  match_id?: unknown;
  created_by?: unknown;
  results_object_key?: unknown;
  players_object_key?: unknown;
  trajectories_object_key?: unknown;
  label_backup_keys?: unknown;
}

/** A usable id: a non-empty string that cannot introduce a path segment. */
function isKeyId(value: unknown): value is string {
  return typeof value === "string" && value !== "" && !value.includes("/");
}

/**
 * The exact objects to remove from `RESULTS_BUCKET` for these job rows.
 *
 * A FIXED LIST, never a sweep. This feeds a service-role `remove` on the bucket
 * holding every athlete's files, so nothing here lists a bucket or builds a
 * prefix, wildcard or directory key: a sweep built from a wrong or empty
 * segment (`results//`, `results/former-member/`) would match other matches'
 * files, and a fixed list has no such failure mode. Every path returned is one
 * of exactly two things:
 *
 *   • a RECORDED column value, verbatim — `results_object_key`,
 *     `players_object_key`, `trajectories_object_key`, and each
 *     `label_backup_keys` entry under the row's own match. Recorded beats
 *     recomputed: an adopted delivery keeps its `orphaned/…` keys, which no
 *     recomputation would reach. A null column contributes nothing.
 *
 *   • a return value of `ballPathsObjectKey`. `ball-paths.json` is the ONE
 *     unrecorded key — there is no column for it — so it is rebuilt from the
 *     row, and only when the row's `id` and `match_id` are both usable and the
 *     match is one this purge was asked about. Two candidates: the key under
 *     `ballPathsUserSegment(created_by)`, and the sibling of the recorded
 *     results key. The sibling exists because `created_by` is nulled when the
 *     uploader leaves, after which a file written under their uuid cannot be
 *     recomputed — but it always sits beside the results key the webhook wrote
 *     in the same delivery. It is taken only when `resultsKeyUserSegment`
 *     proves that key is EXACTLY `results/{segment}/{match_id}/{id}.json` for
 *     this row's own ids — the same anchored check the ball-paths reader uses.
 *     Removing a key that does not exist is a no-op, so the extra candidate is
 *     safe.
 *
 * The cost of a fixed list: a NEW FILE TYPE MUST BE ADDED HERE BY HAND, or it
 * outlives the match it belongs to.
 */
function resultsBucketPaths(
  jobs: ResultsKeyRow[],
  matchIds: string[],
): string[] {
  const paths = new Set<string>();

  for (const job of jobs) {
    for (const recorded of [
      job.results_object_key,
      job.players_object_key,
      job.trajectories_object_key,
    ]) {
      if (typeof recorded === "string" && recorded !== "") paths.add(recorded);
    }

    const { id: jobId, match_id: matchId } = job;
    if (!isKeyId(jobId) || !isKeyId(matchId) || !matchIds.includes(matchId)) {
      continue;
    }

    // Recorded too, server-side only (processing_jobs_guard_storage_keys),
    // and still taken only from under this row's own match.
    if (Array.isArray(job.label_backup_keys)) {
      for (const key of job.label_backup_keys) {
        if (
          typeof key === "string" &&
          key.startsWith(`label-backups/${matchId}/`) &&
          !key.includes("..")
        ) {
          paths.add(key);
        }
      }
    }

    const createdBy =
      typeof job.created_by === "string" && job.created_by !== ""
        ? job.created_by
        : null;
    paths.add(
      ballPathsObjectKey({
        userId: ballPathsUserSegment(createdBy),
        matchId,
        jobId,
      }),
    );

    const siblingSegment = resultsKeyUserSegment({
      resultsObjectKey: job.results_object_key,
      matchId,
      jobId,
    });
    if (siblingSegment !== null) {
      paths.add(ballPathsObjectKey({ userId: siblingSegment, matchId, jobId }));
    }
  }

  return [...paths];
}

/**
 * Of `keys`, those a job on a match OUTSIDE this purge still records in one of
 * `columns`, which must survive it. A copied match carries its source's job
 * keys verbatim — the same results file, the same trimmed video — so deleting
 * one copy must not take the other's files. Null when a read fails: the lane
 * then removes nothing, since a leak is recoverable and a lost file is not.
 */
async function keysKeptElsewhere(
  supabase: SupabaseClient,
  columns: readonly string[],
  keys: readonly string[],
  matchIds: readonly string[],
): Promise<Set<string> | null> {
  const kept = new Set<string>();
  if (keys.length === 0) return kept;
  const reads = await Promise.all(
    columns.map((column) =>
      supabase
        .from("processing_jobs")
        .select(`match_id, ${column}`)
        .in(column, [...keys]),
    ),
  );
  for (const [i, { data, error }] of reads.entries()) {
    if (error) return null;
    for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
      const key = row[columns[i]];
      if (
        typeof key === "string" &&
        isKeyId(row.match_id) &&
        !matchIds.includes(row.match_id)
      ) {
        kept.add(key);
      }
    }
  }
  return kept;
}

/**
 * Remove every stored object belonging to a set of matches.
 *
 * MUST run BEFORE the match rows are deleted, and that ordering is
 * load-bearing: `video_object_key`, `trimmed_object_key`, `playback_object_key`,
 * `results_object_key`, `players_object_key` and `trajectories_object_key` all
 * live on `processing_jobs`, which cascades away with the match. Delete the
 * rows first and the keys are gone, leaving objects that nothing can even name
 * — a permanent multi-GB leak in the video store's case.
 *
 * The results-bucket lane removes a FIXED LIST of files per job (see
 * `resultsBucketPaths`), not a prefix sweep. That list must be extended by
 * hand for any new file type the pipeline stores. `ball-paths.json` is the one
 * key in it that is recorded nowhere and so is rebuilt from the row.
 *
 * Extracted from the match DELETE route so account deletion runs the identical
 * cleanup. A foreign-key `ON DELETE CASCADE` would have been the easy way to
 * make accounts deletable, and it would have skipped all of this: athlete video
 * left in Azure, still billed, still holding footage the person just asked to
 * have erased.
 *
 * The fourth lane — SwingVision video attachments (`match_video_attachments`)
 * — is the exception to the ordering rule, and deliberately so: that table's
 * `match_id` is `on delete set null`, so its blob keys survive the delete and
 * the cleanup worker collects the orphaned objects afterwards. The lane only
 * authorizes, counts and schedules that run; see
 * `lib/services/match-video/purge.ts`.
 *
 * Every step is best-effort. A stranded file is recoverable (see
 * `scripts/cleanup-orphan-storage.ts`); a match or account the user cannot
 * delete is not. So failures log and the caller proceeds regardless.
 */
export async function purgeMatchStorage(
  supabase: SupabaseClient,
  matchIds: string[],
  /** Prefixes the logs, so a stranded object says which path left it. */
  label = "match delete",
  options: PurgeMatchStorageOptions = {},
): Promise<void> {
  if (matchIds.length === 0) return;

  // Console references block account cleanup and the console's abandon. Ordinary
  // creators cannot see this provenance through RLS, so a server-only claim RPC
  // checks it before any object is removed. The match delete route passes its
  // own claim, which does not refuse.
  const sharedKeyReader = options.sharedKeyReader ?? createAdminClient();
  const claimPurge =
    options.claimPurge ??
    (async (ids: string[]) => {
      const { data, error } = await createAdminClient().rpc(
        "admin_claim_match_storage_purge",
        { p_match_ids: ids },
      );
      return { data, error };
    });
  const { data: protectedMatch, error: protectionError } =
    await claimPurge(matchIds);
  // Only an explicit `false` from a clean read is the console's refusal.
  // An error, or any answer outside the RPC's boolean contract, means the
  // guard could not be checked — not that the match is protected.
  if (protectedMatch === false && !protectionError) {
    throw new PurgeRefusedError(
      "protected",
      "Matches recorded, analyzed or hand-labeled through the admin console cannot be deleted here. Contact support to remove them.",
    );
  }
  if (protectedMatch !== true || protectionError) {
    throw new PurgeRefusedError(
      "unavailable",
      "We could not verify whether these matches can be deleted. Try again.",
      protectionError,
    );
  }

  // Both storage cleanups key off the same rows, so they are read once here
  // rather than issuing two near-identical SELECTs.
  //
  // The error is bound and logged rather than discarded. If this read fails,
  // both cleanups silently do nothing and the rows are deleted anyway — a
  // permanent multi-GB leak whose only trace would otherwise be its absence.
  const { data: jobs, error: jobsError } = await supabase
    .from("processing_jobs")
    .select(
      "id, match_id, created_by, video_object_key, trimmed_object_key, playback_object_key, results_object_key, players_object_key, trajectories_object_key, label_backup_keys",
    )
    .in("match_id", matchIds);

  if (jobsError) {
    console.error(
      `[${label}] could not read storage keys for ${matchIds.length} match(es) — ` +
        `video and results will be stranded, recover with ` +
        `scripts/cleanup-orphan-storage.ts:`,
      jobsError.message,
    );
  }

  // The four cleanups key only off the ids and none reads another's output, so
  // they run concurrently rather than costing the sum of their latencies. Each
  // keeps its own try/catch: a throw in the video step must not skip the other
  // three, which is exactly what a single wrapping try would do.
  await Promise.all([
    (async () => {
      try {
        // 1. Videos. Deleted inline rather than through an edge function: this
        //    runtime already holds the storage account key, because the same key
        //    signs the vendor's read SAS.
        //
        //    ALL three keys, not just the source. `trimmed_object_key` is our
        //    copy of the vendor's re-encode, and once the sweeper has removed the
        //    source it is the ONLY video for this match — several GB of it.
        //    `playback_object_key` is the worker's playback copy of the source.
        //
        //    Deduped: every job for one match points at the same source blob, so
        //    a re-submitted match would otherwise delete the same blob twice.
        const candidates = [
          ...new Set(
            (jobs ?? [])
              .flatMap((j) => [
                j.video_object_key as string | null,
                j.trimmed_object_key as string | null,
                j.playback_object_key as string | null,
              ])
              .filter((k): k is string => Boolean(k)),
          ),
        ];
        const kept = await keysKeptElsewhere(
          sharedKeyReader,
          ["video_object_key", "trimmed_object_key", "playback_object_key"],
          candidates,
          matchIds,
        );
        if (!kept) {
          console.error(
            `[${label}] could not check which videos other matches share — none removed`,
          );
          return;
        }
        const blobNames = candidates.filter((k) => !kept.has(k));

        const removed = await Promise.all(
          blobNames.map((blobName) => deleteVideoBlob({ blobName })),
        );

        const count = removed.filter((r) => r.deleted).length;
        if (count > 0) {
          console.log(`[${label}] removed ${count} video blob(s)`);
        }
      } catch (err) {
        console.error(`[${label}] video cleanup threw:`, err);
      }
    })(),

    (async () => {
      try {
        // 2. Everything a job left in the results bucket: the vendor's
        //    strokes, players and trajectories files and our derived ball
        //    paths. Same bucket the webhook writes to, so this client can
        //    remove them directly. One `remove`, of a fixed de-duplicated list.
        const candidates = resultsBucketPaths(
          (jobs ?? []) as ResultsKeyRow[],
          matchIds,
        );
        const kept = await keysKeptElsewhere(
          sharedKeyReader,
          [
            "results_object_key",
            "players_object_key",
            "trajectories_object_key",
          ],
          candidates,
          matchIds,
        );
        if (!kept) {
          console.error(
            `[${label}] could not check which results files other matches share — none removed`,
          );
          return;
        }
        const resultKeys = candidates.filter((k) => !kept.has(k));

        if (resultKeys.length > 0) {
          const { error: resultsError } = await supabase.storage
            .from(RESULTS_BUCKET)
            .remove(resultKeys);

          if (resultsError) {
            console.error(
              `[${label}] results cleanup failed for ${RESULTS_BUCKET}:`,
              resultsError.message,
            );
          }
        }
      } catch (err) {
        console.error(`[${label}] results cleanup threw:`, err);
      }
    })(),

    (async () => {
      try {
        // 3. Uploaded provider files (SwingVision .xlsx and friends). There is
        //    one bucket for these, so it is named directly rather than read from
        //    a row.
        const { data: files, error: filesError } = await supabase
          .from("match_files")
          .select("storage_path")
          .in("match_id", matchIds);

        if (filesError) {
          console.error(
            `[${label}] could not read match_files:`,
            filesError.message,
          );
          return;
        }

        const paths = (files ?? [])
          .map((f) => f.storage_path as string | null)
          .filter((p): p is string => Boolean(p));

        if (paths.length > 0) {
          const { error: storageError } = await supabase.storage
            .from(MATCH_DATA_BUCKET)
            .remove(paths);

          if (storageError) {
            console.error(
              `[${label}] storage cleanup failed for ${MATCH_DATA_BUCKET}:`,
              storageError.message,
            );
          }
        }
      } catch (err) {
        console.error(`[${label}] storage cleanup threw:`, err);
      }
    })(),

    (async () => {
      try {
        // 4. SwingVision video attachments. Nothing is deleted here: the
        //    rows outlive the match (FK set null) and the worker collects
        //    them once it is gone. This lane authorizes the ids, counts what
        //    the delete strands, and schedules that run for after the
        //    caller's response. A failure here strands nothing new — the
        //    daily sweep finds the same orphans — and must not skip the
        //    three lanes above, whose keys do NOT survive the delete.
        await purgeMatchAttachments({
          caller: supabase,
          matchIds,
          label,
          deps: options.attachments ?? productionAttachmentPurgeDeps(),
        });
      } catch (err) {
        console.error(
          `[${label}] attachment cleanup threw — rows keep their keys and ` +
            `the daily sweep collects them once the match is gone:`,
          err,
        );
      }
    })(),
  ]);
}
