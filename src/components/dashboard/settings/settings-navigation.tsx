"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CreditCard, Shield, User } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUnsavedChanges } from "@/components/dashboard/settings/unsaved-changes-context";

type TabId = "profile" | "account" | "subscription";

interface Tab {
  id: TabId;
  index: string;
  label: string;
  description: string;
  href: string;
  icon: LucideIcon;
}

const TABS: readonly Tab[] = [
  {
    id: "profile",
    index: "01",
    label: "Profile",
    description: "Identity & tennis info",
    href: "/dashboard/settings/profile",
    icon: User,
  },
  {
    id: "account",
    index: "02",
    label: "Account",
    description: "Login & security",
    href: "/dashboard/settings/account",
    icon: Shield,
  },
  {
    id: "subscription",
    index: "03",
    label: "Subscription",
    description: "Plan & billing",
    href: "/dashboard/settings/subscription",
    icon: CreditCard,
  },
] as const;

export function SettingsNavigation(): React.ReactElement {
  const pathname = usePathname();
  const router = useRouter();
  const { confirmNavigation } = useUnsavedChanges();

  const activeTab =
    TABS.find((tab) => pathname?.includes(tab.id))?.id ?? "profile";

  const handleClick = (
    e: React.MouseEvent,
    href: string,
    isActive: boolean
  ) => {
    if (isActive) return;
    if (!confirmNavigation()) {
      e.preventDefault();
      return;
    }
    e.preventDefault();
    router.push(href);
  };

  return (
    <nav
      className="w-full md:w-52 flex-shrink-0 md:sticky md:top-6 md:self-start"
      aria-label="Settings"
    >
      <p className="hidden md:block text-[10px] font-medium uppercase tracking-[2.5px] text-[var(--color-ink-400)] mb-4">
        Sections
      </p>

      <div className="flex md:flex-col gap-1 overflow-x-auto pb-2 md:pb-0 -mx-2 px-2 md:mx-0 md:px-0 scrollbar-hide">
        {TABS.map(({ id, index, label, description, href, icon: Icon }) => {
          const isActive = activeTab === id;

          return (
            <Link
              key={id}
              href={href}
              onClick={(e) => handleClick(e, href, isActive)}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "group relative flex items-center gap-3 transition-colors duration-200 whitespace-nowrap md:whitespace-normal",
                "py-2.5 pl-4 pr-3",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-blue)]/30 focus-visible:rounded-[6px]"
              )}
            >
              {/* Left rail — only visible when active */}
              <span
                aria-hidden="true"
                className={cn(
                  "absolute left-0 top-1/2 -translate-y-1/2 w-[2px] rounded-full transition-all duration-200",
                  isActive
                    ? "h-6 bg-[var(--color-blue)]"
                    : "h-0 bg-transparent group-hover:h-3 group-hover:bg-[var(--color-ink-200)]"
                )}
              />

              {/* Tabular index — magazine TOC */}
              <span
                className={cn(
                  "hidden md:inline-block text-[10px] font-medium tracking-[1px] tabular-nums w-5 transition-colors duration-200",
                  isActive
                    ? "text-[var(--color-blue)]"
                    : "text-[var(--color-ink-300)] group-hover:text-[var(--color-ink-500)]"
                )}
                aria-hidden="true"
              >
                {index}
              </span>

              <Icon
                className={cn(
                  "size-3.5 flex-shrink-0 transition-colors duration-200 md:hidden",
                  isActive
                    ? "text-[var(--color-blue)]"
                    : "text-[var(--color-ink-400)] group-hover:text-[var(--color-ink-700)]"
                )}
                strokeWidth={1.5}
                aria-hidden="true"
              />

              <span className="flex flex-col min-w-0 leading-tight flex-1">
                <span
                  className={cn(
                    "text-[13px] tracking-[-0.05px] transition-colors duration-200",
                    isActive
                      ? "text-[var(--color-ink-900)] font-medium"
                      : "text-[var(--color-ink-700)] group-hover:text-[var(--color-ink-900)]"
                  )}
                >
                  {label}
                </span>
                <span
                  className={cn(
                    "hidden md:block text-[11px] mt-0.5 transition-colors duration-200",
                    isActive ? "text-[var(--color-ink-400)]" : "text-[var(--color-ink-400)]/80"
                  )}
                >
                  {description}
                </span>
              </span>

            </Link>
          );
        })}
      </div>

      {/* Footer hint — mirrors auth subtitle voice */}
      <div className="hidden md:block mt-8 pl-4">
        <p className="text-[11px] text-[var(--color-ink-400)] leading-[1.55]">
          Need help?{" "}
          <Link
            href="/dashboard/help"
            className="text-[var(--color-blue)] hover:text-[var(--color-blue-hover)] transition-colors"
          >
            Visit support
          </Link>
        </p>
      </div>
    </nav>
  );
}
