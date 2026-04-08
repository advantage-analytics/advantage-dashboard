"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CreditCard, Shield, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUnsavedChanges } from "@/components/dashboard/settings/unsaved-changes-context";

type TabId = "profile" | "account" | "subscription";

const TABS = [
  {
    id: "profile" as TabId,
    label: "Profile",
    href: "/dashboard/settings/profile",
    icon: User,
  },
  {
    id: "account" as TabId,
    label: "Account",
    href: "/dashboard/settings/account",
    icon: Shield,
  },
  {
    id: "subscription" as TabId,
    label: "Subscription",
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

  const handleClick = (e: React.MouseEvent, href: string, isActive: boolean) => {
    if (isActive) return;
    if (!confirmNavigation()) {
      e.preventDefault();
      return;
    }
    e.preventDefault();
    router.push(href);
  };

  return (
    <nav className="w-full md:w-44 flex-shrink-0" aria-label="Settings">
      <div className="flex md:flex-col gap-1 overflow-x-auto pb-2 md:pb-0 -mx-2 px-2 md:mx-0 md:px-0 scrollbar-hide">
        {TABS.map(({ id, label, href, icon: Icon }) => {
          const isActive = activeTab === id;

          return (
            <Link
              key={id}
              href={href}
              onClick={(e) => handleClick(e, href, isActive)}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 h-9 pl-[13px] pr-3.5 rounded-lg text-[13px] whitespace-nowrap transition-colors duration-200",
                isActive
                  ? "bg-[#EBF2FD] text-[#3B82F6] font-medium"
                  : "text-[#8A8A8E] hover:text-[#3C3C43] hover:bg-[#F5F5F5]"
              )}
            >
              <Icon
                className={cn(
                  "size-3.5 flex-shrink-0",
                  isActive ? "text-[#3B82F6]" : "text-[#8A8A8E]"
                )}
                strokeWidth={1.5}
                aria-hidden="true"
              />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
