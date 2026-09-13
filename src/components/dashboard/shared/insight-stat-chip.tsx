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
 * Small, non-interactive "evidence" pill shown next to AI-insight prose. The numbers
 * always come from real computed data (KPI movers, match statistics) — never from the
 * LLM — so the figures are trustworthy. The trend arrow/color mirrors `KpiTile`
 * (`src/components/dashboard/shared/kpi-tile.tsx`) for consistency.
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
  const trendColor = isGood ? "text-[#5DB955]" : "text-[#E51837]";
  const arrow = (change as number) > 0 ? "↑" : "↓";
  const sign = (change as number) > 0 ? "+" : "";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[6px] bg-[#F5F5F5] px-2 py-1",
        className,
      )}
    >
      <span className="text-[9px] font-normal uppercase tracking-[2.5px] text-[var(--color-text-dim)] whitespace-nowrap">
        {label}
      </span>
      <span className="text-[11px] font-semibold tabular-nums text-[var(--color-text-primary)]">
        {value}
      </span>
      {hasTrend && (
        <span className={cn("text-[10px] font-semibold tabular-nums", trendColor)}>
          {arrow}
          {sign}
          {change}
        </span>
      )}
    </span>
  );
}
