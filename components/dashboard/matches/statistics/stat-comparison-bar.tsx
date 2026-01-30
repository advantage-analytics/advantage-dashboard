"use client";

import { motion } from "framer-motion";

interface StatComparisonBarProps {
  label: string;
  player1Value: number;
  player2Value: number;
  index: number;
  isPercentage?: boolean;
}

export function StatComparisonBar({
  label,
  player1Value,
  player2Value,
  index,
  isPercentage = false,
}: StatComparisonBarProps) {
  const maxValue = Math.max(player1Value, player2Value);
  const player1Percentage = maxValue > 0 ? (player1Value / maxValue) * 100 : 0;
  const player2Percentage = maxValue > 0 ? (player2Value / maxValue) * 100 : 0;

  const player1IsLeading = player1Value > player2Value;
  const player2IsLeading = player2Value > player1Value;
  const isTied = player1Value === player2Value;

  const barWidth = 240;
  const barHeight = 6;
  const borderRadius = 3;

  const formatValue = (value: number) => {
    if (isPercentage) {
      return `${value}%`;
    }
    return value.toString();
  };

  return (
    <motion.div
      className="grid grid-cols-[70px_1fr_120px_1fr_70px] items-center gap-4 rounded-xl"
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{
        duration: 0.4,
        delay: 0.15 + index * 0.04,
        ease: [0.25, 0.46, 0.45, 0.94],
      }}
    >
      {/* Player 1 Value */}
      <div className="flex items-center justify-end gap-1">
        {player1IsLeading && (
          <motion.div
            className="w-1.5 h-1.5 rounded-full bg-[#4A8AF4]"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.3, delay: 0.6 + index * 0.04 }}
          />
        )}
        <div className="w-[40px] text-right">
          <span
            className={`text-sm font-semibold tabular-nums transition-colors duration-200 ${
              player1IsLeading
                ? "text-[#4A8AF4]"
                : isTied
                  ? "text-[#666666]"
                  : "text-[#999999]"
            }`}
          >
            {formatValue(player1Value)}
          </span>
        </div>
      </div>

      {/* Player 1 Bar (fills right-to-left) */}
      <div className="flex justify-end">
        <svg
          width={barWidth}
          height={barHeight}
          className="scale-x-[-1]"
        >
          <rect
            width={barWidth}
            height={barHeight}
            rx={borderRadius}
            ry={borderRadius}
            fill="#D9D9D9"
          />
          <motion.rect
            height={barHeight}
            rx={borderRadius}
            ry={borderRadius}
            fill="#4A8AF4"
            initial={{ width: 0 }}
            animate={{ width: barWidth * (player1Percentage / 100) }}
            transition={{
              duration: 0.7,
              delay: 0.25 + index * 0.04,
              ease: [0.34, 1.56, 0.64, 1],
            }}
          />
        </svg>
      </div>

      {/* Label */}
      <div className="flex items-center justify-center w-[120px]">
        <span className="text-xs font-medium text-[#999999] text-center leading-tight">
          {label}
        </span>
      </div>

      {/* Player 2 Bar (fills left-to-right) */}
      <div className="flex justify-start">
        <svg width={barWidth} height={barHeight}>
          <rect
            width={barWidth}
            height={barHeight}
            rx={borderRadius}
            ry={borderRadius}
            fill="#D9D9D9"
          />
          <motion.rect
            height={barHeight}
            rx={borderRadius}
            ry={borderRadius}
            fill="#F38439"
            initial={{ width: 0 }}
            animate={{ width: barWidth * (player2Percentage / 100) }}
            transition={{
              duration: 0.7,
              delay: 0.25 + index * 0.04,
              ease: [0.34, 1.56, 0.64, 1],
            }}
          />
        </svg>
      </div>

      {/* Player 2 Value */}
      <div className="flex items-center justify-start gap-1">
        <div className="w-[40px]">
          <span
            className={`text-sm font-semibold tabular-nums transition-colors duration-200 ${
              player2IsLeading
                ? "text-[#F38439]"
                : isTied
                  ? "text-[#666666]"
                  : "text-[#999999]"
            }`}
          >
            {formatValue(player2Value)}
          </span>
        </div>
        {player2IsLeading && (
          <motion.div
            className="w-1.5 h-1.5 rounded-full bg-[#F38439]"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.3, delay: 0.6 + index * 0.04 }}
          />
        )}
      </div>
    </motion.div>
  );
}
