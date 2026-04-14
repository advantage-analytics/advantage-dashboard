"use client";

import { motion, useReducedMotion } from "framer-motion";

const EASE: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];
const FADE_ANIMATE = { opacity: 1, y: 0 };

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

  if (items.length === 0) return null;

  return (
    <div>
      <p className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px] leading-[15px] mb-3">
        Tactical Patterns
      </p>
      <div className="border-y border-[#F3F3F3] divide-y divide-[#F3F3F3]" role="list" aria-label="Tactical patterns">
        {items.slice(0, 6).map((item, i) => {
          const pct =
            item.value > 1
              ? Math.round(item.value)
              : Math.round(item.value * 100);
          const accentColor = item.type === "strength" ? "#5DB955" : "#E51837";
          return (
            <motion.div
              key={item.name}
              className="flex items-start justify-between gap-8 py-5 pl-3.5 relative"
              initial={prefersReduced ? false : { opacity: 0, y: 6 }}
              animate={FADE_ANIMATE}
              transition={{ duration: 0.3, delay: i * 0.05, ease: EASE }}
            >
              <div
                className="absolute left-0 top-5 bottom-5 w-[2px] rounded-full"
                style={{ backgroundColor: accentColor }}
                aria-hidden="true"
              />
              <div className="flex flex-col gap-1 min-w-0 flex-1">
                <p className="text-[13px] font-medium text-[#0D0D0D]">
                  {item.name}
                </p>
                {item.description && (
                  <p className="text-[12px] text-[#71717A] leading-[1.65]">
                    {item.description}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2.5 shrink-0 pt-0.5">
                <div className="w-[72px] h-[5px] bg-[#F3F3F3] rounded-full overflow-hidden">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundColor: accentColor }}
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(pct, 100)}%` }}
                    transition={{
                      duration: prefersReduced ? 0 : 0.5,
                      delay: i * 0.05 + 0.15,
                      ease: EASE,
                    }}
                  />
                </div>
                <span className="text-[13px] font-medium text-[#0D0D0D] tabular-nums w-9 text-right">
                  {pct}%
                </span>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
