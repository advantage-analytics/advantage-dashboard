"use client";

import { motion } from "framer-motion";
import { formatDuration } from "@/lib/data/match-utils";

interface SummaryStatsRowProps {
  totalPoints: number;
  durationMinutes: number;
  longestRally: number;
  winner: string;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.4,
      ease: [0.25, 0.46, 0.45, 0.94] as const,
    },
  },
};

export function SummaryStatsRow({
  totalPoints,
  durationMinutes,
  longestRally,
  winner,
}: SummaryStatsRowProps) {
  const { hours, mins } = formatDuration(durationMinutes);

  const stats = [
    {
      label: "Total Points",
      value: totalPoints.toString(),
      isFormatted: false,
    },
    {
      label: "Match Duration",
      hours,
      mins,
      isFormatted: true,
    },
    {
      label: "Longest Rally Length",
      value: longestRally.toString(),
      isFormatted: false,
    },
    {
      label: "Match Winner",
      value: winner,
      isFormatted: false,
    },
  ];

  return (
    <motion.div
      className="bg-white overflow-hidden"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <div className="grid grid-cols-4 p-2">
        {stats.map((stat, index) => (
          <motion.div
            key={stat.label}
            className="flex flex-row items-center justify-start"
            variants={itemVariants}
          >
            <div className="w-[2px] h-12 bg-[#D9D9D9] mr-6" />
            <div className="flex flex-col items-start justify-start">
              <p className="text-xs font-normal text-[#888888] mb-1 text-center">
                {stat.label}
              </p>
              {stat.isFormatted ? (
                <p className="text-2xl font-medium text-[#0D0D0D]">
                  {stat.hours}
                  <span className="text-xs font-medium text-[#888888] ml-0.5">
                    HR
                  </span>{" "}
                  {stat.mins}
                  <span className="text-xs font-medium text-[#888888] ml-0.5">
                    MIN
                  </span>
                </p>
              ) : (
                <p className="text-2xl font-medium text-[#0D0D0D] text-center">
                  {stat.value}
                </p>
              )}
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
