"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { SettingsAlert } from "@/components/dashboard/settings/settings-alert";
import { SettingsButton } from "@/components/dashboard/settings/settings-button";
import { SettingsSection } from "@/components/dashboard/settings/settings-section";
import { createClient } from "@/lib/supabase/client";

type PlanType = "free" | "pro";
type Billing = "monthly" | "yearly";

interface Plan {
  id: PlanType;
  name: string;
  monthly: number;
  description: string;
  features: string[];
  recommended?: boolean;
}

const EASE_CURVE: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

const plans: Plan[] = [
  {
    id: "free",
    name: "Free",
    monthly: 0,
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
    monthly: 14.99,
    description: "Advanced analytics, unlimited uploads, AI coaching.",
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
];

const planOrder: PlanType[] = ["free", "pro"];

function getPlanName(planId: PlanType): string {
  return plans.find((p) => p.id === planId)?.name ?? planId;
}

function formatPrice(plan: Plan, billing: Billing) {
  if (plan.monthly === 0) return { price: "Free", note: "" };
  if (billing === "yearly") {
    const yearly = plan.monthly * 12 * 0.8;
    return {
      price: `$${(yearly / 12).toFixed(2)}`,
      note: "/mo, billed yearly",
    };
  }
  return { price: `$${plan.monthly.toFixed(2)}`, note: "/mo" };
}

const PlanCard = memo(function PlanCard({
  plan,
  billing,
  isSelected,
  isCurrentPlan,
  onSelect,
  index,
}: {
  plan: Plan;
  billing: Billing;
  isSelected: boolean;
  isCurrentPlan: boolean;
  onSelect: (planId: PlanType) => void;
  index: number;
}) {
  const handleClick = useCallback(() => onSelect(plan.id), [onSelect, plan.id]);
  const { price, note } = formatPrice(plan, billing);

  return (
    <motion.button
      type="button"
      onClick={handleClick}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.06, ease: EASE_CURVE }}
      className={cn(
        "relative flex flex-col text-left p-5 rounded-[14px] bg-[var(--color-surface-card)] transition-all duration-200 cursor-pointer w-full h-full",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-blue)]/40",
        "shadow-[var(--shadow-card)]",
        isSelected
          ? "border-2 border-[var(--color-blue)] -m-px"
          : "border border-[var(--color-ink-100)] hover:border-[var(--color-ink-300)]"
      )}
    >
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] font-medium text-[var(--color-ink-400)] uppercase tracking-[2.5px]">
          {plan.name}
        </p>
        {isCurrentPlan ? (
          <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-[var(--color-success)] uppercase tracking-[1.5px]">
            <span className="size-1 rounded-full bg-[var(--color-success)]" />
            Current
          </span>
        ) : plan.recommended ? (
          <span className="text-[10px] font-medium text-[var(--color-blue)] uppercase tracking-[1.5px]">
            Suggested
          </span>
        ) : null}
      </div>

      <div className="flex items-baseline gap-0.5">
        <span className="text-[28px] font-light text-[var(--color-ink-900)] tracking-[-0.5px] tabular-nums">
          {price}
        </span>
        {note && (
          <span className="text-[11px] text-[var(--color-ink-500)] ml-1">{note}</span>
        )}
      </div>

      {billing === "yearly" && plan.monthly > 0 && (
        <p className="text-[10px] text-[var(--color-ink-500)] tracking-[0.2px] mt-1">
          Billed yearly · save 20%
        </p>
      )}

      <div className="h-px bg-[var(--color-ink-100)] mb-4 mt-5" />

      <ul className="space-y-2.5 flex-1">
        {plan.features.map((feature, i) => (
          <li key={i} className="flex items-start gap-2.5">
            <span
              className={cn(
                "flex-shrink-0 size-4 rounded-full flex items-center justify-center mt-px transition-colors",
                isSelected ? "bg-[var(--color-blue)]" : "bg-[var(--color-ink-100)]"
              )}
            >
              <Check
                className={cn(
                  "size-2.5",
                  isSelected ? "text-white" : "text-[var(--color-ink-500)]"
                )}
                strokeWidth={2.5}
              />
            </span>
            <span className="text-[12px] text-[var(--color-ink-700)] leading-[1.4]">
              {feature}
            </span>
          </li>
        ))}
      </ul>
    </motion.button>
  );
});

