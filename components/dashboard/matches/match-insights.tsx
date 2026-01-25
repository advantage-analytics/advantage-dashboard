"use client";

import { motion } from "framer-motion";

interface MatchInsightsProps {
  matchId: string;
}

export function MatchInsights({ matchId }: MatchInsightsProps) {
  const features = [
    { label: "Performance Analysis", icon: "chart" },
    { label: "Tactical Insights", icon: "target" },
    { label: "Improvement Areas", icon: "trend" },
  ];

  return (
    <motion.div
      className="relative overflow-hidden bg-gradient-to-br from-[#0A1628] via-[#0F1D32] to-[#162544] border border-[#1E3A5F]/50 p-8 rounded-2xl"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.5,
        delay: 0.8,
        ease: [0.25, 0.46, 0.45, 0.94],
      }}
    >
      {/* Ambient glow effects */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-[#3986F3]/10 rounded-full blur-3xl" />
      <div className="absolute bottom-0 left-0 w-48 h-48 bg-[#6366F1]/10 rounded-full blur-3xl" />

      {/* Subtle grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
                           linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
          backgroundSize: "32px 32px",
        }}
      />

      {/* Content */}
      <div className="relative z-10">
        {/* Header with icon */}
        <div className="flex items-center gap-3 mb-5">
          <motion.div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{
              background: "linear-gradient(135deg, #3986F3 0%, #6366F1 100%)",
              boxShadow: "0 4px 16px rgba(57, 134, 243, 0.3)",
            }}
            initial={{ scale: 0, rotate: -90 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ duration: 0.5, delay: 1, type: "spring", stiffness: 200 }}
          >
            <svg
              className="w-5 h-5 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
              />
            </svg>
          </motion.div>
          <div>
            <h2 className="text-sm font-bold text-[#3986F3] tracking-wider uppercase">
              Advantage Intelligence
            </h2>
            <p className="text-[10px] text-[#6B7A99] uppercase tracking-widest mt-0.5">
              AI-Powered Analysis
            </p>
          </div>
        </div>

        {/* Description */}
        <p className="text-sm font-normal text-[#94A3B8] leading-relaxed mb-6">
          AI-powered match analysis and personalized insights are coming soon.
          Get detailed performance breakdowns, tactical recommendations, and
          areas for improvement based on your match statistics.
        </p>

        {/* Feature pills */}
        <div className="flex flex-wrap gap-2 mb-6">
          {features.map((feature, i) => (
            <motion.div
              key={feature.label}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, delay: 1.1 + i * 0.1 }}
            >
              <div className="w-1.5 h-1.5 rounded-full bg-[#3986F3]" />
              <span className="text-xs font-medium text-[#CBD5E1]">
                {feature.label}
              </span>
            </motion.div>
          ))}
        </div>

        {/* Coming Soon indicator */}
        <motion.div
          className="flex items-center gap-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 1.4 }}
        >
          <div className="flex items-center gap-1.5">
            <motion.div
              className="w-2 h-2 rounded-full bg-[#3986F3]"
              animate={{
                scale: [1, 1.2, 1],
                opacity: [1, 0.7, 1],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
            <span className="text-xs font-semibold text-[#3986F3] uppercase tracking-wider">
              Coming Soon
            </span>
          </div>
          <div className="flex-1 h-[1px] bg-gradient-to-r from-[#3986F3]/30 to-transparent" />
        </motion.div>
      </div>
    </motion.div>
  );
}
