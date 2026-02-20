"use client";

import Image from "next/image";
import { motion } from "framer-motion";

const PARTNERS = [
  { name: "SwingVision", logo: "/partners/swingvision.svg" },
  { name: "Playsight", logo: "/partners/playsight.svg" },
  { name: "Baselinevision", logo: "/partners/baselinevision.svg" },
  { name: "Wingfield", logo: "/partners/wingfield.svg" },
  { name: "PlayReplay", logo: "/partners/playreplay.svg" },
  { name: "EyesOn", logo: "/partners/eyeson.svg" },
  { name: "Zenniz", logo: "/partners/zenniz.svg" },
];

export function PartnersRibbon() {
  return (
    <section className="py-12 md:py-16 border-y border-gray-100 bg-gray-50/50">
      <div className="mx-auto max-w-9xl px-6 md:px-10">
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center md:text-lg text-xs text-gray-400 mb-12"
        >
          The future of tennis, unified. Integrating with the industry leaders
          in ELC technology.
        </motion.p>
        <div
          className="overflow-hidden"
          style={{
            maskImage:
              "linear-gradient(to right, transparent, black 8%, black 90%, transparent)",
          }}
        >
          <div className="animate-scroll flex gap-24 md:gap-40 items-center justify-start">
            {PARTNERS.map((partner) => (
              <div
                key={`${partner.name}-1`}
                className="flex-shrink-0 flex items-center gap-3"
              >
                <Image
                  src={partner.logo}
                  alt={partner.name}
                  width={120}
                  height={32}
                  className="h-8 w-auto opacity-75 hover:opacity-100 transition-opacity duration-300"
                />
              </div>
            ))}
            {PARTNERS.map((partner) => (
              <div
                key={`${partner.name}-2`}
                className="flex-shrink-0 flex items-center gap-3"
              >
                <Image
                  src={partner.logo}
                  alt={partner.name}
                  width={120}
                  height={32}
                  className="h-8 w-auto opacity-75 hover:opacity-100 transition-opacity duration-300"
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
