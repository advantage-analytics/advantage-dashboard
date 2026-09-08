"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { Check, RotateCcw, Settings2 } from "lucide-react";
import type { KpiCardData, KpiCategory } from "@/lib/data/performance-server";
import { KpiTile, KpiTileStrip } from "@/components/dashboard/shared/kpi-tile";
import { ChromeTooltip } from "@/components/dashboard/shared/chrome-tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const MAX_VISIBLE = 5;
const MIN_VISIBLE = 4;
const CATEGORY_ORDER: KpiCategory[] = ["Serve", "Return", "Other"];

// Module-scope so the entrance stagger doesn't replay when users navigate away
// and back within the same SPA session. Keyed by strip: the personal Home and
// Team Home share this module, and one flag meant a first-ever view of the
// team strip skipped its entrance because the personal one had already played.
const animatedStrips = new Set<string>();

interface KpiCardsProps {
  cards: KpiCardData[];
  matchCount?: number;
  /**
   * Where the viewer's pick is kept. Team Home passes its own key so choosing
   * tiles for a program does not rearrange the personal strip, and the
   * reverse; the two are different questions asked of the same picker.
   */
  storageKey?: string;
  /** How many tiles show before anyone has picked — 5 on the personal Home, 4 on Team Home. */
  defaultCount?: number;
  /** Passed through to every tile — see `KpiTile`. */
  ghostSparkline?: boolean;
  compactPhone?: boolean;
  /**
   * Drop tiles rather than narrow them as the strip loses width — see
   * `KpiTileStrip`. Its thresholds are written for five tiles: the fourth
   * leaves below 736px of strip. Team Home shows four and turns this off, or a
   * coach on a phone would see the day-zero strip promise four regions and the
   * first report take one away; `compactPhone` is that strip's narrow-width
   * answer instead.
   */
  collapse?: boolean;
  /** Names the strip as a landmark — "Program summary" on Team Home. */
  ariaLabel?: string;
}

function defaultVisible(allKeys: string[], count: number): string[] {
  return allKeys.slice(0, count);
}

function readVisible(allKeys: string[], storageKey: string, count: number): string[] {
  if (typeof window === "undefined") return defaultVisible(allKeys, count);
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return defaultVisible(allKeys, count);
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return defaultVisible(allKeys, count);
    const valid = parsed.filter(
      (k): k is string => typeof k === "string" && allKeys.includes(k)
    );
    if (valid.length < MIN_VISIBLE) return defaultVisible(allKeys, count);
    return valid.slice(0, MAX_VISIBLE);
  } catch {
    return defaultVisible(allKeys, count);
  }
}

