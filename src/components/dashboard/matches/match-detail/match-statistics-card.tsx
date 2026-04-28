"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PLAYER_1, PLAYER_2 } from "@/lib/design/player-colors";

export interface StatRow {
  label: string;
  description?: string;
  p1Display: string;
  p2Display: string;
  p1Fraction?: string;
  p2Fraction?: string;
}

export interface StatSection {
  title: string;
  rows: StatRow[];
}

interface MatchStatisticsCardProps {
  sections: StatSection[];
  p1Name: string;
  p2Name: string;
}

const P1_COLOR = PLAYER_1;
const P2_COLOR = PLAYER_2;
const NEUTRAL_COLOR = "var(--color-text-secondary)";

const STAT_DESCRIPTIONS: Record<string, string> = {
  "aces": "Serves the returner doesn't touch.",
  "double faults": "Missed second serves; point lost.",
  "first serve in %": "First serves landing in the box.",
  "first serve won %": "Points won when first serve is in.",
  "second serve won %": "Points won on second serves.",
  "break points saved": "Break points denied on serve.",
  "total serve points won": "Points won while serving.",
  "total service games won": "Service games held.",
  "first serve return in %": "First-serve returns in play.",
  "first serve returns won %": "Points won returning first serves.",
  "second serve return in %": "Second-serve returns in play.",
  "second serve return points won %": "Points won returning second serves.",
  "break points converted": "Break points won on return.",
  "total return points won": "Points won while returning.",
  "return games won %": "Opponent's service games broken.",
  "return games won": "Opponent service games broken.",
  "winners": "Point-ending shots not touched.",
  "errors": "Shots into the net or out of bounds.",
  "net points appearances": "Points played at the net.",
  "net points won": "Net points won.",
  "short (1-4 shots)": "Rallies of 1–4 shots.",
  "medium (5-8 shots)": "Rallies of 5–8 shots.",
  "long (9+ shots)": "Rallies of 9+ shots.",
  "total points won": "Total points won.",
};

function getStatDescription(label: string, fallback?: string): string | undefined {
  return STAT_DESCRIPTIONS[label.toLowerCase()] ?? fallback;
}

const headerCellClass =
  "text-[10px] font-medium uppercase tracking-[2.5px] leading-[15px] text-left pb-[12px] text-[var(--color-text-dim)]";
const labelCellClass =
  "font-normal text-[10px] leading-[15px] text-[var(--color-text-dim)] text-left align-middle py-[8px] pl-3 pr-4 transition-colors group-hover:bg-[var(--color-surface-muted)] group-hover:rounded-l-[8px]";
const valueCellClass =
  "text-left align-middle py-[8px] pr-2 w-[28%] transition-colors group-hover:bg-[var(--color-surface-muted)]";
// Expands invisible click/tap target to ≥44px without disturbing layout (WCAG 2.5.5).
const touchTargetExpanderClass =
  "relative after:absolute after:content-[''] after:inset-y-[-13px] after:inset-x-[-8px]";

