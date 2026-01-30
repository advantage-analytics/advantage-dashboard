"use client";

import { motion } from "framer-motion";

interface MatchInsightsProps {
  matchId: string;
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

export function MatchInsights({ matchId }: MatchInsightsProps) {
  const features = [
    { label: "Performance Analysis" },
    { label: "Tactical Insights" },
    { label: "Improvement Areas" },
  ];

  return (
    <motion.div
      className="bg-white p-6 rounded-2xl"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Header */}
      <motion.div
        className="flex items-center justify-between mb-4"
        variants={itemVariants}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#4A8AF4]/10 flex items-center justify-center">
            <svg
              className="w-4 h-4 text-[#4A8AF4]"
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
          </div>
          <div>
            <h2 className="text-sm font-semibold text-[#0D0D0D]">
              Advantage Intelligence
            </h2>
            <p className="text-[10px] font-medium text-[#999999] uppercase tracking-wider">
              AI-Powered Analysis
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#4A8AF4]/10">
          <motion.div
            className="w-1.5 h-1.5 rounded-full bg-[#4A8AF4]"
            animate={{
              scale: [1, 1.3, 1],
              opacity: [1, 0.6, 1],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
          <span className="text-[10px] font-semibold text-[#4A8AF4] uppercase tracking-wider">
            Coming Soon
          </span>
        </div>
      </motion.div>

      {/* Divider */}
      <motion.div
        className="h-[1px] bg-[#E8E8E8] mb-4"
        variants={itemVariants}
      />

      {/* Description */}
      <motion.p
        className="text-xs font-normal text-[#999999] leading-relaxed mb-5"
        variants={itemVariants}
      >
        AI-powered match analysis and personalized insights are coming soon.
        Get detailed performance breakdowns, tactical recommendations, and
        areas for improvement based on your match statistics.
      </motion.p>

      {/* Feature list */}
      <motion.div className="flex flex-col gap-2.5" variants={itemVariants}>
        {features.map((feature, i) => (
          <motion.div
            key={feature.label}
            className="flex items-center gap-3"
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{
              duration: 0.3,
              delay: 0.3 + i * 0.08,
              ease: [0.25, 0.46, 0.45, 0.94],
            }}
          >
            <div className="w-5 h-5 rounded-md bg-[#F5F5F5] flex items-center justify-center">
              <svg
                className="w-3 h-3 text-[#4A8AF4]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <span className="text-sm font-medium text-[#0D0D0D]">
              {feature.label}
            </span>
          </motion.div>
        ))}
      </motion.div>
    </motion.div>
  );
}
