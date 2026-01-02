"use client";

import { motion } from "framer-motion";

export function StatsShowcase() {
  return (
    <section
      id="beta"
      className="section-padding relative overflow-hidden px-6 md:px-10 py-20 md:py-32"
    >
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-accent/30 to-background" />

      <div className="container-tight relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12 md:mb-16"
        >
          <h2 className="text-3xl md:text-5xl font-medium tracking-[-0.02em] text-[#1D1D1F]">
            Better Swingvision Stats
          </h2>
          <p className="mt-4 text-base md:text-lg text-gray-400 max-w-2xl mx-auto px-4">
            See the difference between raw data and actionable intelligence.
          </p>
        </motion.div>

        {/* Heatmap Card */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="max-w-5xl mx-auto"
        >
          <div className="bento-card">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-3 h-3 rounded-full bg-orange-500 animate-pulse" />
              <span className="text-md font-medium text-[#1D1D1F]">
                Advantage Dashboard
              </span>
            </div>

            {/* Heatmap visualization */}
            <div className="mb-4 md:mb-4">
              <div className="text-xs text-gray-400 mb-2">
                Ball Landing Heatmap (3 Months)
              </div>
              <div className="aspect-[18/10] md:aspect-[2/1] bg-muted/30 rounded-md border border-border relative overflow-hidden">
                {/* Center net line */}
                <div className="absolute left-1/2 top-0 bottom-0 border-l-2 border-border" />
                {/* Court outline */}
                <div className="absolute inset-4 md:inset-6 border border-border">
                  {/* Singles sidelines */}
                  <div className="absolute left-0 right-0 top-[15%] border-t border-border" />
                  <div className="absolute left-0 right-0 bottom-[15%] border-t border-border" />

                  {/* Service lines */}
                  <div className="absolute left-[25%] top-[15%] bottom-[15%] border-l border-border" />
                  <div className="absolute right-[25%] top-[15%] bottom-[15%] border-l border-border" />

                  {/* Center service line */}
                  <div className="absolute left-[25%] right-[25%] top-1/2 border-t border-border" />
                </div>
                {/* Animated tennis balls */}
                {[
                  { left: "85%", top: "30%" },
                  { left: "12%", top: "60%" },
                  { left: "78%", top: "70%" },
                  { left: "18%", top: "35%" },
                  { left: "88%", top: "55%" },
                  { left: "10%", top: "75%" },
                  { left: "75%", top: "40%" },
                  { left: "15%", top: "50%" },
                  { left: "82%", top: "65%" },
                  { left: "20%", top: "25%" },
                  { left: "90%", top: "45%" },
                  { left: "8%", top: "55%" },
                ].map((pos, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0 }}
                    animate={{
                      opacity: [0, 0.6, 0.6, 0],
                    }}
                    transition={{
                      duration: 1.2,
                      times: [0, 0.05, 0.3, 1],
                      repeat: Infinity,
                      repeatDelay: 8,
                      delay: i * 0.65,
                      ease: "easeOut",
                    }}
                    className="absolute w-2 h-2 md:w-3 md:h-3 rounded-full bg-orange-500"
                    style={{ left: pos.left, top: pos.top }}
                  />
                ))}
              </div>
            </div>

            {/* Consistency Index */}
            <div className="flex flex-col md:flex-row gap-3 md:gap-4 w-full">
              <div className="flex flex-col justify-between p-4 md:p-5 bg-muted/30 rounded-lg border border-border w-full md:flex-1">
                <div className="text-xs md:text-sm text-gray-400 mb-1">
                  Serve Rating
                </div>
                <div className="flex flex-row justify-between items-end w-full">
                  <div className="text-xl md:text-2xl font-medium text-[#1D1D1F]">
                    256.2
                  </div>
                  <div className="flex items-center gap-1 text-green-500 text-sm md:text-base font-normal">
                    +12.3%
                  </div>
                </div>
              </div>
              <div className="flex flex-col justify-between p-4 md:p-5 bg-muted/30 rounded-lg border border-border w-full md:flex-1">
                <div className="text-xs md:text-sm text-gray-400 mb-1">
                  Return Rating
                </div>
                <div className="flex flex-row justify-between items-end w-full">
                  <div className="text-xl md:text-2xl font-medium text-[#1D1D1F]">
                    235.7
                  </div>
                  <div className="flex items-center gap-1 text-red-500 text-sm md:text-base font-normal">
                    -12.3%
                  </div>
                </div>
              </div>
              <div className="flex flex-col justify-between p-4 md:p-5 bg-muted/30 rounded-lg border border-border w-full md:flex-1">
                <div className="text-xs md:text-sm text-gray-400 mb-1">
                  Under Pressure Rating
                </div>
                <div className="flex flex-row justify-between items-end w-full">
                  <div className="text-xl md:text-2xl font-medium text-[#1D1D1F]">
                    157.4
                  </div>
                  <div className="flex items-center gap-1 text-green-500 text-sm md:text-base font-normal">
                    +8.9%
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
