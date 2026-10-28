"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { FloatMenu } from "@/components/ui/float-menu";
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
 * Five tabs and a More menu (Admin Console canvas, "updated" boards): Today ·
 * Matches · Teams · Requests · Labels · More. More holds the four surfaces an
 * admin visits less often — Conferences, Pilots, Outreach, Ask — each with a
 * one-line description and its count. On one of those four pages the More
 * button carries that page's name and the active wash, so the header still
 * says where you are.
 *
 * **Counts are plain text in the label**, "Requests · 3", never a numeric
 * badge: the design system bans numeric badges anywhere in the chrome. Zero
 * prints nothing — "Requests · 0" is a sentence about nothing.
 *
 * Nav active is the neutral wash (`--surface-subtle` + `--ink-900`), never
 * blue: blue is reserved for actions, and being where you already are is not
 * one.
 */
const TABS = [
  { href: "/admin", label: "Today", key: "today" },
  { href: "/admin/matches", label: "Matches", key: "matches" },
  { href: "/admin/teams", label: "Teams", key: "teams" },
  { href: "/admin/requests", label: "Requests", key: "requests" },
  { href: "/admin/labels", label: "Labels", key: "labels" },
] as const;

const MORE = [
  { href: "/admin/conferences", label: "Conferences", key: "conferences" },
  { href: "/admin/pilots", label: "Pilots", key: "pilots" },
  { href: "/admin/outreach", label: "Outreach", key: "outreach" },
  { href: "/admin/ask", label: "Ask", key: "ask" },
] as const;

type TabKey = (typeof TABS)[number]["key"];
type MoreKey = (typeof MORE)[number]["key"];

/** What the header prints beside each destination, computed on the server. */
export interface AdminNavCounts {
  /** Counts on the five tabs; absent or 0 prints nothing. */
  tabs: Partial<Record<TabKey, number>>;
  /** Each More row's count and its one-line description. */
  more: Partial<Record<MoreKey, { count?: number; sub?: string }>>;
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
  const [moreOpen, setMoreOpen] = useState(false);
  const activeMore = MORE.find((item) => isActive(pathname, item.href));
  const moreTotal = MORE.reduce(
    (sum, item) => sum + (nav.more[item.key]?.count ?? 0),
    0,
  );
  const moreLabel = activeMore
    ? activeMore.label
    : withCount("More", moreTotal);

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

      {/* The destinations */}
      <nav aria-label="Admin" className="flex items-center gap-1">
        {TABS.map((tab) => {
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

        <FloatMenu
          open={moreOpen}
          onOpenChange={setMoreOpen}
          label="More"
          align="end"
          sideOffset={6}
          width={240}
          trigger={
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={moreOpen}
              aria-current={activeMore ? "page" : undefined}
              className={cn(
                TAB_CLASS,
                "cursor-pointer gap-1",
                activeMore || moreOpen ? TAB_ON : TAB_OFF,
                !activeMore && "font-normal",
              )}
            >
              {moreLabel}
              <ChevronDown
                className={cn(
                  "size-3 transition-transform duration-200",
                  moreOpen && "rotate-180",
                )}
                strokeWidth={1.8}
                aria-hidden="true"
              />
            </button>
          }
        >
          {MORE.map((item) => {
            const entry = nav.more[item.key];
            return (
              <Link
                key={item.href}
                href={item.href}
                role="menuitem"
                aria-current={
                  isActive(pathname, item.href) ? "page" : undefined
                }
                onClick={() => setMoreOpen(false)}
                className="flex min-h-10 items-center gap-2.5 rounded-[7px] px-2.5 py-[5px] transition-colors duration-100 hover:bg-[var(--surface-subtle)] focus-visible:bg-[var(--surface-subtle)] focus-visible:outline-none"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[13px] text-[var(--ink-900)]">
                    {item.label}
                  </span>
                  {entry?.sub ? (
                    <span className="truncate text-[11px] text-[var(--ink-600)]">
                      {entry.sub}
                    </span>
                  ) : null}
                </span>
                {entry?.count ? (
                  <span className="text-[12px] font-medium text-[var(--ink-700)] tabular-nums">
                    {entry.count}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </FloatMenu>
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
