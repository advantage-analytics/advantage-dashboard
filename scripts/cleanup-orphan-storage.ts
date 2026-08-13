/**
 * Delete stored objects whose match no longer exists.
 *
 * Covers all three places a match leaves bytes:
 *
 *   match-data        Supabase Storage   uploaded provider files (.xlsx)
 *   match-results     Supabase Storage   raw vendor results JSON (~1 MB)
 *   advantage-videos  Azure Blob         source video (1–8 GB) ← the expensive one
 *
 * All three key layouts put the match id in the THIRD path segment
 * (`.../{userId}/{matchId}/...`), which is what identifies an orphan. That held
 * across the move from R2 to Azure because the blob name is still whatever
 * videoObjectKey() produced — the store changed, the layout did not.
 *
 * Run from repo root:
 *   npx tsx scripts/cleanup-orphan-storage.ts            # dry run
 *   npx tsx scripts/cleanup-orphan-storage.ts --apply    # actually delete
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.
 *
 * The video container is skipped unless AZURE_STORAGE_ACCOUNT and
 * AZURE_STORAGE_KEY are also present — that is where an orphan actually costs
 * money, so copy them from Vercel when you want to sweep it.
 *
 * Deleting a match through the app now cleans all three itself; this exists for
 * strays created before that, and for rows deleted straight from the database.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import {
  BlobServiceClient,
  StorageSharedKeyCredential,
  type ContainerClient,
} from "@azure/storage-blob";

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

/** Null when Azure is not configured locally — the caller reports and skips. */
function videoContainer(): { container: ContainerClient; name: string } | null {
  const account = process.env.AZURE_STORAGE_ACCOUNT;
  const accountKey = process.env.AZURE_STORAGE_KEY;
  const name = process.env.AZURE_STORAGE_CONTAINER ?? "advantage-videos";

  if (!account || !accountKey) return null;

  const container = new BlobServiceClient(
    `https://${account}.blob.core.windows.net`,
    new StorageSharedKeyCredential(account, accountKey)
  ).getContainerClient(name);

  return { container, name };
}

async function listBlobNames(container: ContainerClient): Promise<string[]> {
  const names: string[] = [];
  // Paging is handled by the async iterator; `flat` means the layout's slashes
  // are part of the name rather than virtual directories, which is what keeps
  // matchIdOf()'s third-segment rule working unchanged.
  for await (const blob of container.listBlobsFlat()) {
    names.push(blob.name);
  }
  return names;
}

/**
 * One place bytes live. Supabase Storage and Azure differ only in how you
 * enumerate and how many keys a delete call takes — the orphan rule, the
 * reporting and the batching are identical, so `sweep()` below owns them once.
 */
interface Store {
  label: string;
  /** Every object key in the store. */
  list(): Promise<string[]>;
  /** Keys per delete call: Supabase Storage takes 100, Azure deletes one at a time. */
  batchSize: number;
  /** Deletes one batch, returning how many went. Throwing aborts this store only. */
  removeBatch(keys: string[]): Promise<number>;
}

async function sweep(
  store: Store,
  validIds: Set<string>
): Promise<{ orphans: number; deleted: number }> {
  let all: string[];
  try {
    all = await store.list();
  } catch (err) {
    console.error(`[${store.label}] could not list — skipping:`, err);
    return { orphans: 0, deleted: 0 };
  }

  const orphans = all.filter((p) => {
    const id = matchIdOf(p);
    return id !== undefined && !validIds.has(id);
  });

  console.log(`[${store.label}] objects: ${all.length}, orphans: ${orphans.length}`);
  for (const p of orphans.slice(0, 5)) console.log(`  - ${p}`);
  if (orphans.length > 5) console.log(`  … and ${orphans.length - 5} more`);

  let deleted = 0;
  if (APPLY && orphans.length > 0) {
    for (let i = 0; i < orphans.length; i += store.batchSize) {
      try {
        deleted += await store.removeBatch(orphans.slice(i, i + store.batchSize));
      } catch (err) {
        // A batch that throws failed at the transport or on credentials, so the
        // next one would too — stop rather than hammer the remaining batches.
        // Per-key failures do not land here; each store logs those and continues.
        console.error(`[${store.label}] batch ${i} failed:`, err);
        break;
      }
    }
    console.log(`[${store.label}] deleted ${deleted}/${orphans.length}.`);
  }
  console.log("");

  return { orphans: orphans.length, deleted };
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

  const stores: Store[] = SUPABASE_BUCKETS.map((bucket) => ({
    label: bucket,
    batchSize: 100,
    list: () => listSupabaseObjects(bucket),
    removeBatch: async (keys) => {
      const { data, error } = await supabase.storage.from(bucket).remove(keys);
      if (error) throw error;
      return data?.length ?? 0;
    },
  }));

  const videos = videoContainer();
  if (videos) {
    stores.push({
      label: videos.name,
      // Azure has no multi-delete verb on the blob API — BlobBatchClient exists
      // but caps at 256 subrequests and needs its own client. One call per blob
      // is honest and fast enough: orphaned videos are counted in dozens.
      batchSize: 1,
      list: () => listBlobNames(videos.container),
      removeBatch: async (keys) => {
        let deleted = 0;
        for (const key of keys) {
          try {
            // deleteIfExists, not delete: a blob already gone is the desired
            // state. It also must not throw — sweep() breaks out of the delete
            // loop on the first throw, so one 404 would abort the whole sweep.
            const res = await videos.container
              .getBlockBlobClient(key)
              .deleteIfExists();
            if (res.succeeded) deleted++;
          } catch (err) {
            console.error(
              `[${videos.name}] ${key}: ${err instanceof Error ? err.message : String(err)}`
            );
          }
        }
        return deleted;
      },
    });
  } else {
    console.log(
      "[advantage-videos] SKIPPED — AZURE_STORAGE_ACCOUNT / AZURE_STORAGE_KEY " +
        "not in .env.local.\n" +
        "                  This is the container where orphans cost real money; " +
        "copy the credentials from Vercel to sweep it.\n"
    );
  }

  let totalOrphans = 0;
  let totalDeleted = 0;
  for (const store of stores) {
    const { orphans, deleted } = await sweep(store, validIds);
    totalOrphans += orphans;
    totalDeleted += deleted;
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
