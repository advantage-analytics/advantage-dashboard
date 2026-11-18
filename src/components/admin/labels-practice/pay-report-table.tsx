"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import type {
  PayLabellerRow,
  PaySessionLine,
  PaySitting,
} from "@/lib/data/practice-server";
import { AdminPage } from "@/components/admin/admin-page";
import { InertButton } from "@/components/admin/inert-button";
import {
  PendingBar,
  PendingRegion,
} from "@/components/dashboard/loading/pending";
import { advField } from "@/lib/ui/adv-field";
import { cn } from "@/lib/utils";
import { DownloadCsvButton } from "./download-csv-button";

const GRID =
  "grid grid-cols-[minmax(220px,1fr)_140px_140px] items-center gap-x-6";

/** The table card, the loaded table's and its skeleton's. */
const TABLE_CARD =
  "overflow-x-auto rounded-[var(--radius-card)] border border-[var(--border-card)] bg-[var(--surface-card)] shadow-[var(--shadow-card)]";

const TABLE_INNER = "min-w-[640px] px-6 pb-3";

/** The column labels; every column after Labeller is a number, flush right. */
const PAY_COLUMNS = ["Labeller", "Paid video", "Time worked"] as const;

/**
 * A row that opens: the surface-muted wash on a rounded row inset 8px past
 * its text (the table law's 8a row), held while it is open.
 */
const OPENING_ROW =
  "-mx-2 block w-[calc(100%+16px)] cursor-pointer rounded-[var(--radius-element)] px-2 text-left transition-[background-color] duration-200 ease-[var(--ease-primary)] hover:bg-[var(--surface-subtle)] disabled:cursor-default disabled:hover:bg-transparent";

/**
 * The page's title and what it counts. The page (`labels/pay/page.tsx`) and
 * its skeleton both draw it.
 */
export function PayReportHeading() {
  return (
    <div>
      <h1 className="text-display">Pay report</h1>
      <p className="text-body-sm mt-[9px] max-w-[620px]">
        Hours of match video each labeller published, counted on the day it was
        first published. Time worked is each labeller&rsquo;s own active minutes
        on those matches.
      </p>
    </div>
  );
}

function PayHeaderRow() {
  return (
    <div
      className={`${GRID} mb-1.5 border-b border-[var(--border-hairline)] pt-4 pb-2.5`}
    >
      {PAY_COLUMNS.map((label, i) => (
        <span key={label} className={cn("eyebrow-sm", i > 0 && "text-right")}>
          {label}
        </span>
      ))}
    </div>
  );
}

function hours(n: number): string {
  return n.toFixed(2);
}

/** Minutes as "3h 11m", or "45m" under an hour. */
function duration(minutes: number): string {
  const whole = Math.round(minutes);
  const h = Math.floor(whole / 60);
  const m = whole % 60;
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

// The report is in UTC days, so every stamp on it reads in UTC too.
const DAY = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const CLOCK = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "UTC",
});

function day(iso: string): string {
  return DAY.format(new Date(iso));
}

function clock(iso: string): string {
  return CLOCK.format(new Date(iso));
}

function sittingText(s: PaySitting): string {
  return `${s.start.slice(0, 16)}Z–${s.end.slice(11, 16)}Z (${s.minutes}m)`;
}

function labellerWorked(row: PayLabellerRow): string {
  if (row.workedMinutes === 0) return "—";
  return duration(row.workedMinutes) + (row.untrackedSessions ? " +" : "");
}

