import { createHash } from "node:crypto";

import { renderEmail, renderText, type EmailContent } from "../shell";
import type { EmailMessage } from "../send";

export interface VendorDeletionEmailInput {
  /** `SPLITSTEP_DELETION_EMAIL`, or the internal alerts inbox to forward by hand. */
  to: string;
  /** Copied on every request, so Advantage keeps a record of what was asked. */
  cc?: string[];
  /** The UTC day the batch covers, for the subject and idempotency. */
  day: string;
  requests: readonly { vendorMatchId: string; vendorJobId: string }[];
}

/**
 * The daily request asking SplitStep to delete the video of matches users
 * deleted (Privacy Policy 1.5 §5, §8). One line per job: SplitStep knows a
 * match by its `MatchID` (our `matches.id`) and its own job id.
 */
export function vendorDeletionEmail(
  input: VendorDeletionEmailInput,
): EmailMessage {
  const { to, cc, day, requests } = input;
  const content: EmailContent = {
    preheader: `Please delete the video for ${requests.length} match${requests.length === 1 ? "" : "es"}.`,
    eyebrow: "Deletion request",
    heading: "Please delete these matches' video",
    body: [
      "Advantage users deleted the matches below. Please delete the video and any copies you hold for them, and reply to confirm.",
    ],
    facts: requests.map((r) => ({
      label: `MatchID ${r.vendorMatchId}`,
      value: `Job ${r.vendorJobId}`,
    })),
    note: "Sent once a day by Advantage when users delete matches.",
  };
  return {
    to,
    cc,
    replyTo: "team@advantage-analytics.com",
    subject: `Advantage deletion request, ${day} (${requests.length})`,
    html: renderEmail(content),
    text: renderText(content),
    tags: { type: "vendor_deletion_request" },
    // Keyed on the whole batch, not just its first row: a same-day re-run
    // that holds more rows must send, not replay the earlier response.
    idempotencyKey: `vendor-deletion:${day}:${createHash("sha256")
      .update(requests.map((r) => r.vendorJobId).join(","))
      .digest("hex")
      .slice(0, 32)}`,
  };
}

export interface VendorDeletionUnrecordedEmailInput {
  /** `INTERNAL_ALERTS_ADDRESS`, passed by the caller. */
  to: string;
  matchId: string;
}

/**
 * Internal alert: a match was deleted but the trigger could not record its
 * SplitStep deletion request, so the daily request will not include it.
 * SplitStep knows the match by this id as its `MatchID` (for an admin-console
 * submission it may instead hold the operation id, which the logs name).
 */
export function vendorDeletionUnrecordedEmail(
  input: VendorDeletionUnrecordedEmailInput,
): EmailMessage {
  const { to, matchId } = input;
  const content: EmailContent = {
    preheader: "A deleted match's SplitStep deletion request was not recorded.",
    eyebrow: "Action needed",
    heading: "Ask SplitStep to delete this match's video",
    body: [
      "A match was deleted, but its deletion request to SplitStep could not be recorded, so the daily request will not include it. Ask SplitStep to delete the video for this MatchID by hand.",
    ],
    facts: [{ label: "MatchID", value: matchId }],
    note: "Sent to the internal alerts inbox, once per match. The database warning names the reason.",
  };
  return {
    to,
    subject: `Action needed: SplitStep deletion not recorded (${matchId})`,
    html: renderEmail(content),
    text: renderText(content),
    tags: { type: "vendor_deletion_unrecorded" },
  };
}
