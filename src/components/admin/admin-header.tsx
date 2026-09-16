"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AdminAccountMenu } from "@/components/admin/admin-account-menu";
import { AdminSearch } from "@/components/admin/admin-search";

/**
 * The admin area's chrome.
 *
 * Admin is not the dashboard: there is no workspace, no icon rail and nothing
 * to collapse, so the four destinations sit in the header itself rather than
 * in a sidebar that would be 64px of empty column. What it does keep is the
 * dashboard header's grammar — the wordmark, a 1×14 `--border-medium` divider
 * before the area's name, the ghost Search trigger that says the word
 * "Search", and the 26px account circle at the right edge.
 *
 * **The Requests count is plain text in the label**, "Requests · 3", not a
 * numeric badge: the design system bans numeric badges anywhere in the chrome,
 * and a count in the word reads the same without inventing a second shape.
 * Zero prints nothing at all — "Requests · 0" is a sentence about nothing.
 *
 * Nav active is the neutral wash (`--surface-subtle` + `--ink-900`), never
 * blue: blue is reserved for actions, and being where you already are is not
 * one.
 */
const TABS = [
  { href: "/admin/teams", label: "Teams" },
  { href: "/admin/requests", label: "Requests" },
  { href: "/admin/conferences", label: "Conferences" },
  { href: "/admin/uploads", label: "Uploads" },
] as const;

export function AdminHeader({
  requestsCount,
  viewer,
}: {
  /** Claims awaiting review plus open program requests, summed server-side. */
  requestsCount: number;
  viewer: {
    name: string;
    email: string;
    initials: string;
    avatarUrl: string | null;
  };
}) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 grid h-[var(--header-h)] grid-cols-[1fr_auto_1fr] items-center bg-[var(--surface-card)] px-6">
      {/* Wordmark · divider · area name */}
      <div className="flex min-w-0 items-center gap-2.5">
        <Link href="/admin" className="flex items-center">
          <Image
            src="/logos/logo4.svg"
            alt="Advantage"
            width={105}
            height={18}
            style={{ width: 105, height: 18 }}
            priority
          />
        </Link>
        <span
          aria-hidden="true"
          className="h-[14px] w-px shrink-0 bg-[var(--border-medium)]"
        />
        <span className="text-[12px] whitespace-nowrap text-[var(--ink-500)]">
          Admin
        </span>
      </div>

      {/* The four destinations */}
      <nav aria-label="Admin" className="flex items-center gap-1">
        {TABS.map((tab) => {
          const isActive =
            pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          const label =
            tab.href === "/admin/requests" && requestsCount > 0
              ? `${tab.label} · ${requestsCount}`
              : tab.label;

          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={isActive ? "page" : undefined}
              className={`flex h-[30px] items-center rounded-[var(--radius-button)] px-2.5 text-[12px] whitespace-nowrap transition-colors duration-200 ${
                isActive
                  ? "bg-[var(--surface-subtle)] font-medium text-[var(--ink-900)]"
                  : "text-[var(--ink-600)] hover:bg-[var(--surface-subtle)] hover:text-[var(--ink-900)]"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Search · account */}
      <div className="flex items-center justify-end gap-2">
        {/* T8 held this slot with a disabled twin so the bar's geometry would
            be the one the wired version landed into; T12 lands it. */}
        <AdminSearch />
        <AdminAccountMenu
          name={viewer.name}
          email={viewer.email}
          initials={viewer.initials}
          avatarUrl={viewer.avatarUrl}
        />
      </div>
    </header>
  );
}
