"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { Check, RotateCcw, Settings2 } from "lucide-react";
import type { KpiCardData, KpiCategory } from "@/lib/data/performance-server";
import { KpiTile, KpiTileStrip } from "@/components/dashboard/shared/kpi-tile";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const STORAGE_KEY = "advantage.kpi.visible";
const MAX_VISIBLE = 5;
const MIN_VISIBLE = 4;
const CATEGORY_ORDER: KpiCategory[] = ["Serve", "Return", "Other"];

// Module-scope so the entrance stagger doesn't replay when users navigate away
// and back within the same SPA session.
let hasAnimatedOnce = false;

interface KpiCardsProps {
  cards: KpiCardData[];
  matchCount?: number;
}

function defaultVisible(allKeys: string[]): string[] {
  return allKeys.slice(0, MAX_VISIBLE);
}

function readVisible(allKeys: string[]): string[] {
  if (typeof window === "undefined") return defaultVisible(allKeys);
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultVisible(allKeys);
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return defaultVisible(allKeys);
    const valid = parsed.filter(
      (k): k is string => typeof k === "string" && allKeys.includes(k)
    );
    if (valid.length < MIN_VISIBLE) return defaultVisible(allKeys);
    return valid.slice(0, MAX_VISIBLE);
  } catch {
    return defaultVisible(allKeys);
  }
}

export default function KpiCards({ cards, matchCount }: KpiCardsProps) {
  const showTrends = matchCount == null || matchCount >= 2;
  const shouldReduceMotion = useReducedMotion();
  const skipAnimation = shouldReduceMotion || hasAnimatedOnce;

  const allKeys = cards.map((c) => c.key);
  const allKeysRef = useRef(allKeys);
  allKeysRef.current = allKeys;

  const [visibleKeys, setVisibleKeys] = useState<string[]>(() => defaultVisible(allKeys));
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setVisibleKeys(readVisible(allKeysRef.current));
    setHydrated(true);
  }, []);

  useEffect(() => {
    hasAnimatedOnce = true;
  }, []);

  const persist = (next: string[]) => {
    setVisibleKeys(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
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

  const shown = (hydrated ? visibleKeys : defaultVisible(allKeys))
    .map((k) => cards.find((c) => c.key === k))
    .filter((c): c is KpiCardData => c !== undefined);
  const atMax = visibleKeys.length >= MAX_VISIBLE;
  const atMin = visibleKeys.length <= MIN_VISIBLE;

  const grouped = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    items: cards.filter((c) => c.category === cat),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="relative">
      <KpiTileStrip>
        {shown.map((card, index) => (
          <KpiTile
            key={card.key}
            label={card.label}
            value={card.value}
            sparkline={card.sparkline}
            trend={
              showTrends
                ? {
                    change: card.change,
                    changeLabel: card.changeLabel,
                    lowerIsBetter: card.lowerIsBetter,
                  }
                : undefined
            }
            hintText={showTrends ? undefined : "1 more match for trends"}
            description={card.description}
            index={index}
            skipAnimation={skipAnimation}
            href={`/dashboard/statistics?focus=${card.key}`}
          />
        ))}
      </KpiTileStrip>

      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Customize KPI tiles"
            className="absolute top-2 right-2 h-7 w-7 rounded-lg flex items-center justify-center text-[#8A8A8E] hover:text-[#3C3C43] hover:bg-[#F5F5F5] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40 data-[state=open]:bg-[#F5F5F5] data-[state=open]:text-[#0D0D0D]"
          >
            <Settings2 className="size-3.5" strokeWidth={1.5} />
          </button>
        </PopoverTrigger>
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
              onClick={() => persist(defaultVisible(allKeys))}
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
