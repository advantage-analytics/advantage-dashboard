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

  const barWidth = 140;
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
      className="grid grid-cols-[70px_1fr_120px_1fr_70px] items-center gap-3 py-2 px-3 rounded-xl hover:bg-[#FAFAFA] transition-colors duration-200 group"
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{
        duration: 0.4,
        delay: 0.15 + index * 0.04,
        ease: [0.25, 0.46, 0.45, 0.94],
      }}
    >
      {/* Player 1 Value */}
      <div className="flex items-center justify-end gap-2">
        {player1IsLeading && (
          <motion.div
            className="w-1.5 h-1.5 rounded-full bg-[#4A8AF4]"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.3, delay: 0.6 + index * 0.04 }}
          />
        )}
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

      {/* Player 1 Bar (fills right-to-left) */}
      <div className="flex justify-end">
        <div className="relative">
          <svg
            width={barWidth}
            height={barHeight}
            className="scale-x-[-1] overflow-visible"
          >
            {/* Background bar with subtle gradient */}
            <defs>
              <linearGradient id={`bg-grad-${index}-1`} x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#F0F0F0" />
                <stop offset="100%" stopColor="#E8E8E8" />
              </linearGradient>
              <linearGradient id={`bar-grad-${index}-1`} x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#5A9BFF" />
                <stop offset="50%" stopColor="#4A8AF4" />
                <stop offset="100%" stopColor="#3A7BD5" />
              </linearGradient>
            </defs>
            <rect
              width={barWidth}
              height={barHeight}
              rx={borderRadius}
              ry={borderRadius}
              fill={`url(#bg-grad-${index}-1)`}
            />
            {/* Foreground bar with gradient */}
            <motion.rect
              height={barHeight}
              rx={borderRadius}
              ry={borderRadius}
              fill={`url(#bar-grad-${index}-1)`}
              initial={{ width: 0 }}
              animate={{ width: barWidth * (player1Percentage / 100) }}
              transition={{
                duration: 0.7,
                delay: 0.25 + index * 0.04,
                ease: [0.34, 1.56, 0.64, 1],
              }}
            />
          </svg>
          {/* Glow effect on hover */}
          <div
            className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
            style={{
              background: "linear-gradient(90deg, transparent 0%, rgba(74, 138, 244, 0.1) 100%)",
              borderRadius: borderRadius,
            }}
          />
        </div>
      </div>

      {/* Label */}
      <div className="flex items-center justify-center">
        <span className="text-[11px] font-medium text-[#888888] text-center leading-tight">
          {label}
        </span>
      </div>

      {/* Player 2 Bar (fills left-to-right) */}
      <div className="flex justify-start">
        <div className="relative">
          <svg
            width={barWidth}
            height={barHeight}
            className="overflow-visible"
          >
            {/* Background bar with subtle gradient */}
            <defs>
              <linearGradient id={`bg-grad-${index}-2`} x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#E8E8E8" />
                <stop offset="100%" stopColor="#F0F0F0" />
              </linearGradient>
              <linearGradient id={`bar-grad-${index}-2`} x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#E89B4D" />
                <stop offset="50%" stopColor="#F5A962" />
                <stop offset="100%" stopColor="#FFB87A" />
              </linearGradient>
            </defs>
            <rect
              width={barWidth}
              height={barHeight}
              rx={borderRadius}
              ry={borderRadius}
              fill={`url(#bg-grad-${index}-2)`}
            />
            {/* Foreground bar with gradient */}
            <motion.rect
              height={barHeight}
              rx={borderRadius}
              ry={borderRadius}
              fill={`url(#bar-grad-${index}-2)`}
              initial={{ width: 0 }}
              animate={{ width: barWidth * (player2Percentage / 100) }}
              transition={{
                duration: 0.7,
                delay: 0.25 + index * 0.04,
                ease: [0.34, 1.56, 0.64, 1],
              }}
            />
          </svg>
          {/* Glow effect on hover */}
          <div
            className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
            style={{
              background: "linear-gradient(90deg, rgba(245, 169, 98, 0.1) 0%, transparent 100%)",
              borderRadius: borderRadius,
            }}
          />
        </div>
      </div>

      {/* Player 2 Value */}
      <div className="flex items-center justify-start gap-2">
        <span
          className={`text-sm font-semibold tabular-nums transition-colors duration-200 ${
            player2IsLeading
              ? "text-[#F5A962]"
              : isTied
                ? "text-[#666666]"
                : "text-[#999999]"
          }`}
        >
          {formatValue(player2Value)}
        </span>
        {player2IsLeading && (
          <motion.div
            className="w-1.5 h-1.5 rounded-full bg-[#F5A962]"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.3, delay: 0.6 + index * 0.04 }}
          />
        )}
      </div>
    </motion.div>
  );
}
