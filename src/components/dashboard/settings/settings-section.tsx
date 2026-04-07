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
        <p className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px]">
          {title}
        </p>
        <div className="flex-1 h-px bg-[#F3F3F3]" />
      </div>
      {children}
    </div>
  );
}
