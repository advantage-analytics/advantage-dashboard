/**
 * Keep a completed job's vendor files whose copy missed, while their 7-day
 * urls are still live: the players file (gzipped), the trajectories file and
 * the trimmed video. The same sweep the daily cron runs
 * (`archiveMissingVendorFiles` in vendor-archive.ts), without its time limit.
 *
 * A dry run by default — it lists what is missing and when each url expires.
 *
 *   npx tsx scripts/splitstep-archive-vendor-files.ts             # every job
 *   npx tsx scripts/splitstep-archive-vendor-files.ts --job <uuid>
 *   npx tsx scripts/splitstep-archive-vendor-files.ts --write
 *
 * Never prints a url: they carry their own credential.
 */

import { readFileSync } from "node:fs";
import { createAdminClient } from "@/lib/supabase/admin";
import { archiveMissingVendorFiles } from "@/lib/services/splitstep/vendor-archive";

try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    const [, k, v] = match;
    if (!process.env[k]) process.env[k] = v.replace(/^["']|["']$/g, "").trim();
  }
} catch {
  // Fine when the variables are already exported in the environment.
}

async function main() {
  const jobFlag = process.argv.indexOf("--job");
  const lines = await archiveMissingVendorFiles({
    supabase: createAdminClient(),
    write: process.argv.includes("--write"),
    // Plenty for an 80 MB players file from a script; the cron has less.
    timeoutMs: 180_000,
    jobId: jobFlag !== -1 ? process.argv[jobFlag + 1] : undefined,
  });
  for (const l of lines) {
    console.log(`${l.jobId.slice(0, 8)} ${l.kind}: ${l.outcome} ${l.detail}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
