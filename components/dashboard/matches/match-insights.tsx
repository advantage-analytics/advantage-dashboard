"use client";

import { useState } from "react";

import { motion, AnimatePresence } from "framer-motion";

type TabType = "keyMoments" | "strengths" | "weaknesses";

interface KeyMoment {
  title: string;
  description: string;
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

const DEFAULT_KEY_MOMENTS: KeyMoment[] = [
  { title: "Break In Set 1, Game 7", description: "Converted break point with crosscourt winner" },
  { title: "Held Serve Under Pressure", description: "Saved 3 break points in Set 2, Game 5" },
  { title: "Strong Finish", description: "Won final 4 games to close out match" },
  { title: "Clutch Return Winner", description: "Return winner on match point in Set 2" },
];

const DEFAULT_STRENGTHS: StatItem[] = [
  { label: "First Serve Percentage", value: 68, description: "Consistently landing serves in play with 68% success rate" },
  { label: "Break Point Conversion", value: 71, description: "Converting opportunities when they arise" },
  { label: "Forehand Winners", value: 78, description: "Dominating with powerful forehand shots" },
];

const DEFAULT_WEAKNESSES: StatItem[] = [
  { label: "Second Serve Return", value: 42, description: "Struggling to capitalize on opponent's second serves" },
  { label: "Backhand Errors", value: 58, description: "Unforced errors coming from backhand side" },
  { label: "Net Play", value: 45, description: "Limited effectiveness at net, winning only 45% of approaches" },
];

const TABS: { value: TabType; label: string }[] = [
  { value: "keyMoments", label: "Key Moments" },
  { value: "strengths", label: "Strengths" },
  { value: "weaknesses", label: "Weaknesses" },
];

const FOOTER_TEXT: Record<TabType, string> = {
  keyMoments: "These critical moments shaped the outcome of your match. Focus on maintaining composure during key points.",
  strengths: "Continue building on these strengths in practice. Your serve and forehand are major weapons in your game.",
  weaknesses: "Targeted practice in these areas will provide the most improvement. Consider working with a coach on backhand consistency.",
};

const SECTION_TITLES: Record<TabType, string> = {
  keyMoments: "Key Moments",
  strengths: "Top Strengths",
  weaknesses: "Areas to Improve",
};

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
  hidden: { opacity: 0, y: 8 },
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
  color: "blue" | "orange";
}

function ProgressBar({ value, color }: ProgressBarProps): React.JSX.Element {
  const barColor = color === "blue" ? "bg-[#4A8AF4]" : "bg-[#F38439]";

  return (
    <div className="relative w-full h-1.5 bg-[#E8E8E8] rounded-full overflow-hidden">
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
  color: "blue" | "orange";
  index: number;
}

function StatRow({ item, color, index }: StatRowProps): React.JSX.Element {
  const textColor = color === "blue" ? "text-[#4A8AF4]" : "text-[#F38439]";

  return (
    <motion.div
      className="flex flex-col gap-1.5"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.08, ease: EASE_CURVE }}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-[#0D0D0D]">{item.label}</span>
        <span className={`text-sm font-semibold ${textColor}`}>{item.value}%</span>
      </div>
      <ProgressBar value={item.value} color={color} />
      <p className="text-xs text-[#999999]">{item.description}</p>
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
      className="flex flex-col gap-1"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.06, ease: EASE_CURVE }}
    >
      <span className="text-sm font-semibold text-[#0D0D0D]">{moment.title}</span>
      <span className="text-xs text-[#999999]">{moment.description}</span>
    </motion.div>
  );
}

export function MatchInsights({
  keyMoments = DEFAULT_KEY_MOMENTS,
  strengths = DEFAULT_STRENGTHS,
  weaknesses = DEFAULT_WEAKNESSES,
}: MatchInsightsProps): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<TabType>("keyMoments");
  const [isExpanded, setIsExpanded] = useState(true);

  function handleTabClick(e: React.MouseEvent, tabValue: TabType): void {
    e.stopPropagation();
    setActiveTab(tabValue);
  }

  function renderTabContent(): React.JSX.Element {
    switch (activeTab) {
      case "keyMoments":
        return (
          <motion.div
            key="keyMoments"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="grid grid-cols-2 gap-x-8 gap-y-5"
          >
            {keyMoments.map((moment, index) => (
              <KeyMomentCard key={moment.title} moment={moment} index={index} />
            ))}
          </motion.div>
        );
      case "strengths":
        return (
          <motion.div
            key="strengths"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col gap-5"
          >
            {strengths.map((item, index) => (
              <StatRow key={item.label} item={item} color="blue" index={index} />
            ))}
          </motion.div>
        );
      case "weaknesses":
        return (
          <motion.div
            key="weaknesses"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col gap-5"
          >
            {weaknesses.map((item, index) => (
              <StatRow key={item.label} item={item} color="orange" index={index} />
            ))}
          </motion.div>
        );
    }
  }

  return (
    <motion.div
      className="bg-white rounded-2xl overflow-hidden"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <motion.div
        className="flex items-center justify-between px-6 pt-6 pb-4 cursor-pointer"
        variants={itemVariants}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            className="text-[#0D0D0D]"
          >
            <path
              d="M12 2L4 6V12C4 16.4183 7.58172 20 12 20C16.4183 20 20 16.4183 20 12V6L12 2Z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M12 2V20"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <path
              d="M4 6L12 10L20 6"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-[#0D0D0D] tracking-wide uppercase">
              Advantage Intelligence
            </h2>
            <div className="w-px h-4 bg-[#D9D9D9]" />
            <span className="text-xs font-medium text-[#999999] uppercase tracking-wider">
              AI-Powered Analysis
            </span>
          </div>
        </div>
        <motion.div
          animate={{ rotate: isExpanded ? 0 : 180 }}
          transition={{ duration: 0.2 }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            className="text-[#999999]"
          >
            <path
              d="M5 12.5L10 7.5L15 12.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </motion.div>
      </motion.div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: EASE_CURVE }}
          >
            <motion.div className="flex gap-2 px-6 pb-5" variants={itemVariants}>
              {TABS.map((tab) => (
                <button
                  key={tab.value}
                  onClick={(e) => handleTabClick(e, tab.value)}
                  className={`px-4 py-2 rounded-full text-xs font-medium transition-all duration-200 ${
                    activeTab === tab.value
                      ? "bg-[#0D0D0D] text-white"
                      : "bg-transparent text-[#0D0D0D] border border-[#E8E8E8] hover:border-[#999999]"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </motion.div>

            <div className="px-6 pb-6">
              <motion.p
                className="text-[10px] font-semibold text-[#999999] uppercase tracking-[0.15em] mb-4"
                key={`title-${activeTab}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2 }}
              >
                {SECTION_TITLES[activeTab]}
              </motion.p>

              <AnimatePresence mode="wait">{renderTabContent()}</AnimatePresence>

              <motion.p
                className="text-xs text-[#999999] mt-6 leading-relaxed"
                key={`footer-${activeTab}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3, delay: 0.1 }}
              >
                {FOOTER_TEXT[activeTab]}
              </motion.p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
