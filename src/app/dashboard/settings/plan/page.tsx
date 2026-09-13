"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { SettingsAlert } from "@/components/dashboard/settings/settings-alert";
import { SettingsButton } from "@/components/dashboard/settings/settings-button";
import {
  SettingsCard,
  SettingsCardTitle,
} from "@/components/dashboard/settings/settings-card";
import { useWorkspace } from "@/components/dashboard/workspace-provider";
import { isProPlan } from "@/lib/user/roles";
import { teamLabel } from "@/lib/workspace/types";
import { SUPPORT_EMAIL } from "@/lib/constants";

/**
 * Settings › Plan — what the account is entitled to.
 *
 * Renamed from Subscription, and narrowed with it: analysis hours moved to
 * Usage and are only pointed at from here. The two were one page while "plan"
 * and "how much of this month you have spent" were the same question; they
 * stopped being the same question when a program's 75 shared hours arrived
 * alongside a personal 2, on the same account.
 *
 * Entitlement is read from `viewer.plan`, never from `users.role`. The old
 * subscription page read `role === 'founder'`, which the Profile page in this
 * same area overwrites with a persona — so saving your profile downgraded you
 * on screen. See `lib/user/roles.ts`.
 *
 * Still a client page because the Stripe round trip lands back on it with
 * `?success=true` and has to poll for the webhook.
 */

type Banner = { type: "success" | "error" | "info"; text: string };

const PLANS: readonly {
  id: "free" | "pro";
  name: string;
  price: string;
  note?: string;
  summary: string;
}[] = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    summary:
      "SwingVision imports · 5 uploads · one report per match · core stats",
  },
  {
    id: "pro",
    name: "Pro",
    price: "$4.99",
    note: "once",
    summary:
      "Unlimited uploads and reports · shot-by-shot analysis · trends · Ask",
  },
];

function PlanContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { active, viewer } = useWorkspace();

  const isPro = isProPlan(viewer.plan);
  const isTeam = active.kind === "team";

  const [selectedPlan, setSelectedPlan] = useState<"free" | "pro">("pro");
  const [isLoading, setIsLoading] = useState(false);
  /** Something the person just did. Outranks whatever the URL implies. */
  const [override, setOverride] = useState<Banner | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const returnedFromCheckout = searchParams.get("success") === "true";
  const awaitingWebhook = returnedFromCheckout && !isPro;

  /**
   * Stripe's return is eventually consistent: the webhook flips `users.plan`,
   * and the page it redirects to often renders first.
   *
   * `router.refresh()` rather than polling `users` from the browser. The plan
   * this page renders comes from the server's workspace context, so re-reading
   * the row client-side would leave the two disagreeing until a reload — the
   * old page did exactly that and had to keep a second copy of "current plan"
   * in state to paper over it. Refreshing asks the same resolver again, and
   * `isPro` below simply becomes true.
   */
  useEffect(() => {
    if (!awaitingWebhook) return;
    let attempts = 0;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const tick = () => {
      if (cancelled) return;
      attempts += 1;
      router.refresh();
      if (attempts < 8) {
        timer = setTimeout(tick, Math.min(500 * attempts, 3000));
      } else {
        setOverride({
          type: "success",
          text: "Payment received. Your account will update shortly — reload if it hasn't.",
        });
      }
    };

    timer = setTimeout(tick, 700);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [awaitingWebhook, router]);

  // Derived, not mirrored into state: `isPro` changes underneath this as the
  // refresh above lands, and a value copied in an effect would not follow it.
  const redirectBanner: Banner | null =
    searchParams.get("canceled") === "true"
      ? {
          type: "info",
          text: "Checkout canceled. You can upgrade to Pro anytime.",
        }
      : returnedFromCheckout
        ? isPro
          ? { type: "success", text: "You're on Pro." }
          : { type: "info", text: "Confirming your payment…" }
        : null;

  const banner = override ?? (dismissed ? null : redirectBanner);

  const handleUpgrade = useCallback(async () => {
    if (isPro) return;
    setIsLoading(true);
    setOverride({ type: "info", text: "Preparing checkout…" });
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
      throw new Error(data.error ?? "No checkout URL returned");
    } catch {
      setOverride({
        type: "error",
        text: "Couldn't start checkout. Try again or contact support.",
      });
      setIsLoading(false);
    }
  }, [isPro]);

  // The strip names the tier as a person would say it: Free, Lifetime (the
  // one-time Pro purchase) or Pilot (a program). That already answers "how
  // long does this last", so there is no separate Access column to repeat it.
  const facts = [
    { label: "Plan", value: isTeam ? "Pilot" : isPro ? "Lifetime" : "Free" },
    isTeam ? { label: "Squad", value: teamLabel(active.team) ?? "—" } : null,
    { label: "Member since", value: viewer.memberSince ?? "—" },
  ].filter((fact): fact is NonNullable<typeof fact> => fact !== null);

  return (
    <div className="flex max-w-[640px] flex-col gap-5">
      {/* The facts card: hairline-separated columns, one large light value
          each. Analysis hours are pointedly not here — they are on Usage, which
          the page subtitle links to. Zero card padding so the dividers run the
          card's full height instead of stopping short; each cell pads itself. */}
      <SettingsCard className="overflow-hidden p-0">
        <dl
          className={cn(
            "grid divide-y divide-[var(--border-hairline)] sm:divide-x sm:divide-y-0",
            facts.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2",
          )}
        >
          {facts.map((fact) => (
            <div
              key={fact.label}
              className="flex min-w-0 flex-col gap-1.5 px-6 py-5"
            >
              <dt className="eyebrow whitespace-nowrap">{fact.label}</dt>
              <dd className="tabular text-[22px] leading-[1.15] font-light tracking-[-0.4px] whitespace-nowrap text-[var(--ink-900)]">
                {fact.value}
              </dd>
            </div>
          ))}
        </dl>
      </SettingsCard>

      {banner && (
        <SettingsAlert
          type={banner.type}
          message={banner.text}
          onDismiss={() => {
            setOverride(null);
            setDismissed(true);
          }}
        />
      )}

      {/* A program is a workspace, not something bought from this screen.
          Showing the personal Free/Pro rows here put two answers to "what plan
          am I on?" side by side — the strip saying Pilot, a card below saying
          Free — so inside a team workspace the card steps aside and the strip
          is the only answer. The personal plan is still reachable, from the
          workspace it belongs to. */}
      {isTeam ? (
        <SettingsCard className="gap-2">
          <div className="text-[12px] text-[var(--ink-900)]">
            Program plans are arranged with us directly.
          </div>
          <div className="text-[11px] leading-[1.6] text-[var(--ink-500)]">
            Seats, shared analysis hours and billing for {active.name} are set
            up with support rather than bought here —{" "}
            <a
              href={`mailto:${SUPPORT_EMAIL}?subject=Program%20plan`}
              className="text-[var(--blue)] hover:text-[var(--blue-hover)]"
            >
              {SUPPORT_EMAIL}
            </a>
            . Your own Free or Pro plan is separate and unaffected; switch to
            your personal workspace to change it.
          </div>
        </SettingsCard>
      ) : (
        <>
          {/* Free and Pro as two rows in one card, not two cards — a card
              inside a card is not a shape the design system has. */}
          <SettingsCard>
            <SettingsCardTitle className="pb-2">
              Choose your plan
            </SettingsCardTitle>

            {PLANS.map((plan) => {
              const isCurrent = plan.id === (isPro ? "pro" : "free");
              const isSelected = plan.id === selectedPlan;
              return (
                <button
                  key={plan.id}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => setSelectedPlan(plan.id)}
                  className="flex w-full cursor-pointer items-start gap-6 border-t border-[var(--border-hairline)] py-3 text-left focus-visible:outline-none"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "mt-0.5 flex size-[13px] shrink-0 items-center justify-center rounded-full border transition-colors duration-150",
                      isSelected
                        ? "border-[var(--blue)]"
                        : "border-[var(--ink-300)]",
                    )}
                  >
                    <span
                      className={cn(
                        "size-[6px] rounded-full transition-colors duration-150",
                        isSelected ? "bg-[var(--blue)]" : "bg-transparent",
                      )}
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="text-[12px] text-[var(--ink-900)]">
                        {plan.name}
                      </span>
                      {isCurrent && (
                        <span className="inline-flex h-[18px] items-center rounded-full bg-[var(--surface-subtle)] px-[7px] text-[10px] font-medium whitespace-nowrap text-[var(--ink-700)]">
                          Current
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-[1.5] text-[var(--ink-500)]">
                      {plan.summary}
                    </span>
                  </span>
                  <span className="tabular shrink-0 text-[13px] text-[var(--ink-900)]">
                    {plan.price}
                    {plan.note && (
                      <span className="ml-1 text-[11px] text-[var(--ink-500)]">
                        {plan.note}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}

            <span className="mt-3.5 border-t border-[var(--border-hairline)] pt-3.5 text-[11px] leading-[1.5] text-[var(--ink-500)]">
              Changing plan never changes your role. Pro is a one-time payment —
              there is no subscription to cancel.
            </span>
          </SettingsCard>

          <SettingsCard className="flex-row items-center gap-4">
            <div className="min-w-0 flex-1">
              <div className="text-[12px] text-[var(--ink-900)]">
                Billing is handled by Stripe.
              </div>
              <div className="mt-0.5 text-[11px] text-[var(--ink-500)]">
                Receipts and card details live there.{" "}
                <Link
                  href="/dashboard/help#support"
                  className="text-[var(--blue)] hover:text-[var(--blue-hover)]"
                >
                  Questions about billing?
                </Link>
              </div>
            </div>
            <SettingsButton
              onClick={handleUpgrade}
              disabled={isPro || selectedPlan === "free"}
              loading={isLoading}
            >
              {isPro ? "You're on Pro" : "Upgrade to Pro"}
            </SettingsButton>
          </SettingsCard>
        </>
      )}
    </div>
  );
}

export default function PlanPage() {
  return (
    <Suspense fallback={null}>
      <PlanContent />
    </Suspense>
  );
}
