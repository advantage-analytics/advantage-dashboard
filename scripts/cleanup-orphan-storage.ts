/**
 * Delete stored objects whose match no longer exists.
 *
 * Covers all three places a match leaves bytes:
 *
 *   match-data      Supabase Storage   uploaded provider files (.xlsx)
 *   match-results   Supabase Storage   raw vendor results JSON (~1 MB)
 *   advantage-videos  Cloudflare R2    source video (1–5 GB) ← the expensive one
 *
 * All three key layouts put the match id in the THIRD path segment
 * (`.../{userId}/{matchId}/...`), which is what identifies an orphan.
 *
 * Run from repo root:
 *   npx tsx scripts/cleanup-orphan-storage.ts            # dry run
 *   npx tsx scripts/cleanup-orphan-storage.ts --apply    # actually delete
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.
 *
 * R2 is skipped unless R2_ACCOUNT_ID, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY
 * are also present. Those normally live only in the Supabase edge-function
 * secrets, so copy them into .env.local when you want to sweep R2 — that is the
 * bucket where an orphan actually costs money.
 *
 * Deleting a match through the app now cleans all three itself; this exists for
 * strays created before that, and for rows deleted straight from the database.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";

// Minimal .env.local loader (no dotenv dependency).
try {
  const raw = readFileSync(".env.local", "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const [, k, v] = m;
    if (process.env[k] === undefined) {
      process.env[k] = v.replace(/^["'](.*)["']$/, "$1");
    }
  }
} catch {
  // ignore — env may come from shell
}

const SUPABASE_BUCKETS = ["match-data", "match-results"] as const;
const APPLY = process.argv.includes("--apply");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase: SupabaseClient = createClient(url, key, {
  auth: { persistSession: false },
});

/** Match id is the third path segment in every layout we write. */
function matchIdOf(path: string): string | undefined {
  return path.split("/")[2];
}

async function listSupabaseObjects(bucket: string): Promise<string[]> {
  const paths: string[] = [];

  async function walk(prefix: string) {
    const pageSize = 1000;
    let offset = 0;
    while (true) {
      const { data, error } = await supabase.storage.from(bucket).list(prefix, {
        limit: pageSize,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      if (error) throw error;
      if (!data || data.length === 0) break;
      for (const entry of data) {
        const fullPath = prefix ? `${prefix}/${entry.name}` : entry.name;
        // A null id means a folder, not an object.
        if (entry.id === null) {
          await walk(fullPath);
        } else {
          paths.push(fullPath);
        }
      }
      if (data.length < pageSize) break;
      offset += pageSize;
    }
  }

  await walk("");
  return paths;
}

/** Null when R2 is not configured locally — the caller reports and skips. */
function r2Client(): { s3: S3Client; bucket: string } | null {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_VIDEOS ?? "advantage-videos";

  if (!accountId || !accessKeyId || !secretAccessKey) return null;

  return {
    bucket,
    s3: new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      forcePathStyle: true,
      credentials: { accessKeyId, secretAccessKey },
      // R2 rejects the CRC32 checksum headers the SDK adds by default.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    }),
  };
}

async function listR2Objects(s3: S3Client, bucket: string): Promise<string[]> {
  const keys: string[] = [];
  let token: string | undefined;

  do {
    const page = await s3.send(
      new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token })
    );
    for (const obj of page.Contents ?? []) {
      if (obj.Key) keys.push(obj.Key);
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);

  return keys;
}

function reportOrphans(label: string, all: string[], orphans: string[]): void {
  console.log(`[${label}] objects: ${all.length}, orphans: ${orphans.length}`);
  for (const p of orphans.slice(0, 5)) console.log(`  - ${p}`);
  if (orphans.length > 5) console.log(`  … and ${orphans.length - 5} more`);
}

async function main() {
  console.log(`[cleanup] mode=${APPLY ? "APPLY" : "DRY-RUN"}\n`);

  const { data: matches, error: mErr } = await supabase.from("matches").select("id");
  if (mErr) throw mErr;

  const validIds = new Set((matches ?? []).map((m: { id: string }) => m.id));
  console.log(`[cleanup] valid match ids: ${validIds.size}\n`);

  // Guard: an empty match table would mark every object an orphan and wipe the
  // lot. Far more likely a failed query or the wrong project than a genuinely
  // empty database.
  if (validIds.size === 0) {
    console.error(
      "[cleanup] REFUSING: no matches found. Every object would look orphaned.\n" +
        "          Check NEXT_PUBLIC_SUPABASE_URL points at the right project."
    );
    process.exit(1);
  }

  let totalOrphans = 0;
  let totalDeleted = 0;

  /* ── Supabase Storage ── */
  for (const bucket of SUPABASE_BUCKETS) {
    let all: string[];
    try {
      all = await listSupabaseObjects(bucket);
    } catch (err) {
      console.error(`[${bucket}] could not list — skipping:`, err);
      continue;
    }

    const orphans = all.filter((p) => {
      const id = matchIdOf(p);
      return id && !validIds.has(id);
    });

    reportOrphans(bucket, all, orphans);
    totalOrphans += orphans.length;

    if (APPLY && orphans.length > 0) {
      const BATCH = 100;
      for (let i = 0; i < orphans.length; i += BATCH) {
        const batch = orphans.slice(i, i + BATCH);
        const { data, error } = await supabase.storage.from(bucket).remove(batch);
        if (error) {
          console.error(`[${bucket}] batch ${i} failed:`, error.message);
          break;
        }
        totalDeleted += data?.length ?? 0;
      }
      console.log(`[${bucket}] deleted.`);
    }
    console.log("");
  }

  /* ── Cloudflare R2 ── */
  const r2 = r2Client();
  if (!r2) {
    console.log(
      "[advantage-videos] SKIPPED — R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / " +
        "R2_SECRET_ACCESS_KEY not in .env.local.\n" +
        "                  This is the bucket where orphans cost real money; " +
        "copy the keys from the Supabase edge-function secrets to sweep it.\n"
    );
  } else {
    let all: string[];
    try {
      all = await listR2Objects(r2.s3, r2.bucket);
    } catch (err) {
      console.error(`[${r2.bucket}] could not list — skipping:`, err);
      all = [];
    }

    const orphans = all.filter((p) => {
      const id = matchIdOf(p);
      return id && !validIds.has(id);
    });

    reportOrphans(r2.bucket, all, orphans);
    totalOrphans += orphans.length;

    if (APPLY && orphans.length > 0) {
      // DeleteObjects caps at 1000 keys per call.
      const BATCH = 1000;
      for (let i = 0; i < orphans.length; i += BATCH) {
        const batch = orphans.slice(i, i + BATCH);
        const res = await r2.s3.send(
          new DeleteObjectsCommand({
            Bucket: r2.bucket,
            Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: false },
          })
        );
        totalDeleted += res.Deleted?.length ?? 0;
        for (const e of res.Errors ?? []) {
          console.error(`[${r2.bucket}] ${e.Key}: ${e.Message}`);
        }
      }
      console.log(`[${r2.bucket}] deleted.`);
    }
    console.log("");
  }

  if (totalOrphans === 0) {
    console.log("[cleanup] nothing orphaned. Done.");
  } else if (!APPLY) {
    console.log(`[cleanup] ${totalOrphans} orphan(s) found. Rerun with --apply to delete.`);
  } else {
    console.log(`[cleanup] done. removed ${totalDeleted}/${totalOrphans} object(s).`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
