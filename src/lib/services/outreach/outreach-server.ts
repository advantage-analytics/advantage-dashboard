import { createAdminClient } from "@/lib/supabase/admin";
import {
  OUTREACH_CAMPAIGN,
  type OutreachProgram,
  type OutreachRecipient,
  type OutreachSend,
  type OutreachTemplate,
} from "./types";

/**
 * Loading outreach state. Service role throughout: both tables are server-only
 * (no RLS policy), so a session-client read returns nothing rather than an
 * error. Every caller has already passed the admin guard.
 *
 * Server only — it imports the service-role client.
 */

type RecipientRow = {
  id: string;
  email_no: number;
  row_key: string;
  label: string;
  division: string | null;
  conference: string | null;
  to_name: string | null;
  to_last_name: string | null;
  to_role: string | null;
  to_email: string;
  cc: unknown;
  program_keys: string[] | null;
  fields: unknown;
  held: boolean | null;
};

type SendRow = {
  id: string;
  recipient_id: string;
  email_no: number;
  status: OutreachSend["status"];
  resend_id: string | null;
  scheduled_at: string | null;
  created_at: string;
  error: string | null;
};

const PAGE = 1000;
const RECIPIENT_COLUMNS =
  "id,email_no,row_key,label,division,conference,to_name,to_last_name,to_role,to_email,cc,program_keys,fields,held";

function toRecipient(row: RecipientRow): OutreachRecipient {
  return {
    id: row.id,
    emailNo: row.email_no,
    rowKey: row.row_key,
    label: row.label,
    division: row.division,
    conference: row.conference,
    toName: row.to_name,
    toLastName: row.to_last_name,
    toRole: row.to_role,
    toEmail: row.to_email,
    cc: Array.isArray(row.cc) ? (row.cc as OutreachRecipient["cc"]) : [],
    programKeys: row.program_keys ?? [],
    fields:
      row.fields && typeof row.fields === "object"
        ? (row.fields as OutreachRecipient["fields"])
        : {},
    held: Boolean(row.held),
  };
}

function toSend(row: SendRow): OutreachSend {
  return {
    id: row.id,
    recipientId: row.recipient_id,
    emailNo: row.email_no,
    status: row.status,
    resendId: row.resend_id,
    scheduledAt: row.scheduled_at,
    createdAt: row.created_at,
    error: row.error,
  };
}

/** Every recipient of the campaign. PostgREST caps a read at 1,000 rows. */
export async function loadRecipients(
  listNo?: number,
): Promise<OutreachRecipient[]> {
  const db = createAdminClient();
  const out: OutreachRecipient[] = [];
  for (let from = 0; ; from += PAGE) {
    let query = db
      .from("outreach_recipients")
      .select(RECIPIENT_COLUMNS)
      .eq("campaign", OUTREACH_CAMPAIGN)
      .order("email_no")
      .order("division", { nullsFirst: true })
      .order("conference", { nullsFirst: true })
      .order("label")
      .range(from, from + PAGE - 1);
    if (listNo !== undefined) query = query.eq("email_no", listNo);
    const { data, error } = await query;
    if (error)
      throw new Error(`Loading outreach recipients failed: ${error.message}`);
    out.push(...(data as RecipientRow[]).map(toRecipient));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

export async function loadRecipientById(
  id: string,
): Promise<OutreachRecipient | null> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("outreach_recipients")
    .select(RECIPIENT_COLUMNS)
    .eq("id", id)
    .eq("campaign", OUTREACH_CAMPAIGN)
    .maybeSingle();
  if (error || !data) return null;
  return toRecipient(data as RecipientRow);
}

export async function loadSends(): Promise<OutreachSend[]> {
  const db = createAdminClient();
  const out: OutreachSend[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("outreach_sends")
      .select(
        "id,recipient_id,email_no,status,resend_id,scheduled_at,created_at,error",
      )
      .eq("campaign", OUTREACH_CAMPAIGN)
      .neq("status", "test")
      .order("created_at")
      .range(from, from + PAGE - 1);
    if (error)
      throw new Error(`Loading outreach sends failed: ${error.message}`);
    out.push(...(data as SendRow[]).map(toSend));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

/** Program keys someone has already claimed or is claiming. */
export async function loadClaimedKeys(): Promise<Set<string>> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("programs")
    .select("program_key")
    .neq("status", "unclaimed")
    .not("program_key", "is", null);
  if (error)
    throw new Error(`Loading claimed programs failed: ${error.message}`);
  return new Set((data ?? []).map((row) => row.program_key as string));
}

/** The programs behind these keys: name, status and admin page id. */
export async function loadPrograms(keys: string[]): Promise<OutreachProgram[]> {
  const db = createAdminClient();
  const unique = [...new Set(keys)];
  const out: OutreachProgram[] = [];
  // Chunked: a long `in (...)` list would overflow the request URL.
  for (let at = 0; at < unique.length; at += 300) {
    const { data, error } = await db
      .from("programs")
      .select("id,program_key,school_name,team,status")
      .in("program_key", unique.slice(at, at + 300));
    if (error) throw new Error(`Loading programs failed: ${error.message}`);
    for (const row of data ?? []) {
      out.push({
        key: row.program_key as string,
        id: row.id as string,
        name: [row.school_name, row.team].filter(Boolean).join(" "),
        status: (row.status as string) ?? "unclaimed",
      });
    }
  }
  return out;
}

/** The admin's own versions of the emails, by email number. */
export async function loadTemplates(): Promise<Map<number, OutreachTemplate>> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("outreach_templates")
    .select("email_no,subject,html,updated_at")
    .eq("campaign", OUTREACH_CAMPAIGN);
  if (error)
    throw new Error(`Loading outreach templates failed: ${error.message}`);
  return new Map(
    (data ?? []).map((row) => [
      row.email_no as number,
      {
        emailNo: row.email_no as number,
        subject: row.subject as string,
        html: row.html as string,
        updatedAt: row.updated_at as string,
      },
    ]),
  );
}

export async function loadTemplate(
  emailNo: number,
): Promise<OutreachTemplate | null> {
  return (await loadTemplates()).get(emailNo) ?? null;
}
