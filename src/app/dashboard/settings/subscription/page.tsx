"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { SettingsAlert } from "@/components/dashboard/settings/settings-alert";
import { SettingsButton } from "@/components/dashboard/settings/settings-button";
import { SettingsSection } from "@/components/dashboard/settings/settings-section";

type PlanType = "starter" | "pro" | "elite";

interface Plan {
  id: PlanType;
  name: string;
  price: string;
  priceNote?: string;
  description: string;
  features: string[];
  recommended?: boolean;
}

const EASE_CURVE: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

const plans: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    price: "Free",
    description: "Basic match analysis and performance tracking.",
    features: [
      "Upload and store match data",
      "Up to 5 file uploads",
      "One report per match",
      "Core stats breakdown",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: "$14.99",
    priceNote: "/mo",
    description: "Advanced analytics for serious competitors.",
    features: [
      "Unlimited match uploads",
      "Unlimited reports",
      "Shot-by-shot analysis",
      "AI coaching recommendations",
      "Trend analysis",
      "Priority support",
    ],
    recommended: true,
  },
  {
    id: "elite",
    name: "Elite",
    price: "$24.99",
    priceNote: "/mo",
    description: "Full suite for professionals and academies.",
    features: [
      "Everything in Pro",
      "Custom report builder",
      "Team & academy dashboard",
      "API access",
      "White-label exports",
      "Dedicated account manager",
    ],
  },
];

function PlanCard({
  plan,
  isSelected,
  isCurrentPlan,
  onSelect,
  index,
}: {
  plan: Plan;
  isSelected: boolean;
  isCurrentPlan: boolean;
  onSelect: () => void;
  index: number;
}) {
  return (
    <motion.button
      type="button"
      onClick={onSelect}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.06, ease: EASE_CURVE }}
      className={cn(
        "relative flex flex-col text-left p-5 rounded-[14px] border transition-all duration-200 cursor-pointer group w-full h-full",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40",
        isSelected
          ? "border-[#3B82F6] bg-white shadow-[0px_2px_8px_0px_rgba(0,0,0,0.06),0_0_0_3px_rgba(59,130,246,0.08)]"
          : "border-[#F3F3F3] bg-white hover:border-[#CCCCCC] shadow-[0px_2px_8px_0px_rgba(0,0,0,0.06)]"
      )}
    >
      {/* Recommended Badge */}
      {plan.recommended && !isCurrentPlan && (
        <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2.5 py-1 bg-[#3B82F6] rounded-full">
          <span className="text-[8px] font-medium text-white uppercase tracking-[1.5px]">
            Recommended
          </span>
        </div>
      )}

      {/* Current Plan Indicator */}
      {isCurrentPlan && (
        <div className="absolute top-4 right-4">
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[9px] font-medium text-[#5DB955] bg-[rgba(115,230,104,0.12)] rounded-full uppercase tracking-[1px]">
            <span className="size-1 rounded-full bg-[#5DB955] animate-pulse" />
            Current
          </span>
        </div>
      )}

      {/* Plan Name */}
      <p className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px] mb-3">
        {plan.name}
      </p>

      {/* Price */}
      <div className="flex items-baseline gap-0.5 mb-2">
        <span className="text-[28px] font-light text-[#0D0D0D] tracking-[-0.5px] tabular-nums">
          {plan.price === "Free" ? "Free" : plan.price}
        </span>
        {plan.priceNote && (
          <span className="text-[12px] text-[#888888] ml-0.5">
            {plan.priceNote}
          </span>
        )}
      </div>

      {/* Description */}
      <p className="text-[12px] text-[#888888] leading-[1.5] mb-5">
        {plan.description}
      </p>

      {/* Divider */}
      <div className="h-px bg-[#F3F3F3] mb-4" />

      {/* Features */}
      <ul className="space-y-2.5 flex-1">
        {plan.features.map((feature, i) => (
          <li key={i} className="flex items-start gap-2.5">
            <span
              className={cn(
                "flex-shrink-0 size-4 rounded-full flex items-center justify-center mt-px",
                isSelected ? "bg-[#3B82F6]" : "bg-[#F5F5F5]"
              )}
            >
              <Check
                className={cn(
                  "size-2.5",
                  isSelected ? "text-white" : "text-[#888888]"
                )}
                strokeWidth={2.5}
              />
            </span>
            <span className="text-[12px] text-[#525252] leading-[1.4]">
              {feature}
            </span>
          </li>
        ))}
      </ul>
    </motion.button>
  );
}

const planOrder: PlanType[] = ["starter", "pro", "elite"];

function getPlanName(planId: PlanType): string {
  return plans.find((p) => p.id === planId)?.name ?? planId;
}

export default function SubscriptionPage() {
  const [currentPlan] = useState<PlanType>("starter");
  const [selectedPlan, setSelectedPlan] = useState<PlanType>("pro");
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);

  const handleUpgrade = async () => {
    if (selectedPlan === currentPlan) return;

    setIsLoading(true);
    setMessage({
      type: "info",
      text: "Preparing checkout...",
    });

    await new Promise((resolve) => setTimeout(resolve, 1200));

    setIsLoading(false);
    setMessage({
      type: "success",
      text: "Checkout session created. You would be redirected to Stripe.",
    });
  };

  const currentPlanIndex = planOrder.indexOf(currentPlan);
  const selectedPlanIndex = planOrder.indexOf(selectedPlan);
  const canUpgrade = selectedPlanIndex > currentPlanIndex;
  const canDowngrade =
    selectedPlanIndex < currentPlanIndex && selectedPlan !== "starter";

  return (
    <div className="space-y-8">
      {/* Page Heading */}
      <div>
        <h2 className="text-[14px] font-medium text-[#0D0D0D]">
          Subscription
        </h2>
        <p className="text-[11px] text-[#888888] mt-0.5">
          Choose the plan that fits your training needs
        </p>
      </div>

      {/* Message */}
      <AnimatePresence mode="wait">
        {message && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2, ease: EASE_CURVE }}
          >
            <SettingsAlert
              type={message.type}
              message={message.text}
              onDismiss={() => setMessage(null)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Plans */}
      <SettingsSection title="Choose Your Plan">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
          {plans.map((plan, index) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              isSelected={selectedPlan === plan.id}
              isCurrentPlan={currentPlan === plan.id}
              onSelect={() => setSelectedPlan(plan.id)}
              index={index}
            />
          ))}
        </div>
      </SettingsSection>

      {/* CTA */}
      <div className="space-y-3">
        <SettingsButton
          onClick={handleUpgrade}
          disabled={!canUpgrade && !canDowngrade}
          loading={isLoading}
          fullWidth
          variant={canUpgrade ? "blue" : "primary"}
        >
          {selectedPlan === currentPlan
            ? `You're on ${getPlanName(currentPlan)}`
            : canUpgrade
              ? `Upgrade to ${getPlanName(selectedPlan)}`
              : canDowngrade
                ? `Downgrade to ${getPlanName(selectedPlan)}`
                : `Select a plan to change`}
        </SettingsButton>

        <p className="text-[10px] text-[#AAAAAA] text-center tracking-[0.3px]">
          Secure payment powered by Stripe
        </p>
      </div>

      {/* Footer */}
      <div className="pt-4 border-t border-[#F3F3F3]">
        <p className="text-[12px] text-[#888888]">
          Questions about billing?{" "}
          <Link
            href="/dashboard/help"
            className="text-[#3B82F6] font-medium hover:text-[#2563EB] underline-offset-2 transition-colors duration-200"
          >
            Contact support
          </Link>
        </p>
      </div>
    </div>
  );
}
