/**
 * Give existing match videos a list-row thumbnail
 * (`matches.video_thumbnail_key`, `thumbnails/{matchId}/{uuid}.jpg`).
 *
 * New uploads capture theirs in the browser; this is for the matches uploaded
 * before that, and for any upload whose browser could not read a frame.
 *
 *   npx tsx scripts/backfill-match-thumbnails.ts                  # dry run: which matches, from which copy
 *   npx tsx scripts/backfill-match-thumbnails.ts --apply          # the first 10
 *   npx tsx scripts/backfill-match-thumbnails.ts --apply --limit 25
 *   npx tsx scripts/backfill-match-thumbnails.ts --apply --match <match-id>
 *
 * Small batches on purpose: `--limit` defaults to 10 and matches are done one
 * at a time. Run it again for the next batch.
 *
 * Safe to re-run:
 * - Only matches whose key is NULL are read, and the row is written with the
 *   same condition, so a thumbnail a browser stored meanwhile is never
 *   replaced. The image this run uploaded is then deleted again.
 * - A match with no readable video is reported and skipped, every time.
 * - Nothing is ever deleted except this run's own unused image.
 *
 * How a frame is read: ffmpeg seeks inside the video over HTTP (a short-lived
 * read URL, never printed), so only a few megabytes are fetched however large
 * the file is. The playback copy is preferred (R2: no egress); then our copy
 * of the vendor's re-encode; then the original upload.
 *
 * The frame is ~90 s past the first point where the match has points, and
 * never past the midpoint — the same rule as the browser capture
 * (`thumbnailCaptureTime`).
 *
 * Needs `ffmpeg` and `ffprobe` on PATH.
 *
 * Env (the shell wins over the local env file): NEXT_PUBLIC_SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY, AZURE_STORAGE_ACCOUNT, AZURE_STORAGE_KEY,
 * AZURE_STORAGE_CONTAINER, and for copies in R2 the read pair
 * R2_ACCOUNT_ID / R2_BUCKET_VIDEOS / R2_READ_ACCESS_KEY_ID /
 * R2_READ_SECRET_ACCESS_KEY. Prints no URL and no secret.
 */
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { createClient } from "@supabase/supabase-js";

import {
  looksLikeJpeg,
  THUMBNAIL_HEIGHT_PX,
  THUMBNAIL_MAX_BYTES,
  THUMBNAIL_WIDTH_PX,
  thumbnailCaptureTime,
  thumbnailObjectKey,
} from "../src/lib/match-thumbnail";
import { azureThumbnailStorage } from "../src/lib/services/match-thumbnail/storage";
import { mintPlaybackSas } from "../src/lib/services/splitstep/video-url/azure-sas";
import {
  mintR2Playback,
  resolveR2Config,
} from "../src/lib/services/video-storage/r2";
import { loadEnvLocal } from "./lib/env";

loadEnvLocal();

const run = promisify(execFile);

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const limitArg = args.indexOf("--limit");
const LIMIT = limitArg >= 0 ? Number(args[limitArg + 1]) : 10;
if (!(LIMIT > 0)) throw new Error("--limit needs a positive number");
const matchArg = args.indexOf("--match");
const ONLY_MATCH = matchArg >= 0 ? args[matchArg + 1] : null;
if (matchArg >= 0 && !ONLY_MATCH) throw new Error("--match needs a match id");

/** A read URL good for one ffmpeg run. Server-side only; never logged. */
const SOURCE_URL_TTL_SECONDS = 15 * 60;
const FFMPEG_TIMEOUT_MS = 120_000;

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed",
    );
  }
  return {
    db: createClient(url, key, { auth: { persistSession: false } }),
    url,
  };
}

type Db = ReturnType<typeof admin>["db"];

interface Source {
  matchId: string;
  /** For the report: which copy the frame comes from. */
  kind:
    "playback (R2)" | "playback" | "vendor copy" | "original" | "attachment";
  store: "r2" | "azure";
  key: string;
}