export function MatchStatisticsCard({
  sections,
  p1Name,
  p2Name,
}: MatchStatisticsCardProps) {
  const visibleSections = sections.filter((s) => s.rows.length > 0);
  if (visibleSections.length === 0) {
    return (
      <section
        aria-labelledby="match-stats-heading-empty"
        className="surface-card rounded-[14px] p-[21px]"
      >
        <h2
          id="match-stats-heading-empty"
          className="text-[10px] font-medium text-[var(--color-text-dim)] uppercase tracking-[2.5px] leading-[15px] mb-[14px]"
        >
          Statistics
        </h2>
        <p className="text-[13px] font-light text-[var(--color-text-dim)] text-left">
          No statistics available for this match.
        </p>
      </section>
    );
  }

  return (
    <section
      id="match-statistics"
      aria-labelledby="match-stats-heading"
      className="surface-card rounded-[14px] p-[21px] scroll-mt-6 relative"
    >
      <a
        href="#match-stats-end"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-20 focus:bg-white focus:px-3 focus:py-1.5 focus:rounded-[6px] focus:text-[12px] focus:text-[var(--color-accent-blue)] focus:shadow-card focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-blue-ring)]"
      >
        Skip past statistics table
      </a>
      <table className="w-full border-separate border-spacing-0 table-fixed">
        <thead className="sticky top-0 bg-white z-10">
          <tr>
            <th
              scope="col"
              id="match-stats-heading"
              className={`${headerCellClass} pl-3 bg-white`}
            >
              Statistic
            </th>
            <th
              scope="col"
              title={p1Name}
              className={`${headerCellClass} w-[28%] truncate bg-white`}
            >
              {p1Name}
            </th>
            <th
              scope="col"
              title={p2Name}
              className={`${headerCellClass} w-[28%] truncate bg-white sm:pr-6 lg:pr-10`}
            >
              {p2Name}
            </th>
          </tr>
        </thead>

        {visibleSections.map((section) => (
          <tbody key={section.title}>
            <tr>
              <th scope="colgroup" colSpan={3} className="pb-[8px]">
                <div className="text-left text-[11px] font-medium leading-[16.5px] text-[var(--color-text-body)] pl-3 pt-[12px] pb-[14px] border-b border-[var(--color-border-card)]">
                  {section.title}
                </div>
              </th>
            </tr>
            {section.rows.map((row) => {
              const diff = compareDisplay(row.p1Display, row.p2Display, row.label);
              const p1Leader = diff !== null && diff > 0;
              const p2Leader = diff !== null && diff < 0;
              const description = getStatDescription(row.label, row.description);
              const p1Missing = isMissingValue(row.p1Display);
              const p2Missing = isMissingValue(row.p2Display);
              return (
                <tr key={row.label} className="group">
                  <th scope="row" className={labelCellClass}>
                    {description ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span
                            tabIndex={0}
                            className={`inline-block cursor-help rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-blue-ring)] ${touchTargetExpanderClass}`}
                          >
                            {row.label}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent
                          sideOffset={8}
                          collisionPadding={12}
                          className="max-w-[280px] px-3 py-2 text-left leading-[16px]"
                        >
                          {description}
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      row.label
                    )}
                  </th>
                  <td className={valueCellClass}>
                    <ValueCell
                      display={row.p1Display}
                      fraction={row.p1Fraction}
                      color={p1Leader ? P1_COLOR : NEUTRAL_COLOR}
                      isLeader={p1Leader}
                      isMissing={p1Missing}
                    />
                  </td>
                  <td className={`${valueCellClass} sm:pr-6 lg:pr-10 group-hover:rounded-r-[8px]`}>
                    <ValueCell
                      display={row.p2Display}
                      fraction={row.p2Fraction}
                      color={p2Leader ? P2_COLOR : NEUTRAL_COLOR}
                      isLeader={p2Leader}
                      isMissing={p2Missing}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        ))}
      </table>
      <span id="match-stats-end" tabIndex={-1} className="sr-only">
        End of statistics table
      </span>
    </section>
  );
}

function ValueCell({
  display,
  fraction,
  color,
  isLeader,
  isMissing,
}: {
  display: string;
  fraction?: string;
  color: string;
  isLeader: boolean;
  isMissing: boolean;
}) {
  if (isMissing) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            tabIndex={0}
            aria-label="No data recorded for this stat"
            className={`inline-block whitespace-nowrap text-[var(--color-text-muted)] italic cursor-help focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-blue-ring)] rounded-sm text-[14px] leading-[18px] font-normal tabular-nums ${touchTargetExpanderClass}`}
          >
            —
          </span>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          sideOffset={6}
          className="px-2.5 py-1.5 text-[11px] leading-[14px]"
        >
          No data
        </TooltipContent>
      </Tooltip>
    );
  }
  const numberWeight = isLeader && !fraction ? "font-medium" : "font-normal";
  return (
    <span
      className="inline-flex items-end gap-[8px] whitespace-nowrap"
      style={{ color }}
    >
      <span className={`text-[14px] leading-[18px] tabular-nums ${numberWeight}`}>
        {display}
      </span>
      {fraction && (
        <span className="text-[10px] font-normal leading-[14px] text-[var(--color-text-dim)] tabular-nums">
          {fraction}
        </span>
      )}
    </span>
  );
}