export default function SubscriptionPage() {
  const [currentPlan] = useState<PlanType>("free");
  const [selectedPlan, setSelectedPlan] = useState<PlanType>("pro");
  const [billing, setBilling] = useState<Billing>("monthly");
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);

  // TODO(stripe): real upgrade flow lands when the subscriptions table + Stripe
  // checkout session are wired. Until then, this is a visual demo.
  const handleUpgrade = async () => {
    if (selectedPlan === currentPlan) return;
    setIsLoading(true);
    setMessage({ type: "info", text: "Preparing checkout..." });
    try {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      setMessage({
        type: "success",
        text: "Checkout session created. You would be redirected to Stripe.",
      });
    } catch {
      setMessage({
        type: "error",
        text: "Couldn't start checkout. Try again or contact support.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const currentPlanIndex = planOrder.indexOf(currentPlan);
  const selectedPlanIndex = planOrder.indexOf(selectedPlan);
  const canUpgrade = selectedPlanIndex > currentPlanIndex;
  const canDowngrade =
    selectedPlanIndex < currentPlanIndex && selectedPlan !== "free";

  const currentPlanData = useMemo(
    () => plans.find((p) => p.id === currentPlan)!,
    [currentPlan]
  );

  const [memberSince, setMemberSince] = useState<string | null>(null);
  const [uploadsUsed, setUploadsUsed] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      const [{ data: row }, { count }] = await Promise.all([
        supabase
          .from("users")
          .select("created_at")
          .eq("id", user.id)
          .single(),
        supabase
          .from("matches")
          .select("id", { count: "exact", head: true })
          .eq("created_by", user.id),
      ]);

      if (cancelled) return;
      if (row?.created_at) {
        const d = new Date(row.created_at);
        setMemberSince(
          d.toLocaleDateString("en-US", { month: "short", year: "numeric" })
        );
      }
      setUploadsUsed(count ?? 0);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // TODO(stripe): nextBilling becomes a real date once subscriptions sync.
  const usage = {
    uploadsUsed,
    uploadsLimit: currentPlan === "free" ? 5 : null,
    memberSince: memberSince ?? "—",
    nextBilling: currentPlan === "free" ? null : "—",
  };
  const uploadsRatio = usage.uploadsLimit
    ? Math.min(1, usage.uploadsUsed / usage.uploadsLimit)
    : 0;

  return (
    <div className="flex flex-col">
      {/* Usage strip — four editorial columns: plan, uploads, member since, next billing */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-y-6 gap-x-0 sm:divide-x sm:divide-[var(--color-ink-100)]">
        {/* Plan */}
        <div className="flex flex-col gap-2 sm:pr-6">
          <p className="text-[10px] font-medium text-[var(--color-ink-400)] uppercase tracking-[2.5px]">
            Plan
          </p>
          <p className="font-light text-[22px] text-[var(--color-ink-900)] tracking-[-0.4px] leading-[1.15] tabular-nums">
            {currentPlanData.name}
          </p>
          {currentPlan === "free" && (
            <p className="text-[10px] font-medium uppercase tracking-[1.5px] text-[var(--color-blue)]">
              Upgrade available
            </p>
          )}
        </div>

        {/* Uploads */}
        <div className="flex flex-col gap-2 sm:px-6">
          <p className="text-[10px] font-medium text-[var(--color-ink-400)] uppercase tracking-[2.5px]">
            Uploads
          </p>
          {usage.uploadsLimit ? (
            <>
              <p className="font-light text-[22px] text-[var(--color-ink-900)] tracking-[-0.4px] leading-[1.15] tabular-nums">
                {usage.uploadsUsed}{" "}
                <span className="text-[var(--color-ink-400)]">/ {usage.uploadsLimit}</span>
              </p>
              <div
                className="h-[2px] rounded-full bg-[var(--color-ink-100)] overflow-hidden"
                role="progressbar"
                aria-valuenow={usage.uploadsUsed}
                aria-valuemin={0}
                aria-valuemax={usage.uploadsLimit}
                aria-label={`Uploads used: ${usage.uploadsUsed} of ${usage.uploadsLimit}`}
              >
                <div
                  className={cn(
                    "h-full rounded-full",
                    uploadsRatio >= 0.8 ? "bg-[var(--color-error-strong)]" : "bg-[var(--color-blue)]"
                  )}
                  style={{
                    width: `${uploadsRatio * 100}%`,
                    transition:
                      "width 0.6s cubic-bezier(0.25,0.46,0.45,0.94)",
                  }}
                />
              </div>
            </>
          ) : (
            <p className="font-light text-[22px] text-[var(--color-ink-900)] tracking-[-0.4px] leading-[1.15] tabular-nums">
              {usage.uploadsUsed}{" "}
              <span className="text-[12px] text-[var(--color-ink-500)]">this month</span>
            </p>
          )}
        </div>

        {/* Member since */}
        <div className="flex flex-col gap-2 sm:px-6">
          <p className="text-[10px] font-medium text-[var(--color-ink-400)] uppercase tracking-[2.5px]">
            Member since
          </p>
          <p className="font-light text-[22px] text-[var(--color-ink-900)] tracking-[-0.4px] leading-[1.15] tabular-nums">
            {usage.memberSince}
          </p>
        </div>

        {/* Next billing */}
        <div className="flex flex-col gap-2 sm:pl-6">
          <p className="text-[10px] font-medium text-[var(--color-ink-400)] uppercase tracking-[2.5px]">
            Next billing
          </p>
          <p
            className={cn(
              "font-light text-[22px] tracking-[-0.4px] leading-[1.15] tabular-nums",
              usage.nextBilling ? "text-[var(--color-ink-900)]" : "text-[var(--color-ink-400)]"
            )}
          >
            {usage.nextBilling ?? "—"}
          </p>
        </div>
      </section>

      {/* Alert — tight to whatever it relates to (hugs the next section) */}
      <AnimatePresence mode="wait">
        {message && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2, ease: EASE_CURVE }}
            className="mt-8"
          >
            <SettingsAlert
              type={message.type}
              message={message.text}
              onDismiss={() => setMessage(null)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Plans — generous gutter from the usage strip (different territory) */}
      <SettingsSection
        number="01"
        title="Choose Your Plan"
        className="mt-12"
      >
        {/* Billing toggle — sliding indicator via Framer layoutId.
            Centered above the plan grid so it visually anchors the two cards.
            Savings stays visible in both states; greens up when yearly is active. */}
        <div className="flex justify-center">
          <div
            role="tablist"
            aria-label="Billing period"
            className="relative inline-flex items-center p-1 rounded-full bg-[var(--color-ink-100)]"
          >
            {(["monthly", "yearly"] as Billing[]).map((b) => {
              const active = billing === b;
              return (
                <button
                  key={b}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setBilling(b)}
                  className={cn(
                    "relative h-9 px-4 text-[10px] font-medium uppercase tracking-[1.5px] rounded-full transition-colors duration-200",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-blue)]/30",
                    active
                      ? "text-[var(--color-ink-900)]"
                      : "text-[var(--color-ink-500)] hover:text-[var(--color-ink-700)]"
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="billing-indicator"
                      aria-hidden="true"
                      className="absolute inset-0 rounded-full bg-[var(--color-surface-card)] shadow-[var(--shadow-card)]"
                      transition={{ duration: 0.3, ease: EASE_CURVE }}
                    />
                  )}
                  <span className="relative z-10 inline-flex items-center gap-1.5">
                    {b === "monthly" ? (
                      "Monthly"
                    ) : (
                      <>
                        Yearly
                        <span
                          className={cn(
                            "tabular-nums transition-colors duration-200",
                            active
                              ? "text-[var(--color-success)]"
                              : "text-[var(--color-ink-400)]"
                          )}
                        >
                          −20%
                        </span>
                      </>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Plan cards — gap-6 for breathing room between the two */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
          {plans.map((plan, index) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              billing={billing}
              isSelected={selectedPlan === plan.id}
              isCurrentPlan={currentPlan === plan.id}
              onSelect={setSelectedPlan}
              index={index}
            />
          ))}
        </div>
      </SettingsSection>

      {/* CTA + supporting hint — tight pair, treated as one unit */}
      <div className="flex flex-col gap-2 mt-10">
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
        <p className="text-[10px] text-[var(--color-ink-400)] text-center tracking-[0.3px]">
          Secure payment powered by Stripe · Cancel anytime
        </p>
      </div>

      {/* Footer help — left-aligned, no border. Sits as a quiet trailing line. */}
      <p className="text-[12px] text-[var(--color-ink-500)] mt-10">
        Questions about billing?{" "}
        <Link
          href="/dashboard/help"
          className="text-[var(--color-blue)] font-medium hover:text-[var(--color-blue-hover)] transition-colors duration-200"
        >
          Contact support
        </Link>
      </p>
    </div>
  );
}
