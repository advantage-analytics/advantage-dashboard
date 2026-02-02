"use client";

import { cn } from "@/lib/utils";

interface SettingsSectionProps {
  title: string;
  children: React.ReactNode;
  className?: string;
}

export function SettingsSection({
  title,
  children,
  className,
}: SettingsSectionProps): React.ReactElement {
  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-center gap-3">
        <p className="text-[10px] font-semibold text-[#999] uppercase tracking-[0.1em]">
          {title}
        </p>
        <div className="flex-1 h-px bg-[#F0F0F0]" />
      </div>
      {children}
    </div>
  );
}
