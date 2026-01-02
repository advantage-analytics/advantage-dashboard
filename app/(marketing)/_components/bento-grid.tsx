"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import Image from "next/image";

const radarData = [
  { subject: "Forehand", A: 120, fullMark: 150 },
  { subject: "Backhand", A: 98, fullMark: 150 },
  { subject: "Serve", A: 86, fullMark: 150 },
  { subject: "Volley", A: 99, fullMark: 150 },
  { subject: "Mental", A: 85, fullMark: 150 },
];

const performanceTrendData = [
  { match: "Match 1", performance: 65 },
  { match: "Match 2", performance: 68 },
  { match: "Match 3", performance: 70 },
  { match: "Match 4", performance: 72 },
  { match: "Match 5", performance: 75 },
  { match: "Match 6", performance: 78 },
  { match: "Match 7", performance: 82 },
  { match: "Match 8", performance: 85 },
  { match: "Match 9", performance: 87 },
];

const TypingText: React.FC = () => {
  const [displayedText, setDisplayedText] = useState("");
  const fullText = "Improvement detected in forehand depth.";

  useEffect(() => {
    let currentIndex = 0;
    const typingInterval = setInterval(() => {
      if (currentIndex <= fullText.length) {
        setDisplayedText(fullText.slice(0, currentIndex));
        currentIndex++;
      } else {
        clearInterval(typingInterval);
      }
    }, 50);

    return () => clearInterval(typingInterval);
  }, []);

  return (
    <div className="flex items-center justify-center md:justify-center">
      <div className="inline-flex items-center">
        <span className="text-base text-center font-mono text-blue-600">
          {displayedText}
        </span>
        <motion.span
          animate={{ opacity: [1, 0, 1] }}
          transition={{ duration: 0.8, repeat: Infinity, ease: "easeInOut" }}
          className="ml-0.5 inline-block w-0.5 h-5 bg-blue-600"
        />
      </div>
    </div>
  );
};

