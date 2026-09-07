import Link from "next/link";
import { ResultMark } from "@/components/dashboard/result-mark";
import { RowAction } from "@/components/dashboard/schedule/row-action";
import { EmptyMark } from "@/components/ui/empty-mark";
import type { ProfileMatchRow } from "@/lib/data/player-profile-server";

/**
 * Every match, one row each — Date · Name · School · Line · outcome · Score.
 *
 * The geometry is exported so the day-zero ghost draws the same columns
 * under the same header by import; a ghost that restates a grid is a ghost
 * that stops matching the table it stands in for.
 */
export const HISTORY_GRID =
  "grid-cols-[56px_minmax(0,1.2fr)_minmax(0,1.2fr)_40px_18px_88px]";

export const HISTORY_COLUMNS = ["Date", "Name", "School", "Line", "", "Score"] as const;

export function MatchHistoryHeader() {
  return (
    <div
      className={`grid ${HISTORY_GRID} gap-3 border-b border-[var(--border-hairline)] pb-2`}
    >
      {HISTORY_COLUMNS.map((column, i) => (
        /* The DS eyebrow class is unlayered and would win over a Tailwind
           colour utility, so the frame's ink-400 is set inline. */
        <span key={i} className="eyebrow-sm" style={{ color: "var(--ink-400)" }}>
          {column}
        </span>
      ))}
    </div>
  );
}

export function MatchHistoryCard({
  rows,
  playerName,
}: {
  rows: ProfileMatchRow[];
  /** For the Matches list's own player filter, which keys on the name. */
  playerName: string;
}) {
  const allHref = `/dashboard/matches?player=${encodeURIComponent(playerName)}`;

  return (
    <section
      aria-label="Match history"
      className="surface-card flex flex-col gap-0.5"
      style={{ padding: 20 }}
    >
      <div className="flex items-center gap-2.5 pb-3">
        <span className="eyebrow">Match history</span>
        <div className="flex-1" />
        <RowAction href={allHref}>
          All {rows.length} {rows.length === 1 ? "match" : "matches"}
        </RowAction>
      </div>

      <MatchHistoryHeader />

      {/* No rules between rows — the header's hairline is the card's only
          line, as on the roster (Data Table law 9). */}
      {rows.map((row) => (
        <Link
          key={row.id}
          href={`/dashboard/matches/${row.id}`}
          className={`-mx-2 grid ${HISTORY_GRID} h-11 items-center gap-3 rounded-[var(--radius-element)] px-2 transition-colors hover:bg-[var(--surface-muted)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none`}
        >
          <span className="tabular text-[11px] text-[var(--ink-500)]">
            {row.date || <EmptyMark label="Undated" />}
          </span>
          <span className="truncate text-[13px] font-medium text-[var(--ink-900)]">
            {row.opponent}
          </span>
          <span className="flex min-w-0 items-center gap-2">
            {row.school ? (
              <>
                <span
                  aria-hidden
                  className="flex size-[26px] shrink-0 items-center justify-center rounded-[var(--radius-button)] bg-[var(--surface-subtle)] text-[11px] font-medium text-[var(--ink-700)]"
                >
                  {row.schoolAbbr}
                </span>
                <span className="truncate text-[12px] text-[var(--ink-600)]">{row.school}</span>
              </>
            ) : (
              <EmptyMark label="No school recorded" />
            )}
          </span>
          <span className="mono text-[11px] text-[var(--ink-500)]">
            {row.line ?? <EmptyMark label="Not on a line" />}
          </span>
          <span className="flex items-center">
            {row.won === null ? (
              <EmptyMark label="Score not recorded" />
            ) : (
              <ResultMark won={row.won} />
            )}
          </span>
          <span className="tabular text-[12px] text-[var(--ink-700)]">{row.score || "—"}</span>
        </Link>
      ))}
    </section>
  );
}
