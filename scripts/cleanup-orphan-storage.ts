/**
 * One-off cleanup: delete orphan objects in the `match-data` bucket whose
 * `{matchId}` path segment (third segment) has no row in `public.matches`.
 *
 * Run from repo root:
 *   npx tsx scripts/cleanup-orphan-storage.ts            # dry run
 *   npx tsx scripts/cleanup-orphan-storage.ts --apply    # actually delete
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

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

const BUCKET = "match-data";
const APPLY = process.argv.includes("--apply");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

type ObjectRow = { name: string };

async function listAllObjects(): Promise<string[]> {
  const paths: string[] = [];
  async function walk(prefix: string) {
    const pageSize = 1000;
    let offset = 0;
    while (true) {
      const { data, error } = await supabase.storage.from(BUCKET).list(prefix, {
        limit: pageSize,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      if (error) throw error;
      if (!data || data.length === 0) break;
      for (const entry of data) {
        const fullPath = prefix ? `${prefix}/${entry.name}` : entry.name;
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

async function main() {
  console.log(`[cleanup] mode=${APPLY ? "APPLY" : "DRY-RUN"} bucket=${BUCKET}`);

  const { data: matches, error: mErr } = await supabase.from("matches").select("id");
  if (mErr) throw mErr;
  const validIds = new Set((matches as ObjectRow[] | { id: string }[]).map((m: any) => m.id));
  console.log(`[cleanup] valid match ids: ${validIds.size}`);

  const allPaths = await listAllObjects();
  console.log(`[cleanup] total storage objects: ${allPaths.length}`);

  const orphans = allPaths.filter((p) => {
    const segments = p.split("/");
    const matchIdSegment = segments[2];
    return matchIdSegment && !validIds.has(matchIdSegment);
  });
  console.log(`[cleanup] orphan objects: ${orphans.length}`);

  if (orphans.length === 0) {
    console.log("[cleanup] nothing to delete.");
    return;
  }

  console.log("[cleanup] sample orphans:");
  for (const p of orphans.slice(0, 5)) console.log("  -", p);

  if (!APPLY) {
    console.log("[cleanup] dry-run; rerun with --apply to delete.");
    return;
  }

  const BATCH = 100;
  let deleted = 0;
  for (let i = 0; i < orphans.length; i += BATCH) {
    const batch = orphans.slice(i, i + BATCH);
    const { data, error } = await supabase.storage.from(BUCKET).remove(batch);
    if (error) {
      console.error(`[cleanup] batch ${i}-${i + batch.length} failed:`, error);
      throw error;
    }
    deleted += data?.length ?? 0;
    console.log(`[cleanup] deleted ${deleted}/${orphans.length}`);
  }
  console.log(`[cleanup] done. removed ${deleted} objects.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
