"use client";

import { motion } from "framer-motion";

export default function VisualsPage() {
  return (
    <motion.div
      className="relative overflow-hidden rounded-2xl border-2 border-[#D9D9D9] bg-gradient-to-br from-white via-[#FAFBFC] to-[#F5F7FA] min-h-[600px] mb-64"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      {/* Abstract grid background */}
      <div className="absolute inset-0 opacity-[0.03]">
        <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern
              id="grid"
              width="40"
              height="40"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 40 0 L 0 0 0 40"
                fill="none"
                stroke="#000"
                strokeWidth="1"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>

      <div className="relative z-10 flex flex-col items-center justify-center py-16 px-8">
        {/* Animated chart illustration */}
        <div className="relative w-64 h-48 mb-8">
          {/* Bar chart visualization */}
          <svg
            viewBox="0 0 240 160"
            className="w-full h-full"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Horizontal grid lines */}
            {[0, 1, 2, 3, 4].map((i) => (
              <motion.line
                key={`grid-${i}`}
                x1="40"
                y1={30 + i * 25}
                x2="220"
                y2={30 + i * 25}
                stroke="#E5E7EB"
                strokeWidth="1"
                strokeDasharray="4 4"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 0.8, delay: i * 0.1 }}
              />
            ))}

            {/* Y-axis */}
            <motion.line
              x1="40"
              y1="20"
              x2="40"
              y2="140"
              stroke="#D9D9D9"
              strokeWidth="2"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.6 }}
            />

            {/* X-axis */}
            <motion.line
              x1="40"
              y1="130"
              x2="220"
              y2="130"
              stroke="#D9D9D9"
              strokeWidth="2"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.6, delay: 0.2 }}
            />

            {/* Animated bars */}
            {[
              { x: 60, height: 70, delay: 0.4, color: "#3986F3" },
              { x: 95, height: 45, delay: 0.5, color: "#93C5FD" },
              { x: 130, height: 85, delay: 0.6, color: "#3986F3" },
              { x: 165, height: 55, delay: 0.7, color: "#93C5FD" },
              { x: 200, height: 65, delay: 0.8, color: "#3986F3" },
            ].map((bar, i) => (
              <motion.rect
                key={`bar-${i}`}
                x={bar.x}
                y={130 - bar.height}
                width="20"
                height={bar.height}
                rx="4"
                fill={bar.color}
                initial={{ scaleY: 0, originY: 1 }}
                animate={{ scaleY: 1 }}
                transition={{
                  duration: 0.6,
                  delay: bar.delay,
                  ease: [0.34, 1.56, 0.64, 1],
                }}
                style={{ transformOrigin: `${bar.x + 10}px 130px` }}
              />
            ))}

            {/* Trend line */}
            <motion.path
              d="M 70 80 Q 105 100 140 60 T 210 75"
              stroke="#10B981"
              strokeWidth="2.5"
              strokeLinecap="round"
              fill="none"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 1.2, delay: 1 }}
            />

            {/* Data points on trend line */}
            {[
              { cx: 70, cy: 80 },
              { cx: 140, cy: 60 },
              { cx: 210, cy: 75 },
            ].map((point, i) => (
              <motion.circle
                key={`point-${i}`}
                cx={point.cx}
                cy={point.cy}
                r="4"
                fill="#10B981"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.3, delay: 1.2 + i * 0.15 }}
              />
            ))}
          </svg>

          {/* Floating stat cards */}
          <motion.div
            className="absolute -top-2 -right-4 bg-white rounded-lg shadow-lg px-3 py-2 border border-[#E5E7EB]"
            initial={{ opacity: 0, x: 20, y: -10 }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            transition={{ duration: 0.5, delay: 1.4 }}
          >
            <span className="text-[10px] font-medium text-[#999999] uppercase tracking-wide">
              Win Rate
            </span>
            <p className="text-lg font-semibold text-[#0D0D0D]">78%</p>
          </motion.div>

          <motion.div
            className="absolute -bottom-4 -left-6 bg-white rounded-lg shadow-lg px-3 py-2 border border-[#E5E7EB]"
            initial={{ opacity: 0, x: -20, y: 10 }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            transition={{ duration: 0.5, delay: 1.6 }}
          >
            <span className="text-[10px] font-medium text-[#999999] uppercase tracking-wide">
              Aces
            </span>
            <p className="text-lg font-semibold text-[#3986F3]">12</p>
          </motion.div>
        </div>

        {/* Text content */}
        <motion.div
          className="text-center max-w-md"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <h2 className="text-sm font-bold text-[#3986F3] tracking-wider uppercase mb-3">
            Visual Analytics
          </h2>
          <p className="text-sm font-normal text-[#666666] leading-relaxed">
            Interactive charts and visual breakdowns of your match performance
            are coming soon. Explore serve patterns, shot placement heatmaps,
            and momentum graphs.
          </p>
        </motion.div>

        {/* Feature pills */}
        <motion.div
          className="flex flex-wrap justify-center gap-2 mt-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.5 }}
        >
          {["Shot Heatmaps", "Serve Analysis", "Rally Patterns", "Momentum"].map(
            (feature, i) => (
              <motion.span
                key={feature}
                className="px-3 py-1.5 bg-[#F5F7FA] text-[#666666] text-xs font-medium rounded-full border border-[#E5E7EB]"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3, delay: 0.6 + i * 0.1 }}
              >
                {feature}
              </motion.span>
            )
          )}
        </motion.div>
      </div>
    </motion.div>
  );
}
