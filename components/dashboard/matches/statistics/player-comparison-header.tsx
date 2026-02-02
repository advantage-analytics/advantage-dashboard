"use client";

import { motion } from "framer-motion";
import { getInitials } from "@/lib/data/match-utils";

interface PlayerComparisonHeaderProps {
  player1Name: string;
  player2Name: string;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.4,
      ease: [0.25, 0.46, 0.45, 0.94] as const,
    },
  },
};

export function PlayerComparisonHeader({
  player1Name,
  player2Name,
}: PlayerComparisonHeaderProps) {
  const player1Initials = getInitials(player1Name);
  const player2Initials = getInitials(player2Name);

  return (
    <motion.div
      className="grid grid-cols-[1fr_auto_1fr] items-center gap-6 pb-4 border-b border-[#E8E8E8]"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Player 1 */}
      <motion.div
        className="flex items-center gap-3"
        variants={itemVariants}
      >
        <div className="w-10 h-10 rounded-full bg-[#4A8AF4] flex items-center justify-center">
          <span className="text-xs font-semibold text-white">
            {player1Initials}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-[#0D0D0D]">
            {player1Name}
          </span>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-[#4A8AF4]" />
            <span className="text-[10px] font-medium text-[#999999] uppercase tracking-wider">
              Player 1
            </span>
          </div>
        </div>
      </motion.div>

      {/* Center Divider */}
      <motion.div
        className="flex items-center gap-3"
        variants={itemVariants}
      >
        <div className="w-8 h-[1px] bg-[#D9D9D9]" />
        <span className="text-[10px] font-semibold text-[#BBBBBB] tracking-wider">
          VS
        </span>
        <div className="w-8 h-[1px] bg-[#D9D9D9]" />
      </motion.div>

      {/* Player 2 */}
      <motion.div
        className="flex items-center justify-end gap-3"
        variants={itemVariants}
      >
        <div className="flex flex-col items-end">
          <span className="text-sm font-semibold text-[#0D0D0D]">
            {player2Name}
          </span>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-medium text-[#999999] uppercase tracking-wider">
              Player 2
            </span>
            <div className="w-1.5 h-1.5 rounded-full bg-[#F38439]" />
          </div>
        </div>
        <div className="w-10 h-10 rounded-full bg-[#F38439] flex items-center justify-center">
          <span className="text-xs font-semibold text-white">
            {player2Initials}
          </span>
        </div>
      </motion.div>
    </motion.div>
  );
}
