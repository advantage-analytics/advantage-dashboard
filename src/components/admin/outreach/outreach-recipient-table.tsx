"use client";

import { Users } from "lucide-react";
import {
  AdminPersonCell,
  WorkspaceMark,
  useIsClient,
} from "@/components/admin/admin-cells";
import { TableEmptyBody } from "@/components/dashboard/shared/table-empty-body";
import { Checkbox } from "@/components/ui/checkbox";
import type { OutreachRow } from "@/lib/services/outreach/types";
import { cn } from "@/lib/utils";

/**
 * Admin › Outreach's recipient table (Outreach2 board): a tick, the
 * recipient (avatar, name, role and address), the program (crest, school,
 * division and conference) on a program list, and the status as words.
 *
 * Clicking a row shows its email in the preview beside the table (the board's
 * side panel); the tick is its own control and never selects. A real
 * `<table>`, so the tick and the row stay separate keyboard stops.
 */

export const OUTREACH_STATE_LABEL: Record<OutreachRow["state"], string> = {
  not_sent: "Not sent",
  sending: "Sending",
  sent: "Sent",
  scheduled: "Scheduled",
  failed: "Failed",
  claimed: "Claimed",
  held: "Held",
  not_due: "Not due",
};

/** "Oct 29, 9:00 am". */
export function formatOutreachWhen(iso: string): string {
  return new Date(iso)
    .toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })
    .replace("AM", "am")
    .replace("PM", "pm");
}

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

const STATE_INK: Record<OutreachRow["state"], string> = {
  not_sent: "text-[var(--ink-600)]",
  sending: "text-[var(--ink-900)]",
  scheduled: "text-[var(--ink-900)]",
  sent: "text-[var(--ink-500)]",
  failed: "font-medium text-[var(--warning-text)]",
  claimed: "text-[var(--ink-500)]",
  held: "text-[var(--ink-600)]",
  not_due: "text-[var(--ink-500)]",
};

/** The status as words: "Scheduled · Oct 29, 9:00 am", "Sent · Oct 21". */
export function OutreachStatusText({ row }: { row: OutreachRow }) {
  const isClient = useIsClient();
  const label = OUTREACH_STATE_LABEL[row.state];
  let detail: string | null = null;
  if (isClient && row.send) {
    if (row.state === "scheduled" && row.send.scheduledAt) {
      detail = formatOutreachWhen(row.send.scheduledAt);
    } else if (row.state === "sent" || row.state === "sending") {
      detail = formatDay(row.send.scheduledAt ?? row.send.createdAt);
    }
  }
  return (
    <span
      className={cn(
        "truncate text-[12px] whitespace-nowrap tabular-nums",
        STATE_INK[row.state],
      )}
    >
      {detail ? `${label} · ${detail}` : label}
    </span>
  );
}

/** Who a row is to: the named person, else the row's own label. */
export function recipientName(row: OutreachRow, programs: boolean): string {
  const recipient = row.recipient;
  if (programs) return recipient.toName || recipient.toEmail;
  return recipient.toName || recipient.label || recipient.toEmail;
}

const TH =
  "eyebrow-sm border-b border-[var(--border-hairline)] bg-[var(--surface-card)] pt-3.5 pb-2.5 text-left font-normal";

export function OutreachRecipientTable({
  rows,
  programs,
  crests,
  selectedId,
  tickedIds,
  allTicked,
  onSelect,
  onTick,
  onTickAll,
}: {
  rows: readonly OutreachRow[];
  /** A program list (emails 6–8): the Program column draws. */
  programs: boolean;
  /** `program_key` → crest URL. */
  crests: Readonly<Record<string, string>>;
  selectedId: string | null;
  tickedIds: ReadonlySet<string>;
  allTicked: boolean;
  onSelect: (id: string) => void;
  onTick: (id: string, on: boolean) => void;
  onTickAll: (on: boolean) => void;
}) {
  if (rows.length === 0) {
    return (
      <TableEmptyBody icon={Users} title="Nobody here matches this view" />
    );
  }
  return (
    <table className="w-full min-w-[640px] border-collapse">
      <thead className="sticky top-0 z-10">
        <tr>
          <th className={cn(TH, "w-[30px]")}>
            <Checkbox
              checked={allTicked}
              onChange={onTickAll}
              aria-label={`Tick all ${rows.length.toLocaleString("en-US")} in this view`}
            />
          </th>
          <th className={TH}>Recipient</th>
          {programs ? <th className={TH}>Program</th> : null}
          <th className={cn(TH, "w-[180px]")}>Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const recipient = row.recipient;
          const active = recipient.id === selectedId;
          const name = recipientName(row, programs);
          const sub = [
            recipient.toRole,
            recipient.toName || !programs ? recipient.toEmail : null,
            recipient.cc.length > 0 ? `+${recipient.cc.length} CC` : null,
          ]
            .filter(Boolean)
            .join(" · ");
          const key = recipient.programKeys[0];
          return (
            <tr
              key={recipient.id}
              tabIndex={0}
              aria-selected={active}
              aria-label={`Preview the email to ${recipient.label}`}
              onClick={() => onSelect(recipient.id)}
              onKeyDown={(event) => {
                if (event.target !== event.currentTarget) return;
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(recipient.id);
                }
              }}
              className={cn(
                "h-16 cursor-pointer transition-[background-color] duration-200 ease-[var(--ease-primary)] hover:bg-[var(--surface-muted)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
                active && "bg-[var(--surface-muted)]",
              )}
            >
              <td
                className="rounded-l-[var(--radius-cell)] pr-3 pl-1"
                onClick={(event) => event.stopPropagation()}
              >
                <Checkbox
                  checked={tickedIds.has(recipient.id)}
                  onChange={(on) => onTick(recipient.id, on)}
                  aria-label={`Tick ${recipient.label}`}
                />
              </td>
              <td className="max-w-0 pr-4">
                <AdminPersonCell name={name} sub={sub || undefined} />
              </td>
              {programs ? (
                <td className="max-w-0 pr-4">
                  <span className="flex min-w-0 items-center gap-2">
                    <WorkspaceMark
                      workspace={{
                        kind: "team",
                        name: recipient.label,
                        crestUrl: (key && crests[key]) || null,
                      }}
                    />
                    <span className="flex min-w-0 flex-col gap-1">
                      <span className="flex min-w-0 items-baseline gap-1.5">
                        <span className="truncate text-[12px] text-[var(--ink-700)]">
                          {recipient.label}
                        </span>
                        {recipient.programKeys.length > 1 ? (
                          <span className="shrink-0 text-[11px] text-[var(--ink-500)]">
                            Men&apos;s &amp; women&apos;s
                          </span>
                        ) : null}
                      </span>
                      {recipient.division || recipient.conference ? (
                        <span className="truncate text-[12px] text-[var(--ink-600)]">
                          {[recipient.division, recipient.conference]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      ) : null}
                    </span>
                  </span>
                </td>
              ) : null}
              <td className="max-w-0 rounded-r-[var(--radius-cell)] pr-1">
                <OutreachStatusText row={row} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
