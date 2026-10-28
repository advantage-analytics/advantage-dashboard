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

/**
 * The More menu's line under Outreach, from real data only:
 *
 *  - the next scheduled send, when one is still to go out —
 *    "Cold outreach scheduled Oct 29";
 *  - otherwise the list size and the last send — "658 contacts · last sent
 *    Oct 2" — or "658 contacts · nothing sent yet";
 *  - null when the tables can't be read, so the menu prints no line rather
 *    than a wrong one.
 */
export async function outreachNavSub(
  now: Date = new Date(),
): Promise<string | null> {
  try {
    const db = createAdminClient();
    const nowIso = now.toISOString();
    const [next, recipients, last] = await Promise.all([
      db
        .from("outreach_sends")
        .select("email_no, scheduled_at")
        .eq("campaign", OUTREACH_CAMPAIGN)
        .eq("status", "scheduled")
        .gt("scheduled_at", nowIso)
        .order("scheduled_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
      db
        .from("outreach_recipients")
        .select("id", { count: "exact", head: true })
        .eq("campaign", OUTREACH_CAMPAIGN),
      db
        .from("outreach_sends")
        .select("created_at, scheduled_at")
        .eq("campaign", OUTREACH_CAMPAIGN)
        .in("status", ["sent", "scheduled"])
        .lte("created_at", nowIso)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (next.error || recipients.error || last.error) return null;

    const scheduled = next.data as {
      email_no: number;
      scheduled_at: string;
    } | null;
    if (scheduled) {
      const name = outreachEmail(scheduled.email_no)?.name ?? "Outreach";
      return `${name} scheduled ${shortDay(scheduled.scheduled_at)}`;
    }

    const contacts = recipients.count ?? 0;
    const lead = `${contacts.toLocaleString("en-US")} ${contacts === 1 ? "contact" : "contacts"}`;
    const sent = last.data as {
      created_at: string;
      scheduled_at: string | null;
    } | null;
    // A scheduled send counts as sent once its time has passed.
    const sentAt = sent ? (sent.scheduled_at ?? sent.created_at) : null;
    return sentAt && Date.parse(sentAt) <= now.getTime()
      ? `${lead} · last sent ${shortDay(sentAt)}`
      : `${lead} · nothing sent yet`;
  } catch {
    return null;
  }
}
