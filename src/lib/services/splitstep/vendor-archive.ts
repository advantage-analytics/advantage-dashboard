/**
 * Keep the vendor's per-frame files and its trimmed video — everything a
 * completion links to — before the 7-day SAS urls expire.
 *
 * Shared by the webhook and by scripts/splitstep-archive-vendor-files.ts, the
 * recovery path for a job whose copy missed while its urls are still live.
 *
 * ── Why the players file is gzipped ─────────────────────────────────────────
 * `match-results` caps an object at 50 MB, and the players file of a long
 * match is 60–80 MB of JSON (measured 2026-10-10: 64 MB and 76 MB). Uploaded
 * plain, it was refused by storage on 10 of 14 completed jobs. Gzipped it is a
 * fraction of that, so it is stored as `<key>.gz` with `application/gzip`, and
 * the column records the key actually written. Read it back with
 * {@link readVendorJson}, which inflates a `.gz` key and passes any other
 * through — older jobs stored their players file plain.
 *
 * The trajectories file stays plain (2–5 MB) because ball-paths-store.ts reads
 * it back on every derive, and plain keeps that path unchanged.
 *
 * ── The trimmed video ────────────────────────────────────────────────────────
 * Copied server-side into our Azure container (`trimmed_object_key`), Azure
 * pulling from the vendor's SAS, so no byte passes through this function — a
 * trimmed match is 1–1.5 GB. Playback still prefers the athlete's own upload
 * (match-video-choice.ts); the copy is the fallback and the archive.
 */

import { gunzipSync, gzipSync } from "node:zlib";

import type { createAdminClient } from "@/lib/supabase/admin";
import { videoContainerClient } from "./video-url/azure-sas";
import { RESULTS_BUCKET } from "./config";
import { selectDeliveryStorageKeys } from "./delivery-storage-keys";
import { isAllowedResultUrl, resultUrlHostname } from "./result-url-policy";

type Admin = ReturnType<typeof createAdminClient>;

export const GZIP_SUFFIX = ".gz";

export type ArchiveResult =
  | { ok: true; objectKey: string; bytes: number; storedBytes: number }
  | { ok: false; error: string };

/**
 * Download one vendor JSON file and write it to `match-results`, gzipped when
 * `gzip` is set (the key then gains {@link GZIP_SUFFIX}). Overwrites, so a
 * retry lands on the same key. Refuses a url off the result-host allowlist,
 * and a redirect, exactly as the strokes download does.
 */
export async function archiveVendorJson(params: {
  supabase: Admin;
  url: string;
  objectKey: string;
  timeoutMs: number;
  gzip: boolean;
}): Promise<ArchiveResult> {
  const { supabase, url, timeoutMs, gzip } = params;
  if (!isAllowedResultUrl(url)) {
    return {
      ok: false,
      error: `result url host not allowed: ${resultUrlHostname(url)}`,
    };
  }

  let raw: Buffer;
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "error",
    });
    if (!response.ok) {
      return {
        ok: false,
        error: `Vendor returned ${response.status} ${response.statusText}`,
      };
    }
    raw = Buffer.from(await response.arrayBuffer());
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown fetch error",
    };
  }
  if (raw.length === 0) {
    return { ok: false, error: "Vendor returned an empty body" };
  }

  const objectKey = gzip
    ? `${params.objectKey}${GZIP_SUFFIX}`
    : params.objectKey;
  const body = gzip ? gzipSync(raw) : raw;
  const { error } = await supabase.storage
    .from(RESULTS_BUCKET)
    .upload(objectKey, body, {
      contentType: gzip ? "application/gzip" : "application/json",
      upsert: true,
    });
  if (error) {
    return { ok: false, error: `Storage upload failed: ${error.message}` };
  }
  return { ok: true, objectKey, bytes: raw.length, storedBytes: body.length };
}

/** A stored vendor JSON file as text, inflating a `.gz` key. */
export async function readVendorJson(
  supabase: Admin,
  objectKey: string,
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(RESULTS_BUCKET)
    .download(objectKey);
  if (error || !data) {
    throw new Error(
      `could not read ${objectKey}: ${error?.message ?? "no data"}`,
    );
  }
  const bytes = Buffer.from(await data.arrayBuffer());
  return (objectKey.endsWith(GZIP_SUFFIX) ? gunzipSync(bytes) : bytes).toString(
    "utf8",
  );
}

