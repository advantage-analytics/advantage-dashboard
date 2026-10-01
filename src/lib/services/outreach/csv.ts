import type { OutreachCc, OutreachFields } from "./types";

/**
 * Turning a reviewed send-list CSV into recipient rows.
 *
 * The CSVs are the ones exported from the review pages (`email1_send_list.csv`
 * … `email7_send_list.csv`). Columns are matched by header name, so an extra
 * column is ignored and a missing required one is reported, never guessed.
 */

export interface ParsedRecipient {
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

export interface ParseResult {
  rows: ParsedRecipient[];
  problems: string[];
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/;

/** RFC 4180: quoted fields, doubled quotes, CRLF or LF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const input = text.replace(/^﻿/, "");

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && input[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

const REQUIRED: Record<number, string[]> = {
  1: ["name", "to_email"],
  3: ["name", "to_email"],
  4: ["name", "to_email"],
  6: ["program_keys", "school", "to_email"],
  7: ["program_keys", "school", "to_email"],
};

function split(value: string | undefined): string[] {
  return (value ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);
}

function blank(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function recipientsFromCsv(listNo: number, text: string): ParseResult {
  const problems: string[] = [];
  const required = REQUIRED[listNo];
  if (!required) return { rows: [], problems: [`There is no list ${listNo}.`] };

  const table = parseCsv(text);
  if (table.length < 2) {
    return { rows: [], problems: ["The file has no rows under its header."] };
  }
  const header = table[0].map((cell) => cell.trim().toLowerCase());
  const missing = required.filter((column) => !header.includes(column));
  if (missing.length) {
    return {
      rows: [],
      problems: [
        `The file is missing the column${missing.length > 1 ? "s" : ""} ${missing.join(", ")}.`,
      ],
    };
  }

  const rows: ParsedRecipient[] = [];
  const seenTo = new Set<string>();
  const seenKey = new Set<string>();

  table.slice(1).forEach((cells, index) => {
    const get = (column: string) => {
      const at = header.indexOf(column);
      return at === -1 ? undefined : cells[at];
    };
    const line = index + 2;
    const toEmail = (get("to_email") ?? "").trim();
    if (!EMAIL_RE.test(toEmail)) {
      problems.push(
        `Line ${line}: "${toEmail}" is not an email address, so the row was left out.`,
      );
      return;
    }
    if (seenTo.has(toEmail.toLowerCase())) {
      problems.push(
        `Line ${line}: ${toEmail} is already the To address of another row, so the row was left out.`,
      );
      return;
    }

    const programKeys = split(get("program_keys"));
    const programs = listNo === 6 || listNo === 7;
    const rowKey = programs ? programKeys.join(";") : toEmail.toLowerCase();
    if (!rowKey || seenKey.has(rowKey)) {
      problems.push(`Line ${line}: duplicate or empty row, left out.`);
      return;
    }

    const ccEmails = split(get("cc_emails"));
    const ccNames = (get("cc_names") ?? "")
      .split(";")
      .map((part) => part.trim());
    const cc: OutreachCc[] = [];
    ccEmails.forEach((email, at) => {
      if (!EMAIL_RE.test(email)) {
        problems.push(
          `Line ${line}: CC "${email}" is not an email address and was dropped.`,
        );
        return;
      }
      if (email.toLowerCase() === toEmail.toLowerCase()) return;
      if (
        cc.some((person) => person.email.toLowerCase() === email.toLowerCase())
      )
        return;
      cc.push({ name: ccNames[at] ?? "", email });
    });

    const fields: OutreachFields = {};
    const first = blank(get("first_name"));
    if (first) fields.first_name = first;
    const plan = blank(get("plan"));
    if (plan) fields.plan = plan;
    const program = blank(get("program"));
    if (program) fields.program = program;
    const firstSend = blank(get("first_send_resend_id"));
    if (firstSend) fields.first_send_resend_id = firstSend;
    const note = blank(get("note"));
    if (note) fields.note = note;

    seenTo.add(toEmail.toLowerCase());
    seenKey.add(rowKey);
    rows.push({
      rowKey,
      label: (programs ? get("school") : get("name"))?.trim() || toEmail,
      division: blank(get("division")),
      conference: blank(get("conference")),
      toName: blank(get("to_name")) ?? (programs ? null : blank(get("name"))),
      toLastName: blank(get("to_last_name")) ?? blank(get("last_name")),
      toRole: blank(get("to_role")) ?? blank(get("role")),
      toEmail,
      cc,
      programKeys,
      fields,
    });
  });

  return { rows, problems };
}
