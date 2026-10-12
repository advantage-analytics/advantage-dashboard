/**
 * List stored match videos that not every browser can play.
 *
 *   npx tsx scripts/scan-video-codecs.ts          # only the ones to repair
 *   npx tsx scripts/scan-video-codecs.ts --all    # every video, with its shape
 *
 * Read-only. For each distinct `processing_jobs.video_object_key` it reads the
 * container metadata over ranged requests (a few MB per file, never the video)
 * and prints the ones `normaliseReason()` flags: not H.264, or above 1080p.
 * Those raise a media error for a viewer whose browser has no decoder for them.
 *
 * Mediabunny directly rather than `inspectMedia()`: that inspector also
 * enforces the attachment feature's zero-based-clock rule, which refuses most
 * trimmed uploads and says nothing about whether a browser can decode them.
 *
 * Requires in .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * AZURE_STORAGE_ACCOUNT, AZURE_STORAGE_KEY.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { readAllPages } from "@/lib/data/admin-range-read";
import { ALL_FORMATS, CustomSource, Input } from "mediabunny";

import { normaliseReason } from "@/lib/match-video/playback-format";
import { azureBlobReader } from "@/lib/services/match-video/probe";
import { resolveAzureStorageConfig } from "@/lib/services/splitstep/video-url";
import { loadEnvLocal } from "./lib/env";

loadEnvLocal();

interface JobRow {
  id: string;
  match_id: string;
  video_object_key: string | null;
}

interface StoredShape {
  videoCodec: string | null;
  codedWidth: number;
  codedHeight: number;
  durationSeconds: number;
  sizeBytes: number;
}

/** Codec, frame size and length of one stored video, pinned to one ETag. */
async function readShape(blobName: string): Promise<StoredShape | string> {
  const reader = azureBlobReader(blobName);
  const signal = new AbortController().signal;
  const { etag, contentLength } = await reader.properties(signal);
  const input = new Input({
    formats: ALL_FORMATS,
    source: new CustomSource({
      getSize: () => contentLength,
      read: async (start, end) =>
        (await reader.read(start, end, etag, signal)).bytes,
      prefetchProfile: "network",
    }),
  });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) return "no video track";
    const [videoCodec, codedWidth, codedHeight, durationSeconds] =
      await Promise.all([
        track.getCodec(),
        track.getCodedWidth(),
        track.getCodedHeight(),
        track.computeDuration(),
      ]);
    return {
      videoCodec,
      codedWidth,
      codedHeight,
      durationSeconds,
      sizeBytes: contentLength,
    };
  } finally {
    input.dispose();
  }
}

async function main() {
  const showAll = process.argv.includes("--all");
  if (!resolveAzureStorageConfig().ok) {
    console.error("Missing AZURE_STORAGE_ACCOUNT / AZURE_STORAGE_KEY.");
    process.exit(1);
  }

  const db = createAdminClient();
  const jobs = await readAllPages<JobRow>(
    db
      .from("processing_jobs")
      .select("id, match_id, video_object_key")
      .not("video_object_key", "is", null)
      .order("id"),
    "could not read processing_jobs",
  );

  const matchByKey = new Map<string, string>();
  for (const job of jobs) {
    if (job.video_object_key)
      matchByKey.set(job.video_object_key, job.match_id);
  }

  let flagged = 0;
  let unread = 0;
  for (const [key, matchId] of matchByKey) {
    try {
      const shape = await readShape(key);
      if (typeof shape === "string") {
        unread += 1;
        console.log(`?  ${matchId}  ${key}  not read: ${shape}`);
        continue;
      }
      const reason = normaliseReason(shape);
      const mbps = (shape.sizeBytes * 8) / shape.durationSeconds / 1e6;
      const line = `${matchId}  ${shape.videoCodec ?? "unknown"} ${shape.codedWidth}×${shape.codedHeight}  ${mbps.toFixed(1)} Mbps  ${(shape.sizeBytes / 1e9).toFixed(2)} GB  ${key}`;
      if (reason) {
        flagged += 1;
        console.log(`!  ${line}  (${reason})`);
      } else if (showAll) {
        console.log(`   ${line}`);
      }
    } catch (cause) {
      unread += 1;
      console.log(
        `?  ${matchId}  ${key}  not read: ${(cause as Error)?.message ?? cause}`,
      );
    }
  }

  console.log(
    `\n${matchByKey.size} video(s): ${flagged} to repair, ${unread} not read.`,
  );
}

main().catch((cause: unknown) => {
  console.error((cause as Error)?.message ?? cause);
  process.exit(1);
});
