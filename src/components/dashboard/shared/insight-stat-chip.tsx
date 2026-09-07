import { cn } from "@/lib/utils";

export interface InsightStatChipProps {
  /** Short stat name, e.g. "Return Games Won". Rendered uppercase. */
  label: string;
  /** Pre-formatted display value, e.g. "64%" or "12". Always deterministic — never LLM text. */
  value: string;
  /**
   * Optional period-over-period change. A non-zero value renders a trend arrow + delta;
   * `0` or `undefined` renders value-only (a zero delta carries no signal and a "→0"
   * glyph next to the value reads confusingly as a drop to zero).
   */
  change?: number;
  /** Whether a lower value is the better outcome (e.g. double faults, unforced errors). */
  lowerIsBetter?: boolean;
  className?: string;
}

/**
 * A bare evidence stat beside AI prose — v3's `InsightStatChip`: pure type,
 * no container. The numbers always come from real computed data (match
 * statistics, KPI movers), never from the LLM, so the figures are
 * trustworthy. The trend arrow mirrors `KpiTile` for consistency.
 *
 * It used to draw a grey box around itself; the design system's own chip is
 * a 9px letter-spaced label on a 12px tabular value, which is what a row of
 * five reads as evidence rather than as five buttons.
 */
export function InsightStatChip({
  label,
  value,
  change,
  lowerIsBetter = false,
  className,
}: InsightStatChipProps) {
  // A zero delta is treated as "no trend" — we render value-only rather than a neutral
  // "→0", which next to the value reads as a drop to zero.
  const hasTrend = typeof change === "number" && change !== 0;
  const isGood = lowerIsBetter ? (change as number) < 0 : (change as number) > 0;
  const trendColor = isGood ? "var(--viz-good)" : "var(--viz-bad)";
  const arrow = (change as number) > 0 ? "↑" : "↓";
  const sign = (change as number) > 0 ? "+" : "";

  return (
    <span className={cn("inline-flex items-baseline gap-[7px] leading-none", className)}>
      <span className="whitespace-nowrap text-[9px] font-normal uppercase tracking-[2.5px] text-[var(--ink-400)]">
        {label}
      </span>
      <span className="tabular text-[12px] font-normal text-[var(--ink-900)]">{value}</span>
      {hasTrend && (
        <span className="tabular text-[10px] font-medium" style={{ color: trendColor }}>
          {arrow}
          {sign}
          {change}
        </span>
      )}
    </span>
  );
}
