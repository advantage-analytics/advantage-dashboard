/**
 * The R2 delete queue (`r2_pending_deletes`).
 *
 * The app holds only R2's READ token, so it cannot delete a playback copy when
 * a match or an account is deleted. It queues the key here, and a holder of
 * the WRITE token drains the queue: the playback worker at the start of every
 * run (`/api/webhooks/playback/deletes`), or
 * `scripts/backfill-playback-to-r2.ts --drain-deletes`.
 *
 * A row leaves the queue only once the object is confirmed gone with a HEAD,
 * so a drainer that reports success without deleting changes nothing.
 * Only playback-copy keys are ever queued or handed out
 * ({@link PLAYBACK_COPY_KEY}, enforced again by the table's CHECK).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

const TABLE = "r2_pending_deletes";

/** `playback/<uid>/<match>/<name>.mp4`: the only R2 objects this queue touches. */
export const PLAYBACK_COPY_KEY = /^playback\/[^/]+\/[^/]+\/[^/]+\.mp4$/;

/** Rows tried this many times stop being handed out; they need a look. */
export const MAX_DELETE_ATTEMPTS = 10;

export function isPlaybackCopyKey(key: unknown): key is string {
  return typeof key === "string" && PLAYBACK_COPY_KEY.test(key);
}

/** Queue keys for deletion. Idempotent: a key already queued stays as it is. */
export async function queueR2Deletes(
  db: SupabaseClient,
  keys: string[],
  queuedBy: string,
): Promise<{ queued: number; error: string | null }> {
  const valid = [...new Set(keys.filter(isPlaybackCopyKey))];
  if (valid.length === 0) return { queued: 0, error: null };
  const { error } = await db.from(TABLE).upsert(
    valid.map((object_key) => ({ object_key, queued_by: queuedBy })),
    { onConflict: "object_key", ignoreDuplicates: true },
  );
  return { queued: error ? 0 : valid.length, error: error?.message ?? null };
}

/**
 * Up to `limit` keys to delete, oldest first, each marked as attempted. Two
 * drainers taking the same key is harmless: deleting is idempotent and the row
 * goes only when the object is confirmed gone.
 */
export async function claimR2Deletes(
  db: SupabaseClient,
  limit: number,
): Promise<string[]> {
  const { data, error } = await db
    .from(TABLE)
    .select("object_key, attempts")
    .lt("attempts", MAX_DELETE_ATTEMPTS)
    .order("queued_at", { ascending: true })
    .limit(limit);
  if (error)
    throw new Error(`Could not read the R2 delete queue: ${error.message}`);
  const rows = (data ?? []).filter((r) => isPlaybackCopyKey(r.object_key));
  const now = new Date().toISOString();
  await Promise.all(
    rows.map((r) =>
      db
        .from(TABLE)
        .update({ attempts: (r.attempts as number) + 1, last_attempt_at: now })
        .eq("object_key", r.object_key),
    ),
  );
  return rows.map((r) => r.object_key as string);
}

/**
 * Settle keys a drainer says it deleted: each row whose object `exists`
 * confirms is gone is removed; any still present keeps its row, noted.
 */
export async function confirmR2Deletes(
  db: SupabaseClient,
  keys: string[],
  exists: (key: string) => Promise<boolean>,
): Promise<{ removed: number; remaining: number }> {
  let removed = 0;
  let remaining = 0;
  for (const key of new Set(keys.filter(isPlaybackCopyKey))) {
    let present: boolean;
    try {
      present = await exists(key);
    } catch {
      remaining += 1;
      continue;
    }
    if (present) {
      remaining += 1;
      await db
        .from(TABLE)
        .update({ last_error: "still present after the drainer's delete" })
        .eq("object_key", key);
      continue;
    }
    const { error } = await db.from(TABLE).delete().eq("object_key", key);
    if (error) remaining += 1;
    else removed += 1;
  }
  return { removed, remaining };
}
