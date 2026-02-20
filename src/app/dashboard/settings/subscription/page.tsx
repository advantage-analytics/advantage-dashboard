"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { SettingsAlert } from "@/components/dashboard/settings/settings-alert";
import { SettingsButton } from "@/components/dashboard/settings/settings-button";

type PlanType = "starter" | "pro" | "elite";

interface Plan {
  id: PlanType;
  name: string;
  price: string;
  priceNote?: string;
  description: string;
  features: string[];
  popular?: boolean;
}

const plans: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    price: "Free",
    description:
      "Perfect for players getting started with match analysis and basic performance tracking.",
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
    priceNote: "month",
    description:
      "Advanced analytics and coaching insights for serious competitors looking to level up.",
    features: [
      "Unlimited match uploads",
      "Unlimited reports",
      "Shot-by-shot analysis",
      "AI coaching recommendations",
      "Trend analysis",
      "Priority support",
    ],
    popular: true,
  },
  {
    id: "elite",
    name: "Elite",
    price: "$24.99",
    priceNote: "month",
    description:
      "The ultimate package for professionals and academies with custom reporting and API access.",
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
}: {
  plan: Plan;
  isSelected: boolean;
  isCurrentPlan: boolean;
  onSelect: () => void;
}) {
  const showPopularBadge = plan.popular && !isCurrentPlan;

  return (
    <motion.button
      type="button"
      onClick={onSelect}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
      className={cn(
        "relative flex flex-col text-left p-5 rounded-xl border-2 transition-all duration-200 cursor-pointer group w-full",
        isSelected
          ? "border-[#3986F3] bg-white shadow-[0_0_0_3px_rgba(57,134,243,0.08)]"
          : "border-[#E5E5E5] bg-[#FAFAFA] hover:border-[#CCCCCC] hover:bg-white"
      )}
    >
      {/* Popular Badge */}
      {showPopularBadge && (
        <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2.5 py-1 bg-[#3986F3] rounded-full flex items-center gap-1.5">
          <Sparkles className="w-2.5 h-2.5 text-white" />
          <span className="text-[9px] font-semibold text-white uppercase tracking-wide">
            Recommended
          </span>
        </div>
      )}

      {/* Radio Indicator */}
      <div className="absolute top-4 right-4">
        <div
          className={cn(
            "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-200",
            isSelected
              ? "border-[#3986F3] bg-[#3986F3]"
              : "border-[#D0D0D0] bg-white group-hover:border-[#999]"
          )}
        >
          {isSelected && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
              className="w-2 h-2 rounded-full bg-white"
            />
          )}
        </div>
      </div>

      {/* Current Plan Badge */}
      {isCurrentPlan && (
        <div className="absolute top-4 right-11">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-semibold text-emerald-700 bg-emerald-50 rounded-full">
            <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
            Current
          </span>
        </div>
      )}

      {/* Content */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-4 pr-16">
        {/* Left: Name + Price */}
        <div className="sm:w-40 flex-shrink-0">
          <h3 className="text-xs font-semibold text-[#0D0D0D] mb-2">
            {plan.name}
          </h3>
          <div className="flex items-baseline gap-0.5">
            {plan.price !== "Free" && (
              <span className="text-xs font-medium text-[#666]">$</span>
            )}
            <span className="text-2xl font-semibold text-[#0D0D0D] tracking-tight tabular-nums">
              {plan.price === "Free" ? "Free" : plan.price.replace("$", "")}
            </span>
            {plan.priceNote && (
              <span className="text-xs text-[#999] ml-0.5">
                /{plan.priceNote}
              </span>
            )}
          </div>
        </div>

        {/* Right: Description */}
        <div className="flex-1">
          <p className="text-xs text-[#666] leading-relaxed">
            {plan.description}
          </p>
        </div>
      </div>

      {/* Features */}
      <div className="mt-4 pt-4 border-t border-[#F0F0F0]">
        <ul className="grid grid-cols-2 gap-x-4 gap-y-2">
          {plan.features.map((feature, index) => (
            <li key={index} className="flex items-center gap-2">
              <span
                className={cn(
                  "flex-shrink-0 w-3.5 h-3.5 rounded-full flex items-center justify-center",
                  isSelected ? "bg-[#3986F3]" : "bg-[#E5E5E5]"
                )}
              >
                <Check
                  className={cn(
                    "w-2 h-2",
                    isSelected ? "text-white" : "text-[#666]"
                  )}
                  strokeWidth={2.5}
                />
              </span>
              <span className="text-[11px] text-[#666]">{feature}</span>
            </li>
          ))}
        </ul>
      </div>
    </motion.button>
  );
}

const planOrder: PlanType[] = ["starter", "pro", "elite"];

function getPlanName(planId: PlanType): string {
  const plan = plans.find((p) => p.id === planId);
  return plan?.name ?? planId;
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
  const canDowngrade = selectedPlanIndex < currentPlanIndex && selectedPlan !== "starter";

  return (
    <div className="space-y-8">
      {/* Section Header */}
      <div>
        <h2 className="text-sm font-medium text-[#0D0D0D]">Subscription</h2>
        <p className="text-xs text-[#999] mt-1">
          Choose the plan that fits your training needs
        </p>
      </div>

      {/* Message */}
      <AnimatePresence mode="wait">
        {message && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            <SettingsAlert
              type={message.type}
              message={message.text}
              onDismiss={() => setMessage(null)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Plans - Stacked Vertically */}
      <div className="space-y-4">
        {plans.map((plan, index) => (
          <motion.div
            key={plan.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: index * 0.08 }}
          >
            <PlanCard
              plan={plan}
              isSelected={selectedPlan === plan.id}
              isCurrentPlan={currentPlan === plan.id}
              onSelect={() => setSelectedPlan(plan.id)}
            />
          </motion.div>
        ))}
      </div>

      {/* CTA Button */}
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

        <p className="text-[10px] text-[#999] text-center">
          Secure payment powered by Stripe
        </p>
      </div>

      {/* Footer */}
      <div className="pt-5 border-t border-[#F0F0F0]">
        <p className="text-xs text-[#999]">
          Questions about billing?{" "}
          <a
            href="#"
            className="text-[#0D0D0D] font-medium hover:underline underline-offset-2 transition-colors"
          >
            Contact support
          </a>
        </p>
      </div>
    </div>
  );
}
