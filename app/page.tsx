// app/page.tsx
"use client";

import Image from "next/image";
import LandingNav from "@/components/landing-nav";
import LandingInput from "@/components/landing-input";

export default function LandingPage() {
  return (
    <div className="relative min-h-dvh bg-white text-foreground">
      {/* Landing Nav */}
      <LandingNav />

      {/* centered divider */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 hidden -translate-x-1/2 -translate-y-1/2 bg-border md:block h-[320px] w-px" />

      {/* Split */}
      <main className="min-h-dvh flex items-center justify-center px-6 md:px-10">
        <div className="w-full max-w-6xl grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-center gap-10 md:gap-16">
          {/* Left brand/copy */}
          <section className="relative flex items-center justify-center md:justify-end md:pr-[14px]">
            <div className="max-w-[520px]">
              {/* advantage beta */}
              <Image
                src="/logo2.svg"
                alt="Advantage Beta"
                width={347}
                height={29}
                priority
                className="md:h-14"
              />

              <h2 className="mt-4 text-xl font-medium">Elevate Your Game</h2>
              {/* line breaks*/}
              <p className="mt-4 text-sm">
                We&apos;re still fine tuning Advantage and
                <span className="block">would love your feedback.</span>
              </p>
              <p className="mt-4 text-sm">
                Join our Beta to help us shape the best
                <span className="block">platform for players.</span>
              </p>
            </div>
          </section>

          {/* Spacer  */}
          <div className="hidden md:block h-[320px] w-px bg-transparent" />

          {/* Right waitlist form  */}
          <LandingInput />
        </div>
      </main>
    </div>
  );
}
