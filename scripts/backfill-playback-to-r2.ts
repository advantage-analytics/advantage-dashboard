/**
 * Copy existing playback copies from Azure to R2, verify them, and point their
 * jobs at R2 (`processing_jobs.playback_store = 'r2'`).
 *
 * The playback worker writes new copies to R2 itself once deployed with R2
 * configured; this is for the ones made before (docs/r2-video-storage-plan.md).
 *
 *   npx tsx scripts/backfill-playback-to-r2.ts                 # dry run: what, how many GB, what it costs
 *   npx tsx scripts/backfill-playback-to-r2.ts --apply --limit 5
 *   npx tsx scripts/backfill-playback-to-r2.ts --apply         # the rest
 *   npx tsx scripts/backfill-playback-to-r2.ts --apply --sample  # also sample/match-v1.mp4
 *   npx tsx scripts/backfill-playback-to-r2.ts --drain-deletes   # list queued R2 deletes
 *   npx tsx scripts/backfill-playback-to-r2.ts --drain-deletes --apply  # delete them
 *
 * `--drain-deletes` empties `r2_pending_deletes`: playback copies of deleted
 * matches and accounts, which the app (read token only) cannot delete itself.
 * The playback worker drains it too, at the start of every run; this is for
 * when no upload has come through to start one.
 *
 * Resumable: a copy already in R2 at the same size is not copied again, only
 * marked; a job already marked is not read at all. Run it as often as needed.
 *
 * Safe by construction:
 * - Every part's MD5 is computed here from the bytes read out of Azure and
 *   must equal the ETag R2 returns for that part, and the finished object's
 *   size must equal the Azure blob's, before any row changes.
 * - An object already in R2 at a DIFFERENT size is reported and skipped.
 * - The Azure copy is never deleted. Players fall back to Azure for anything
 *   R2 cannot serve, and removing it is a separate, later decision.
 *
 * Cost: these bytes leave Azure over the internet, billed as egress (about
 * $0.087/GB past the account's free 100 GB a month). The dry run prints the
 * total; `--limit` spreads it out.
 *
 * Env (the shell wins over .env.local): NEXT_PUBLIC_SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY, AZURE_STORAGE_ACCOUNT, AZURE_STORAGE_KEY,
 * AZURE_STORAGE_CONTAINER, R2_ACCOUNT_ID, R2_BUCKET_VIDEOS and the WRITE pair
 * R2_WRITE_ACCESS_KEY_ID / R2_WRITE_SECRET_ACCESS_KEY. Prints no URL and no
 * secret.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";

import { videoContainerClient } from "../src/lib/services/splitstep/video-url";
import { SAMPLE_VIDEO_BLOB } from "../src/lib/services/sample-match/video";
import {
  claimR2Deletes,
  confirmR2Deletes,
} from "../src/lib/services/video-storage/delete-queue";
import {
  isNotFound,
  r2Client,
  requireR2Config,
} from "../src/lib/services/video-storage/r2";

// Minimal .env.local loader (no dotenv dependency), as cleanup-orphan-storage.ts.
try {
  const raw = readFileSync(".env.local", "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const [, k, v] = m;
    if (process.env[k] === undefined) {
      process.env[k] = v.replace(/^["']|["']$/g, "");
    }
  }
} catch {
  // No .env.local: the shell must carry everything.
}

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const SAMPLE = args.includes("--sample");
const DRAIN = args.includes("--drain-deletes");
const limitArg = args.indexOf("--limit");
const LIMIT = limitArg >= 0 ? Number(args[limitArg + 1]) : Infinity;
if (!(LIMIT > 0)) throw new Error("--limit needs a positive number");

const PART_BYTES = 64 * 1024 * 1024; // 64 MiB: ≤ 10,000 parts up to 625 GiB
const CONCURRENCY = 4;
const EGRESS_PER_GB = 0.087;

const gb = (bytes: number) => (bytes / 1e9).toFixed(2);

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed",
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

/** Playback keys of ready copies not yet marked as in R2. */
async function pendingKeys(db: ReturnType<typeof admin>): Promise<string[]> {
  const { data, error } = await db
    .from("processing_jobs")
    .select("playback_object_key, playback_store")
    .eq("playback_status", "ready")
    .not("playback_object_key", "is", null)
    .or("playback_store.is.null,playback_store.neq.r2");
  if (error?.code === "42703") {
    throw new Error(
      "processing_jobs.playback_store does not exist yet: apply " +
        "supabase/migrations/20261110043800_processing_jobs_playback_store.sql first",
    );
  }
  if (error) throw new Error(`Could not read jobs: ${error.message}`);
  return [
    ...new Set(
      (data ?? []).map((r) => r.playback_object_key as string).filter(Boolean),
    ),
  ].sort();
}

