"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { House, Calendars, ChartColumnIncreasing, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarSeparator,
} from "@/components/ui/sidebar";

const MAIN_LINKS = [
  { name: "Home", href: "/dashboard", icon: House },
  { name: "Matches", href: "/dashboard/matches", icon: Calendars },
  {
    name: "Statistics",
    href: "/dashboard/statistics",
    icon: ChartColumnIncreasing,
  },
] as const;

const BOTTOM_LINKS = [
  { name: "Help Center", href: "/dashboard/help", icon: Info },
] as const;

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar
      collapsible="offcanvas"
      className="h-screen border-r border-gray-200 bg-white"
    >
      {/* Logo Section - 40px (pt-10) from top, 40px (mb-10) gap to nav */}
      <SidebarHeader className="px-6 pt-10 pb-0 mb-10">
        <div className="flex items-center justify-center">
          <Image
            src="/logos/logo.svg"
            alt="Advantage"
            width={141}
            height={24}
            priority
          />
        </div>
      </SidebarHeader>

      {/* Navigation - spans full height with justify-between */}
      <SidebarContent className="px-6 pb-10 justify-between">
        {/* Main Navigation */}
        <SidebarMenu className="gap-2.5">
          {MAIN_LINKS.map(({ name, href, icon: Icon }) => {
            const active =
              pathname === href ||
              (href !== "/dashboard" && pathname?.startsWith(href));

            return (
              <SidebarMenuItem key={href}>
                <SidebarMenuButton
                  asChild
                  isActive={active}
                  className={cn(
                    "h-10 px-4 py-3 rounded-lg gap-3 text-[#0D0D0D] font-normal hover:bg-[#F9F9F9] hover:text-[#0D0D0D]",
                    active && "bg-[#F9F9F9] text-[#0D0D0D] font-normal"
                  )}
                >
                  <Link href={href}>
                    <Icon className="w-3 h-3" strokeWidth={2} />
                    <span className="text-xs">{name}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>

        {/* Bottom Section */}
        <div>
          <SidebarSeparator className="mb-6 bg-gray-200" />
          <SidebarMenu className="gap-2.5">
            {BOTTOM_LINKS.map(({ name, href, icon: Icon }) => {
              const active = pathname === href || pathname?.startsWith(href);

              return (
                <SidebarMenuItem key={href}>
                  <SidebarMenuButton
                    asChild
                    isActive={active}
                    className={cn(
                      "h-10 px-4 py-3 rounded-lg gap-3 text-[#0D0D0D] font-normal hover:bg-[#F9F9F9] hover:text-[#0D0D0D]",
                      active && "bg-[#F9F9F9] text-[#0D0D0D] font-normal"
                    )}
                  >
                    <Link href={href}>
                      <Icon className="w-3 h-3" strokeWidth={2} />
                      <span className="text-xs">{name}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </div>
      </SidebarContent>
    </Sidebar>
  );
}
