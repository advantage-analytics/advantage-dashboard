"use client";

import { cn } from "@/lib/utils";

interface SettingsSectionProps {
  title: string;
  children: React.ReactNode;
  className?: string;
  titleClassName?: string;
}

export function SettingsSection({
  title,
  children,
  className,
  titleClassName,
}: SettingsSectionProps): React.ReactElement {
  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-center gap-3">
        <p
          className={cn(
            "text-[10px] font-medium uppercase tracking-[2.5px]",
            titleClassName || "text-[#AAAAAA]"
          )}
        >
          {title}
        </p>
        <div className="flex-1 h-px bg-[#F3F3F3]" />
      </div>
      {children}
    </div>
  );
}
