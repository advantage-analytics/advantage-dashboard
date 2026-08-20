import Link from "next/link";
import { ChevronRight } from "lucide-react";

/**
 * The frame every create screen and event page shares — 25b, 25c, 25e, 25f.
 *
 * A 44px crumb bar, a scrolling body, and a footer that only exists when there
 * is something to commit. Written once because the three create forms differ in
 * their middle and nowhere else, and three hand-built 44px bars is three
 * chances for one of them to be 46.
 */
export function EventShell({
  crumb,
  trail,
  note,
  footer,
  children,
}: {
  /** The last crumb — the page you are on. */
  crumb: string;
  /** Everything before it. Defaults to Schedule. */
  trail?: { label: string; href: string }[];
  /** Right-aligned in the crumb bar — "Created just now", "Draft saved". */
  note?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const crumbs = trail ?? [{ label: "Schedule", href: "/dashboard/team/schedule" }];

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col bg-[var(--surface-card)]">
      <div className="flex h-11 shrink-0 items-center gap-2.5 border-b border-[var(--border-hairline)] px-6">
        {crumbs.map((entry) => (
          <span key={entry.href} className="flex items-center gap-2.5">
            <Link
              href={entry.href}
              className="text-[12px] text-[var(--ink-500)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--ink-900)]"
            >
              {entry.label}
            </Link>
            <ChevronRight
              strokeWidth={1.5}
              className="size-3 text-[var(--ink-300)]"
            />
          </span>
        ))}
        <span className="text-[12px] text-[var(--ink-900)]">{crumb}</span>
        {note ? (
          <>
            <div className="flex-1" />
            <span className="text-[11px] text-[var(--ink-500)]">{note}</span>
          </>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-12 pb-8 pt-[26px]">
        {children}
      </div>

      {footer ? (
        <div className="flex shrink-0 items-center gap-3 border-t border-[var(--border-hairline)] px-12 pb-[22px] pt-4">
          {footer}
        </div>
      ) : null}
    </div>
  );
}
