"use client";

import { useState } from "react";
import { PlanCard } from "@/components/dashboard/settings/plan-card";
import { SettingsAlert } from "@/components/dashboard/settings/settings-alert";

export default function SubscriptionPage() {
  const [userRole] = useState<"free" | "founder">("free");
  const [uploadCount] = useState(2);
  const [message, setMessage] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);

  const handleUpgrade = async () => {
    setMessage({
      type: "info",
      text: "Redirecting to checkout...",
    });
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setMessage({
      type: "success",
      text: "Checkout session created. You would be redirected to Stripe.",
    });
  };

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
      {message && (
        <SettingsAlert
          type={message.type}
          message={message.text}
          onDismiss={() => setMessage(null)}
        />
      )}

      {/* Plans */}
      <div className="space-y-5">
        {/* Starter Plan */}
        <PlanCard
          title="Starter"
          price="Free"
          filesUsed={userRole === "free" ? uploadCount : undefined}
          filesLimit={userRole === "free" ? 5 : undefined}
          filesMessage={
            userRole === "free"
              ? `${5 - uploadCount} uploads remaining`
              : undefined
          }
          status={userRole === "free" ? "Active" : undefined}
          statusNote={
            userRole === "free"
              ? "Upgrade anytime for unlimited access"
              : "Included with Founder's Pass"
          }
          features={[
            { text: "Upload and store match data" },
            { text: "Up to 5 file uploads" },
            { text: "One auto-generated report per match" },
            { text: "Core stats and accuracy breakdowns" },
          ]}
          isCurrentPlan={userRole === "free"}
        />

        {/* Founder's Pass */}
        <PlanCard
          title="Founder's Pass"
          price="$9.99"
          priceNote="one-time"
          filesLimit="unlimited"
          filesMessage={
            userRole === "founder" ? "Unlimited uploads unlocked" : undefined
          }
          status={userRole === "founder" ? "Active" : "Lifetime access"}
          statusNote="Permanent access to all premium features"
          features={[
            { text: "Everything in Starter" },
            { text: "Unlimited match uploads" },
            { text: "Unlimited report generation" },
            { text: "Deep shot-by-shot analysis" },
            { text: "Trend analysis across matches" },
            { text: "Early access to beta features" },
          ]}
          isCurrentPlan={userRole === "founder"}
          isPremium={userRole === "free"}
          onUpgrade={userRole === "free" ? handleUpgrade : undefined}
        />
      </div>

      {/* Footer Note */}
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
  );
}
