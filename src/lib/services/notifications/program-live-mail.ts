import { siteUrl } from "@/lib/site-url";
import {
  sendEmail,
  programLiveInternalEmail,
  INTERNAL_ALERTS_ADDRESS,
} from "@/lib/services/email";
import {
  programStatusFor,
  type ClaimStatus,
} from "@/lib/services/programs/claim-state";
import { claimSend } from "./should-notify";
import type { createAdminClient } from "@/lib/supabase/admin";

/**
 * "A program just went live" — one FYI to the internal alerts inbox.
 *
 * Two doors lead to a live program, and both call this:
 *
 *  - `path: "auto"` — `completeClaim()` / `completeClaimWithToken()`, when the
 *    `complete_program_claim*` RPC landed the claim in `objection_window` or
 *    `approved` on its own. That is NOT the same as `contact_matched`: a
 *    program with `domain_match_skips_review` also lands live with the flag
 *    false, so the decision reads `status` (see `shouldAnnounceProgramLive`).
 *  - `path: "reviewed"` — `transition()` in `admin-actions.ts`, when an
 *    admin's approval opens the objection window. `approved` arrives later via
 *    `settle` and is not a second "went live".
 */
export interface ProgramWentLiveEvent {
  /** `programs.id` — the dedupe key. The RPCs never return a claim id. */
  programId: string;
  programName: string;
  claimantName: string;
  claimantEmail: string;
  path: "auto" | "reviewed";
}

/**
 * Should a `complete_program_claim*` result announce a live program?
 *
 * True only when the RPC's `status` is one `programStatusFor` calls "active"
 * (`objection_window` / `approved`) AND the call did not take the
 * `already_owned` branch — that branch inserted no new claim, so the program
 * was live before this request and has nothing new to announce.
 *
 * Pure so it is testable offline; the claim actions are the only callers.
 */
export function shouldAnnounceProgramLive(
  rpc: { status: ClaimStatus; already_owned: boolean } | null,
): boolean {
  if (!rpc) return false;
  return (
    programStatusFor(rpc.status) === "active" && rpc.already_owned === false
  );
}

/**
 * Mail `INTERNAL_ALERTS_ADDRESS` that one program went live.
 *
 * Gated by `claimSend("program_live:<program_id>")`, claimed before anything
 * is rendered: a retried action or a double-clicked approval finds the key
 * spent and stays silent. Keyed on the program rather than the claim, so this
 * fires once per program lifetime — a program handed back and reclaimed later
 * never alerts again, which was accepted as the trade for a key both doors
 * can build.
 *
 * `db` is taken for parity with `notifyAdminsReviewNeeded` — every caller
 * already holds an admin client — though nothing here reads with it today.
 *
 * Never throws and never returns a failure: the program is live whether or not
 * this arrives, and `sendEmail` has already logged the technical cause.
 */
export async function notifyProgramWentLive(
  db: ReturnType<typeof createAdminClient>,
  event: ProgramWentLiveEvent,
): Promise<void> {
  void db;

  const claimed = await claimSend(`program_live:${event.programId}`);
  if (!claimed) return;

  const sent = await sendEmail(
    programLiveInternalEmail({
      to: INTERNAL_ALERTS_ADDRESS,
      programName: event.programName,
      claimantName: event.claimantName,
      claimantEmail: event.claimantEmail,
      path: event.path,
      adminUrl: `${siteUrl()}/admin`,
    }),
  );

  if (!sent.ok) {
    console.warn("[program-live] notification not sent", {
      programId: event.programId,
      path: event.path,
    });
  }
}