const warnedValues = new Set<string>();

function compareDisplay(a: string, b: string, label?: string): number | null {
  const av = parseDisplay(a);
  const bv = parseDisplay(b);
  if (av === null || bv === null) {
    if (process.env.NODE_ENV !== "production") {
      const unparseable = [av === null ? a : null, bv === null ? b : null]
        .filter((v): v is string => v !== null && v.trim() !== "");
      for (const value of unparseable) {
        const key = `${label ?? ""}::${value}`;
        if (warnedValues.has(key)) continue;
        warnedValues.add(key);
        console.warn(
          `[MatchStatisticsCard] unparseable stat value${label ? ` (${label})` : ""}:`,
          value,
        );
      }
    }
    return null;
  }
  return av - bv;
}

function parseDisplay(s: string): number | null {
  return parseValue(s)?.value ?? null;
}

function parseValue(s: string): { value: number; isPercent: boolean } | null {
  const raw = s.trim();
  const isPercent = raw.endsWith("%");
  const trimmed = isPercent ? raw.slice(0, -1).trim() : raw;
  if (trimmed.includes("/")) {
    const [num, denom] = trimmed.split("/").map((p) => Number(p));
    if (Number.isFinite(num) && Number.isFinite(denom) && denom > 0) {
      return { value: num / denom, isPercent };
    }
    return Number.isFinite(num) ? { value: num, isPercent } : null;
  }
  const n = Number(trimmed);
  return Number.isFinite(n) ? { value: n, isPercent } : null;
}

function isMissingValue(s: string): boolean {
  const trimmed = s.trim();
  if (trimmed === "") return true;
  if (trimmed === "—" || trimmed === "-" || trimmed === "–") return true;
  if (/^n\/?a$/i.test(trimmed)) return true;
  return false;
}

export function MatchStatisticsCardSkeleton() {
  const sections = [6, 8, 7];
  return (
    <section
      role="status"
      aria-busy
      aria-live="polite"
      aria-label="Loading statistics"
      className="surface-card rounded-[14px] p-[21px]"
    >
      <div className="flex items-center justify-between pb-[12px]">
        <div className="h-[10px] w-[80px] rounded bg-[var(--color-surface-muted)] motion-safe:animate-pulse" />
        <div className="flex gap-6">
          <div className="h-[10px] w-[72px] rounded bg-[var(--color-surface-muted)] motion-safe:animate-pulse" />
          <div className="h-[10px] w-[72px] rounded bg-[var(--color-surface-muted)] motion-safe:animate-pulse" />
        </div>
      </div>
      {sections.map((rowCount, sectionIdx) => (
        <div key={sectionIdx}>
          <div className="pt-[12px] pb-[14px] border-b border-[var(--color-border-card)] pl-3">
            <div className="h-[11px] w-[56px] rounded bg-[var(--color-surface-muted)] motion-safe:animate-pulse" />
          </div>
          <div className="pt-[8px]">
            {Array.from({ length: rowCount }).map((_, rowIdx) => (
              <div key={rowIdx} className="flex items-center justify-between py-[8px] pl-3">
                <div
                  className="h-[10px] rounded bg-[var(--color-surface-muted)] motion-safe:animate-pulse"
                  style={{ width: `${110 + ((rowIdx * 23) % 70)}px` }}
                />
                <div className="flex gap-6">
                  <div className="h-[14px] w-[40px] rounded bg-[var(--color-surface-muted)] motion-safe:animate-pulse" />
                  <div className="h-[14px] w-[40px] rounded bg-[var(--color-surface-muted)] motion-safe:animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
