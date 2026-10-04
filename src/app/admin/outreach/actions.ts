"use server";

import { revalidatePath } from "next/cache";
import { sendEmail } from "@/lib/services/email";
import {
  OUTREACH_SEND_GAP_MS,
  OUTREACH_TRANCHE_MAX,
} from "@/lib/services/email/config";
import {
  cancelScheduledEmail,
  getEmailMessageId,
  listSuppressedAddresses,
} from "@/lib/services/email/resend-admin";
import {
  checkOutreachTemplate,
  OutreachConfigError,
  outreachTemplateSource,
  renderOutreachEmail,
} from "@/lib/services/email/templates/outreach";
import { recipientsFromCsv } from "@/lib/services/outreach/csv";
import { buildRows } from "@/lib/services/outreach/rows";
import {
  loadClaimedKeys,
  loadRecipientById,
  loadRecipients,
  loadSends,
  loadTemplate,
} from "@/lib/services/outreach/outreach-server";
import {
  IMPORTABLE_LISTS,
  OUTREACH_CAMPAIGN,
  outreachEmail,
  type OutreachCc,
  type OutreachTemplate,
  type OutreachTrancheInput,
  type OutreachTrancheResult,
} from "@/lib/services/outreach/types";
import { requireAdmin } from "@/lib/services/programs/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Server actions for `/admin/outreach`.
 *
 * Every action re-checks `is_admin` itself: the layout guard protects the
 * page, not the write (`admin/layout.tsx`).
 *
 * The send path is built so that nothing goes out twice and nothing goes out
 * broken:
 *  - a claim link that does not load stops the tranche before anything sends;
 *  - a program claimed since the list was reviewed is skipped;
 *  - suppressed addresses (unsubscribes, bounces, complaints) are dropped from
 *    To and CC from one read of the whole list;
 *  - each send first inserts a 'sending' row, and a unique index allows one
 *    live row per recipient and email, so a second press cannot double-send;
 *  - each Resend call carries an idempotency key for the same reason.
 */

const POSTAL = () => process.env.OUTREACH_POSTAL_ADDRESS?.trim() || null;
const COLD = new Set([6, 7, 8]);
const PAGE = "/admin/outreach";

const NOT_ADMIN = "Only admins can do this.";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Import ────────────────────────────────────────────────────────────────

export interface OutreachImportResult {
  ok: boolean;
  message: string;
  problems: string[];
}

export async function importOutreachCsv(
  formData: FormData,
): Promise<OutreachImportResult> {
  if (!(await requireAdmin()))
    return { ok: false, message: NOT_ADMIN, problems: [] };

  const listNo = Number(formData.get("listNo"));
  const file = formData.get("file");
  if (!IMPORTABLE_LISTS.includes(listNo as (typeof IMPORTABLE_LISTS)[number])) {
    return {
      ok: false,
      message: "Choose which email this list is for.",
      problems: [],
    };
  }
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Choose a CSV file.", problems: [] };
  }
  if (file.size > 5_000_000) {
    return {
      ok: false,
      message: "That file is over 5 MB, which is far larger than a send list.",
      problems: [],
    };
  }

  const { rows, problems } = recipientsFromCsv(listNo, await file.text());
  if (rows.length === 0) {
    return { ok: false, message: "Nothing was imported.", problems };
  }

  const db = createAdminClient();
  const now = new Date().toISOString();
  const payload = rows.map((row) => ({
    campaign: OUTREACH_CAMPAIGN,
    email_no: listNo,
    row_key: row.rowKey,
    label: row.label,
    division: row.division,
    conference: row.conference,
    to_name: row.toName,
    to_last_name: row.toLastName,
    to_role: row.toRole,
    to_email: row.toEmail,
    cc: row.cc,
    program_keys: row.programKeys,
    fields: row.fields,
    updated_at: now,
  }));

  for (let at = 0; at < payload.length; at += 500) {
    const { error } = await db
      .from("outreach_recipients")
      .upsert(payload.slice(at, at + 500), {
        onConflict: "campaign,email_no,row_key",
      });
    if (error) {
      return {
        ok: false,
        message: `Import stopped after ${at} rows: ${error.message}`,
        problems,
      };
    }
  }

  revalidatePath(PAGE);
  const name = outreachEmail(listNo)?.name ?? `email ${listNo}`;
  return {
    ok: true,
    message: `Imported ${rows.length.toLocaleString("en-US")} rows into ${name}. Rows already in the list were updated, not duplicated.`,
    problems,
  };
}