interface JobRow {
  match_id: string;
  created_at: string;
  video_object_key: string | null;
  trimmed_object_key: string | null;
  playback_object_key: string | null;
  playback_status: string | null;
  playback_store: string | null;
}

function sourceOfJob(job: JobRow): Omit<Source, "matchId"> | null {
  if (job.playback_object_key && job.playback_status === "ready") {
    return job.playback_store === "r2"
      ? { kind: "playback (R2)", store: "r2", key: job.playback_object_key }
      : { kind: "playback", store: "azure", key: job.playback_object_key };
  }
  if (job.trimmed_object_key) {
    return { kind: "vendor copy", store: "azure", key: job.trimmed_object_key };
  }
  if (job.video_object_key) {
    return { kind: "original", store: "azure", key: job.video_object_key };
  }
  return null;
}

/** Matches with a video and no thumbnail, by id so every run sees one order. */
async function pending(db: Db): Promise<Source[]> {
  const sources = new Map<string, Source>();

  const jobs = await db
    .from("processing_jobs")
    .select(
      "match_id, created_at, video_object_key, trimmed_object_key, playback_object_key, playback_status, playback_store",
    )
    .not("match_id", "is", null)
    .order("created_at", { ascending: false });
  if (jobs.error) throw new Error(`Could not read jobs: ${jobs.error.message}`);
  // Newest job first, so the first source seen for a match is its current one.
  for (const job of (jobs.data ?? []) as JobRow[]) {
    if (sources.has(job.match_id)) continue;
    const source = sourceOfJob(job);
    if (source) sources.set(job.match_id, { matchId: job.match_id, ...source });
  }

  const attachments = await db
    .from("match_video_attachments")
    .select("match_id, final_blob_key")
    .eq("state", "active")
    .not("match_id", "is", null)
    .not("final_blob_key", "is", null);
  if (attachments.error) {
    throw new Error(`Could not read attachments: ${attachments.error.message}`);
  }
  for (const row of attachments.data ?? []) {
    // An active attachment is the video the match plays.
    sources.set(row.match_id as string, {
      matchId: row.match_id as string,
      kind: "attachment",
      store: "azure",
      key: row.final_blob_key as string,
    });
  }

  const ids = [...sources.keys()];
  const missing = new Set<string>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await db
      .from("matches")
      .select("id")
      .in("id", ids.slice(i, i + 200))
      .is("video_thumbnail_key", null);
    if (error?.code === "42703") {
      throw new Error(
        "matches.video_thumbnail_key does not exist yet: apply " +
          "supabase/migrations/20261123050000_matches_video_thumbnail_key.sql first",
      );
    }
    if (error) throw new Error(`Could not read matches: ${error.message}`);
    for (const row of data ?? []) missing.add(row.id as string);
  }

  return [...sources.values()]
    .filter((s) => missing.has(s.matchId))
    .filter((s) => !ONLY_MATCH || s.matchId === ONLY_MATCH)
    .sort((a, b) => a.matchId.localeCompare(b.matchId));
}

function readUrl(source: Source): string {
  if (source.store === "r2") {
    if (!resolveR2Config("read").ok) {
      throw new Error("the copy is in R2 and R2's read pair is not set");
    }
    return mintR2Playback({
      key: source.key,
      ttlSeconds: SOURCE_URL_TTL_SECONDS,
    }).playbackUrl;
  }
  return mintPlaybackSas({
    blobName: source.key,
    ttlSeconds: SOURCE_URL_TTL_SECONDS,
    stable: false,
  }).playbackUrl;
}

async function durationOf(url: string): Promise<number> {
  const { stdout } = await run(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      url,
    ],
    { timeout: FFMPEG_TIMEOUT_MS },
  );
  const seconds = Number(stdout.trim());
  if (!(seconds > 0)) throw new Error("ffprobe reported no duration");
  return seconds;
}

