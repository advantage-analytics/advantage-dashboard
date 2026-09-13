"use client";

import { useEffect, useRef } from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type AlertType = "success" | "error" | "info";

interface SettingsAlertProps {
  type: AlertType;
  message: string;
  onDismiss?: () => void;
  autoDismissMs?: number;
}

interface AlertConfig {
  icon: LucideIcon;
  bg: string;
  border: string;
  text: string;
  iconColor: string;
}

const alertConfig: Record<AlertType, AlertConfig> = {
  success: {
    icon: CheckCircle2,
    bg: "bg-[var(--color-success-tint-04)]",
    border: "border-[var(--color-success-tint-20)]",
    text: "text-[var(--color-success)]",
    iconColor: "text-[var(--color-success)]",
  },
  error: {
    icon: AlertCircle,
    bg: "bg-[var(--color-danger-tint-15)]",
    border: "border-[var(--color-danger-tint-15)]",
    text: "text-[var(--color-error-strong)]",
    iconColor: "text-[var(--color-error-strong)]",
  },
  info: {
    icon: Info,
    bg: "bg-[var(--color-blue-tint-08)]",
    border: "border-[var(--color-blue-tint-12)]",
    text: "text-[var(--color-blue)]",
    iconColor: "text-[var(--color-blue)]",
  },
};

const AUTO_DISMISS_TYPES: AlertType[] = ["success", "info"];

export function SettingsAlert({
  type,
  message,
  onDismiss,
  autoDismissMs = 4000,
}: SettingsAlertProps): React.ReactElement {
  const config = alertConfig[type];
  const Icon = config.icon;
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (!onDismissRef.current || !AUTO_DISMISS_TYPES.includes(type)) return;

    const timer = setTimeout(() => onDismissRef.current?.(), autoDismissMs);
    return () => clearTimeout(timer);
  }, [type, autoDismissMs]);

  const isError = type === "error";

  return (
    <div
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
      className={cn(
        "flex items-start gap-3 px-4 py-3 rounded-lg border animate-in fade-in slide-in-from-top-1 duration-200",
        config.bg,
        config.border
      )}
    >
      <Icon
        className={cn("size-3.5 flex-shrink-0 mt-0.5", config.iconColor)}
        strokeWidth={1.5}
        aria-hidden="true"
      />
      <p className={cn("text-[12px] flex-1 leading-relaxed", config.text)}>
        {message}
      </p>
      {onDismiss && (
        <button
          onClick={onDismiss}
          aria-label="Dismiss alert"
          className={cn(
            "size-4 flex-shrink-0 rounded flex items-center justify-center hover:bg-black/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-blue)]/40",
            config.text
          )}
        >
          <X className="size-3" strokeWidth={1.5} />
        </button>
      )}
    </div>
  );
}
