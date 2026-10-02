import {
  FOLLOW_UP_DAYS,
  outreachEmail,
  type OutreachRecipient,
  type OutreachRow,
  type OutreachSend,
} from "./types";

/**
 * Where each recipient of one email stands. Client-safe and pure, so the page
 * and the send action read the same answer from the same function.
 */

const LIVE = new Set<string>(["sending", "sent", "scheduled"]);

/** When a send went (or goes) out: its schedule, else when it was made. */
export function sentAt(send: OutreachSend): string {
  return send.scheduledAt ?? send.createdAt;
}

/**
 * The page's rows for one email: who it goes to, and where each stands.
 *
 * A program someone has claimed since the list was reviewed reads "claimed"
 * and is never sent to: they are already in, and a "set up your program"
 * email would be wrong. For the follow-up (8), a row is "not due" until its
 * email 7 has been out for `FOLLOW_UP_DAYS`.
 */
export function buildRows(
  emailNo: number,
  recipients: OutreachRecipient[],
  sends: OutreachSend[],
  claimed: Set<string>,
  now: Date = new Date(),
): OutreachRow[] {
  const def = outreachEmail(emailNo);
  if (!def) return [];

  const latest = new Map<string, OutreachSend>();
  const firstSend = new Map<string, OutreachSend>();
  for (const send of sends) {
    if (send.emailNo === emailNo) {
      const current = latest.get(send.recipientId);
      // A live send outranks a failed or cancelled one made later or earlier.
      if (!current || LIVE.has(send.status) || !LIVE.has(current.status)) {
        latest.set(send.recipientId, send);
      }
    }
    if (
      emailNo === 8 &&
      send.emailNo === 7 &&
      (send.status === "sent" || send.status === "scheduled")
    ) {
      firstSend.set(send.recipientId, send);
    }
  }

  const dueBefore = now.getTime() - FOLLOW_UP_DAYS * 86_400_000;

  return recipients
    .filter((recipient) => recipient.emailNo === def.list)
    .map((recipient) => {
      const send = latest.get(recipient.id) ?? null;
      const first = firstSend.get(recipient.id) ?? null;
      let state: OutreachRow["state"] = "not_sent";
      if (send && LIVE.has(send.status)) {
        state = send.status as "sending" | "sent" | "scheduled";
      } else if (recipient.held) {
        state = "held";
      } else if (recipient.programKeys.some((key) => claimed.has(key))) {
        state = "claimed";
      } else if (
        emailNo === 8 &&
        (!first || new Date(sentAt(first)).getTime() > dueBefore)
      ) {
        state = "not_due";
      } else if (send?.status === "failed") {
        state = "failed";
      }
      return {
        recipient,
        state,
        send,
        firstSentAt: first ? sentAt(first) : null,
      };
    });
}
