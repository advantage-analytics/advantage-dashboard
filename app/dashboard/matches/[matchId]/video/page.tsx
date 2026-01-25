"use client";

import { motion } from "framer-motion";

export default function VideoPage() {
  return (
    <motion.div
      className="relative overflow-hidden rounded-2xl border-2 border-[#D9D9D9] bg-[#0D0D0D] min-h-[600px] mb-64"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      {/* Cinematic letterbox bars */}
      <div className="absolute top-0 left-0 right-0 h-8 bg-black z-20" />
      <div className="absolute bottom-0 left-0 right-0 h-8 bg-black z-20" />

      {/* Film grain overlay */}
      <div
        className="absolute inset-0 opacity-[0.04] z-10 pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* Subtle court texture in background */}
      <div className="absolute inset-0 opacity-[0.08]">
        <svg
          width="100%"
          height="100%"
          viewBox="0 0 400 200"
          preserveAspectRatio="xMidYMid slice"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Tennis court lines */}
          <rect
            x="50"
            y="30"
            width="300"
            height="140"
            fill="none"
            stroke="#fff"
            strokeWidth="2"
          />
          <line
            x1="200"
            y1="30"
            x2="200"
            y2="170"
            stroke="#fff"
            strokeWidth="2"
          />
          <rect
            x="100"
            y="30"
            width="200"
            height="140"
            fill="none"
            stroke="#fff"
            strokeWidth="1"
          />
          <line
            x1="100"
            y1="100"
            x2="300"
            y2="100"
            stroke="#fff"
            strokeWidth="1"
          />
        </svg>
      </div>

      <div className="relative z-10 flex flex-col items-center justify-center py-20 px-8">
        {/* Video player mockup */}
        <div className="relative w-80 mb-10">
          {/* Player frame with reflection */}
          <motion.div
            className="relative aspect-video bg-gradient-to-br from-[#1a1a1a] to-[#0a0a0a] rounded-lg overflow-hidden shadow-2xl"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            {/* Scanline effect */}
            <div
              className="absolute inset-0 pointer-events-none opacity-[0.03]"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.03) 2px, rgba(255,255,255,0.03) 4px)",
              }}
            />

            {/* Screen content - abstract tennis visual */}
            <div className="absolute inset-0 flex items-center justify-center">
              <svg
                viewBox="0 0 160 90"
                className="w-full h-full opacity-30"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                {/* Abstract tennis ball trajectory */}
                <motion.path
                  d="M 20 70 Q 50 20 80 45 T 140 25"
                  stroke="#3986F3"
                  strokeWidth="2"
                  strokeLinecap="round"
                  fill="none"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{
                    duration: 2,
                    delay: 0.8,
                    ease: "easeInOut",
                  }}
                />
                <motion.circle
                  cx="140"
                  cy="25"
                  r="6"
                  fill="#CAFF4A"
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.4, delay: 2.6 }}
                />
              </svg>
            </div>

            {/* Play button */}
            <motion.div
              className="absolute inset-0 flex items-center justify-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, delay: 0.6 }}
            >
              <motion.div
                className="w-16 h-16 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center border border-white/20"
                whileHover={{ scale: 1.1 }}
                transition={{ type: "spring", stiffness: 400, damping: 17 }}
              >
                <svg
                  className="w-6 h-6 text-white ml-1"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M8 5v14l11-7z" />
                </svg>
              </motion.div>
            </motion.div>

            {/* Timeline bar */}
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/10">
              <motion.div
                className="h-full bg-[#3986F3]"
                initial={{ width: "0%" }}
                animate={{ width: "35%" }}
                transition={{ duration: 1.5, delay: 1 }}
              />
            </div>

            {/* Duration badge */}
            <motion.div
              className="absolute bottom-3 right-3 px-2 py-1 bg-black/60 rounded text-[10px] text-white/80 font-mono"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3, delay: 1.2 }}
            >
              1:24:37
            </motion.div>
          </motion.div>

          {/* Reflection */}
          <div className="absolute -bottom-8 left-0 right-0 h-8 bg-gradient-to-b from-[#0D0D0D]/40 to-transparent transform scale-y-[-1] opacity-20 blur-sm rounded-lg" />
        </div>

        {/* Text content */}
        <motion.div
          className="text-center max-w-md"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          <h2 className="text-sm font-bold text-[#3986F3] tracking-wider uppercase mb-3">
            Match Footage
          </h2>
          <p className="text-sm font-normal text-[#888888] leading-relaxed">
            Full match replays and highlight clips are coming soon. Relive key
            moments, review your technique, and share your best plays.
          </p>
        </motion.div>

        {/* Feature chips */}
        <motion.div
          className="flex flex-wrap justify-center gap-2 mt-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.6 }}
        >
          {["Full Replay", "Highlights", "Point-by-Point", "Slow Motion"].map(
            (feature, i) => (
              <motion.span
                key={feature}
                className="px-3 py-1.5 bg-white/5 text-[#888888] text-xs font-medium rounded-full border border-white/10"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3, delay: 0.7 + i * 0.1 }}
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
