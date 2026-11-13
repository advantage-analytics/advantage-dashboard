import { PROGRAM_CRESTS_BUCKET } from "@/lib/data/teams-server";
import {
  OUTREACH_CAMPAIGN,
  outreachEmail,
} from "@/lib/services/outreach/types";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Admin › Outreach's extra reads for the redesigned page (Outreach2 board)
 * and the admin nav's More menu. Service role, as `outreach-server.ts`: the
 * outreach tables are server-only (no RLS policy), and every caller sits
 * behind `requireAdminOrNotFound()` already.
 */

/**
 * `program_key` → the crest's public URL, for the programs a list points at.
 * Keys with no crest are left out; the cell draws its blank square for them.
 */
export async function loadOutreachCrests(
  keys: string[],
): Promise<Record<string, string>> {
  const db = createAdminClient();
  const unique = [...new Set(keys)];
  const out: Record<string, string> = {};
  // Chunked like `loadPrograms`: a long `in (...)` would overflow the URL.
  for (let at = 0; at < unique.length; at += 300) {
    const { data, error } = await db
      .from("programs")
      .select("program_key, crest_path")
      .in("program_key", unique.slice(at, at + 300))
      .not("crest_path", "is", null);
    if (error) throw new Error(`Loading crests failed: ${error.message}`);
    for (const row of (data ?? []) as {
      program_key: string | null;
      crest_path: string | null;
    }[]) {
      if (!row.program_key || !row.crest_path) continue;
      out[row.program_key] = db.storage
        .from(PROGRAM_CRESTS_BUCKET)
        .getPublicUrl(row.crest_path).data.publicUrl;
    }
  }
  return out;
}

/**
 * "Oct 29". Pacific time: the sends are scheduled from, and read by, an
 * admin in California, and this runs on a server whose zone is UTC.
 */
function shortDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "America/Los_Angeles",
  });
}
