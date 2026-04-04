"use client";

import { motion } from "framer-motion";

// Recent Performance Component
export function RecentPerformance({
  value,
  change,
  label,
  index = 0,
}: {
  value: number;
  change: number;
  label: string;
  index?: number;
}) {
  const changeColor =
    change >= 0 ? "bg-[rgba(115,230,104,0.15)]" : "bg-[rgba(229,24,55,0.15)]";
  const changeTextColor =
    change >= 0 ? "text-[#5DB955]" : "text-[#E51837]";
  const changeText = change >= 0 ? `+${change.toFixed(1)}` : change.toFixed(1);

  return (
    <motion.div
      className="flex gap-6 items-center px-1 py-3"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.5,
        delay: 0.4 + index * 0.1,
        ease: [0.25, 0.46, 0.45, 0.94],
      }}
    >
      <div className="w-0.5 h-12 bg-[#3986F3] rounded-full shrink-0" />
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <p className="text-xl font-medium text-[#525252] tabular-nums">
            {value.toFixed(1)}%
          </p>
          <motion.span
            className={`px-1.5 py-1 rounded-[6px] text-[10px] font-semibold leading-none ${changeColor} ${changeTextColor}`}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{
              duration: 0.3,
              delay: 0.6 + index * 0.1,
              ease: [0.25, 0.46, 0.45, 0.94],
            }}
          >
            {changeText}
          </motion.span>
        </div>
        <p className="text-xs font-normal text-[#999999]">{label}</p>
      </div>
    </motion.div>
  );
}
