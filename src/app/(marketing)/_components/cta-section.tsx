"use client";

import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";
import { motion } from "framer-motion";

export function CtaSection() {
  return (
    <section className="py-20 md:py-32 px-6 md:px-10 relative overflow-hidden bg-[#1a1a1a]">
      {/* Full background image */}
      <div className="absolute inset-0">
        <Image
          src="/marketing/cta-bg.webp"
          alt=""
          fill
          className="object-cover opacity-100 blur-[1px]"
        />
      </div>

      <div className="relative mx-auto max-w-7xl">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left side - Content */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-4xl md:text-5xl font-medium tracking-tight text-white mb-6 text-center lg:text-left">
              Join the Winning Team
            </h2>
            <p className="text-lg md:text-xl text-white mb-8 max-w-xl text-center lg:text-left mx-auto lg:mx-0">
              Join the Advantage Beta and be among the first to experience the
              future of tennis analytics.
            </p>

            {/* Benefits list */}
            <div className="space-y-4 mx-auto lg:mx-0 max-w-fit">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-6 h-6 text-[#4A9EFF] flex-shrink-0" />
                <span className="text-white text-lg">
                  Early access to all features
                </span>
              </div>
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-6 h-6 text-[#4A9EFF] flex-shrink-0" />
                <span className="text-white text-lg">
                  Direct feedback channel with our team
                </span>
              </div>
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-6 h-6 text-[#4A9EFF] flex-shrink-0" />
                <span className="text-white text-lg">
                  Exclusive beta pricing
                </span>
              </div>
            </div>
          </motion.div>

          {/* Right side - Form */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mx-auto lg:ml-auto lg:mr-0 w-full max-w-md"
          >
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8 space-y-6">
              <Image
                src="/logos/logo.svg"
                alt="Advantage"
                width={160}
                height={28}
                className="h-7 w-auto mx-auto brightness-0 invert"
              />
              <Button
                asChild
                className="w-full py-6 bg-[#4A9EFF] hover:bg-[#3A8EEF] text-white rounded-lg text-base font-medium transition-colors"
              >
                <Link
                  href="/auth/sign-up"
                  className="flex items-center justify-center"
                >
                  Join
                </Link>
              </Button>
              <p className="text-sm text-gray-500 text-center">
                No spam. Unsubscribe anytime.
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
