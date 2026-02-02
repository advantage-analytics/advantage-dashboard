"use client";

import { Check, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { SettingsButton } from "./settings-button";

interface PlanFeature {
  text: string;
}

interface PlanCardProps {
  title: string;
  price?: string;
  priceNote?: string;
  filesUsed?: number;
  filesLimit?: number | "unlimited";
  filesMessage?: string;
  status?: string;
  statusNote?: string;
  features: PlanFeature[];
  isCurrentPlan?: boolean;
  isPremium?: boolean;
  onUpgrade?: () => void;
}

const PROGRESS_SEGMENTS = 5;

function ProgressBar({
  filesUsed = 0,
  filesLimit,
}: {
  filesUsed?: number;
  filesLimit: number | "unlimited";
}): React.ReactElement {
  if (filesLimit === "unlimited") {
    return (
      <div className="w-full h-1 rounded-full bg-gradient-to-r from-[#3986F3] to-[#60a5fa] animate-pulse" />
    );
  }

  const filledSegments = Math.ceil((filesUsed / filesLimit) * PROGRESS_SEGMENTS);

  return (
    <div className="flex gap-1">
      {Array.from({ length: PROGRESS_SEGMENTS }, (_, i) => (
        <div
          key={i}
          className={cn(
            "flex-1 h-1 rounded-full transition-all duration-500",
            i < filledSegments ? "bg-[#3986F3]" : "bg-[#E5E5E5]"
          )}
          style={{ transitionDelay: `${i * 50}ms` }}
        />
      ))}
    </div>
  );
}

function PlanBadge(): React.ReactElement {
  return (
    <span className="px-3 py-1.5 text-[10px] font-semibold text-[#0D0D0D] bg-[#F0F0F0] rounded-full uppercase tracking-wide">
      Current
    </span>
  );
}

export function PlanCard({
  title,
  price,
  priceNote,
  filesUsed,
  filesLimit,
  filesMessage,
  status,
  statusNote,
  features,
  isCurrentPlan = false,
  isPremium = false,
  onUpgrade,
}: PlanCardProps): React.ReactElement {
  function renderHeaderAction(): React.ReactNode {
    if (isCurrentPlan) {
      return <PlanBadge />;
    }
    if (onUpgrade) {
      return <SettingsButton onClick={onUpgrade}>Upgrade</SettingsButton>;
    }
    return null;
  }

  return (
    <div
      className={cn(
        "relative border rounded-xl p-6 transition-all duration-300",
        isCurrentPlan
          ? "border-[#0D0D0D] bg-white"
          : "border-[#E5E5E5] bg-[#FAFAFA] hover:border-[#CCCCCC] hover:bg-white"
      )}
    >
      {/* Premium badge */}
      {isPremium && !isCurrentPlan && (
        <div className="absolute -top-2.5 left-5 px-2.5 py-1 bg-gradient-to-r from-[#3986F3] to-[#60a5fa] rounded-full flex items-center gap-1.5">
          <Sparkles className="h-3 w-3 text-white" />
          <span className="text-[10px] font-semibold text-white uppercase tracking-wide">
            Recommended
          </span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h3 className="text-sm font-semibold text-[#0D0D0D]">{title}</h3>
          {price && (
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-2xl font-semibold text-[#0D0D0D] tabular-nums">
                {price}
              </span>
              {priceNote && (
                <span className="text-xs text-[#999]">{priceNote}</span>
              )}
            </div>
          )}
        </div>

        {renderHeaderAction()}
      </div>

      {/* Usage */}
      {filesLimit !== undefined && (
        <div className="mb-5 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#666]">Uploads</span>
            <span className="text-xs font-medium text-[#0D0D0D] tabular-nums">
              {filesLimit === "unlimited"
                ? "Unlimited"
                : `${filesUsed || 0} / ${filesLimit}`}
            </span>
          </div>
          <ProgressBar filesUsed={filesUsed} filesLimit={filesLimit} />
          {filesMessage && (
            <p className="text-xs text-[#999]">{filesMessage}</p>
          )}
        </div>
      )}

      {/* Status */}
      {status && (
        <div className="mb-5 pb-5 border-b border-[#F0F0F0]">
          <p
            className={cn(
              "text-xs font-medium",
              isCurrentPlan ? "text-emerald-600" : "text-[#666]"
            )}
          >
            {status}
          </p>
          {statusNote && (
            <p className="text-xs text-[#999] mt-0.5">{statusNote}</p>
          )}
        </div>
      )}

      {/* Features */}
      <div className="space-y-3">
        <p className="text-[10px] font-semibold text-[#999] uppercase tracking-[0.1em]">
          What&apos;s included
        </p>
        <ul className="space-y-2.5">
          {features.map((feature, index) => (
            <li
              key={index}
              className="flex items-start gap-3 group"
            >
              <span
                className={cn(
                  "flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center mt-0.5 transition-colors",
                  isCurrentPlan
                    ? "bg-[#0D0D0D]"
                    : "bg-[#E5E5E5] group-hover:bg-[#D0D0D0]"
                )}
              >
                <Check
                  className={cn(
                    "w-2.5 h-2.5",
                    isCurrentPlan ? "text-white" : "text-[#666]"
                  )}
                  strokeWidth={3}
                />
              </span>
              <span className="text-xs text-[#666] leading-relaxed">
                {feature.text}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