export default function KpiCards({
  cards,
  matchCount,
  storageKey = "advantage.kpi.visible",
  defaultCount = MAX_VISIBLE,
  ghostSparkline = false,
  compactPhone = false,
  collapse = true,
  ariaLabel,
}: KpiCardsProps) {
  const showTrends = matchCount == null || matchCount >= 2;
  const shouldReduceMotion = useReducedMotion();
  const skipAnimation = shouldReduceMotion || animatedStrips.has(storageKey);

  const allKeys = cards.map((c) => c.key);
  // Captured at mount only. The single consumer is the mount effect below,
  // which restores persisted visibility against the initial key set, so
  // useRef's initial value is exactly what it needs. The previous render-time
  // reassignment kept it "fresh" for a reader that never existed, and mutating
  // a ref during render is unsafe under concurrent rendering (react-hooks/refs).
  const allKeysRef = useRef(allKeys);

  const [visibleKeys, setVisibleKeys] = useState<string[]>(() =>
    defaultVisible(allKeys, defaultCount)
  );
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setVisibleKeys(readVisible(allKeysRef.current, storageKey, defaultCount));
    setHydrated(true);
  }, [storageKey, defaultCount]);

  useEffect(() => {
    animatedStrips.add(storageKey);
  }, [storageKey]);

  const persist = (next: string[]) => {
    setVisibleKeys(next);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // ignore quota / privacy mode
    }
  };

  const toggle = (key: string) => {
    if (visibleKeys.includes(key)) {
      if (visibleKeys.length <= MIN_VISIBLE) return;
      persist(visibleKeys.filter((k) => k !== key));
    } else {
      if (visibleKeys.length >= MAX_VISIBLE) return;
      persist(
        allKeys.filter((k) => visibleKeys.includes(k) || k === key)
      );
    }
  };

  if (cards.length === 0) return null;

  const shown = (hydrated ? visibleKeys : defaultVisible(allKeys, defaultCount))
    .map((k) => cards.find((c) => c.key === k))
    .filter((c): c is KpiCardData => c !== undefined);
  const atMax = visibleKeys.length >= MAX_VISIBLE;
  const atMin = visibleKeys.length <= MIN_VISIBLE;

  const grouped = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    items: cards.filter((c) => c.category === cat),
  })).filter((g) => g.items.length > 0);

  return (
    // `group`: the customize control below reveals on hover over the strip.
    <div
      className="group relative"
      role={ariaLabel ? "group" : undefined}
      aria-label={ariaLabel}
    >
      <KpiTileStrip collapse={collapse}>
        {shown.map((card, index) => {
          // A trend needs a line: two readings of THIS statistic, not two
          // matches in the program. Gating on the match count alone printed
          // "→ 0 vs earlier" under a statistic nothing had measured, and under
          // one measured once — a change of zero asserted about no comparison.
          const hasLine = card.sparkline.length >= 2;
          const trend =
            showTrends && hasLine
              ? {
                  change: card.change,
                  changeLabel: card.changeLabel,
                  lowerIsBetter: card.lowerIsBetter,
                }
              : undefined;
          const hintText = trend
            ? undefined
            : card.sparkline.length === 0
              ? "Not measured yet"
              : "1 more match for trends";
          return (
          <KpiTile
            key={card.key}
            label={card.label}
            value={card.value}
            sparkline={card.sparkline}
            ghostSparkline={ghostSparkline}
            compactPhone={compactPhone}
            trend={trend}
            hintText={hintText}
            description={card.description}
            index={index}
            skipAnimation={skipAnimation}
            detail={card.points}
            format={card.format}
          />
          );
        })}
      </KpiTileStrip>

      <Popover>
        {/* Hover-revealed, the way v3 reveals a table row's icon actions: the
            Pa2 frame draws the strip with nothing in its corner, and the
            SKILL.md lock still wants the 4–5 tile picker. So it is there on
            hover, on focus and while open, and absent at rest. Named by a dark
            tooltip as every icon-only control must be. */}
        <ChromeTooltip label="Customize tiles" detail="Pick 4–5 to show">
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="Customize KPI tiles"
              className="absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-lg text-[#8A8A8E] opacity-0 transition-[opacity,color,background-color] duration-200 hover:bg-[#F5F5F5] hover:text-[#3C3C43] focus-visible:opacity-100 focus-visible:outline-none group-hover:opacity-100 data-[state=open]:bg-[#F5F5F5] data-[state=open]:text-[#0D0D0D] data-[state=open]:opacity-100"
            >
              <Settings2 className="size-3.5" strokeWidth={1.5} />
            </button>
          </PopoverTrigger>
        </ChromeTooltip>
        <PopoverContent
          align="end"
          sideOffset={6}
          className="w-[280px] p-0 overflow-hidden rounded-xl border border-[#E5E5EA] shadow-[0_8px_30px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)]"
        >
          <div className="px-4 pt-3.5 pb-3">
            <div className="flex items-baseline justify-between">
              <p className="text-[13px] font-medium text-[#1D1D1F] leading-none">
                Customize tiles
              </p>
              <p className="text-[11px] text-[#AAAAAA] tabular-nums leading-none">
                <span className="font-medium text-[#0D0D0D]">
                  {visibleKeys.length}
                </span>
                <span className="mx-0.5">of</span>
                {MAX_VISIBLE}
              </p>
            </div>
            <div
              className="mt-2.5 flex items-center gap-1"
              role="presentation"
              aria-hidden="true"
            >
              {Array.from({ length: MAX_VISIBLE }).map((_, i) => {
                const filled = i < visibleKeys.length;
                return (
                  <span
                    key={i}
                    className={`h-[3px] flex-1 rounded-full transition-colors duration-200 ${
                      filled ? "bg-[#3B82F6]" : "bg-[#EBEBEB]"
                    }`}
                  />
                );
              })}
            </div>
          </div>

          <div className="h-px bg-[#E5E5EA] mx-2" />

          <div className="flex flex-col max-h-[300px] overflow-y-auto p-1">
            {grouped.map((group, gi) => (
              <div key={group.category} className={gi > 0 ? "mt-1" : ""}>
                <div className="px-2.5 pt-2 pb-1.5">
                  <p className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px]">
                    {group.category}
                  </p>
                </div>
                {group.items.map((card) => {
                  const checked = visibleKeys.includes(card.key);
                  const disabled = (checked && atMin) || (!checked && atMax);
                  const formattedLabel = card.label
                    .toLowerCase()
                    .replace(/\b\w/g, (c) => c.toUpperCase());
                  return (
                    <button
                      key={card.key}
                      type="button"
                      role="menuitemcheckbox"
                      aria-checked={checked}
                      aria-disabled={disabled}
                      disabled={disabled}
                      onClick={() => toggle(card.key)}
                      title={
                        disabled
                          ? checked
                            ? `Keep at least ${MIN_VISIBLE} tiles visible`
                            : `Uncheck a tile to add ${formattedLabel}`
                          : undefined
                      }
                      className={`group relative flex w-full items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] text-left transition-colors duration-100 focus-visible:outline-none focus-visible:bg-[#F5F5F5] ${
                        disabled
                          ? "opacity-40 cursor-not-allowed"
                          : "hover:bg-[#F5F5F5] active:bg-[#EBEBEB] cursor-pointer"
                      } ${
                        checked && !disabled
                          ? "text-[#0D0D0D]"
                          : "text-[#525252]"
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className="size-3.5 shrink-0 flex items-center justify-center"
                      >
                        {checked && (
                          <Check
                            className="size-3.5 text-[#3B82F6]"
                            strokeWidth={2.25}
                          />
                        )}
                      </span>
                      <span className="truncate flex-1 leading-none">
                        {formattedLabel}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="h-px bg-[#E5E5EA] mx-2" />

          <div className="flex items-center justify-between gap-2 px-4 py-2.5">
            <p className="text-[11px] leading-[1.45] text-[#888888] flex-1">
              {atMax
                ? "All slots full — uncheck to swap."
                : atMin
                  ? `Minimum ${MIN_VISIBLE} tiles.`
                  : `Pick ${MIN_VISIBLE}–${MAX_VISIBLE} to display.`}
            </p>
            <button
              type="button"
              onClick={() => persist(defaultVisible(allKeys, defaultCount))}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-[#525252] hover:text-[#2563EB] transition-colors duration-200 focus-visible:outline-none focus-visible:text-[#2563EB] rounded-sm"
            >
              <RotateCcw className="size-3" strokeWidth={1.5} />
              Reset
            </button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
