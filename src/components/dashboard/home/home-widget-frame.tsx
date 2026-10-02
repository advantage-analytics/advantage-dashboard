import Link from "next/link";
import type { ReactNode } from "react";

/** The real card chrome, shared by its pending, empty, error and ready bodies. */
export function HomeWidgetFrame({
  title,
  href,
  action,
  children,
  className = "",
}: {
  title: string;
  href?: string;
  action?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-label={title}
      className={`surface-card min-w-0 p-[var(--pad-card)] ${className}`}
    >
      <div className="flex items-center gap-2.5">
        <h2 className="eyebrow">{title}</h2>
        <div className="flex-1" />
        {href && action && (
          <Link
            href={href}
            className="text-[11px] whitespace-nowrap text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)]"
          >
            {action}
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}
