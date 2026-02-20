"use client";

import { motion } from "framer-motion";
import { Star } from "lucide-react";

export function TestimonialSection() {
  return (
    <section
      id="testimonial"
      className="py-20 md:py-32 px-6 md:px-10 bg-white"
    >
      <div className="mx-auto max-w-7xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12 md:mb-16"
        >
          <h2 className="text-3xl md:text-5xl font-medium tracking-[-0.02em] text-[#1D1D1F]">
            Real Stories, Real Results
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-16 items-center">
          {/* Image */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="relative aspect-[4/3] bg-gray-200 rounded-2xl overflow-hidden"
          >
            <img
              src="/marketing/IMG_3532.jpg"
              alt="Gianluca Ballota - UCLA Tennis"
              className="absolute inset-0 w-full h-full object-cover"
            />
          </motion.div>

          {/* Quote */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            {/* 5 Stars */}
            <div className="flex gap-1 mb-6 justify-center md:justify-start">
              {[1, 2, 3, 4, 5].map((i) => (
                <Star
                  key={i}
                  className="w-5 h-5 fill-yellow-400 text-yellow-400"
                />
              ))}
            </div>

            <blockquote className="text-md md:text-lg text-gray-400 leading-relaxed text-center md:text-left">
              &quot;It was a valuable tool that helped us stay well-prepared and
              gave us an edge over other teams.&quot;
            </blockquote>

            <div className="mt-6 text-center md:text-left">
              <p className="font-medium text-[#1D1D1F]">Gianluca Ballota</p>
              <p className="text-gray-400">UCLA Men&apos;s Tennis Player</p>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
