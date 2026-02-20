"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CreditCard, Shield, User } from "lucide-react";
import { cn } from "@/lib/utils";

type TabId = "profile" | "account" | "subscription";

const TABS = [
  {
    id: "profile" as TabId,
    label: "Profile",
    description: "Personal info",
    href: "/dashboard/settings/profile",
    icon: User,
  },
  {
    id: "account" as TabId,
    label: "Account",
    description: "Security",
    href: "/dashboard/settings/account",
    icon: Shield,
  },
  {
    id: "subscription" as TabId,
    label: "Subscription",
    description: "Billing",
    href: "/dashboard/settings/subscription",
    icon: CreditCard,
  },
] as const;

export function SettingsNavigation(): React.ReactElement {
  const pathname = usePathname();

  const activeTab = TABS.find((tab) => pathname?.includes(tab.id))?.id ?? "profile";

  return (
    <nav className="w-full md:w-52 flex-shrink-0">
      <div className="flex md:flex-col gap-1.5 overflow-x-auto pb-2 md:pb-0 -mx-2 px-2 md:mx-0 md:px-0 scrollbar-hide">
        {TABS.map(({ id, label, description, href, icon: Icon }) => {
          const isActive = activeTab === id;

          return (
            <Link
              key={id}
              href={href}
              className={cn(
                "group flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 whitespace-nowrap",
                isActive
                  ? "bg-[#0D0D0D] text-white"
                  : "text-[#666] hover:bg-[#F5F5F5] hover:text-[#0D0D0D]"
              )}
            >
              <span
                className={cn(
                  "flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-colors",
                  isActive
                    ? "bg-white/10"
                    : "bg-[#F0F0F0] group-hover:bg-[#E8E8E8]"
                )}
              >
                <Icon
                  className={cn(
                    "h-4 w-4",
                    isActive ? "text-white" : "text-[#666]"
                  )}
                />
              </span>
              <div className="flex flex-col">
                <span className="text-xs font-medium">{label}</span>
                <span
                  className={cn(
                    "text-[10px] hidden md:block",
                    isActive ? "text-white/60" : "text-[#999]"
                  )}
                >
                  {description}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
