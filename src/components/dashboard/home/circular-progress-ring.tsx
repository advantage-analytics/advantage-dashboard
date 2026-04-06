"use client";

import { motion } from "framer-motion";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type CircularProgressRingProps = {
  wins: number;
  losses: number;
  label?: string;
  onClick?: () => void;
};

export function CircularProgressRing({
  wins,
  losses,
  label = "Overall Record",
  onClick,
}: CircularProgressRingProps) {
  // Calculate percentages and geometry
  const total = wins + losses;
  const winPercentage = total > 0 ? wins / total : 0;
  const winRate = Math.round(winPercentage * 100);

  // SVG geometry calculations
  const size = 100;
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2; // 46
  const circumference = 2 * Math.PI * radius; // ~289.03

  // Calculate stroke-dashoffset for progress ring
  const progressOffset = circumference * (1 - winPercentage);

  return (
    <TooltipProvider>
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>
          <motion.div
            whileHover={{ scale: 1.01 }}
            transition={{ duration: 0.2 }}
            onClick={onClick}
            className="flex items-center gap-4 cursor-pointer"
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }}
            aria-label={`${label}: ${wins} wins, ${losses} losses. Click to cycle views.`}
          >
            <div
              className="flex-shrink-0"
              style={{ filter: "drop-shadow(0px 1px 3px rgba(0, 0, 0, 0.12))" }}
            >
              <svg width={size} height={size}>
              <g transform={`translate(${size / 2}, ${size / 2})`}>
                {/* Background ring - full gray circle (static, no animation) */}
                <circle
                  r={radius}
                  fill="none"
                  stroke="#D9D9D9"
                  strokeWidth={strokeWidth}
                />

                {/* Progress ring - blue arc showing win percentage */}
                {winPercentage > 0 && (
                  <motion.circle
                    r={radius}
                    fill="none"
                    stroke="#3B82F6"
                    strokeWidth={strokeWidth}
                    strokeLinecap="butt"
                    strokeDasharray={circumference}
                    initial={{ strokeDashoffset: circumference }}
                    animate={{ strokeDashoffset: progressOffset }}
                    transition={{
                      duration: 0.8,
                      delay: 0.3,
                      ease: [0.25, 0.46, 0.45, 0.94],
                    }}
                    transform="rotate(-90)"
                  />
                )}
              </g>
              </svg>
            </div>

            <div className="flex flex-col">
              <p className="text-2xl font-medium text-[#0D0D0D]">
                {wins}-{losses}
              </p>
              <p className="text-sm font-normal text-[#71717A]">{label}</p>
            </div>
          </motion.div>
        </TooltipTrigger>

        <TooltipContent>
          <div className="text-xs space-y-1">
            <p className="font-semibold">Win Rate: {winRate}%</p>
            <p>
              Wins: {wins} | Losses: {losses}
            </p>
            <p className="text-[#888888]">Total: {total} matches</p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
