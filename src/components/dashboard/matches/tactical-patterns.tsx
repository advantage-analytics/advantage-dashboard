"use client";

import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

const EASE: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

interface TacticalPatternsProps {
  items: Array<{
    name: string;
    value: number;
    description: string;
    type: "strength" | "weakness";
  }>;
}

export function TacticalPatterns({ items }: TacticalPatternsProps) {
  const prefersReduced = useReducedMotion();
  const visible = items.slice(0, 6);

  if (visible.length === 0) return null;

  return (
    <section
      aria-labelledby="tactical-patterns-heading"
      className="bg-white border border-[#F3F3F3] rounded-[14px] shadow-[0px_2px_8px_0px_rgba(0,0,0,0.06)] p-5 flex flex-col gap-5"
    >
      <div className="flex items-baseline justify-between">
        <p
          id="tactical-patterns-heading"
          className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px] leading-[15px]"
        >
          Tactical Patterns
        </p>
        <p className="text-[10px] font-normal text-[#AAAAAA] tabular-nums leading-[15px]">
          {visible.length} identified
        </p>
      </div>

      <ol className="flex flex-col" role="list">
        {visible.map((item, i) => {
          const pct =
            item.value > 1
              ? Math.round(item.value)
              : Math.round(item.value * 100);
          const isStrength = item.type === "strength";
          const accentColor = isStrength ? "#5DB955" : "#E51837";
          const categoryLabel = isStrength ? "Strength" : "Area to improve";
          const index = String(i + 1).padStart(2, "0");

          return (
            <motion.li
              key={item.name}
              className={cn(
                "group grid grid-cols-[32px_minmax(0,1fr)_180px] items-center gap-6 py-5",
                i !== 0 && "border-t border-[#F3F3F3]",
              )}
              initial={prefersReduced ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.04, ease: EASE }}
            >
              <div className="flex items-center gap-3 self-stretch">
                <div
                  className="w-px h-full rounded-full shrink-0 opacity-70 group-hover:opacity-100 transition-opacity duration-200"
                  style={{ backgroundColor: accentColor }}
                  aria-hidden="true"
                />
                <span className="text-[10px] font-medium text-[#AAAAAA] tabular-nums tracking-[1px] uppercase">
                  {index}
                </span>
              </div>

              <div className="flex flex-col gap-1 min-w-0">
                <p className="text-[13px] font-medium text-[#0D0D0D] leading-[20px]">
                  {item.name}
                </p>
                {item.description && (
                  <p className="text-[11px] font-normal text-[#71717A] leading-[1.5] max-w-[60ch]">
                    {item.description}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-1 items-end text-right">
                <p className="text-[9px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px] leading-[15px]">
                  {categoryLabel}
                </p>
                <p className="text-[28px] font-light text-[#0D0D0D] tracking-[-0.5px] leading-none tabular-nums">
                  {pct}
                  <span className="text-[14px] font-light text-[#AAAAAA] tracking-normal ml-0.5">
                    %
                  </span>
                </p>
              </div>
            </motion.li>
          );
        })}
      </ol>
    </section>
  );
}