async function firstPointSeconds(
  db: Db,
  matchId: string,
): Promise<number | null> {
  const { data } = await db
    .from("points")
    .select("video_time")
    .eq("match_id", matchId)
    .not("video_time", "is", null)
    .order("video_time", { ascending: true })
    .limit(1);
  const raw = data?.[0]?.video_time;
  const value = raw === null || raw === undefined ? NaN : Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

async function grabFrame(url: string, atSeconds: number, out: string) {
  const box = `${THUMBNAIL_WIDTH_PX}:${THUMBNAIL_HEIGHT_PX}`;
  await run(
    "ffmpeg",
    [
      "-nostdin",
      "-v",
      "error",
      "-y",
      // Before `-i`: an input seek, so ffmpeg range-requests near the frame
      // instead of reading the file up to it.
      "-ss",
      atSeconds.toFixed(2),
      "-i",
      url,
      "-frames:v",
      "1",
      "-vf",
      `scale=${box}:force_original_aspect_ratio=decrease,` +
        `pad=${box}:(ow-iw)/2:(oh-ih)/2:black`,
      "-q:v",
      "4",
      "-f",
      "image2",
      out,
    ],
    { timeout: FFMPEG_TIMEOUT_MS },
  );
}

/** ffmpeg's errors quote its arguments; the read URL must not reach a log. */
function safeMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text
    .replace(/https?:\/\/\S+/g, "<url>")
    .split("\n")[0]
    .slice(0, 200);
}

async function main() {
  const { db, url } = admin();
  const storage = azureThumbnailStorage();
  if (!storage.available()) {
    throw new Error("AZURE_STORAGE_ACCOUNT / _KEY / _CONTAINER are needed");
  }

  const all = await pending(db);
  const batch = all.slice(0, LIMIT);
  console.log(`Project: ${new URL(url).host}`);
  console.log(
    `${all.length} match(es) have a video and no thumbnail; ` +
      `${APPLY ? "doing" : "would do"} ${batch.length} this run.`,
  );
  if (!APPLY) {
    for (const s of batch) console.log(`  ${s.matchId}  from ${s.kind}`);
    console.log("Dry run: nothing read or written. Pass --apply to run.");
    return;
  }

  const dir = mkdtempSync(join(tmpdir(), "match-thumbs-"));
  let stored = 0;
  let skipped = 0;
  try {
    for (const source of batch) {
      const out = join(dir, `${source.matchId}.jpg`);
      try {
        const sourceUrl = readUrl(source);
        const duration = await durationOf(sourceUrl);
        const at = thumbnailCaptureTime({
          durationSeconds: duration,
          startSeconds: await firstPointSeconds(db, source.matchId),
        });
        await grabFrame(sourceUrl, at, out);

        const bytes = new Uint8Array(readFileSync(out));
        if (!looksLikeJpeg(bytes) || bytes.length > THUMBNAIL_MAX_BYTES) {
          throw new Error(
            `ffmpeg wrote ${bytes.length} bytes, not a thumbnail`,
          );
        }

        const key = thumbnailObjectKey(source.matchId, randomUUID());
        await storage.put(key, bytes);
        const { data, error } = await db
          .from("matches")
          .update({ video_thumbnail_key: key })
          .eq("id", source.matchId)
          .is("video_thumbnail_key", null)
          .select("id");
        if (error || (data ?? []).length !== 1) {
          // Somebody stored one meanwhile, or the match is gone. Either way
          // this image is nobody's.
          await storage.delete(key).catch(() => undefined);
          throw new Error(
            error?.message ?? "the match already has a thumbnail",
          );
        }
        stored += 1;
        console.log(
          `  ok ${source.matchId}  ${source.kind}  @${Math.round(at)}s  ${bytes.length} B`,
        );
      } catch (error) {
        skipped += 1;
        console.log(`  -- ${source.matchId}  skipped: ${safeMessage(error)}`);
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log(
    `Stored ${stored}, skipped ${skipped}. ` +
      `${Math.max(0, all.length - batch.length)} left for the next run.`,
  );
}

main().catch((error) => {
  console.error(safeMessage(error));
  process.exit(1);
});