/** The `se=` expiry a SAS url carries, or null when it has none. */
export function sasExpiry(url: string): Date | null {
  try {
    const se = new URL(url).searchParams.get("se");
    return se ? new Date(se) : null;
  } catch {
    return null;
  }
}

/** How far back the sweep looks: a SAS url's 7 days, and a day's slack. */
const SWEEP_WINDOW_MS = 8 * 24 * 60 * 60 * 1000;

/** One vendor file the sweep looked at, for the caller to log. Never a url. */
export interface SweepLine {
  jobId: string;
  kind: "players" | "trajectories" | "trimmed_video";
  outcome: "expired" | "missing" | "stored" | "copying" | "failed" | "skipped";
  detail: string;
}

/**
 * Every completed job's vendor files that a delivery failed to keep, kept now
 * while their urls are live — the players and trajectories files into
 * `match-results`, the trimmed video into Azure. Soonest expiry first, and it
 * stops starting downloads once `deadline` is near, so a bounded caller (the
 * daily cron) gets the most urgent ones and the rest the next day.
 *
 * `write: false` only reports. The webhook's own copy is the first line; this
 * is the second, shared by the cron and scripts/splitstep-archive-vendor-files.ts.
 */
export async function archiveMissingVendorFiles(params: {
  supabase: Admin;
  write: boolean;
  timeoutMs: number;
  jobId?: string;
  /** Epoch ms after which no new download starts. */
  deadline?: number;
  now?: number;
}): Promise<SweepLine[]> {
  const { supabase, write, timeoutMs, jobId, deadline } = params;
  const now = params.now ?? Date.now();

  let query = supabase
    .from("processing_jobs")
    .select(
      "id, created_by, match_id, external_job_id, players_url, players_object_key, trajectories_url, trajectories_object_key, trimmed_video_url, trimmed_object_key",
    )
    .eq("status", "completed")
    // A SAS url lives 7 days: older jobs have nothing left to fetch.
    .gte("completed_at", new Date(now - SWEEP_WINDOW_MS).toISOString())
    .or(
      "and(players_url.not.is.null,players_object_key.is.null)," +
        "and(trajectories_url.not.is.null,trajectories_object_key.is.null)," +
        "and(trimmed_video_url.not.is.null,trimmed_object_key.is.null)",
    );
  if (jobId) query = query.eq("id", jobId);
  const { data: jobs, error } = await query;
  if (error) throw new Error(`could not list jobs: ${error.message}`);

  const files = (jobs ?? []).flatMap((job) => {
    const keys = selectDeliveryStorageKeys({
      jobId: job.id,
      createdBy: job.created_by,
      matchId: job.match_id,
      externalJobId: job.external_job_id,
      deliveryId: "sweep",
    });
    const all = [
      {
        kind: "players" as const,
        url: job.players_url,
        stored: job.players_object_key,
        key: keys.playersKey,
      },
      {
        kind: "trajectories" as const,
        url: job.trajectories_url,
        stored: job.trajectories_object_key,
        key: keys.trajectoriesKey,
      },
      {
        kind: "trimmed_video" as const,
        url: job.trimmed_video_url,
        stored: job.trimmed_object_key,
        key: keys.trimmedKey,
      },
    ];
    return all
      .filter((f): f is typeof f & { url: string } => !!f.url && !f.stored)
      .map((f) => ({ ...f, jobId: job.id, expiry: sasExpiry(f.url) }));
  });
  files.sort(
    (a, b) =>
      (a.expiry?.getTime() ?? Infinity) - (b.expiry?.getTime() ?? Infinity),
  );

  const lines: SweepLine[] = [];
  for (const file of files) {
    const line = (outcome: SweepLine["outcome"], detail: string) =>
      lines.push({ jobId: file.jobId, kind: file.kind, outcome, detail });
    if (file.expiry && file.expiry.getTime() <= now) {
      line("expired", file.expiry.toISOString());
      continue;
    }
    if (!write) {
      line("missing", `live until ${file.expiry?.toISOString() ?? "unknown"}`);
      continue;
    }
    if (!file.key) {
      line("skipped", "no key: the match cannot be named");
      continue;
    }

    // A copy is one Start Copy request — Azure moves the bytes — so only the
    // JSON downloads are charged against the deadline.
    if (file.kind === "trimmed_video") {
      const copied = await archiveTrimmedVideo({
        supabase,
        jobId: file.jobId,
        sourceUrl: file.url,
        blobName: file.key,
      });
      if (copied.ok) line("copying", `${copied.copyStatus} → ${file.key}`);
      else line("failed", copied.error);
      continue;
    }

    if (deadline !== undefined && Date.now() + timeoutMs > deadline) {
      line("skipped", "out of time — next run");
      continue;
    }
    const players = file.kind === "players";
    const stored = await archiveVendorJson({
      supabase,
      url: file.url,
      objectKey: file.key,
      timeoutMs,
      gzip: players,
    });
    if (!stored.ok) {
      line("failed", stored.error);
      continue;
    }
    const column = players ? "players_object_key" : "trajectories_object_key";
    const { error: recordError } = await supabase
      .from("processing_jobs")
      .update({ [column]: stored.objectKey })
      .eq("id", file.jobId);
    if (recordError) {
      line("failed", `stored ${stored.objectKey}, ${column} NOT recorded`);
    } else {
      line(
        "stored",
        `${(stored.bytes / 1e6).toFixed(1)} MB as ${(stored.storedBytes / 1e6).toFixed(1)} MB → ${stored.objectKey}`,
      );
    }
  }
  return lines;
}

