import Link from "next/link";
import type { ProfileKpi } from "@/lib/data/player-profile";
import { Sparkline } from "@/components/dashboard/shared/kpi-tile";
import {
  EmptyBand,
  GhostBar,
  GhostRows,
  HEAD_LINK,
  LIST_CARD,
  LIST_ROW,
  LIST_ROW_HOVER,
  RowChevron,
  ROW_SUB,
  ROW_TITLE,
  SectionHead,
} from "./home-title";
import { RememberHomeRows } from "./home-shape-memory";
import type { ListKind } from "./list-pending";

const WINDOW = 4;
/** The five biggest changes: a glance, level with the list beside it. */
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
export function numberRows(
  kpis: readonly ProfileKpi[],
  limit: number = ROWS,
): {
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
  return { rows: rows.slice(0, limit), span };
}

const show = (value: number, percent: boolean) =>
  percent ? `${Math.round(value)}%` : String(Math.round(value * 10) / 10);

/**
 * The personal Home's rail: where the player's own numbers are moving, set
 * as the lists beside it are — the statistic over what it was before, then
 * the trend into the current value and the change, where only the arrow
 * takes the colour. Each row opens Ask with a question about that statistic. Until two matches are analyzed there is nothing to compare, so
 * the list draws its own shape and says so.
 */
export function YourNumbers({
  kpis,
  limit = ROWS,
  askHref = "/dashboard/ask",
  list = "numbers",
}: {
  kpis: readonly ProfileKpi[];
  /** How many rows: five beside one list, eight where the rail has room. */
  limit?: number;
  /** This workspace's Ask page. */
  askHref?: string;
  list?: ListKind;
}) {
  const { rows, span } = numberRows(kpis, limit);
  return (
    <section
      aria-label="Your numbers"
      className="flex min-w-0 flex-col gap-2.5"
    >
      <SectionHead title="Your numbers">
        {rows.length > 0 ? (
          <Link href={askHref} className={HEAD_LINK}>
            Ask about your game
          </Link>
        ) : null}
      </SectionHead>
      <RememberHomeRows list={list} rows={rows.length} />
      <div className={`${LIST_CARD} @container`}>
        {rows.length === 0 ? (
          <>
            <GhostRows
              lines={[130, 110]}
              tail={
                <>
                  <GhostBar width={76} height={14} />
                  <GhostBar width={34} />
                  <GhostBar width={40} />
                </>
              }
            />
            <EmptyBand
              title="Your numbers start with your second analyzed match"
              body="Each stat is compared with the matches before it."
            />
          </>
        ) : (
          rows.map((row) => {
            const rounded = Math.round(row.change);
            return (
              // The row opens Ask with the question already in the composer;
              // nothing is sent, or spent, until the player sends it.
              <Link
                key={row.key}
                href={`${askHref}?q=${encodeURIComponent(
                  `Why did my ${row.label.toLowerCase()} go ${rounded < 0 ? "down" : "up"}?`,
                )}`}
                aria-label={`Ask about ${row.label}`}
                className={`${LIST_ROW} ${LIST_ROW_HOVER}`}
              >
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className={ROW_TITLE}>{row.label}</span>
                  <span className={ROW_SUB}>
                    Was{" "}
                    <span className="tabular">
                      {show(row.before, row.percent)}
                    </span>
                    {/* The narrowed rail keeps the figure and drops the
                        window, so the statistic's name stays whole. */}
                    <span className="@max-[380px]:hidden">
                      {span === 1
                        ? " the match before"
                        : ` in the ${span} before`}
                    </span>
                  </span>
                </span>
                <Sparkline data={row.series} positive={rounded >= 0} />
                <span className="tabular w-11 shrink-0 text-right text-[13px] font-medium text-[var(--ink-900)]">
                  {show(row.recent, row.percent)}
                </span>
                <span className="tabular w-9 shrink-0 text-right text-[12px] text-[var(--ink-700)]">
                  <span
                    style={{
                      color:
                        rounded > 0
                          ? "var(--viz-good)"
                          : rounded < 0
                            ? "var(--viz-bad)"
                            : "var(--ink-500)",
                    }}
                  >
                    {rounded > 0 ? "↑" : rounded < 0 ? "↓" : "→"}
                  </span>{" "}
                  {Math.abs(rounded)}
                </span>
                <span className="contents @max-[380px]:hidden">
                  <RowChevron />
                </span>
              </Link>
            );
          })
        )}
      </div>
    </section>
  );
}
