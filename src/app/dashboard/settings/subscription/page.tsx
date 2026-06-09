"use client";

import {
  memo,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Check } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { SettingsAlert } from "@/components/dashboard/settings/settings-alert";
import { SettingsButton } from "@/components/dashboard/settings/settings-button";
import { SettingsSection } from "@/components/dashboard/settings/settings-section";
import { createClient } from "@/lib/supabase/client";

type PlanType = "free" | "pro";

interface Plan {
  id: PlanType;
  name: string;
  /** Price in dollars. 0 for free, one-time charge for paid plans. */
  price: number;
  /** One-time purchase (no recurring billing). */
  oneTime?: boolean;
  description: string;
  features: string[];
  recommended?: boolean;
}

const EASE_CURVE: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

/** users.role value that marks a paid Pro user (mirrors the original Founder's Pass). */
const PRO_ROLE = "founder";

const plans: Plan[] = [
  {
    id: "free",
    name: "Free",
    price: 0,
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
    price: 4.99,
    oneTime: true,
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

function formatPrice(plan: Plan) {
  if (plan.price === 0) return { price: "Free", note: "" };
  return {
    price: `$${plan.price.toFixed(2)}`,
    note: plan.oneTime ? "one-time" : "/mo",
  };
}

const PlanCard = memo(function PlanCard({
  plan,
  isSelected,
  isCurrentPlan,
  onSelect,
  index,
}: {
  plan: Plan;
  isSelected: boolean;
  isCurrentPlan: boolean;
  onSelect: (planId: PlanType) => void;
  index: number;
}) {
  const handleClick = useCallback(() => onSelect(plan.id), [onSelect, plan.id]);
  const { price, note } = formatPrice(plan);

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

      {plan.oneTime && (
        <p className="text-[10px] text-[var(--color-ink-500)] tracking-[0.2px] mt-1">
          Lifetime access · pay once
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

function SubscriptionContent() {
  const searchParams = useSearchParams();
  const [currentPlan, setCurrentPlan] = useState<PlanType>("free");
  const [selectedPlan, setSelectedPlan] = useState<PlanType>("pro");
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);

  // Redirect to Stripe Checkout for the one-time Pro purchase.
  const handleUpgrade = async () => {
    if (selectedPlan === currentPlan) return;
    setIsLoading(true);
    setMessage({ type: "info", text: "Preparing checkout..." });
    try {
      const response = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await response.json();

      if (data.url) {
        window.location.href = data.url;
        return;
      }
      throw new Error(data.error || "No checkout URL returned");
    } catch {
      setMessage({
        type: "error",
        text: "Couldn't start checkout. Try again or contact support.",
      });
      setIsLoading(false);
    }
  };

  const currentPlanIndex = planOrder.indexOf(currentPlan);
  const selectedPlanIndex = planOrder.indexOf(selectedPlan);
  const canUpgrade = selectedPlanIndex > currentPlanIndex;

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
          .select("created_at, role")
          .eq("id", user.id)
          .single(),
        supabase
          .from("matches")
          .select("id", { count: "exact", head: true })
          .eq("created_by", user.id),
      ]);

      if (cancelled) return;
      if (row?.role === PRO_ROLE) {
        setCurrentPlan("pro");
      }
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

  // Handle the Stripe Checkout redirect back into the app. On success we poll
  // the user's role until the webhook upgrades it (eventually consistent).
  useEffect(() => {
    const success = searchParams.get("success");
    const canceled = searchParams.get("canceled");

    if (success === "true") {
      setMessage({ type: "info", text: "Confirming your payment..." });
      const supabase = createClient();

      let cancelled = false;
      let pollCount = 0;
      const maxPolls = 20;
      let delay = 250;

      const checkRole = async () => {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return false;
        const { data } = await supabase
          .from("users")
          .select("role")
          .eq("id", user.id)
          .single();
        return data?.role === PRO_ROLE;
      };

      const poll = async () => {
        if (cancelled) return;
        const isPro = await checkRole();
        if (isPro) {
          setCurrentPlan("pro");
          setSelectedPlan("pro");
          setMessage({
            type: "success",
            text: "Payment successful! You now have unlimited access to all Pro features.",
          });
          return;
        }
        pollCount++;
        if (pollCount < maxPolls) {
          delay = Math.min(delay * 1.5, 1000);
          setTimeout(poll, delay);
        } else {
          setMessage({
            type: "success",
            text: "Payment received. Your account will update shortly — refresh if it hasn't.",
          });
        }
      };

      poll();
      return () => {
        cancelled = true;
      };
    } else if (canceled === "true") {
      setMessage({
        type: "info",
        text: "Checkout canceled. You can upgrade to Pro anytime.",
      });
    }
  }, [searchParams]);

  // One-time purchase: once on Pro there is no recurring billing date.
  const usage = {
    uploadsUsed,
    uploadsLimit: currentPlan === "free" ? 5 : null,
    memberSince: memberSince ?? "—",
    nextBilling: currentPlan === "free" ? null : "Lifetime",
  };
  const uploadsRatio = usage.uploadsLimit
    ? Math.min(1, usage.uploadsUsed / usage.uploadsLimit)
    : 0;

  return (
    <div className="flex flex-col">
      {/* Usage strip — four editorial columns: plan, uploads, member since, access */}
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
              <span className="text-[12px] text-[var(--color-ink-500)]">total</span>
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

        {/* Access */}
        <div className="flex flex-col gap-2 sm:pl-6">
          <p className="text-[10px] font-medium text-[var(--color-ink-400)] uppercase tracking-[2.5px]">
            Access
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
      <SettingsSection number="01" title="Choose Your Plan" className="mt-12">
        {/* Plan cards — gap-6 for breathing room between the two */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {plans.map((plan, index) => (
            <PlanCard
              key={plan.id}
              plan={plan}
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
          disabled={!canUpgrade}
          loading={isLoading}
          fullWidth
          variant={canUpgrade ? "blue" : "primary"}
        >
          {currentPlan === "pro"
            ? "You're on Pro"
            : canUpgrade
              ? `Upgrade to ${getPlanName(selectedPlan)} · $4.99 once`
              : `You're on ${getPlanName(currentPlan)}`}
        </SettingsButton>
        <p className="text-[10px] text-[var(--color-ink-400)] text-center tracking-[0.3px]">
          Secure one-time payment powered by Stripe · Lifetime access
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

export default function SubscriptionPage() {
  return (
    <Suspense fallback={null}>
      <SubscriptionContent />
    </Suspense>
  );
}
