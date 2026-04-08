import Link from "next/link";
import { cn } from "@/lib/utils";

interface WidgetCardProps {
  header: string;
  actionLabel?: string;
  actionHref?: string;
  secondaryLabel?: string;
  children: React.ReactNode;
  className?: string;
  noPadding?: boolean;
}

export function WidgetCard({
  header,
  actionLabel,
  actionHref,
  secondaryLabel,
  children,
  className,
  noPadding = false,
}: WidgetCardProps) {
  return (
    <div
      className={cn(
        "bg-white border border-[#F3F3F3] rounded-[14px] shadow-[0px_4px_16px_0px_rgba(0,0,0,0.1)] overflow-hidden",
        className
      )}
    >
      <div className="flex items-center justify-between h-[47px] px-6">
        <p className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px]">
          {header}
        </p>
        <div className="flex items-center gap-4">
          {secondaryLabel && (
            <p className="text-[10px] font-normal text-[#AAAAAA] uppercase tracking-[1px]">
              {secondaryLabel}
            </p>
          )}
          {actionLabel && actionHref && (
            <Link
              href={actionHref}
              className="text-[10px] font-medium text-[#3B82F6] uppercase tracking-[2px] hover:text-[#2563EB] transition-colors duration-200"
            >
              {actionLabel}
            </Link>
          )}
        </div>
      </div>
      <div className={noPadding ? "" : "px-6 pb-5"}>{children}</div>
    </div>
  );
}
