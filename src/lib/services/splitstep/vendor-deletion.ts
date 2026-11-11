import type { SupabaseClient } from "@supabase/supabase-js";
import {
  INTERNAL_ALERTS_ADDRESS,
  sendEmail,
  vendorDeletionEmail,
  type EmailMessage,
  type EmailResult,
} from "@/lib/services/email";

/**
 * Mails SplitStep the matches users deleted since the last run, and stamps
 * them sent. Rows are written by the `matches_record_vendor_deletion_requests`
 * trigger (20261108085442_vendor_deletion_requests.sql).
 *
 * Until `SPLITSTEP_DELETION_EMAIL` is set the request goes to the internal
 * alerts inbox, to forward by hand. With it set, the alerts inbox is copied.
 */

/** One email holds at most this many; the rest go the next day. */
export const VENDOR_DELETION_BATCH = 200;

export interface VendorDeletionSweepResult {
  pending: number;
  sent: number;
  outcome:
    "nothing_pending" | "sent" | "send_failed" | "read_failed" | "stamp_failed";
}

export interface VendorDeletionDeps {
  send: (message: EmailMessage) => Promise<EmailResult>;
  vendorAddress: string | null;
  internalAddress: string;
  now: () => Date;
}

export const productionVendorDeletionDeps = (): VendorDeletionDeps => ({
  send: (message) => sendEmail(message),
  vendorAddress: process.env.SPLITSTEP_DELETION_EMAIL?.trim() || null,
  internalAddress: INTERNAL_ALERTS_ADDRESS,
  now: () => new Date(),
});

/** Who the request goes to, and who is copied. Pure, so tested offline. */
export function vendorDeletionRecipients(
  vendorAddress: string | null,
  internalAddress: string,
): { to: string; cc?: string[] } {
  return vendorAddress
    ? { to: vendorAddress, cc: [internalAddress] }
    : { to: internalAddress };
}

export async function sweepVendorDeletionRequests(
  admin: SupabaseClient,
  deps: VendorDeletionDeps = productionVendorDeletionDeps(),
): Promise<VendorDeletionSweepResult> {
  const { data, error } = await admin
    .from("vendor_deletion_requests")
    .select("id, vendor_match_id, vendor_job_id")
    .is("sent_at", null)
    .eq("is_test", false)
    .order("requested_at", { ascending: true })
    .limit(VENDOR_DELETION_BATCH);
  if (error) {
    console.error("[vendor-deletion] read failed", { error: error.message });
    return { pending: 0, sent: 0, outcome: "read_failed" };
  }
  const rows = (data ?? []) as {
    id: string;
    vendor_match_id: string;
    vendor_job_id: string;
  }[];
  if (rows.length === 0)
    return { pending: 0, sent: 0, outcome: "nothing_pending" };

  const now = deps.now();
  const message = vendorDeletionEmail({
    ...vendorDeletionRecipients(deps.vendorAddress, deps.internalAddress),
    day: now.toISOString().slice(0, 10),
    requests: rows.map((r) => ({
      vendorMatchId: r.vendor_match_id,
      vendorJobId: r.vendor_job_id,
    })),
  });
  const result = await deps.send(message);
  if (!result.ok) {
    console.error("[vendor-deletion] send failed", { error: result.error });
    return { pending: rows.length, sent: 0, outcome: "send_failed" };
  }

  const { error: stampError } = await admin
    .from("vendor_deletion_requests")
    .update({ sent_at: now.toISOString() })
    .in(
      "id",
      rows.map((r) => r.id),
    );
  if (stampError) {
    // The email went; the next run would repeat it. The idempotency key stops
    // a same-day repeat, and a repeat on another day is harmless.
    console.error("[vendor-deletion] stamp failed", {
      error: stampError.message,
    });
    return { pending: rows.length, sent: rows.length, outcome: "stamp_failed" };
  }
  return { pending: rows.length, sent: rows.length, outcome: "sent" };
}
