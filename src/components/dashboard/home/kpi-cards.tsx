"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { Settings2 } from "lucide-react";
import type { KpiCardData, KpiCategory } from "@/lib/data/performance-server";
import { KpiTile, KpiTileStrip } from "@/components/dashboard/shared/kpi-tile";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";

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
                ? { change: card.change, changeLabel: card.changeLabel }
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
            className="absolute top-2 right-2 p-1.5 rounded-full text-[var(--color-text-dim)] hover:text-[var(--color-text-secondary)] hover:bg-[#F5F5F5] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-blue-ring)]"
          >
            <Settings2 className="size-3.5" strokeWidth={1.5} />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" sideOffset={6} className="w-56 p-2">
          <div className="flex items-baseline justify-between px-2 pt-1 pb-2">
            <p className="text-[9px] font-normal text-[var(--color-text-dim)] uppercase tracking-[2.5px]">
              Visible tiles
            </p>
            <span className="text-[10px] font-medium text-[var(--color-text-dim)] tabular-nums">
              {visibleKeys.length}/{MAX_VISIBLE}
            </span>
          </div>
          <div className="flex flex-col max-h-[320px] overflow-y-auto">
            {grouped.map((group, gi) => (
              <div key={group.category} className={gi > 0 ? "mt-1.5 pt-1.5 border-t border-[#F0F0F0]" : ""}>
                <p className="px-2 pt-1 pb-1 text-[9px] font-normal text-[var(--color-text-dim)] uppercase tracking-[2.5px]">
                  {group.category}
                </p>
                {group.items.map((card) => {
                  const checked = visibleKeys.includes(card.key);
                  const disabled = (checked && atMin) || (!checked && atMax);
                  return (
                    <label
                      key={card.key}
                      className={`flex items-center gap-2.5 px-2 py-2 rounded-lg text-[13px] text-[#1D1D1F] transition-colors duration-100 ${
                        disabled
                          ? "opacity-50 cursor-not-allowed"
                          : "hover:bg-[#F5F5F5] cursor-pointer"
                      }`}
                    >
                      <Checkbox
                        checked={checked}
                        disabled={disabled}
                        onCheckedChange={() => toggle(card.key)}
                      />
                      <span className="truncate">
                        {card.label
                          .toLowerCase()
                          .replace(/\b\w/g, (c) => c.toUpperCase())}
                      </span>
                    </label>
                  );
                })}
              </div>
            ))}
          </div>
          <p className="px-2 pt-2 pb-1 text-[10px] text-[var(--color-text-dim)]">
            {atMax
              ? "Uncheck a tile to add a different one."
              : atMin
                ? `Pick at least ${MIN_VISIBLE} tiles.`
                : `Pick ${MIN_VISIBLE}–${MAX_VISIBLE} tiles.`}
          </p>
        </PopoverContent>
      </Popover>
    </div>
  );
}
