"use client";

import type {
  PayLabellerRow,
  PaySessionLine,
} from "@/lib/data/practice-server";
import { DownloadCsvButton } from "./download-csv-button";

const GRID =
  "grid grid-cols-[minmax(180px,1fr)_110px_110px_110px_110px_110px] items-center gap-x-4";

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
        <div className="overflow-x-auto rounded-[var(--radius-card)] border border-[var(--border-card)] bg-[var(--surface-card)] shadow-[var(--shadow-card)]">
          <div className="min-w-[760px] px-6 pt-0.5 pb-1.5">
            <div
              className={`${GRID} border-b border-[var(--border-hairline)] pt-3.5 pb-2.5`}
            >
              <span className="eyebrow-sm">Labeller</span>
              <span className="eyebrow-sm text-right">Published h</span>
              <span className="eyebrow-sm text-right">Checked h</span>
              <span className="eyebrow-sm text-right">Total h</span>
              <span className="eyebrow-sm text-right">Sessions</span>
              <span className="eyebrow-sm text-right">Practice sets</span>
            </div>
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
