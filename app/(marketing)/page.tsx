"use client";

import {
  HeroSection,
  PartnersRibbon,
  BentoGrid,
  StatsShowcase,
  PricingSection,
  TestimonialSection,
  CtaSection,
} from "./_components";

export default function LandingPage() {
  return (
    <div className="relative min-h-dvh bg-white text-[#1D1D1F]">
      {/* Subtle noise texture overlay */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.02] z-0"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E\")",
        }}
      />

      <HeroSection />
      <PartnersRibbon />
      <BentoGrid />
      <StatsShowcase />
      <PricingSection />
      <TestimonialSection />
      <CtaSection />
    </div>
  );
}
