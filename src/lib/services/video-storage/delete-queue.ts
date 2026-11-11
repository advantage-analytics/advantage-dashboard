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

/** A queued row older than this, still undeleted, is reported as stuck. */
export const STUCK_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

/** How far a signed drain request's `ts` may be from the server's clock. */
export const DRAIN_REQUEST_WINDOW_MS = 10 * 60 * 1000;

export type DrainRequest =
  { action: "claim" } | { action: "done"; keys: string[] };

/**
 * A drain request the worker could have sent, or null. The signed body
 * carries `ts` (epoch milliseconds) and is refused outside
 * {@link DRAIN_REQUEST_WINDOW_MS}, so a captured request cannot be replayed
 * later; inside the window a replay is harmless (a claim is read-only, and
 * `done` dequeues only what a HEAD confirms is gone).
 */
export function parseDrainRequest(
  value: unknown,
  nowMs: number,
  maxKeys: number,
): DrainRequest | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;
  if (
    typeof raw.ts !== "number" ||
    !Number.isFinite(raw.ts) ||
    Math.abs(nowMs - raw.ts) > DRAIN_REQUEST_WINDOW_MS
  ) {
    return null;
  }
  if (raw.action === "claim") return { action: "claim" };
  if (
    raw.action === "done" &&
    Array.isArray(raw.keys) &&
    raw.keys.length <= maxKeys &&
    raw.keys.every((k) => typeof k === "string")
  ) {
    return { action: "done", keys: raw.keys as string[] };
  }
  return null;
}

/**
 * Up to `limit` keys to delete, oldest first. Read-only: an attempt is
 * counted only when a drainer reports a key and it is still there
 * ({@link confirmR2Deletes}), so neither a replayed claim nor a drainer that
 * dies mid-run uses up a row's attempts. Two drainers taking the same key is
 * harmless: deleting is idempotent and the row goes only once confirmed gone.
 *
 * Rows past {@link MAX_DELETE_ATTEMPTS} or older than {@link STUCK_AFTER_MS}
 * are logged on every claim: the video of a deleted match or account is still
 * in R2, and someone needs to look.
 */
export async function claimR2Deletes(
  db: SupabaseClient,
  limit: number,
  nowMs = Date.now(),
): Promise<string[]> {
  const { data, error } = await db
    .from(TABLE)
    .select("object_key")
    .lt("attempts", MAX_DELETE_ATTEMPTS)
    .order("queued_at", { ascending: true })
    .limit(limit);
  if (error)
    throw new Error(`Could not read the R2 delete queue: ${error.message}`);

  const { data: stuck } = await db
    .from(TABLE)
    .select("object_key, attempts, queued_at")
    .or(
      `attempts.gte.${MAX_DELETE_ATTEMPTS},queued_at.lt.${new Date(nowMs - STUCK_AFTER_MS).toISOString()}`,
    )
    .limit(20);
  if (stuck && stuck.length > 0) {
    console.error(
      `[r2-delete-queue] ${stuck.length}${stuck.length === 20 ? "+" : ""} queued R2 ` +
        `deletion(s) stuck (>= ${MAX_DELETE_ATTEMPTS} attempts or > 7 days) — ` +
        `deleted matches' video is still in R2`,
      { keys: stuck.slice(0, 5).map((r) => r.object_key) },
    );
  }

  return (data ?? []).map((r) => r.object_key).filter(isPlaybackCopyKey);
}

/**
 * Settle keys a drainer says it deleted: each row whose object `exists`
 * confirms is gone is removed; one still present keeps its row and counts an
 * attempt. A HEAD that fails on our side counts nothing.
 */
export async function confirmR2Deletes(
  db: SupabaseClient,
  keys: string[],
  exists: (key: string) => Promise<boolean>,
  nowMs = Date.now(),
): Promise<{ removed: number; remaining: number }> {
  const valid = [...new Set(keys.filter(isPlaybackCopyKey))];
  if (valid.length === 0) return { removed: 0, remaining: 0 };
  const { data: rows } = await db
    .from(TABLE)
    .select("object_key, attempts")
    .in("object_key", valid);
  const attemptsOf = new Map(
    (rows ?? []).map((r) => [r.object_key as string, r.attempts as number]),
  );
  // At most one claim's worth of keys, so the HEADs run side by side.
  const outcomes = await Promise.all(
    valid.map(async (key) => {
      let present: boolean;
      try {
        present = await exists(key);
      } catch {
        return false;
      }
      if (present) {
        await db
          .from(TABLE)
          .update({
            attempts: (attemptsOf.get(key) ?? 0) + 1,
            last_attempt_at: new Date(nowMs).toISOString(),
            last_error: "still present after the drainer's delete",
          })
          .eq("object_key", key);
        return false;
      }
      const { error } = await db.from(TABLE).delete().eq("object_key", key);
      return !error;
    }),
  );
  const removed = outcomes.filter(Boolean).length;
  return { removed, remaining: outcomes.length - removed };
}
