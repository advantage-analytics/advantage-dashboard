"use client";

import { Check, Sparkles, Crown, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { SettingsButton } from "./settings-button";
import { motion } from "framer-motion";

interface PlanFeature {
  text: string;
  highlighted?: boolean;
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
  isCurrentPlan,
}: {
  filesUsed?: number;
  filesLimit: number | "unlimited";
  isCurrentPlan?: boolean;
}): React.ReactElement {
  if (filesLimit === "unlimited") {
    return (
      <div className="relative w-full h-1.5 rounded-full overflow-hidden bg-gradient-to-r from-[#E5E5E5] to-[#F0F0F0]">
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-[#3B82F6] via-[#60a5fa] to-[#3B82F6]"
          initial={{ x: "-100%" }}
          animate={{ x: "100%" }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "linear",
          }}
          style={{ width: "200%" }}
        />
      </div>
    );
  }

  const filledSegments = Math.ceil(
    (filesUsed / filesLimit) * PROGRESS_SEGMENTS
  );
  const isNearLimit = filesUsed >= filesLimit - 1;

  return (
    <div className="flex gap-1.5">
      {Array.from({ length: PROGRESS_SEGMENTS }, (_, i) => (
        <motion.div
          key={i}
          className={cn(
            "flex-1 h-1.5 rounded-full transition-colors duration-300",
            i < filledSegments
              ? isNearLimit
                ? "bg-amber-500"
                : isCurrentPlan
                  ? "bg-[#0D0D0D]"
                  : "bg-[#3B82F6]"
              : "bg-[#E5E5E5]"
          )}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.4, delay: i * 0.08, ease: "easeOut" }}
        />
      ))}
    </div>
  );
}

function PlanBadge(): React.ReactElement {
  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold text-white bg-[#0D0D0D] rounded-full uppercase tracking-wider"
    >
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
      Active
    </motion.span>
  );
}

function PremiumBadge(): React.ReactElement {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="absolute -top-3 left-6 px-3 py-1.5 bg-[#0D0D0D] rounded-full flex items-center gap-2 shadow-lg"
    >
      <Sparkles className="h-3 w-3 text-amber-400" />
      <span className="text-[10px] font-semibold text-white uppercase tracking-wider">
        Recommended
      </span>
    </motion.div>
  );
}

function UsageIndicator({
  filesUsed,
  filesLimit,
  filesMessage,
  isCurrentPlan,
}: {
  filesUsed?: number;
  filesLimit: number | "unlimited";
  filesMessage?: string;
  isCurrentPlan?: boolean;
}): React.ReactElement {
  const isUnlimited = filesLimit === "unlimited";

  return (
    <div className="p-4 rounded-xl bg-[#FAFAFA] border border-[#F0F0F0] space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "w-6 h-6 rounded-lg flex items-center justify-center",
              isUnlimited ? "bg-[#3B82F6]/10" : "bg-[#0D0D0D]/5"
            )}
          >
            {isUnlimited ? (
              <Zap className="w-3.5 h-3.5 text-[#3B82F6]" />
            ) : (
              <span className="text-[10px] font-bold text-[#0D0D0D]">
                {filesUsed || 0}
              </span>
            )}
          </div>
          <span className="text-xs font-medium text-[#666]">
            {isUnlimited ? "Unlimited uploads" : "Upload usage"}
          </span>
        </div>
        <span className="text-xs font-semibold text-[#0D0D0D] tabular-nums">
          {isUnlimited ? "∞" : `${filesUsed || 0} / ${filesLimit}`}
        </span>
      </div>
      <ProgressBar
        filesUsed={filesUsed}
        filesLimit={filesLimit}
        isCurrentPlan={isCurrentPlan}
      />
      {filesMessage && (
        <p
          className={cn(
            "text-[11px]",
            isUnlimited ? "text-[#3B82F6] font-medium" : "text-[#999]"
          )}
        >
          {filesMessage}
        </p>
      )}
    </div>
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
  const showPremiumBadge = isPremium && !isCurrentPlan;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className={cn(
        "relative border rounded-2xl p-6 transition-all duration-300",
        isCurrentPlan
          ? "border-[#0D0D0D] bg-white shadow-[0_0_0_1px_rgba(13,13,13,0.05),0_4px_24px_-4px_rgba(13,13,13,0.08)]"
          : showPremiumBadge
            ? "border-[#E5E5E5] bg-gradient-to-b from-white to-[#FAFAFA] hover:border-[#0D0D0D]/20 hover:shadow-lg"
            : "border-[#E5E5E5] bg-[#FAFAFA] hover:border-[#CCCCCC] hover:bg-white"
      )}
    >
      {/* Premium badge */}
      {showPremiumBadge && <PremiumBadge />}

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            {isPremium && (
              <Crown
                className={cn(
                  "w-4 h-4",
                  isCurrentPlan ? "text-amber-500" : "text-[#999]"
                )}
              />
            )}
            <h3 className="text-base font-semibold text-[#0D0D0D]">{title}</h3>
          </div>
          {price && (
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-3xl font-semibold text-[#0D0D0D] tracking-tight tabular-nums">
                {price}
              </span>
              {priceNote && (
                <span className="text-xs text-[#999] font-medium">
                  {priceNote}
                </span>
              )}
            </div>
          )}
        </div>

        {isCurrentPlan ? (
          <PlanBadge />
        ) : onUpgrade ? (
          <SettingsButton onClick={onUpgrade}>Upgrade</SettingsButton>
        ) : null}
      </div>

      {/* Usage */}
      {filesLimit !== undefined && (
        <div className="mb-6">
          <UsageIndicator
            filesUsed={filesUsed}
            filesLimit={filesLimit}
            filesMessage={filesMessage}
            isCurrentPlan={isCurrentPlan}
          />
        </div>
      )}

      {/* Status */}
      {status && (
        <div className="mb-6 pb-6 border-b border-[#F0F0F0]">
          <div className="flex items-center gap-2">
            {isCurrentPlan && (
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
            )}
            <p
              className={cn(
                "text-sm font-medium",
                isCurrentPlan ? "text-emerald-600" : "text-[#666]"
              )}
            >
              {status}
            </p>
          </div>
          {statusNote && (
            <p className="text-xs text-[#999] mt-1 ml-4">{statusNote}</p>
          )}
        </div>
      )}

      {/* Features */}
      <div className="space-y-4">
        <p className="text-[10px] font-semibold text-[#999] uppercase tracking-[0.12em]">
          What&apos;s included
        </p>
        <ul className="space-y-3">
          {features.map((feature, index) => (
            <motion.li
              key={index}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.1 + index * 0.05 }}
              className="flex items-start gap-3 group"
            >
              <span
                className={cn(
                  "flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center mt-0.5 transition-all duration-200",
                  isCurrentPlan
                    ? "bg-[#0D0D0D] group-hover:scale-110"
                    : feature.highlighted
                      ? "bg-[#3B82F6] group-hover:scale-110"
                      : "bg-[#E5E5E5] group-hover:bg-[#D0D0D0]"
                )}
              >
                <Check
                  className={cn(
                    "w-3 h-3",
                    isCurrentPlan || feature.highlighted
                      ? "text-white"
                      : "text-[#666]"
                  )}
                  strokeWidth={2.5}
                />
              </span>
              <span
                className={cn(
                  "text-sm leading-relaxed",
                  feature.highlighted
                    ? "text-[#0D0D0D] font-medium"
                    : "text-[#666]"
                )}
              >
                {feature.text}
              </span>
            </motion.li>
          ))}
        </ul>
      </div>
    </motion.div>
  );
}