// ── Preview ───────────────────────────────────────────────────────────────

export type OutreachPreview =
  | { ok: true; subject: string; html: string; text: string }
  | { ok: false; error: string };

/**
 * One recipient's email. With `draft`, renders the editor's unsaved subject
 * and HTML instead of what is saved, so an edit can be seen before it is kept.
 */
export async function previewOutreach(
  recipientId: string,
  emailNo: number,
  draft?: { subject: string; html: string } | null,
): Promise<OutreachPreview> {
  if (!(await requireAdmin())) return { ok: false, error: NOT_ADMIN };
  const recipient = await loadRecipientById(recipientId);
  if (!recipient)
    return { ok: false, error: "That recipient is no longer in the list." };
  const template: OutreachTemplate | null = draft
    ? { emailNo, ...draft, updatedAt: "" }
    : await loadTemplate(emailNo);
  const { subject, message } = renderOutreachEmail(
    emailNo,
    recipient,
    POSTAL(),
    { preview: true, template },
  );
  return { ok: true, subject, html: message.html, text: message.text };
}

// ── Test send ─────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/;

export async function sendOutreachTest(
  recipientId: string,
  emailNo: number,
  to: string,
): Promise<{ ok: boolean; message: string }> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, message: NOT_ADMIN };
  const address = to.trim();
  if (!EMAIL_RE.test(address))
    return { ok: false, message: "Enter the address to send the test to." };

  const recipient = await loadRecipientById(recipientId);
  if (!recipient)
    return { ok: false, message: "That recipient is no longer in the list." };

  const { subject, message } = renderOutreachEmail(
    emailNo,
    recipient,
    POSTAL(),
    { preview: true, template: await loadTemplate(emailNo) },
  );
  const result = await sendEmail({
    ...message,
    to: address,
    cc: undefined,
    subject: `[Test] ${subject}`,
    tags: { campaign: "beta-launch", email: `e${emailNo}`, kind: "test" },
  });

  await createAdminClient()
    .from("outreach_sends")
    .insert({
      recipient_id: recipient.id,
      campaign: OUTREACH_CAMPAIGN,
      email_no: emailNo,
      status: "test",
      resend_id: result.ok ? result.id : null,
      to_email: address,
      subject: `[Test] ${subject}`,
      sent_by: admin.id,
      error: result.ok ? null : result.error,
    });

  return result.ok
    ? {
        ok: true,
        message: `Sent ${recipient.label}'s version to ${address}. The real one would also go to ${recipient.cc.length} on CC.`,
      }
    : { ok: false, message: result.error };
}

// ── Tranche ───────────────────────────────────────────────────────────────

