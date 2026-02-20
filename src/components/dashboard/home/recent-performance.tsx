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
  const changeColor = change >= 0 ? "bg-[#73E668]/15" : "bg-red-200";
  const changeTextColor = change >= 0 ? "text-[#5DB955]" : "text-[#E05252]";
  const changeText = change >= 0 ? `+${change.toFixed(1)}` : change.toFixed(1);

  return (
    <motion.div
      className="flex flex-row gap-6 p-2"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{
        duration: 0.5,
        delay: 0.4 + index * 0.1,
        ease: [0.25, 0.46, 0.45, 0.94],
      }}
    >
      <div className="w-0.5 bg-[#E4E4E4] self-stretch rounded-full"></div>
      <div className="flex flex-col space-y-1">
        <div className="flex flex-row items-center gap-4">
          <p className="text-2xl font-medium text-[#444444]">
            {value.toFixed(1).padStart(4, "0")}%
          </p>
          <motion.span
            className={`px-[6px] py-[4px] rounded-[6px] text-[10px] font-semibold ${changeColor} ${changeTextColor} text-center leading-none`}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{
              duration: 0.3,
              delay: 0.6 + index * 0.1,
              ease: [0.25, 0.46, 0.45, 0.94],
            }}
            style={{ filter: "drop-shadow(0px 1px 2px rgba(0, 0, 0, 0.08))" }}
          >
            {changeText}
          </motion.span>
        </div>
        <p className="text-xs font-normal text-[#999999]">{label}</p>
      </div>
    </motion.div>
  );
}
