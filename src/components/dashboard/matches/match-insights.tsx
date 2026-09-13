"use client";

import { motion } from "framer-motion";

interface KeyMoment {
  title: string;
  description: string;
  score?: string;
}

interface StatItem {
  label: string;
  value: number;
  description: string;
}

interface MatchInsightsProps {
  keyMoments?: KeyMoment[];
  strengths?: StatItem[];
  weaknesses?: StatItem[];
}


const EASE_CURVE = [0.25, 0.46, 0.45, 0.94] as const;

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 6 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.35,
      ease: EASE_CURVE,
    },
  },
};

interface ProgressBarProps {
  value: number;
  color: "green" | "red";
}

function ProgressBar({ value, color }: ProgressBarProps): React.JSX.Element {
  const barColor = color === "green" ? "bg-[#5DB955]" : "bg-[#E51837]";

  return (
    <div className="relative w-full h-1.5 bg-[#F3F3F3] rounded-full overflow-hidden">
      <motion.div
        className={`absolute left-0 h-full ${barColor} rounded-full`}
        initial={{ width: 0 }}
        animate={{ width: `${value}%` }}
        transition={{ duration: 0.6, ease: EASE_CURVE }}
      />
    </div>
  );
}

interface StatRowProps {
  item: StatItem;
  color: "green" | "red";
  index: number;
}

function StatRow({ item, color, index }: StatRowProps): React.JSX.Element {
  const textColor = color === "green" ? "text-[#5DB955]" : "text-[#E51837]";

  return (
    <motion.div
      className="flex flex-col gap-1.5"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.06, ease: EASE_CURVE }}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-[#0D0D0D]">{item.label}</span>
        <span className={`text-sm font-semibold ${textColor}`}>{item.value}%</span>
      </div>
      <ProgressBar value={item.value} color={color} />
      <p className="text-xs text-[#888888]">{item.description}</p>
    </motion.div>
  );
}

interface KeyMomentCardProps {
  moment: KeyMoment;
  index: number;
}

function KeyMomentCard({ moment, index }: KeyMomentCardProps): React.JSX.Element {
  return (
    <motion.div
      className="flex flex-col gap-2"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.06, ease: EASE_CURVE }}
    >
      <div className="w-full aspect-video bg-[#F5F5F5] rounded-lg" />
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium text-[#0D0D0D] leading-tight">{moment.title}</span>
        {moment.score && (
          <span className="text-[10px] font-medium text-[#888888] bg-[#F5F5F5] px-2 py-0.5 rounded-full uppercase tracking-wide whitespace-nowrap shrink-0">
            {moment.score}
          </span>
        )}
      </div>
      <span className="text-xs text-[#888888] leading-relaxed">{moment.description}</span>
    </motion.div>
  );
}

export function MatchInsights({
  keyMoments = [],
  strengths = [],
  weaknesses = [],
}: MatchInsightsProps): React.JSX.Element {
  return (
    <motion.div
      className="bg-white rounded-[16px] overflow-hidden border border-[#E7E7E7] shadow-[0px_4px_16px_0px_rgba(0,0,0,0.06)]"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Header */}
      <motion.div className="px-6 pt-6 pb-5" variants={itemVariants}>
        <div className="flex items-center gap-2 mb-1">
          <h2 className="text-base font-medium text-[#0D0D0D]">Advantage Intelligence</h2>
          <span className="text-[10px] font-semibold text-[#3B82F6] uppercase tracking-[0.12em] px-2 py-0.5 rounded-full bg-[#EEF4FE]">
            AI-Powered Analysis
          </span>
        </div>
        <p className="text-xs text-[#888888]">Game-by-game momentum tracking throughout the match</p>
      </motion.div>

      <div className="px-6 pb-6 flex flex-col gap-8">
        {/* Key Moments */}
        <motion.div variants={itemVariants}>
          <p className="text-[10px] font-semibold text-[#888888] uppercase tracking-[0.15em] mb-4">
            Key Moments
          </p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-5">
            {keyMoments.map((moment, index) => (
              <KeyMomentCard key={moment.title} moment={moment} index={index} />
            ))}
          </div>
        </motion.div>

        {/* Strengths */}
        <motion.div variants={itemVariants}>
          <p className="text-[10px] font-semibold text-[#888888] uppercase tracking-[0.15em] mb-4">
            Strengths
          </p>
          <div className="flex flex-col gap-5">
            {strengths.map((item, index) => (
              <StatRow key={item.label} item={item} color="green" index={index} />
            ))}
          </div>
        </motion.div>

        {/* Weaknesses */}
        <motion.div variants={itemVariants}>
          <p className="text-[10px] font-semibold text-[#888888] uppercase tracking-[0.15em] mb-4">
            Weaknesses
          </p>
          <div className="flex flex-col gap-5">
            {weaknesses.map((item, index) => (
              <StatRow key={item.label} item={item} color="red" index={index} />
            ))}
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