/** GET each link once; a claim page that does not load stops the tranche. */
async function deadLinks(urls: string[]): Promise<string[]> {
  const dead: string[] = [];
  const queue = [...new Set(urls)];
  async function worker() {
    for (let url = queue.shift(); url; url = queue.shift()) {
      try {
        const response = await fetch(url, {
          redirect: "follow",
          cache: "no-store",
          signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) dead.push(`${url} (${response.status})`);
      } catch {
        dead.push(`${url} (did not answer)`);
      }
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));
  return dead;
}

function claimUrls(html: string): string[] {
  return [...html.matchAll(/href="(https?:\/\/[^"]+\/claim[^"]*)"/g)].map(
    (match) => match[1].replace(/&amp;/g, "&"),
  );
}

export async function sendOutreachTranche(
  input: OutreachTrancheInput,
): Promise<OutreachTrancheResult> {
  const empty = { sent: 0, scheduled: 0, failed: [], skipped: [] };
  const admin = await requireAdmin();
  if (!admin) return { ok: false, message: NOT_ADMIN, ...empty };

  const def = outreachEmail(input.emailNo);
  if (!def) return { ok: false, message: "Choose an email.", ...empty };

  const picked = input.recipientIds?.length
    ? new Set(input.recipientIds)
    : null;
  const limit = picked ? picked.size : Math.floor(input.limit);
  if (!(limit >= 1 && limit <= OUTREACH_TRANCHE_MAX)) {
    return {
      ok: false,
      message: `A tranche is 1 to ${OUTREACH_TRANCHE_MAX} emails.`,
      ...empty,
    };
  }

  let scheduledAt: string | null = null;
  if (input.scheduledAt) {
    const when = new Date(input.scheduledAt);
    if (Number.isNaN(when.getTime()) || when.getTime() < Date.now() + 60_000) {
      return {
        ok: false,
        message: "Pick a send time at least a minute from now.",
        ...empty,
      };
    }
    scheduledAt = when.toISOString();
  }

  const postal = POSTAL();
  if (COLD.has(input.emailNo) && !postal) {
    return {
      ok: false,
      message:
        "Set OUTREACH_POSTAL_ADDRESS in the environment first. Cold email needs a postal address in the footer.",
      ...empty,
    };
  }
  if (!process.env.RESEND_API_KEY) {
    return {
      ok: false,
      message: "RESEND_API_KEY is not set here, so nothing can send.",
      ...empty,
    };
  }

  const [recipients, sends, claimed, template] = await Promise.all([
    loadRecipients(def.list),
    loadSends(),
    loadClaimedKeys(),
    loadTemplate(input.emailNo),
  ]);
  const waiting = buildRows(input.emailNo, recipients, sends, claimed).filter(
    (row) => row.state === "not_sent" || row.state === "failed",
  );
  const rows = (
    picked
      ? waiting.filter((row) => picked.has(row.recipient.id))
      : waiting
          .filter(
            (row) =>
              !input.division || row.recipient.division === input.division,
          )
          .filter(
            (row) =>
              !input.conference ||
              row.recipient.conference === input.conference,
          )
  ).slice(0, limit);

  if (rows.length === 0) {
    return {
      ok: true,
      message: "Everyone in this selection has already been sent this email.",
      ...empty,
    };
  }

  // Render everything first: a template problem stops the tranche before any
  // mail goes out, not halfway through it.
  let rendered;
  try {
    rendered = rows.map((row) => ({
      row,
      ...renderOutreachEmail(input.emailNo, row.recipient, postal, {
        template,
      }),
    }));
  } catch (error) {
    const message =
      error instanceof OutreachConfigError
        ? error.message
        : "An email in this tranche failed to render.";
    return { ok: false, message, ...empty };
  }

  if (def.programs) {
    const dead = await deadLinks(
      rendered.flatMap((item) => claimUrls(item.message.html)),
    );
    if (dead.length) {
      return {
        ok: false,
        message: `Nothing was sent: ${dead.length} claim link${dead.length > 1 ? "s don't" : " doesn't"} load, e.g. ${dead[0]}. Deploy the claim pages, then try again.`,
        ...empty,
      };
    }
  }

  const suppression = await listSuppressedAddresses();
  if (!suppression.ok) {
    return {
      ok: false,
      message: `Nothing was sent: the suppression list could not be read (${suppression.error}). Sending without it could reach people who unsubscribed.`,
      ...empty,
    };
  }

  const db = createAdminClient();
  const result: OutreachTrancheResult = {
    ok: true,
    message: "",
    sent: 0,
    scheduled: 0,
    failed: [],
    skipped: [],
  };

  for (const [index, item] of rendered.entries()) {
    const { recipient } = item.row;
    if (suppression.addresses.has(recipient.toEmail.toLowerCase())) {
      result.skipped.push({
        label: recipient.label,
        reason: `${recipient.toEmail} unsubscribed or bounced`,
      });
      continue;
    }
    const cc = (item.message.cc ?? []).filter(
      (address) => !suppression.addresses.has(address.toLowerCase()),
    );

    // Claim the slot. The partial unique index turns a second press, or a
    // second tab, into a conflict here instead of a second email.
    const { data: claim, error: claimError } = await db
      .from("outreach_sends")
      .insert({
        recipient_id: recipient.id,
        campaign: OUTREACH_CAMPAIGN,
        email_no: input.emailNo,
        status: "sending",
        to_email: recipient.toEmail,
        cc,
        subject: item.subject,
        scheduled_at: scheduledAt,
        sent_by: admin.id,
      })
      .select("id")
      .single();
    if (claimError || !claim) {
      result.skipped.push({
        label: recipient.label,
        reason: "already sending or sent",
      });
      continue;
    }

    let headers = item.message.headers;
    if (input.emailNo === 6 && recipient.fields.first_send_resend_id) {
      const messageId = await getEmailMessageId(
        recipient.fields.first_send_resend_id,
      );
      if (messageId)
        headers = {
          ...headers,
          "In-Reply-To": messageId,
          References: messageId,
        };
    }

    const sent = await sendEmail(
      {
        ...item.message,
        to: recipient.toEmail,
        cc,
        headers,
        scheduledAt: scheduledAt ?? undefined,
        idempotencyKey: `outreach-${OUTREACH_CAMPAIGN}-e${input.emailNo}-${recipient.id}`,
      },
      { suppressionChecked: true },
    );

    await db
      .from("outreach_sends")
      .update(
        sent.ok
          ? {
              status: scheduledAt ? "scheduled" : "sent",
              resend_id: sent.id,
              updated_at: new Date().toISOString(),
            }
          : {
              status: "failed",
              error: sent.error,
              updated_at: new Date().toISOString(),
            },
      )
      .eq("id", claim.id);

    if (sent.ok) {
      if (scheduledAt) result.scheduled++;
      else result.sent++;
    } else {
      result.failed.push({ label: recipient.label, error: sent.error });
    }

    if (index < rendered.length - 1) await sleep(OUTREACH_SEND_GAP_MS);
  }

  const done = result.sent + result.scheduled;
  result.ok = result.failed.length === 0;
  result.message =
    (scheduledAt
      ? `Scheduled ${done} email${done === 1 ? "" : "s"}`
      : `Sent ${done} email${done === 1 ? "" : "s"}`) +
    (result.failed.length ? `, ${result.failed.length} failed` : "") +
    (result.skipped.length ? `, ${result.skipped.length} skipped` : "") +
    ".";

  revalidatePath(PAGE);
  return result;
}

// ── Cancel ────────────────────────────────────────────────────────────────

export async function cancelOutreachSend(
  sendId: string,
): Promise<{ ok: boolean; message: string }> {
  if (!(await requireAdmin())) return { ok: false, message: NOT_ADMIN };
  const db = createAdminClient();
  const { data: send } = await db
    .from("outreach_sends")
    .select("id,status,resend_id,scheduled_at")
    .eq("id", sendId)
    .maybeSingle();
  if (!send || send.status !== "scheduled" || !send.resend_id) {
    return {
      ok: false,
      message: "Only a scheduled email that hasn't gone out can be cancelled.",
    };
  }
  if (
    send.scheduled_at &&
    new Date(send.scheduled_at).getTime() <= Date.now()
  ) {
    return {
      ok: false,
      message: "Its send time has passed, so it has already gone out.",
    };
  }
  const result = await cancelScheduledEmail(send.resend_id);
  if (!result.ok) return { ok: false, message: result.error };
  await db
    .from("outreach_sends")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", send.id);
  revalidatePath(PAGE);
  return { ok: true, message: "Cancelled. It won't go out." };
}

// ── Edit the email ────────────────────────────────────────────────────────

export interface OutreachTemplateDraft {
  subject: string;
  html: string;
  /** True when this is the admin's own saved version, not the built-in. */
  custom: boolean;
  updatedAt: string | null;
}

/** What the editor opens with: the saved version, else the built-in one. */
export async function loadOutreachTemplate(
  emailNo: number,
): Promise<
  { ok: true; draft: OutreachTemplateDraft } | { ok: false; error: string }
> {
  if (!(await requireAdmin())) return { ok: false, error: NOT_ADMIN };
  if (!outreachEmail(emailNo)) return { ok: false, error: "Choose an email." };
  const saved = await loadTemplate(emailNo);
  if (saved) {
    return {
      ok: true,
      draft: {
        subject: saved.subject,
        html: saved.html,
        custom: true,
        updatedAt: saved.updatedAt,
      },
    };
  }
  return {
    ok: true,
    draft: {
      ...outreachTemplateSource(emailNo),
      custom: false,
      updatedAt: null,
    },
  };
}

/** The built-in version, for "Start from original" without deleting yet. */
export async function loadOriginalOutreachTemplate(
  emailNo: number,
): Promise<
  { ok: true; subject: string; html: string } | { ok: false; error: string }
> {
  if (!(await requireAdmin())) return { ok: false, error: NOT_ADMIN };
  if (!outreachEmail(emailNo)) return { ok: false, error: "Choose an email." };
  return { ok: true, ...outreachTemplateSource(emailNo) };
}

export async function saveOutreachTemplate(
  emailNo: number,
  subject: string,
  html: string,
): Promise<{ ok: boolean; message: string; problems: string[] }> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, message: NOT_ADMIN, problems: [] };
  if (!outreachEmail(emailNo))
    return { ok: false, message: "Choose an email.", problems: [] };
  const problems = checkOutreachTemplate(emailNo, subject, html);
  if (problems.length) return { ok: false, message: "Not saved.", problems };

  const { error } = await createAdminClient().from("outreach_templates").upsert(
    {
      campaign: OUTREACH_CAMPAIGN,
      email_no: emailNo,
      subject: subject.trim(),
      html,
      updated_by: admin.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "campaign,email_no" },
  );
  if (error) return { ok: false, message: error.message, problems: [] };
  revalidatePath(PAGE);
  return {
    ok: true,
    message: "Saved. Previews, tests and sends of this email use it now.",
    problems: [],
  };
}

