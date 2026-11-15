"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { AdminAccountMenu } from "@/components/admin/admin-account-menu";
import { AdminSearch } from "@/components/admin/admin-search";

/**
 * The admin area's chrome.
 *
 * Admin is not the dashboard: there is no workspace, no icon rail and nothing
 * to collapse, so the destinations sit in the header itself. What it does keep
 * is the dashboard header's grammar — the wordmark, a 1×14 `--border-medium`
 * divider before the area's name, the ghost Search trigger that says the word
 * "Search", and the 26px account circle at the right edge.
 *
 * Four tabs: Today · Labels · Matches · Teams. Requests, Messages and Ask are
 * reached from Today's rows; those three plus Conferences, Pilots, Outreach and
 * the Pay report are also in the account menu, so they stay reachable when
 * Today is empty.
 *
 * **Counts are plain text in the label**, "Matches · 3", never a numeric
 * badge: the design system bans numeric badges anywhere in the chrome. Zero
 * prints nothing — "Matches · 0" is a sentence about nothing.
 *
 * Nav active is the neutral wash (`--surface-subtle` + `--ink-900`), never
 * blue: blue is reserved for actions, and being where you already are is not
 * one.
 */
export const ADMIN_TABS = [
  { href: "/admin", label: "Today", key: "today" },
  { href: "/admin/labels", label: "Labels", key: "labels" },
  { href: "/admin/matches", label: "Matches", key: "matches" },
  { href: "/admin/teams", label: "Teams", key: "teams" },
] as const;

type TabKey = (typeof ADMIN_TABS)[number]["key"];

/** What the header prints beside each destination, computed on the server. */
export interface AdminNavCounts {
  /** Counts on the tabs; absent or 0 prints nothing. */
  tabs: Partial<Record<TabKey, number>>;
}

function withCount(label: string, count: number | undefined): string {
  return count && count > 0 ? `${label} · ${count}` : label;
}

function isActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

const TAB_CLASS =
  "flex h-[30px] items-center rounded-[var(--radius-button)] px-2.5 text-[12px] whitespace-nowrap transition-colors duration-200";
const TAB_ON = "bg-[var(--surface-subtle)] font-medium text-[var(--ink-900)]";
const TAB_OFF =
  "text-[var(--ink-600)] hover:bg-[var(--surface-subtle)] hover:text-[var(--ink-900)]";

export function AdminHeader({
  nav,
  viewer,
}: {
  nav: AdminNavCounts;
  viewer: {
    name: string;
    email: string;
    initials: string;
    avatarUrl: string | null;
  };
}) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 grid h-[var(--header-h)] shrink-0 grid-cols-[1fr_auto_1fr] items-center bg-[var(--surface-card)] px-6">
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

      {/* The destinations */}
      <nav aria-label="Admin" className="flex items-center gap-1">
        {ADMIN_TABS.map((tab) => {
          const active = isActive(pathname, tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={cn(TAB_CLASS, active ? TAB_ON : TAB_OFF)}
            >
              {withCount(tab.label, nav.tabs[tab.key])}
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
