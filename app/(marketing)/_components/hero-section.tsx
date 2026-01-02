"use client";

import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";

const CAROUSEL_IMAGES = [
  {
    src: "/Summary Statistics Template.png",
    alt: "Overall Statistics - Tennis performance analytics overview",
    label: "Overall",
  },
  {
    src: "/First Serve Statistics.png",
    alt: "Serve Statistics - First serve placement and analysis",
    label: "Serve",
  },
  {
    src: "/First Return Deuce Statistics.png",
    alt: "Return Statistics - Return placement and contact analysis",
    label: "Return",
  },
];

export function HeroSection() {
  const [activeIndex, setActiveIndex] = useState(0);

  const handleSwipe = (offset: number) => {
    if (offset > 50) {
      setActiveIndex(
        (prev) => (prev - 1 + CAROUSEL_IMAGES.length) % CAROUSEL_IMAGES.length
      );
    } else if (offset < -50) {
      setActiveIndex((prev) => (prev + 1) % CAROUSEL_IMAGES.length);
    }
  };

  return (
    <section id="hero" className="relative pt-40 md:pt-36 pb-0 px-6 md:px-20">
      <div className=" relative mx-auto max-w-8xl">
        {/* Headline */}
        <div className="flex flex-col md:flex-row justify-between items-center md:items-end">
          <motion.h1
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{
              duration: 0.8,
              ease: [0.16, 1, 0.3, 1],
              delay: 0.2,
            }}
            className="text-center md:text-left text-5xl md:text-6xl lg:text-[80px] font-medium bg-gradient-to-b from-[#1D1D1F] to-gray-400 bg-clip-text text-transparent tracking-tight mb-8 md:mb-0"
          >
            Elevate Your Game
          </motion.h1>
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.6,
              ease: [0.16, 1, 0.3, 1],
              delay: 0.4,
            }}
            className="max-w-lg"
          >
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.6,
                ease: [0.16, 1, 0.3, 1],
                delay: 0.5,
              }}
              className="text-center md:text-right text-normal text-[16px] md:text-[18px] text-gray-400 mb-8"
            >
              Unlock powerful statistics and insights to enhance your team's
              performance and scouting capabilities.
            </motion.p>
            <div className="flex justify-center md:justify-end">
              <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{
                  duration: 0.5,
                  ease: [0.16, 1, 0.3, 1],
                  delay: 0.6,
                }}
              >
                <Button
                  asChild
                  size="lg"
                  className="bg-[#659BFF] hover:bg-[#4686FE] text-white text-[18px] font-medium px-9 py-7 rounded-[40px] transition-all hover:scale-[1.05]"
                >
                  <Link href="/auth/sign-up">Join Now</Link>
                </Button>
              </motion.div>
            </div>
          </motion.div>
        </div>

        {/* Hero Image Carousel */}
        <motion.div
          initial={{ opacity: 0, y: 60 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.8,
            ease: [0.16, 1, 0.3, 1],
            delay: 0.7,
          }}
          className="mt-8 md:mt-12 relative w-full rounded-t-3xl md:rounded-t-4xl overflow-visible bg-gradient-to-br from-blue-200 via-blue-300 to-blue-400"
        >
          <div className="aspect-[3/4] sm:aspect-[1/1] md:aspect-[4/3] lg:aspect-[3/2] xl:aspect-[2/1] flex items-center justify-center p-6 md:p-12 relative overflow-hidden rounded-t-3xl md:rounded-t-4xl">
            {/* Edge fade overlay */}
            <div className="absolute inset-0 pointer-events-none z-10">
              <div className="absolute inset-y-0 left-0 w-24 md:w-32 bg-gradient-to-r from-blue-300/80 md:from-blue-300/40 to-transparent" />
              <div className="absolute inset-y-0 right-0 w-24 md:w-32 bg-gradient-to-l from-blue-300/80 md:from-blue-300/40 to-transparent" />
            </div>

            <div className="relative w-full max-w-md md:max-w-lg h-full flex items-center justify-center">
              {CAROUSEL_IMAGES.map((image, index) => {
                const isActive = index === activeIndex;
                const isNext =
                  index === (activeIndex + 1) % CAROUSEL_IMAGES.length;
                const isPrev =
                  index ===
                  (activeIndex - 1 + CAROUSEL_IMAGES.length) %
                    CAROUSEL_IMAGES.length;

                return (
                  <motion.div
                    key={image.src}
                    onClick={() => !isActive && setActiveIndex(index)}
                    drag={isActive ? "x" : false}
                    dragConstraints={{ left: 0, right: 0 }}
                    dragElastic={0.2}
                    onDragEnd={(_, info) => {
                      if (isActive) {
                        handleSwipe(info.offset.x);
                      }
                    }}
                    className={`absolute inset-0 flex items-center justify-center ${!isActive ? "cursor-pointer" : "touch-pan-x"}`}
                    initial={false}
                    animate={{
                      x: isActive ? "0%" : isNext ? "60%" : isPrev ? "-60%" : "0%",
                      scale: isActive ? 1 : 0.75,
                      opacity: isActive ? 1 : 0.3,
                      zIndex: isActive ? 20 : isPrev || isNext ? 10 : 0,
                    }}
                    transition={{
                      duration: 0.6,
                      ease: [0.16, 1, 0.3, 1],
                    }}
                    whileHover={
                      !isActive ? { scale: 0.8, opacity: 0.5 } : undefined
                    }
                  >
                    <div className="relative w-full h-full flex items-center justify-center">
                      <div
                        className={`relative transition-all duration-500 ${
                          isActive
                            ? "drop-shadow-[0_20px_40px_rgba(0,0,0,0.25)] md:drop-shadow-[0_35px_60px_rgba(0,0,0,0.3)]"
                            : "drop-shadow-[0_10px_20px_rgba(0,0,0,0.15)]"
                        }`}
                        style={{
                          filter: isActive
                            ? "drop-shadow(0 20px 40px rgba(0,0,0,0.15)) drop-shadow(0 10px 20px rgba(0,0,0,0.1))"
                            : "drop-shadow(0 10px 20px rgba(0,0,0,0.1))",
                        }}
                      >
                        <Image
                          src={image.src}
                          alt={image.alt}
                          width={1080}
                          height={1920}
                          className="w-full h-auto max-h-full object-contain rounded-lg"
                          priority={index === 0}
                        />
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>

          {/* Carousel Indicators */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2 z-30">
            {CAROUSEL_IMAGES.map((image, index) => (
              <button
                key={image.src}
                onClick={() => setActiveIndex(index)}
                className={`transition-all duration-300 rounded-full ${
                  index === activeIndex
                    ? "w-8 h-2 bg-white"
                    : "w-2 h-2 bg-white/50 hover:bg-white/70"
                }`}
                aria-label={`View ${image.label} statistics`}
              />
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
