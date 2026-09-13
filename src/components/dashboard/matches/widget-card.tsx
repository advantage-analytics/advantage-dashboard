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
        "overflow-hidden rounded-[14px] border border-[#F3F3F3] bg-white shadow-[0px_4px_16px_0px_rgba(0,0,0,0.1)]",
        className,
      )}
    >
      <div className="flex h-[47px] items-center justify-between px-6">
        <p className="text-[10px] font-medium tracking-[2.5px] text-[#AAAAAA] uppercase">
          {header}
        </p>
        <div className="flex items-center gap-4">
          {secondaryLabel && (
            <p className="text-[10px] font-normal tracking-[1px] text-[#AAAAAA] uppercase">
              {secondaryLabel}
            </p>
          )}
          {actionLabel && actionHref && (
            <Link
              href={actionHref}
              className="text-[10px] font-medium tracking-[2px] text-[#3B82F6] uppercase transition-colors duration-200 hover:text-[#2563EB]"
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