const GlowingOrb: React.FC = () => {
  return (
    <div className="relative w-72 h-72 flex items-center justify-center">
      <motion.div
        className="absolute w-64 h-64 bg-gradient-radial from-blue-300/20 via-blue-200/10 to-transparent rounded-full blur-3xl"
        animate={{
          scale: [1, 1.1, 1],
          opacity: [0.5, 0.7, 0.5],
        }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      />

      <motion.div
        className="absolute w-48 h-48 rounded-full"
        style={{
          background:
            "radial-gradient(circle at 30% 30%, rgba(96, 165, 250, 0.4), rgba(59, 130, 246, 0.3), rgba(37, 99, 235, 0.2))",
          filter: "blur(20px)",
        }}
        animate={{
          scale: [1, 1.05, 1],
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 0.3,
        }}
      />

      <motion.div
        className="absolute w-40 h-40 rounded-full z-10"
        style={{
          background:
            "radial-gradient(circle at 35% 35%, rgba(147, 197, 253, 0.9), rgba(96, 165, 250, 0.8), rgba(59, 130, 246, 0.7), rgba(29, 78, 216, 0.6))",
          boxShadow:
            "inset -10px -10px 30px rgba(29, 78, 216, 0.4), inset 10px 10px 30px rgba(191, 219, 254, 0.3), 0 0 40px rgba(59, 130, 246, 0.3)",
        }}
        animate={{
          y: [-5, 5, -5],
        }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      />

      <div
        className="absolute w-16 h-16 rounded-full z-20"
        style={{
          top: "35%",
          left: "35%",
          background:
            "radial-gradient(circle, rgba(255, 255, 255, 0.8), rgba(255, 255, 255, 0.4), transparent)",
          filter: "blur(8px)",
        }}
      />

      <motion.div
        className="absolute w-40 h-1 z-30"
        style={{
          transform: "rotate(-45deg)",
          background:
            "linear-gradient(90deg, transparent, rgba(191, 219, 254, 0.8), transparent)",
          filter: "blur(2px)",
        }}
        animate={{ opacity: [0.3, 0.7, 0.3] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      />

      {[...Array(3)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-1 h-1 bg-blue-300 rounded-full"
          style={{
            left: `${30 + i * 20}%`,
            top: `${40 + i * 10}%`,
          }}
          animate={{
            opacity: [0.2, 0.6, 0.2],
            scale: [0.8, 1.2, 0.8],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut",
            delay: i * 0.4,
          }}
        />
      ))}
    </div>
  );
};

export const BentoGrid: React.FC = () => {
  return (
    <section id="features" className="py-20 md:py-32 px-6 max-w-7xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.6 }}
        className="text-center mb-16"
      >
        <h2 className="text-3xl md:text-5xl font-medium tracking-[-0.02em] text-[#1D1D1F]">
          Everything You Need to Compete
        </h2>
        <p className="mt-4 text-lg text-gray-400 max-w-2xl mx-auto">
          From match insights to opponent scouting, all the tools you need to
          analyze, improve, and dominate.
        </p>
      </motion.div>

      <div className="flex flex-col gap-12">
        {/* 1. Aggregated Insights */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="bg-white py-8 md:p-12 group"
        >
          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div className="text-center md:text-left">
              <h3 className="text-2xl md:text-3xl font-medium mb-4 text-[#1D1D1F]">
                Aggregated Insights
              </h3>
              <p className="text-gray-400 text-md md:text-lg leading-relaxed">
                Stop looking at matches in isolation. See how your serve depth
                and footwork evolve over a season with our Master Trend engine.
              </p>
            </div>
            <div className="flex items-center justify-center md:p-8">
              <div className="w-full h-72 md:h-80 pl-6 pr-12 md:p-6">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={performanceTrendData}
                    margin={{ top: 10, right: 10, bottom: 20, left: 10 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="match"
                      tick={{ fontSize: 11, fill: "#6b7280", dy: 8 }}
                      tickLine={false}
                      axisLine={{ stroke: "#d1d5db" }}
                      height={50}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "#6b7280", dx: -8 }}
                      tickLine={false}
                      axisLine={{ stroke: "#d1d5db" }}
                      domain={[60, 90]}
                      width={50}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "white",
                        border: "1px solid #e5e7eb",
                        borderRadius: "8px",
                        fontSize: "12px",
                      }}
                      labelStyle={{ color: "#1D1D1F", fontWeight: 500 }}
                      itemStyle={{ color: "#007AFF" }}
                    />
                    <Line
                      type="monotone"
                      dataKey="performance"
                      stroke="#007AFF"
                      strokeWidth={2}
                      dot={{ fill: "#007AFF", r: 2 }}
                      activeDot={{ r: 4, fill: "#007AFF" }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </motion.div>

        {/* 2. Know the Rival */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="bg-white py-8 md:p-12 group"
        >
          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div className="order-2 md:order-1">
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                    <PolarGrid stroke="#d1d5db" />
                    <PolarAngleAxis
                      dataKey="subject"
                      tick={{ fontSize: 12, fill: "#6b7280" }}
                    />
                    <Radar
                      name="Opponent"
                      dataKey="A"
                      stroke="#007AFF"
                      fill="#007AFF"
                      fillOpacity={0.4}
                      strokeWidth={2}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="order-1 md:order-2 text-center md:text-left">
              <h3 className="text-2xl md:text-3xl font-medium mb-4 text-[#1D1D1F]">
                Know the Rival
              </h3>
              <p className="text-gray-400 text-md md:text-lg leading-relaxed">
                Prepare with data, not guesses. Scout your opponents with
                detailed performance breakdowns across all shot types
              </p>
            </div>
          </div>
        </motion.div>

        {/* 3. PDF Reporting */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="bg-white py-8 md:p-12 group"
        >
          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div className="text-center md:text-left">
              <h3 className="text-2xl md:text-3xl font-medium mb-4 text-[#1D1D1F]">
                PDF Reporting
              </h3>
              <p className="text-gray-400 text-md md:text-lg leading-relaxed">
                Professional coach-ready reports. Export your performance data
                in beautifully formatted PDFs
              </p>
            </div>
            <div className="flex flex-col md:flex-row items-center justify-center gap-6 p-4 md:p-8">
              <div className="relative w-64 md:w-72 aspect-[8.5/11] bg-white rounded-lg shadow-md overflow-hidden border border-gray-200">
                <Image
                  src="/First Return Deuce Statistics.png"
                  alt="PDF Report Example"
                  fill
                  className="object-contain"
                />
              </div>
              <motion.div
                whileHover={{ scale: 1.1 }}
                className="bg-blue-500 rounded-full p-3 shadow-lg cursor-pointer"
              >
                <svg
                  className="w-5 h-5 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
                </svg>
              </motion.div>
            </div>
          </div>
        </motion.div>

        {/* 4. Intelligent Analysis */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="bg-white py-8 md:p-12 group"
        >
          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div className="order-2 md:order-1 flex flex-col items-center justify-center py-4 gap-6">
              <GlowingOrb />
              <div className="w-full max-w-md">
                <TypingText />
              </div>
            </div>
            <div className="order-1 md:order-2 text-center md:text-left">
              <h3 className="text-2xl md:text-3xl font-medium mb-4 text-[#1D1D1F]">
                Intelligent Analysis
              </h3>
              <p className="text-gray-400 text-md md:text-lg leading-relaxed">
                Our AI highlights the 20% of your game that drives 80% of
                results. Focus on what matters most
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};