async function r2Size(key: string): Promise<number | null> {
  const config = requireR2Config("write");
  try {
    const head = await r2Client(config).send(
      new HeadObjectCommand({ Bucket: config.bucket, Key: key }),
    );
    return head.ContentLength ?? null;
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

/** Azure → R2, part by part, every part's MD5 checked against R2's ETag. */
async function copyToR2(key: string, size: number): Promise<void> {
  const config = requireR2Config("write");
  const { bucket } = config;
  const s3 = r2Client(config);
  const blob = videoContainerClient().getBlockBlobClient(key);
  const { UploadId } = await s3.send(
    new CreateMultipartUploadCommand({
      Bucket: bucket,
      Key: key,
      ContentType: "video/mp4",
    }),
  );
  if (!UploadId) throw new Error("R2 returned no upload id");

  const partCount = Math.max(1, Math.ceil(size / PART_BYTES));
  const etags: string[] = new Array(partCount);
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < partCount) {
      const index = next++;
      const offset = index * PART_BYTES;
      const count = Math.min(PART_BYTES, size - offset);
      const body = await blob.downloadToBuffer(offset, count);
      if (body.length !== count) {
        throw new Error(
          `part ${index + 1}: read ${body.length} of ${count} bytes`,
        );
      }
      const md5 = createHash("md5").update(body).digest();
      const { ETag } = await s3.send(
        new UploadPartCommand({
          Bucket: bucket,
          Key: key,
          UploadId,
          PartNumber: index + 1,
          Body: body,
          ContentLength: count,
        }),
      );
      if (ETag?.replace(/"/g, "") !== md5.toString("hex")) {
        throw new Error(`part ${index + 1}: R2's ETag does not match its MD5`);
      }
      etags[index] = ETag;
      done += 1;
      process.stdout.write(`\r    ${done}/${partCount} parts`);
    }
  };
  try {
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, partCount) }, worker),
    );
    process.stdout.write("\n");
    await s3.send(
      new CompleteMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        UploadId,
        MultipartUpload: {
          Parts: etags.map((ETag, i) => ({ ETag, PartNumber: i + 1 })),
        },
      }),
    );
  } catch (error) {
    process.stdout.write("\n");
    await s3
      .send(
        new AbortMultipartUploadCommand({ Bucket: bucket, Key: key, UploadId }),
      )
      .catch(() => {});
    throw error;
  }
}

async function markInR2(
  db: ReturnType<typeof admin>,
  key: string,
): Promise<number> {
  const { data, error } = await db
    .from("processing_jobs")
    .update({ playback_store: "r2" })
    .eq("playback_object_key", key)
    .eq("playback_status", "ready")
    .select("id");
  if (error) throw new Error(`Could not mark ${key}: ${error.message}`);
  return data?.length ?? 0;
}