export async function resetOutreachTemplate(
  emailNo: number,
): Promise<{ ok: boolean; message: string }> {
  if (!(await requireAdmin())) return { ok: false, message: NOT_ADMIN };
  const { error } = await createAdminClient()
    .from("outreach_templates")
    .delete()
    .eq("campaign", OUTREACH_CAMPAIGN)
    .eq("email_no", emailNo);
  if (error) return { ok: false, message: error.message };
  revalidatePath(PAGE);
  return { ok: true, message: "Back to the original email." };
}

// ── Manage recipients ─────────────────────────────────────────────────────

export interface OutreachRecipientEdit {
  toName: string;
  toLastName: string;
  toEmail: string;
  /** One person per line: "Name <address>" or just the address. */
  cc: string;
}

function parseCc(text: string): { cc: OutreachCc[]; bad: string[] } {
  const cc: OutreachCc[] = [];
  const bad: string[] = [];
  for (const line of text.split(/[\n;]+/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const angled = trimmed.match(/^(.*)<([^>]+)>$/);
    const email = (angled ? angled[2] : trimmed).trim().toLowerCase();
    const name = angled ? angled[1].trim().replace(/^"|"$/g, "") : "";
    if (!EMAIL_RE.test(email)) bad.push(trimmed);
    else if (!cc.some((person) => person.email === email))
      cc.push({ name, email });
  }
  return { cc, bad };
}

export async function updateOutreachRecipient(
  id: string,
  edit: OutreachRecipientEdit,
): Promise<{ ok: boolean; message: string }> {
  if (!(await requireAdmin())) return { ok: false, message: NOT_ADMIN };
  const toEmail = edit.toEmail.trim().toLowerCase();
  if (!EMAIL_RE.test(toEmail))
    return { ok: false, message: "The To address isn't a valid email." };
  const { cc, bad } = parseCc(edit.cc);
  if (bad.length)
    return { ok: false, message: `Not a valid CC address: ${bad[0]}` };

  const { error } = await createAdminClient()
    .from("outreach_recipients")
    .update({
      to_name: edit.toName.trim() || null,
      to_last_name: edit.toLastName.trim() || null,
      to_email: toEmail,
      cc: cc.filter((person) => person.email !== toEmail),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("campaign", OUTREACH_CAMPAIGN);
  if (error) return { ok: false, message: error.message };
  revalidatePath(PAGE);
  return { ok: true, message: "Saved." };
}

/** Hold rows out of every send, or let them back in. */
export async function setOutreachHeld(
  ids: string[],
  held: boolean,
): Promise<{ ok: boolean; message: string }> {
  if (!(await requireAdmin())) return { ok: false, message: NOT_ADMIN };
  if (ids.length === 0) return { ok: false, message: "Select someone first." };
  const db = createAdminClient();
  for (let at = 0; at < ids.length; at += 300) {
    const { error } = await db
      .from("outreach_recipients")
      .update({ held, updated_at: new Date().toISOString() })
      .in("id", ids.slice(at, at + 300))
      .eq("campaign", OUTREACH_CAMPAIGN);
    if (error) return { ok: false, message: error.message };
  }
  revalidatePath(PAGE);
  const n = ids.length.toLocaleString("en-US");
  return {
    ok: true,
    message: held
      ? `Held ${n}. They stay in the list and won't be sent to.`
      : `Released ${n}. They can be sent to again.`,
  };
}

/**
 * Remove rows from the list. Only rows nothing real was ever sent to: a row
 * with send history is the record of that email, so hold it instead.
 */
export async function removeOutreachRecipients(
  ids: string[],
): Promise<{ ok: boolean; message: string }> {
  if (!(await requireAdmin())) return { ok: false, message: NOT_ADMIN };
  if (ids.length === 0) return { ok: false, message: "Select someone first." };
  const db = createAdminClient();
  const withHistory = new Set<string>();
  for (let at = 0; at < ids.length; at += 300) {
    const { data, error } = await db
      .from("outreach_sends")
      .select("recipient_id")
      .in("recipient_id", ids.slice(at, at + 300))
      .neq("status", "test");
    if (error) return { ok: false, message: error.message };
    for (const row of data ?? []) withHistory.add(row.recipient_id as string);
  }
  const removable = ids.filter((id) => !withHistory.has(id));
  for (let at = 0; at < removable.length; at += 300) {
    const { error } = await db
      .from("outreach_recipients")
      .delete()
      .in("id", removable.slice(at, at + 300))
      .eq("campaign", OUTREACH_CAMPAIGN);
    if (error) return { ok: false, message: error.message };
  }
  revalidatePath(PAGE);
  const kept = withHistory.size;
  return {
    ok: removable.length > 0,
    message:
      `Removed ${removable.length.toLocaleString("en-US")}.` +
      (kept
        ? ` Kept ${kept.toLocaleString("en-US")} that already have sends on record; hold those instead.`
        : ""),
  };
}
