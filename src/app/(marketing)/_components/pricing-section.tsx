"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";

export function PricingSection() {
  const [selectedPlan, setSelectedPlan] = useState<
    "starter" | "founder" | null
  >(null);

  return (
    <section id="pricing" className="py-20 md:py-32 px-6 md:px-10">
      <div className="mx-auto max-w-4xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl md:text-5xl font-medium tracking-[-0.02em] text-[#1D1D1F]">
            Choose Your Plan
          </h2>
          <p className="mt-4 text-lg text-gray-400">
            Start free, upgrade when you need more.
          </p>
        </motion.div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
          {/* Free Tier */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.5, delay: 0.1 }}
            onClick={() =>
              setSelectedPlan(selectedPlan === "starter" ? null : "starter")
            }
            className={`bg-white rounded-2xl p-8 transition-all duration-300 ease-in-out cursor-pointer ${
              selectedPlan === "starter"
                ? "border-2 border-[#659BFF]/60 scale-[1.02] shadow-lg shadow-blue-500/10"
                : "border border-gray-200 hover:border-gray-300"
            }`}
          >
            <div className="mb-6">
              <h3 className="text-2xl font-medium text-[#1D1D1F]">
                Starter Plan
              </h3>
              <p className="text-gray-400 mt-1">
                Starter is always free. Upgrade anytime for unlimited uploads
                and deeper analytics.
              </p>
            </div>
            <div className="mb-8">
              <span className="text-4xl font-medium text-[#1D1D1F]">$0</span>
              <span className="text-gray-400">/forever</span>
            </div>
            <ul className="space-y-4 mb-8">
              <li className="flex items-center gap-3 text-gray-400">
                <Check className="w-5 h-5 text-green-500 flex-shrink-0" />
                <span>1 Report</span>
              </li>
              <li className="flex items-center gap-3 text-gray-400">
                <Check className="w-5 h-5 text-green-500 flex-shrink-0" />
                <span>5 File Uploads</span>
              </li>
              <li className="flex items-center gap-3 text-gray-400">
                <Check className="w-5 h-5 text-green-500 flex-shrink-0" />
                <span>Swingvision Integration</span>
              </li>
              <li className="flex items-center gap-3 text-gray-400">
                <Check className="w-5 h-5 text-green-500 flex-shrink-0" />
                <span>Community Support</span>
              </li>
            </ul>
            <Button
              asChild
              variant="outline"
              className="w-full py-6 rounded-xl text-base border-gray-200 hover:bg-gray-50"
            >
              <Link href="/auth/sign-up">Join Now</Link>
            </Button>
          </motion.div>

          {/* Founder Tier */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.5, delay: 0.2 }}
            onClick={() =>
              setSelectedPlan(selectedPlan === "founder" ? null : "founder")
            }
            className={`relative bg-white rounded-2xl p-8 transition-all duration-300 ease-in-out cursor-pointer ${
              selectedPlan === "founder"
                ? "border-2 border-[#659BFF]/60 scale-[1.02] shadow-lg shadow-blue-500/10"
                : "border border-gray-200 hover:border-gray-300"
            }`}
          >
            {/* Recommended badge */}
            <div
              className={`absolute -top-3 left-1/2 -translate-x-1/2 text-sm font-medium px-4 py-1.5 rounded-full transition-all duration-300 ease-in-out ${
                selectedPlan === "founder"
                  ? "bg-[#659BFF] text-white"
                  : "bg-gray-100 text-gray-400"
              }`}
            >
              Limited Offer
            </div>
            <div className="mb-6">
              <h3 className="text-2xl font-medium text-[#1D1D1F]">
                Founder's Plan
              </h3>
              <p className="text-gray-400 mt-1">
                Permanent access to advanced tools and unlimited uploads.
              </p>
            </div>
            <div className="mb-8">
              <span className="text-4xl font-medium text-[#1D1D1F]">$9.99</span>
              <span className="text-gray-400">/one-time</span>
            </div>
            <ul className="space-y-4 mb-8">
              <li className="flex items-center gap-3 text-gray-400">
                <Check className="w-5 h-5 text-[#007AFF] flex-shrink-0" />
                <span className="font-medium text-gray-500">
                  Unlimited Reports
                </span>
              </li>
              <li className="flex items-center gap-3 text-gray-400">
                <Check className="w-5 h-5 text-[#007AFF] flex-shrink-0" />
                <span className="font-medium text-gray-500">
                  Unlimited File Uploads
                </span>
              </li>
              <li className="flex items-center gap-3 text-gray-400">
                <Check className="w-5 h-5 text-[#007AFF] flex-shrink-0" />
                <span>All ELC Integrations</span>
              </li>
              <li className="flex items-center gap-3 text-gray-400">
                <Check className="w-5 h-5 text-[#007AFF] flex-shrink-0" />
                <span>Priority Support</span>
              </li>
            </ul>
            <Button
              asChild
              className="w-full py-6 rounded-xl text-base bg-[#659BFF] hover:bg-[#4686FE]"
            >
              <Link href="/auth/sign-up">Join Now</Link>
            </Button>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