/** Delete every queued R2 playback copy, confirming each is gone. */
async function drainDeletes(db: ReturnType<typeof admin>) {
  if (!APPLY) {
    const { data, error } = await db
      .from("r2_pending_deletes")
      .select("object_key, queued_by, attempts")
      .order("queued_at");
    if (error) throw new Error(`Could not read the queue: ${error.message}`);
    for (const r of data ?? []) {
      console.log(
        `  queued: ${r.object_key} (${r.queued_by}, ${r.attempts} attempt(s))`,
      );
    }
    console.log(
      `${data?.length ?? 0} queued. Dry run: re-run with --apply to delete.`,
    );
    return;
  }
  const write = requireR2Config("write");
  const s3 = r2Client(write);
  let total = 0;
  for (;;) {
    const keys = await claimR2Deletes(db, 50);
    if (keys.length === 0) break;
    for (const Key of keys) {
      await s3.send(new DeleteObjectCommand({ Bucket: write.bucket, Key }));
    }
    const { removed, remaining } = await confirmR2Deletes(
      db,
      keys,
      async (key) => (await r2Size(key)) !== null,
    );
    total += removed;
    if (remaining > 0) {
      console.log(`  ${remaining} still present after delete; left queued`);
      break;
    }
  }
  console.log(`Done: ${total} R2 playback cop(ies) deleted and dequeued.`);
}

async function main() {
  requireR2Config("write");
  if (DRAIN) return drainDeletes(admin());
  const db = admin();
  const keys = (await pendingKeys(db)).slice(0, LIMIT);
  const container = videoContainerClient();

  type Item = { key: string; size: number; inR2: number | null };
  const items: Item[] = [];
  for (const key of keys) {
    const props = await container
      .getBlockBlobClient(key)
      .getProperties()
      .catch(() => null);
    if (!props?.contentLength) {
      console.log(`  missing in Azure, skipped: ${key}`);
      continue;
    }
    items.push({
      key,
      size: props.contentLength,
      inR2: await r2Size(key),
    });
  }
  if (SAMPLE) {
    const props = await container
      .getBlockBlobClient(SAMPLE_VIDEO_BLOB)
      .getProperties();
    items.push({
      key: SAMPLE_VIDEO_BLOB,
      size: props.contentLength ?? 0,
      inR2: await r2Size(SAMPLE_VIDEO_BLOB),
    });
  }

  const toCopy = items.filter((i) => i.inR2 === null);
  const conflicts = items.filter((i) => i.inR2 !== null && i.inR2 !== i.size);
  const bytes = toCopy.reduce((sum, i) => sum + i.size, 0);
  console.log(
    `${items.length} playback cop(ies): ${toCopy.length} to copy (${gb(bytes)} GB, ` +
      `≈ $${((bytes / 1e9) * EGRESS_PER_GB).toFixed(2)} of Azure egress), ` +
      `${items.length - toCopy.length - conflicts.length} already in R2, ` +
      `${conflicts.length} in R2 at a different size (skipped).`,
  );
  for (const c of conflicts) {
    console.log(
      `  size mismatch, left alone: ${c.key} (Azure ${c.size}, R2 ${c.inR2})`,
    );
  }
  if (!APPLY) {
    console.log("Dry run. Re-run with --apply to copy and mark.");
    return;
  }

  let copied = 0;
  let marked = 0;
  for (const item of items) {
    if (conflicts.includes(item)) continue;
    if (item.inR2 === null) {
      console.log(`  copying ${item.key} (${gb(item.size)} GB)`);
      await copyToR2(item.key, item.size);
      const after = await r2Size(item.key);
      if (after !== item.size) {
        throw new Error(
          `${item.key}: R2 holds ${after} bytes, Azure ${item.size}`,
        );
      }
      copied += 1;
    }
    if (item.key === SAMPLE_VIDEO_BLOB) {
      console.log(
        "  sample in R2: set SAMPLE_VIDEO_STORE=r2 in Vercel to serve it from there",
      );
      continue;
    }
    marked += await markInR2(db, item.key);
  }
  console.log(`Done: ${copied} copied, ${marked} job row(s) now read from R2.`);
}

main().catch((error) => {
  console.error((error as Error).message);
  process.exit(1);
});
