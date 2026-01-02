"use client";

import Image from "next/image";
import { motion } from "framer-motion";

export default function AboutPage() {
  return (
    <div className="min-h-dvh bg-white pt-32 md:pt-40 pb-20 px-6 md:px-20">
      <div className="max-w-8xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="mb-12 md:mb-16"
        >
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-medium text-[#1D1D1F] mb-4">
            About Us
          </h1>
          <p className="text-base md:text-lg text-gray-400">
            Our story and mission.
          </p>
        </motion.div>

        {/* Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 md:gap-12 lg:gap-16 lg:items-center items-start">
          {/* Left - Image */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
            className="relative w-full"
          >
            <Image
              src="/IMG_3589.jpeg"
              alt="Go Bruins"
              width={900}
              height={600}
              className="w-full h-auto rounded-2xl md:rounded-3xl object-contain"
              priority
            />
          </motion.div>

          {/* Right - Content */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.3 }}
            className="space-y-6 md:space-y-8"
          >
            <p className="text-sm md:text-base text-gray-400 leading-relaxed">
              At Advantage, we believe every point matters — both on the court
              and in the data. Born from first hand experience in collegiate
              tennis, we saw a clear gap: while programs were rich in talent,
              they often lacked the detailed, actionable statistics needed to
              turn potential into consistent results. Our mission is to bridge
              that gap, empowering players and coaches with the insights they
              need to succeed.
            </p>

            <p className="text-sm md:text-base text-gray-400 leading-relaxed">
              Based in Bakersfield, California, Advantage is powered by a team
              of six dedicated professionals — including data analysts, graphic
              designers, web developers, and accountants — all working together
              to deliver clear, impactful analysis. We combine advanced
              analytics with a deep understanding of tennis to transform raw
              match data into strategies that drive performance.
            </p>

            <p className="text-sm md:text-base text-gray-400 leading-relaxed">
              From in-depth match breakdowns to visually engaging reports, our
              work turns complex numbers into a competitive advantage. Whether
              it&apos;s optimizing player development, refining game plans, or
              enhancing recruiting strategies, Advantage is here to make data
              work for the game — and for those who play it.
            </p>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
