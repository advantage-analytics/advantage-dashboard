"use client";

import { motion } from "framer-motion";

interface StatComparisonBarProps {
  label: string;
  player1Value: number;
  player2Value: number;
  index: number;
  isPercentage?: boolean;
}

function getTextColor(isLeading: boolean, isTied: boolean, leadingColor: string): string {
  if (isLeading) return leadingColor;
  if (isTied) return "text-[#666666]";
  return "text-[#999999]";
}

function formatValue(value: number, isPercentage: boolean): string {
  return isPercentage ? `${value}%` : value.toString();
}

export function StatComparisonBar({
  label,
  player1Value,
  player2Value,
  index,
  isPercentage = false,
}: StatComparisonBarProps): React.JSX.Element {
  const maxValue = Math.max(player1Value, player2Value);
  const player1Percentage = maxValue > 0 ? (player1Value / maxValue) * 100 : 0;
  const player2Percentage = maxValue > 0 ? (player2Value / maxValue) * 100 : 0;

  const player1IsLeading = player1Value > player2Value;
  const player2IsLeading = player2Value > player1Value;
  const isTied = player1Value === player2Value;

  const baseDelay = 0.15 + index * 0.04;
  const barDelay = 0.25 + index * 0.04;
  const dotDelay = 0.6 + index * 0.04;

  return (
    <motion.div
      className="grid grid-cols-[auto_1fr_auto_1fr_auto] items-center gap-2 sm:gap-4 rounded-xl"
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, delay: baseDelay, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      <div className="flex items-center justify-end gap-1 w-10 sm:w-[70px]">
        {player1IsLeading && (
          <motion.div
            className="w-1.5 h-1.5 rounded-full bg-[#4A8AF4] hidden sm:block"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.3, delay: dotDelay }}
          />
        )}
        <span
          className={`text-xs sm:text-sm font-semibold tabular-nums transition-colors duration-200 text-right ${getTextColor(player1IsLeading, isTied, "text-[#4A8AF4]")}`}
        >
          {formatValue(player1Value, isPercentage)}
        </span>
      </div>

      <div className="flex justify-end min-w-0">
        <div className="relative w-full h-1.5 bg-[#D9D9D9] rounded-full overflow-hidden">
          <motion.div
            className="absolute right-0 h-full bg-[#4A8AF4] rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${player1Percentage}%` }}
            transition={{ duration: 0.7, delay: barDelay, ease: [0.34, 1.56, 0.64, 1] }}
          />
        </div>
      </div>

      <div className="flex items-center justify-center w-16 sm:w-[120px]">
        <span className="text-[10px] sm:text-xs font-medium text-[#999999] text-center leading-tight">
          {label}
        </span>
      </div>

      <div className="flex justify-start min-w-0">
        <div className="relative w-full h-1.5 bg-[#D9D9D9] rounded-full overflow-hidden">
          <motion.div
            className="absolute left-0 h-full bg-[#F38439] rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${player2Percentage}%` }}
            transition={{ duration: 0.7, delay: barDelay, ease: [0.34, 1.56, 0.64, 1] }}
          />
        </div>
      </div>

      <div className="flex items-center justify-start gap-1 w-10 sm:w-[70px]">
        <span
          className={`text-xs sm:text-sm font-semibold tabular-nums transition-colors duration-200 text-left ${getTextColor(player2IsLeading, isTied, "text-[#F38439]")}`}
        >
          {formatValue(player2Value, isPercentage)}
        </span>
        {player2IsLeading && (
          <motion.div
            className="w-1.5 h-1.5 rounded-full bg-[#F38439] hidden sm:block"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.3, delay: dotDelay }}
          />
        )}
      </div>
    </motion.div>
  );
}
