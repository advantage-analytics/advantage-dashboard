/**
 * Delete the vendor's trimmed video copies from Azure (`trimmed/…`), and null
 * `processing_jobs.trimmed_object_key` on the rows that named them.
 *
 * The copy was retired on 2026-11-12 (docs/r2-video-storage-plan.md): every
 * job keeps its upload and has a playback copy, so the ~70 GB in Azure Hot
 * served no one. Run this only once the code that stopped playing it is
 * deployed to production, or a viewer could still be handed a URL for a blob
 * this deletes.
 *
 *   npx tsx scripts/delete-trimmed-copies.ts                    # dry run: what, how many GB
 *   npx tsx scripts/delete-trimmed-copies.ts --apply --limit 5  # five blobs
 *   npx tsx scripts/delete-trimmed-copies.ts --apply            # the rest
 *
 * Safe by construction:
 * - Only blob names under `trimmed/` are ever deleted; anything else in the
 *   list is refused before any delete runs. `videos/` and `playback/` are
 *   never touched.
 * - A blob named by any job without a ready playback copy is skipped and
 *   listed, unless `--force`: that job may still be playing it (no upload, or
 *   an upload a browser cannot play). Give those jobs a playback copy first.
 * - The row is nulled only after the delete succeeds (or the blob is already
 *   gone), so a failure part way leaves both in step. Resumable: rerun it.
 * - Turn on blob soft delete first, so a mistake can be undone for 7 days.
 *
 * Env (the shell wins over .env.local): NEXT_PUBLIC_SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY, AZURE_STORAGE_ACCOUNT, AZURE_STORAGE_KEY,
 * AZURE_STORAGE_CONTAINER. Prints no URL or secret.
 */
import { readFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";

import { videoContainerClient } from "../src/lib/services/splitstep/video-url";

// Minimal .env.local loader (no dotenv dependency), as the other scripts.
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

const PREFIX = "trimmed/";
const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const FORCE = args.includes("--force");
const limitArg = args.indexOf("--limit");
const LIMIT = limitArg >= 0 ? Number(args[limitArg + 1]) : Infinity;
if (!(LIMIT > 0)) throw new Error("--limit needs a positive number");

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

type JobRow = {
  id: string;
  trimmed_object_key: string;
  playback_object_key: string | null;
  playback_status: string | null;
};

async function main() {
  const db = admin();
  const container = videoContainerClient();

  // Every blob under trimmed/, and the rows that still name one.
  const blobs = new Map<string, number>();
  for await (const blob of container.listBlobsFlat({ prefix: PREFIX })) {
    blobs.set(blob.name, blob.properties.contentLength ?? 0);
  }
  const { data, error } = await db
    .from("processing_jobs")
    .select("id, trimmed_object_key, playback_object_key, playback_status")
    .not("trimmed_object_key", "is", null);
  if (error) throw new Error(`Could not read jobs: ${error.message}`);
  const rows = (data ?? []) as JobRow[];
  const rowsByKey = new Map<string, JobRow[]>();
  for (const row of rows) {
    rowsByKey.set(row.trimmed_object_key, [
      ...(rowsByKey.get(row.trimmed_object_key) ?? []),
      row,
    ]);
  }

  // Every key this run would touch: the blobs, and keys rows name whose blob
  // is already gone (only the column is left to clear).
  const keys = [...new Set([...blobs.keys(), ...rowsByKey.keys()])].sort();
  const outside = keys.filter((k) => !k.startsWith(PREFIX));
  if (outside.length > 0) {
    // A row naming a key outside trimmed/ is not ours to delete here.
    console.error(
      `${outside.length} trimmed_object_key value(s) outside ${PREFIX} — refusing to run:`,
    );
    for (const k of outside) console.error(`  ${k}`);
    process.exit(1);
  }

  // A job without a ready playback copy may still be playing this blob: its
  // upload can be missing, or a format a browser cannot play (a phone .mov
  // the worker could not re-encode). Hold those until they have a copy.
  const stillNeeded = (key: string): boolean =>
    (rowsByKey.get(key) ?? []).some(
      (row) => !(row.playback_status === "ready" && row.playback_object_key),
    );

  const plan: Array<{ key: string; bytes: number; inAzure: boolean }> = [];
  const held: string[] = [];
  for (const key of keys) {
    if (!FORCE && stillNeeded(key)) {
      held.push(key);
      continue;
    }
    plan.push({ key, bytes: blobs.get(key) ?? 0, inAzure: blobs.has(key) });
  }
  const batch = plan.slice(0, LIMIT);
  const bytes = batch.reduce((sum, p) => sum + p.bytes, 0);
  const total = [...blobs.values()].reduce((a, b) => a + b, 0);

  console.log(
    `${blobs.size} blob(s) under ${PREFIX} (${gb(total)} GB); ` +
      `${rows.length} row(s) name one.`,
  );
  console.log(
    `This run: ${batch.length} of ${plan.length} — ${batch.filter((p) => p.inAzure).length} ` +
      `blob(s) to delete (${gb(bytes)} GB), ` +
      `${batch.filter((p) => !p.inAzure).length} row(s) naming a blob already gone.`,
  );
  if (held.length > 0) {
    console.log(
      `${held.length} held back — a job naming it has no ready playback copy (--force to include):`,
    );
    for (const k of held) console.log(`  ${k}`);
  }
  if (!APPLY) {
    for (const p of batch) {
      console.log(`  ${p.inAzure ? gb(p.bytes) + " GB" : "(gone)"}  ${p.key}`);
    }
    console.log("Dry run. Re-run with --apply to delete.");
    return;
  }

  let deleted = 0;
  let cleared = 0;
  for (const { key, inAzure } of batch) {
    if (!key.startsWith(PREFIX)) throw new Error(`refusing ${key}`); // belt and braces
    if (inAzure) {
      await container.getBlockBlobClient(key).deleteIfExists();
      deleted += 1;
    }
    const { data: updated, error: updateError } = await db
      .from("processing_jobs")
      .update({ trimmed_object_key: null })
      .eq("trimmed_object_key", key)
      .select("id");
    if (updateError) {
      throw new Error(
        `Deleted ${key} but could not clear its rows: ${updateError.message}`,
      );
    }
    cleared += updated?.length ?? 0;
  }
  console.log(
    `Done: ${deleted} blob(s) deleted (${gb(bytes)} GB), ${cleared} row(s) cleared.`,
  );
}

main().catch((error) => {
  console.error((error as Error).message);
  process.exit(1);
});
