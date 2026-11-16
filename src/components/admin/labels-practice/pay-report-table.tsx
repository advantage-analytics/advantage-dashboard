"use client";

import type {
  PayLabellerRow,
  PaySessionLine,
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
  "grid grid-cols-[minmax(180px,1fr)_110px_110px_110px_110px_110px] items-center gap-x-4";

/** The table card, the loaded table's and its skeleton's. */
const TABLE_CARD =
  "overflow-x-auto rounded-[var(--radius-card)] border border-[var(--border-card)] bg-[var(--surface-card)] shadow-[var(--shadow-card)]";

/** The column labels; every column after Labeller is a number, flush right. */
const PAY_COLUMNS = [
  "Labeller",
  "Published h",
  "Checked h",
  "Total h",
  "Sessions",
  "Practice sets",
] as const;

/**
 * The page's title and what it counts. The page (`labels/pay/page.tsx`) and
 * its skeleton both draw it.
 */
export function PayReportHeading() {
  return (
    <div>
      <h1 className="text-display">Pay report</h1>
      <p className="text-body-sm mt-[9px]">
        Hours of match video each labeller published, counted once on the day it
        was first published. Checked is what an admin has passed. Practice sets
        are not paid hours.
      </p>
    </div>
  );
}

function PayHeaderRow() {
  return (
    <div
      className={`${GRID} border-b border-[var(--border-hairline)] pt-3.5 pb-2.5`}
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

/** Per-labeller hours for the range, with the per-session lines as a second CSV. */
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
  const summary = [
    [
      "labeller",
      "email",
      "published_sessions",
      "published_video_hours",
      "checked_sessions",
      "checked_video_hours",
      "total_video_hours",
      "practice_sets",
    ],
    ...rows.map((r) => [
      r.name,
      r.email,
      r.publishedSessions,
      hours(r.publishedHours),
      r.checkedSessions,
      hours(r.checkedHours),
      hours(r.publishedHours + r.checkedHours),
      r.practiceSets,
    ]),
  ];
  const detail = [
    ["labeller", "session_id", "first_published_at", "state", "video_hours"],
    ...lines.map((l) => [
      l.labellerName,
      l.sessionId,
      l.publishedAt,
      l.state,
      hours(l.videoHours),
    ]),
  ];

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
        <div className={TABLE_CARD}>
          <div className="min-w-[760px] px-6 pt-0.5 pb-1.5">
            <PayHeaderRow />
            {rows.map((r) => (
              <div
                key={r.labellerId}
                className={`${GRID} h-[52px] border-b border-[var(--border-hairline)] text-[13px] tabular-nums last:border-b-0`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-[var(--ink-900)]">
                    {r.name}
                  </span>
                  <span className="block truncate text-[12px] text-[var(--ink-500)]">
                    {r.email}
                  </span>
                </span>
                <span className="text-right text-[var(--ink-700)]">
                  {hours(r.publishedHours)}
                </span>
                <span className="text-right text-[var(--ink-700)]">
                  {hours(r.checkedHours)}
                </span>
                <span className="text-right text-[var(--ink-900)]">
                  {hours(r.publishedHours + r.checkedHours)}
                </span>
                <span className="text-right text-[var(--ink-700)]">
                  {r.publishedSessions + r.checkedSessions}
                </span>
                <span className="text-right text-[var(--ink-700)]">
                  {r.practiceSets}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
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
          <div className="min-w-[760px] px-6 pt-0.5 pb-1.5">
            <PayHeaderRow />
            <PendingRegion label="the pay report">
              {Array.from({ length: 4 }, (_, i) => (
                <div
                  key={i}
                  className={`${GRID} h-[52px] border-b border-[var(--border-hairline)] last:border-b-0`}
                >
                  <span className="flex flex-col gap-1.5">
                    <PendingBar className="h-3 w-32" />
                    <PendingBar className="h-3 w-44" />
                  </span>
                  {Array.from({ length: 5 }, (_, j) => (
                    <span key={j} className="flex justify-end">
                      <PendingBar className="h-3 w-10" />
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
