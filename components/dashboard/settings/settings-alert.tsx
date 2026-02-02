"use client";

import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type AlertType = "success" | "error" | "info";

interface SettingsAlertProps {
  type: AlertType;
  message: string;
  onDismiss?: () => void;
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
    bg: "bg-emerald-50",
    border: "border-emerald-100",
    text: "text-emerald-700",
    iconColor: "text-emerald-500",
  },
  error: {
    icon: AlertCircle,
    bg: "bg-red-50",
    border: "border-red-100",
    text: "text-red-700",
    iconColor: "text-red-500",
  },
  info: {
    icon: Info,
    bg: "bg-blue-50",
    border: "border-blue-100",
    text: "text-blue-700",
    iconColor: "text-blue-500",
  },
};

export function SettingsAlert({ type, message, onDismiss }: SettingsAlertProps): React.ReactElement {
  const config = alertConfig[type];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        "flex items-start gap-3 px-4 py-3 rounded-lg border animate-in fade-in slide-in-from-top-1 duration-200",
        config.bg,
        config.border
      )}
    >
      <Icon className={cn("h-4 w-4 flex-shrink-0 mt-0.5", config.iconColor)} />
      <p className={cn("text-xs flex-1", config.text)}>{message}</p>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className={cn(
            "h-4 w-4 flex-shrink-0 rounded hover:bg-black/5 transition-colors",
            config.text
          )}
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
