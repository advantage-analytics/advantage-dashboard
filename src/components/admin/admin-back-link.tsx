import { ChevronLeft } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * The "‹ Teams" / "‹ Conferences" / "‹ Labels" way back every admin detail
 * page keeps at its top left. `className` is for the caller's layout (a
 * `self-start` in a column), never for restyling it.
 */
export function AdminBackLink({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-1 text-[12px] text-[var(--ink-600)] transition-colors duration-200 hover:text-[var(--ink-900)]",
        className,
      )}
    >
      <ChevronLeft aria-hidden="true" className="size-3" strokeWidth={1.75} />
      {children}
    </Link>
  );
}
