"use client";

import { motion } from "framer-motion";
import { getInitials } from "@/lib/data/match-utils";

interface PlayerComparisonHeaderProps {
  player1Name: string;
  player2Name: string;
}

export function PlayerComparisonHeader({
  player1Name,
  player2Name,
}: PlayerComparisonHeaderProps) {
  const player1Initials = getInitials(player1Name);
  const player2Initials = getInitials(player2Name);

  return (
    <motion.div
      className="flex items-center justify-between py-2"
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      {/* Player 1 */}
      <motion.div
        className="flex items-center gap-4 group"
        whileHover={{ x: 4 }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
      >
        <div className="relative">
          {/* Glow effect */}
          <div className="absolute inset-0 rounded-full bg-[#4A8AF4]/20 blur-md scale-110 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          {/* Avatar */}
          <div
            className="relative w-12 h-12 rounded-full flex items-center justify-center shadow-lg"
            style={{
              background: "linear-gradient(135deg, #5A9BFF 0%, #3A7BD5 50%, #2E6BC4 100%)",
              boxShadow: "0 4px 12px rgba(74, 138, 244, 0.3), inset 0 1px 1px rgba(255,255,255,0.2)",
            }}
          >
            <span className="text-sm font-bold text-white tracking-wide">
              {player1Initials}
            </span>
          </div>
          {/* Ring accent */}
          <div className="absolute -inset-0.5 rounded-full border-2 border-[#4A8AF4]/20" />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-[#0D0D0D] tracking-tight">
            {player1Name}
          </span>
          <span className="text-[10px] font-medium text-[#4A8AF4] uppercase tracking-widest">
            Player 1
          </span>
        </div>
      </motion.div>

      {/* Center Title with VS badge */}
      <div className="flex flex-col items-center gap-1">
        <h3 className="text-xs font-bold text-[#999999] tracking-[0.2em] uppercase">
          Match Statistics
        </h3>
        <div className="relative">
          <motion.div
            className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{
              background: "linear-gradient(135deg, #F8F9FA 0%, #E9ECEF 100%)",
              boxShadow: "0 2px 8px rgba(0,0,0,0.06), inset 0 1px 2px rgba(255,255,255,0.8)",
            }}
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ duration: 0.5, delay: 0.2, type: "spring", stiffness: 200 }}
          >
            <span className="text-xs font-black text-[#666666] tracking-tight">
              VS
            </span>
          </motion.div>
          {/* Decorative lines */}
          <motion.div
            className="absolute top-1/2 -left-8 w-6 h-[1px] bg-gradient-to-r from-transparent to-[#D9D9D9]"
            initial={{ scaleX: 0, originX: 1 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.4, delay: 0.4 }}
          />
          <motion.div
            className="absolute top-1/2 -right-8 w-6 h-[1px] bg-gradient-to-l from-transparent to-[#D9D9D9]"
            initial={{ scaleX: 0, originX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.4, delay: 0.4 }}
          />
        </div>
      </div>

      {/* Player 2 */}
      <motion.div
        className="flex items-center gap-4 group"
        whileHover={{ x: -4 }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
      >
        <div className="flex flex-col items-end">
          <span className="text-sm font-semibold text-[#0D0D0D] tracking-tight">
            {player2Name}
          </span>
          <span className="text-[10px] font-medium text-[#F5A962] uppercase tracking-widest">
            Player 2
          </span>
        </div>
        <div className="relative">
          {/* Glow effect */}
          <div className="absolute inset-0 rounded-full bg-[#F5A962]/20 blur-md scale-110 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          {/* Avatar */}
          <div
            className="relative w-12 h-12 rounded-full flex items-center justify-center shadow-lg"
            style={{
              background: "linear-gradient(135deg, #FFB87A 0%, #F5A962 50%, #E89B4D 100%)",
              boxShadow: "0 4px 12px rgba(245, 169, 98, 0.3), inset 0 1px 1px rgba(255,255,255,0.2)",
            }}
          >
            <span className="text-sm font-bold text-white tracking-wide">
              {player2Initials}
            </span>
          </div>
          {/* Ring accent */}
          <div className="absolute -inset-0.5 rounded-full border-2 border-[#F5A962]/20" />
        </div>
      </motion.div>
    </motion.div>
  );
}
