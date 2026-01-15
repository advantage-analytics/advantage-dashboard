"use client";

import { motion } from "framer-motion";

// Performance Rating Component
export function PerformanceRating({
  label,
  value,
  barColor = "#4A90E2",
}: {
  label: string;
  value: number;
  barColor?: string;
}) {
  // Normalize value to 0-100 percentage (max value is 300)
  const maxValue = 300;
  const normalizedValue = Math.min((value / maxValue) * 100, 100);

  const barWidth = 172; // Fixed width for the bar
  const barHeight = 6; // Height in pixels
  const borderRadius = 3;

  return (
    <div className="flex flex-row items-end justify-between gap-4">
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-[#999999]">{label}</span>
        <div style={{ filter: "drop-shadow(0px 2px 4px rgba(0, 0, 0, 0.10))" }}>
          <svg width={barWidth} height={barHeight}>
            {/* Background bar */}
            <rect
              width={barWidth}
              height={barHeight}
              rx={borderRadius}
              ry={borderRadius}
              fill="#D9D9D9"
            />
            {/* Foreground bar with animation */}
            <motion.rect
              width={barWidth * (normalizedValue / 100)}
              height={barHeight}
              rx={borderRadius}
              ry={borderRadius}
              fill={barColor}
              initial={{ width: 0 }}
              animate={{ width: barWidth * (normalizedValue / 100) }}
              transition={{
                duration: 0.8,
                delay: 0.2,
                ease: [0.25, 0.46, 0.45, 0.94],
              }}
            />
          </svg>
        </div>
      </div>
      <span className="text-2xl font-medium text-[#0D0D0D] min-w-[50px] leading-none text-right">
        {value.toFixed(1).padStart(5, "0")}
      </span>
    </div>
  );
}
