/**
 * Outreach — shared shapes for `/admin/outreach`.
 *
 * Client-safe: no Supabase, no Resend, no environment. The server half lives in
 * `outreach-server.ts` (loading) and `src/app/admin/outreach/actions.ts`
 * (imports and sends).
 */

/** The campaign every row on the page belongs to. One for now. */
export const OUTREACH_CAMPAIGN = "beta-launch";

/** The emails in the beta launch sequence, in the order they are worked. */
export const OUTREACH_EMAILS = [
  { no: 1, name: "Waitlist leads", list: 1, programs: false },
  { no: 3, name: "Personal accounts", list: 3, programs: false },
  { no: 4, name: "Pilot programs", list: 4, programs: false },
  { no: 6, name: "Already contacted", list: 6, programs: true },
  { no: 7, name: "Cold outreach", list: 7, programs: true },
  // The follow-up has no list of its own: it goes to email 7's rows, seven
  // days after each one was sent.
  { no: 8, name: "Day-7 follow-up", list: 7, programs: true },
] as const;

export type OutreachEmailNo = (typeof OUTREACH_EMAILS)[number]["no"];

export const FOLLOW_UP_DAYS = 7;

/** The email numbers a CSV can be imported for (8 reuses 7's list). */
export const IMPORTABLE_LISTS = [1, 3, 4, 6, 7] as const;

export function outreachEmail(no: number) {
  return OUTREACH_EMAILS.find((email) => email.no === no) ?? null;
}

export interface OutreachCc {
  name: string;
  email: string;
}

/** Extra per-email values carried in `outreach_recipients.fields`. */
export interface OutreachFields {
  first_name?: string;
  plan?: string;
  program?: string;
  first_send_resend_id?: string;
  note?: string;
}

export interface OutreachRecipient {
  id: string;
  emailNo: number;
  rowKey: string;
  label: string;
  division: string | null;
  conference: string | null;
  toName: string | null;
  toLastName: string | null;
  toRole: string | null;
  toEmail: string;
  cc: OutreachCc[];
  programKeys: string[];
  fields: OutreachFields;
  /** Kept in the list but never sent to. */
  held: boolean;
}

export type OutreachSendStatus =
  "sending" | "sent" | "scheduled" | "cancelled" | "failed" | "test";

export interface OutreachSend {
  id: string;
  recipientId: string;
  emailNo: number;
  status: OutreachSendStatus;
  resendId: string | null;
  scheduledAt: string | null;
  createdAt: string;
  error: string | null;
}

/** What the page shows for one recipient of one email. */
export type OutreachRowState =
  | "not_sent"
  | "sending"
  | "sent"
  | "scheduled"
  | "failed"
  | "claimed"
  | "held"
  | "not_due";

export interface OutreachRow {
  recipient: OutreachRecipient;
  state: OutreachRowState;
  /** The live or most recent send of this email to this recipient. */
  send: OutreachSend | null;
  /** Email 8 only: when this row's email 7 went (or goes) out. */
  firstSentAt: string | null;
}

export interface OutreachTrancheInput {
  emailNo: number;
  division: string | null;
  conference: string | null;
  limit: number;
  /** ISO 8601, or null to send now. */
  scheduledAt: string | null;
  /**
   * Send to exactly these rows (still only the ones waiting for this email),
   * instead of the next `limit` of the division and conference.
   */
  recipientIds?: string[] | null;
}

export interface OutreachTrancheResult {
  ok: boolean;
  /** One sentence for the admin. */
  message: string;
  sent: number;
  scheduled: number;
  failed: { label: string; error: string }[];
  skipped: { label: string; reason: string }[];
}

/** A program a list row points at, as the programs table has it now. */
export interface OutreachProgram {
  key: string;
  id: string;
  name: string;
  status: string;
}

/** An admin's own version of one email. */
export interface OutreachTemplate {
  emailNo: number;
  subject: string;
  html: string;
  updatedAt: string;
}

/**
 * The merge fields a pasted template can use. Values are escaped for HTML,
 * except `claim_buttons`, which is the button block itself.
 */
export const OUTREACH_MERGE_FIELDS: { token: string; means: string }[] = [
  { token: "school", means: "School name, e.g. Rice University" },
  { token: "first_name", means: "Recipient's first name, or “there”" },
  { token: "coach", means: "“Coach Smith”, or “Coach” with no last name" },
  { token: "last_name", means: "Recipient's last name" },
  { token: "to_name", means: "Recipient's full name" },
  { token: "program", means: "Program name (email 4), else the school" },
  {
    token: "programs",
    means: "e.g. Rice University Men's · Rice University Women's",
  },
  {
    token: "plan_detail",
    means: "“your Pro plan” or “your 2 monthly processing hours” (email 3)",
  },
  { token: "claim_url", means: "First team's claim link" },
  {
    token: "claim_buttons",
    means: "The claim button(s): one per team, plus the fallback links",
  },
  { token: "app_url", means: "https://app.advantage-analytics.com" },
  { token: "unsubscribe_url", means: "This recipient's unsubscribe link" },
  { token: "postal_address", means: "OUTREACH_POSTAL_ADDRESS" },
];

/** Cold emails must carry these two, by law (CAN-SPAM). */
export const COLD_REQUIRED_FIELDS = ["unsubscribe_url", "postal_address"];

export const COLD_EMAILS = new Set([6, 7, 8]);
