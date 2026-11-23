import Link from "next/link";
import type { ProfileKpi } from "@/lib/data/player-profile";
import { Sparkline } from "@/components/dashboard/shared/kpi-tile";
import { EmptyBand, GhostBar, HEAD_LINK, SectionHead } from "./home-title";

const GRID =
  "grid grid-cols-[minmax(240px,1.5fr)_minmax(110px,0.7fr)_minmax(110px,0.7fr)_minmax(110px,0.7fr)_120px] items-center gap-x-6";
const WINDOW = 4;
const ROWS = 5;

const mean = (values: number[]) =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

interface NumberRow {
  key: string;
  label: string;
  recent: number;
  before: number;
  change: number;
  series: number[];
  percent: boolean;
}

/**
 * Each statistic's recent matches against the ones before them, biggest
 * change first. `span` is one window for the whole table (up to four
 * matches), so the two column headings are true of every row.
 */
export function numberRows(kpis: readonly ProfileKpi[]): {
  rows: NumberRow[];
  span: number;
} {
  const measured = kpis.filter((kpi) => (kpi.points?.length ?? 0) >= 2);
  const longest = Math.max(0, ...measured.map((kpi) => kpi.points!.length));
  const span = Math.min(WINDOW, Math.floor(longest / 2));
  if (span === 0) return { rows: [], span };
  const rows = measured.flatMap((kpi): NumberRow[] => {
    const values = kpi.points!.map((point) => point.value);
    if (values.length < span + 1) return [];
    const recent = mean(values.slice(-span));
    const before = mean(values.slice(-span * 2, -span));
    return [
      {
        key: kpi.key,
        label: kpi.label,
        recent,
        before,
        change: recent - before,
        series: values.slice(-span * 2),
        percent: kpi.format === undefined || kpi.format === "percent",
      },
    ];
  });
  rows.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
  return { rows: rows.slice(0, ROWS), span };
}

const show = (value: number, percent: boolean) =>
  percent ? `${Math.round(value)}%` : String(Math.round(value * 10) / 10);

/**
 * The personal Home's last section: where the player's own numbers are
 * moving. Until two matches are analyzed there is nothing to compare, so the
 * table draws its own columns over ghost rows and says what arrives, and when.
 */
export function YourNumbers({ kpis }: { kpis: readonly ProfileKpi[] }) {
  const { rows, span } = numberRows(kpis);
  if (rows.length === 0) {
    return (
      <section aria-label="Your numbers" className="flex flex-col gap-2.5">
        <SectionHead title="Your numbers" />
        <div className="surface-card" style={{ padding: "2px 24px 6px" }}>
          <div
            className={`${GRID} border-b border-[var(--border-hairline)] pt-3.5 pb-2.5`}
          >
            <span className="eyebrow-sm">Biggest changes</span>
            <span className="eyebrow-sm">Recent</span>
            <span className="eyebrow-sm">Before</span>
            <span className="eyebrow-sm">Change</span>
            <span className="eyebrow-sm">Trend</span>
          </div>
          {[1, 0.6, 0.3].map((opacity) => (
            <div
              key={opacity}
              aria-hidden
              className={`${GRID} h-[52px]`}
              style={{ opacity }}
            >
              <GhostBar width={140} />
              <GhostBar width={32} />
              <GhostBar width={32} />
              <GhostBar width={44} />
              <GhostBar width={80} />
            </div>
          ))}
          <EmptyBand
            title="Your numbers start with your second analyzed match"
            body="Each statistic is compared with the matches before it, so the biggest changes in your game lead the list."
          />
        </div>
      </section>
    );
  }
  const matches = span === 1 ? "match" : `${span} matches`;
  return (
    <section aria-label="Your numbers" className="flex flex-col gap-2.5">
      <SectionHead title="Your numbers">
        <Link href="/dashboard/ask" className={HEAD_LINK}>
          Ask about your game
        </Link>
      </SectionHead>
      <div
        className="surface-card overflow-x-auto"
        style={{ padding: "2px 24px 8px" }}
      >
        <div className="min-w-[760px]">
          <div
            className={`${GRID} border-b border-[var(--border-hairline)] pt-3.5 pb-2.5`}
          >
            <span className="eyebrow-sm">Biggest changes</span>
            <span className="eyebrow-sm">Last {matches}</span>
            <span className="eyebrow-sm">
              {span === 1 ? "The one before" : `${span} before`}
            </span>
            <span className="eyebrow-sm">Change</span>
            <span className="eyebrow-sm whitespace-nowrap">
              Last {span * 2} matches
            </span>
          </div>
          {rows.map((row) => {
            const rounded = Math.round(row.change);
            return (
              <div key={row.key} className={`${GRID} h-[52px]`}>
                <span className="min-w-0 truncate text-[13px] text-[var(--ink-900)]">
                  {row.label}
                </span>
                <span className="tabular text-[13px] text-[var(--ink-900)]">
                  {show(row.recent, row.percent)}
                </span>
                <span className="tabular text-[13px] text-[var(--ink-500)]">
                  {show(row.before, row.percent)}
                </span>
                <span
                  className="tabular text-[11px] font-medium"
                  style={{
                    color:
                      rounded > 0
                        ? "var(--viz-good)"
                        : rounded < 0
                          ? "var(--viz-bad)"
                          : "var(--ink-500)",
                  }}
                >
                  {rounded > 0 ? "↑" : rounded < 0 ? "↓" : "→"}{" "}
                  {Math.abs(rounded)}
                  {row.percent ? " pts" : ""}
                </span>
                <Sparkline data={row.series} positive={rounded >= 0} />
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