/** What Azure reports for a copy. `pending` is the normal answer for a big one. */
export type BlobCopyStatus = "pending" | "success" | "aborted" | "failed";

/**
 * Start copying the vendor's trimmed video into our container.
 *
 * `beginCopyFromURL` is Azure's async Copy Blob: Azure pulls from the SAS and
 * this returns after the Start Copy request, almost always `pending`. Never
 * `syncCopyFromURL`, which caps at 256 MiB — under every real match. A blob
 * already at the key is left alone (`ifNoneMatch: "*"`), so a redelivery or a
 * re-run never restarts a finished copy.
 */
export async function startTrimmedVideoCopy(params: {
  blobName: string;
  sourceUrl: string;
}): Promise<{ copyStatus: BlobCopyStatus }> {
  if (!isAllowedResultUrl(params.sourceUrl)) {
    throw new Error(
      `result url host not allowed: ${resultUrlHostname(params.sourceUrl)}`,
    );
  }
  const poller = await videoContainerClient()
    .getBlockBlobClient(params.blobName)
    .beginCopyFromURL(params.sourceUrl, { conditions: { ifNoneMatch: "*" } });
  const result = poller.getResult();
  return { copyStatus: (result?.copyStatus as BlobCopyStatus) ?? "pending" };
}

/**
 * Start the trimmed-video copy and record its key on the job, through the
 * same `record_splitstep_trimmed_copy` the webhook used before the copy was
 * retired. Recorded when the copy is accepted, not when it finishes: the key
 * is what tells a later delivery not to start a second one.
 */
export async function archiveTrimmedVideo(params: {
  supabase: Admin;
  jobId: string;
  sourceUrl: string;
  blobName: string;
}): Promise<
  { ok: true; copyStatus: BlobCopyStatus } | { ok: false; error: string }
> {
  const { supabase, jobId, sourceUrl, blobName } = params;
  const record = async (copyStatus: BlobCopyStatus) => {
    const { error } = await supabase.rpc("record_splitstep_trimmed_copy", {
      p_job_id: jobId,
      p_trimmed_object_key: blobName,
    });
    return error
      ? {
          ok: false as const,
          error: `copy started but the key was NOT recorded: ${error.message}`,
        }
      : { ok: true as const, copyStatus };
  };
  try {
    const { copyStatus } = await startTrimmedVideoCopy({ blobName, sourceUrl });
    return await record(copyStatus);
  } catch (err) {
    // A blob already at the key: an earlier copy got there, and only its key
    // went unrecorded. Azure refuses `ifNoneMatch: "*"` with 409
    // BlobAlreadyExists or 412 ConditionNotMet depending on the operation.
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 409 || status === 412) return record("success");
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