/** Per-labeller hours for the range; a row opens to its sessions, a session to its sittings. */
export function PayReportTable({
  from,
  to,
  rows,
  lines,
}: {
  from: string;
  to: string;
  rows: readonly PayLabellerRow[];
  lines: readonly PaySessionLine[];
}) {
  const [openLabeller, setOpenLabeller] = useState<string | null>(null);
  const [openSession, setOpenSession] = useState<string | null>(null);

  const summary = [
    [
      "labeller",
      "email",
      "published_sessions",
      "published_video_hours",
      "checked_sessions",
      "checked_video_hours",
      "total_video_hours",
      "worked_hours",
      "sessions_without_time",
    ],
    ...rows.map((r) => [
      r.name,
      r.email,
      r.publishedSessions,
      hours(r.publishedHours),
      r.checkedSessions,
      hours(r.checkedHours),
      hours(r.publishedHours + r.checkedHours),
      hours(r.workedMinutes / 60),
      r.untrackedSessions,
    ]),
  ];
  const detail = [
    [
      "labeller",
      "session_id",
      "match",
      "first_published_at",
      "state",
      "video_hours",
      "worked_minutes",
      "sittings",
    ],
    ...lines.map((l) => [
      l.labellerName,
      l.sessionId,
      l.match,
      l.publishedAt,
      l.state,
      hours(l.videoHours),
      l.workedMinutes,
      l.sittings.map(sittingText).join("; "),
    ]),
  ];

  const linesBy = new Map<string, PaySessionLine[]>();
  for (const line of lines) {
    const held = linesBy.get(line.labellerId);
    if (held) held.push(line);
    else linesBy.set(line.labellerId, [line]);
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap justify-end gap-2">
        <DownloadCsvButton
          filename={`label-pay-${from}-to-${to}.csv`}
          rows={summary}
          disabled={rows.length === 0}
        />
        <DownloadCsvButton
          filename={`label-pay-sessions-${from}-to-${to}.csv`}
          rows={detail}
          label="Download sessions"
          disabled={lines.length === 0}
        />
      </div>
      {rows.length === 0 ? (
        <div className="rounded-[var(--radius-card)] border border-[var(--border-card)] bg-[var(--surface-card)] px-6 py-12 text-center shadow-[var(--shadow-card)]">
          <p className="text-[13px] text-[var(--ink-900)]">
            Nothing was published in this range.
          </p>
        </div>
      ) : (
        <>
          <div className={TABLE_CARD}>
            <div className={TABLE_INNER}>
              <PayHeaderRow />
              {rows.map((r) => {
                const open = openLabeller === r.labellerId;
                const panel = `pay-${r.labellerId}`;
                return (
                  <div key={r.labellerId}>
                    <button
                      type="button"
                      aria-expanded={open}
                      aria-controls={panel}
                      onClick={() =>
                        setOpenLabeller(open ? null : r.labellerId)
                      }
                      className={cn(
                        OPENING_ROW,
                        open && "bg-[var(--surface-muted)]",
                      )}
                    >
                      <span
                        className={`${GRID} h-[52px] text-[13px] tabular-nums`}
                      >
                        <span className="flex min-w-0 items-center gap-2.5">
                          <ChevronRight
                            aria-hidden
                            className={cn(
                              "size-3 shrink-0 text-[var(--ink-500)] transition-transform duration-200 ease-[var(--ease-primary)]",
                              open && "rotate-90",
                            )}
                          />
                          <span className="truncate text-[var(--ink-900)]">
                            {r.name}
                          </span>
                        </span>
                        <span className="text-right text-[var(--ink-900)]">
                          {duration((r.publishedHours + r.checkedHours) * 60)}
                        </span>
                        <span className="text-right font-medium text-[var(--ink-900)]">
                          {labellerWorked(r)}
                        </span>
                      </span>
                    </button>
                    {open ? (
                      <div id={panel} className="pt-1 pb-3.5 pl-[22px]">
                        {(linesBy.get(r.labellerId) ?? []).map((l) => (
                          <SessionLine
                            key={l.sessionId}
                            line={l}
                            open={openSession === l.sessionId}
                            onToggle={() =>
                              setOpenSession(
                                openSession === l.sessionId
                                  ? null
                                  : l.sessionId,
                              )
                            }
                          />
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
          <p className="text-[11px] text-[var(--ink-600)]">
            — means no active time was recorded for the session; a + on a total
            means it leaves such sessions out. Times are UTC.
          </p>
        </>
      )}
    </section>
  );
}

function SessionLine({
  line,
  open,
  onToggle,
}: {
  line: PaySessionLine;
  open: boolean;
  onToggle: () => void;
}) {
  const tracked = line.workedMinutes !== null;
  const panel = `pay-session-${line.sessionId}`;
  return (
    <div>
      <button
        type="button"
        disabled={!tracked}
        aria-expanded={tracked ? open : undefined}
        aria-controls={tracked ? panel : undefined}
        onClick={onToggle}
        className={cn(OPENING_ROW, open && "bg-[var(--surface-muted)]")}
      >
        <span
          className={`${GRID} h-10 text-[12px] text-[var(--ink-700)] tabular-nums`}
        >
          <span className="min-w-0 truncate">
            <span className="text-[var(--ink-900)]">{line.match}</span>
            {" · "}
            {day(line.publishedAt)}
            {" · "}
            {line.state === "checked" ? "Checked" : "Published"}
          </span>
          <span className="text-right">{duration(line.videoHours * 60)}</span>
          <span
            className={cn("text-right", !tracked && "text-[var(--ink-400)]")}
          >
            {tracked ? duration(line.workedMinutes ?? 0) : "—"}
          </span>
        </span>
      </button>
      {open && tracked ? (
        <ul
          id={panel}
          className="mt-0.5 mb-2.5 flex flex-col gap-1.5 pl-4 text-[12px] leading-[18px] text-[var(--ink-600)] tabular-nums"
        >
          {line.sittings.map((s) => (
            <li key={s.start}>
              {day(s.start)}, {clock(s.start)}–{clock(s.end)} —{" "}
              <span className="text-[var(--ink-900)]">
                {duration(s.minutes)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * Admin › Labels › Pay report while it loads (`labels/pay/loading.tsx`): the
 * heading, the range form's labels and the table's column labels as
 * themselves; the two dates (they come off the URL), the buttons and the rows
 * as bars.
 */
export function PayReportPageSkeleton() {
  return (
    <AdminPage className="gap-6">
      <PayReportHeading />

      <PendingRegion
        label="the date range"
        innerClassName="flex flex-wrap items-end gap-4"
      >
        {["From", "To"].map((label) => (
          <span key={label} className="flex flex-col gap-1.5">
            <span className="eyebrow-sm">{label}</span>
            <span
              className={cn(advField("boxed"), "flex w-[150px] items-center")}
            >
              <PendingBar className="h-3 w-20" />
            </span>
          </span>
        ))}
        <InertButton variant="primary" size="md">
          Show
        </InertButton>
      </PendingRegion>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap justify-end gap-2">
          <PendingBar className="h-8 w-28 rounded-[var(--radius-button)]" />
          <PendingBar className="h-8 w-40 rounded-[var(--radius-button)]" />
        </div>
        <div className={TABLE_CARD}>
          <div className={TABLE_INNER}>
            <PayHeaderRow />
            <PendingRegion label="the pay report">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className={`${GRID} h-[52px]`}>
                  <span className="flex items-center gap-2.5">
                    <PendingBar className="size-3" />
                    <PendingBar className="h-3 w-32" />
                  </span>
                  {Array.from({ length: 2 }, (_, j) => (
                    <span key={j} className="flex justify-end">
                      <PendingBar className="h-3 w-14" />
                    </span>
                  ))}
                </div>
              ))}
            </PendingRegion>
          </div>
        </div>
      </section>
    </AdminPage>
  );
}
