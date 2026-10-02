import { emailOrigin } from "@/lib/site-url";
import {
  sendEmail,
  adminReviewNeededEmail,
  INTERNAL_ALERTS_ADDRESS,
} from "@/lib/services/email";
import { claimSend } from "./should-notify";
import type { createAdminClient } from "@/lib/supabase/admin";

/**
 * "A human has to look at this" — fanned out to every admin, once per event.
 *
 * ── Signature shape, decided here ───────────────────────────────────────────
 * The task spec left `notifyAdminsReviewNeeded(db, { kind, id, ... })` loosely
 * specified on purpose. The four call sites split into two kinds, and each
 * kind needs different source fields even though the *email* only ever wants
 * one shape (`programName` / `claimantName` / `claimedEmail` / `reason` —
 * see `templates/admin.ts`):
 *
 *  - `kind: "claim"` — `id` is `program_claims.id`, the row that just landed
 *    in `pending_review` or `objected`. The "claimant" is the person who
 *    filed the claim.
 *  - `kind: "request"` — `id` is `program_requests.id`, a newly created open
 *    row (an invite request or an unlisted-program submission). The
 *    "claimant" is the requester.
 *
 * Both `id`s are the same column `admin-requests-server.ts` reads back as
 * `AdminRequestRow.id` for the merged queue, which is what makes
 * `?id=<id>` a real deep link rather than a guess: `RequestsPageContent`
 * (T15) reads that param as `initialSelectedId` and opens the matching row's
 * drawer regardless of which table it came from.
 *
 * A discriminated union rather than one flat object with optional fields:
 * every field below is required for its kind, and a flat shape would let a
 * caller send `kind: "claim"` with a `requesterEmail` that never gets read
 * without the compiler noticing.
 *
 * `db` is accepted rather than created here so a caller that already holds an
 * admin client (every call site in `claim-actions.ts` does, either directly
 * or one `createAdminClient()` away) doesn't stand up a second one for one
 * more query — this function is one more read on a request that has already
 * paid for a service-role client.
 */
export type AdminReviewNeededEvent =
  | {
      kind: "claim";
      /** `program_claims.id`. */
      id: string;
      programName: string;
      claimantName: string;
      claimantEmail: string;
      /** `reviewReason()`'s answer — why this claim needs a human. */
      reason: string;
    }
  | {
      kind: "request";
      /** `program_requests.id`. */
      id: string;
      programName: string;
      requesterName: string;
      requesterEmail: string;
      /** A plain sentence — there is no `reviewReason()` for a request row. */
      reason: string;
    };

/**
 * The final recipient list for one review-needed event: every admin address,
 * plus the internal alerts inbox, deduped case-insensitively.
 *
 * Pure so the dedupe rule is testable without a database or a mocked
 * `sendEmail` — `notifyAdminsReviewNeeded` is the only caller. An admin whose
 * row happens to carry `team@advantage-analytics.com` (case-insensitively)
 * yields one email, not two: address casing is not a meaningful distinction
 * for a mail provider, and a second copy in the same inbox reads as a bug.
 */
export function reviewNeededRecipients(
  adminEmails: readonly string[],
  internal: string,
): string[] {
  const seen = new Set<string>();
  const recipients: string[] = [];
  for (const email of [...adminEmails, internal]) {
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    recipients.push(email);
  }
  return recipients;
}

/**
 * Notify every admin, plus `INTERNAL_ALERTS_ADDRESS`, that one event needs a
 * decision.
 *
 * Gated once per event, not once per recipient: `claimSend("admin_review:<kind>:<id>")`
 * is claimed before any admin is even looked up, so a caller that fires this
 * twice for the SAME row — a double-submitted form landing on the unique
 * index's existing row, a retried server action — finds the key already spent
 * and does nothing, rather than mailing everyone a second time. Losing the
 * whole notification on the rare crash between the claim and the sends is the
 * cheaper failure; the row is still sitting in the queue either way.
 *
 * The internal address always gets a copy, even when no `is_admin` user has
 * an email on file — that used to mean the notice went nowhere and nobody
 * noticed, which is exactly the failure mode this alert exists to prevent.
 *
 * Reads `users` where `is_admin = true` — the partial index added in T1
 * (`users_admins_idx`, `ON users (id) WHERE is_admin`) makes this a
 * index-only lookup rather than a sequential scan of every user. Never
 * throws: a lookup or send failure is logged and swallowed, the same shape as
 * every other notice fired from `claim-actions.ts` — the durable write this
 * follows already happened, and a failed notice must not look like a failed
 * claim or request.
 */
export async function notifyAdminsReviewNeeded(
  db: ReturnType<typeof createAdminClient>,
  event: AdminReviewNeededEvent,
): Promise<void> {
  const claimed = await claimSend(`admin_review:${event.kind}:${event.id}`);
  if (!claimed) return;

  const { data, error } = await db
    .from("users")
    .select("id, email")
    .eq("is_admin", true);

  if (error) {
    console.error("[admin-review] could not read admins", {
      kind: event.kind,
      id: event.id,
      error: error.message,
    });
    return;
  }

  const adminEmails = (data ?? [])
    .map((row: { id: string; email: string | null }) => row.email)
    .filter((email): email is string => Boolean(email));

  const recipients = reviewNeededRecipients(
    adminEmails,
    INTERNAL_ALERTS_ADDRESS,
  );

  const requestsUrl = `${emailOrigin()}/admin/requests?id=${encodeURIComponent(event.id)}`;
  const claimantName =
    event.kind === "claim" ? event.claimantName : event.requesterName;
  const claimedEmail =
    event.kind === "claim" ? event.claimantEmail : event.requesterEmail;

  for (const to of recipients) {
    const sent = await sendEmail(
      adminReviewNeededEmail({
        to,
        programName: event.programName,
        claimantName,
        claimedEmail,
        reason: event.reason,
        requestsUrl,
      }),
    );

    if (!sent.ok) {
      // The queue row exists regardless of whether this notice arrived — an
      // admin who opens /admin/requests still finds it. `sendEmail` already
      // logged the technical cause; this names which notification went out.
      console.warn("[admin-review] notification not sent", {
        to,
        kind: event.kind,
        id: event.id,
      });
    }
  }
}
