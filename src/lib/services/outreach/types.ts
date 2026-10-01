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
