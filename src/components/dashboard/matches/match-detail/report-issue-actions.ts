"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { displayName } from "@/lib/services/programs/invite-acceptance";
import { UUID_RE } from "@/lib/admin/validation";
import type { ActionResult } from "@/components/dashboard/settings/actions";

/**
 * "Something still wrong? Tell us" on a match that is Verified by Advantage
 * (docs/plans/advantage-review.md, step 1): files a `match_issue` row in
 * `program_requests`, the table /admin Requests reads, so it lands in the
 * Waiting tab beside claims and join requests.
 *
 * `program_requests` carries no policies, so the insert is the service
 * role's — but only after the reporter's OWN client has read the match: RLS
 * is what proves they can see it (their match, or a team's they belong to).
 * A match id they cannot read answers exactly like one that does not exist.
 * The address and name are the session's, never the form's.
 *
 * One open report per match and address: a second Send while the first is
 * still in the queue says it is already there rather than filing it twice.
 */

const MATCH_ISSUE_MAX_LENGTH = 2000;

export async function reportMatchIssue(
  matchId: string,
  note: string,
): Promise<ActionResult> {
  const text = typeof note === "string" ? note.trim() : "";
  if (!text) return { ok: false, error: "Say what's still wrong." };
  if (text.length > MATCH_ISSUE_MAX_LENGTH) {
    return {
      ok: false,
      error: `Keep it under ${MATCH_ISSUE_MAX_LENGTH} characters.`,
    };
  }
  if (typeof matchId !== "string" || !UUID_RE.test(matchId)) {
    return { ok: false, error: "That match could not be found." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return { ok: false, error: "Sign in again to send this." };
  }

  const [{ data: match, error: matchError }, { data: profile }] =
    await Promise.all([
      supabase
        .from("matches")
        .select("id, verified")
        .eq("id", matchId)
        .maybeSingle<{ id: string; verified: boolean }>(),
      supabase
        .from("users")
        .select("first_name, last_name")
        .eq("id", user.id)
        .maybeSingle<{ first_name: string | null; last_name: string | null }>(),
    ]);
  if (matchError) {
    console.error("[report-issue] could not read the match", {
      error: matchError.message,
    });
    return { ok: false, error: "Couldn't send that. Try again." };
  }
  if (!match) return { ok: false, error: "That match could not be found." };
  // Only offered on a verified match; a stale tab after a Reopen gets this.
  if (!match.verified) {
    return {
      ok: false,
      error: "This match is no longer Verified by Advantage.",
    };
  }

  const email = user.email.trim().toLowerCase();
  const admin = createAdminClient();
  const { data: open, error: openError } = await admin
    .from("program_requests")
    .select("id")
    .eq("kind", "match_issue")
    .eq("match_id", match.id)
    .eq("email", email)
    .eq("status", "open")
    .limit(1);
  if (openError) {
    console.error("[report-issue] could not read open reports", {
      error: openError.message,
    });
    return { ok: false, error: "Couldn't send that. Try again." };
  }
  if (open && open.length > 0) {
    return {
      ok: false,
      error: "We already have your report on this match, and we'll look at it.",
    };
  }

  const { error: insertError } = await admin.from("program_requests").insert({
    kind: "match_issue",
    match_id: match.id,
    email,
    name: displayName(profile?.first_name ?? null, profile?.last_name ?? null),
    note: text,
  });
  if (insertError) {
    console.error("[report-issue] could not file the report", {
      error: insertError.message,
    });
    return { ok: false, error: "Couldn't send that. Try again." };
  }

  revalidatePath("/admin", "layout");
  return { ok: true };
}
