/**
 * Reconcile every non-terminal processing job against the vendor's status
 * endpoint, by hand.
 *
 * The same sweep the matches list and match detail pages run per-page-load
 * (src/lib/services/splitstep/reconcile.ts), but unscoped and uncapped: every
 * job in submitting/queued/processing is considered, not just the three
 * stalest on one user's screen. Run it when a delivery is suspected lost, or
 * after a vendor outage.
 *
 * Run from repo root:
 *   npx tsx scripts/splitstep-reconcile.ts
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * SPLITSTEP_API_URL and SPLITSTEP_API_KEY in .env.local. The 30-minute
 * staleness window and 10-minute poll gap still apply — a job polled recently
 * by a page load is skipped here too, which is correct: the answer cannot
 * have changed and the stamp is shared.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

import { reconcileVendorJobs } from "../src/lib/services/splitstep/reconcile";

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

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required."
    );
    process.exit(1);
  }
  if (!process.env.SPLITSTEP_API_URL || !process.env.SPLITSTEP_API_KEY) {
    console.error("SPLITSTEP_API_URL and SPLITSTEP_API_KEY are required.");
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });

  // No matchIds (sweep everything) and a cap high enough to mean "all of
  // them" — a backlog bigger than this is a vendor incident, not a sweep.
  const outcome = await reconcileVendorJobs({
    supabase,
    cap: 100,
  });

  console.log(
    `polled ${outcome.polled} job(s), ${outcome.transitioned} transitioned`
  );
  if (outcome.polled === 0) {
    console.log(
      "nothing to poll — no job is both non-terminal, >30 min stale, and >10 min since its last poll"
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
