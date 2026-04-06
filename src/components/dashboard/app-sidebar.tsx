"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Home, Calendar, BarChart3, HelpCircle } from "lucide-react";
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
  { name: "Home", href: "/dashboard", icon: Home },
  { name: "Matches", href: "/dashboard/matches", icon: Calendar },
  {
    name: "Statistics",
    href: "/dashboard/statistics",
    icon: BarChart3,
  },
] as const;

const BOTTOM_LINKS = [
  { name: "Help Center", href: "/dashboard/help", icon: HelpCircle },
] as const;

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar
      collapsible="icon"
      className="h-screen border-r border-[#F0F0F0] bg-white"
    >
      {/* Logo Section - 40px (pt-10) from top, 40px (mb-10) gap to nav */}
      <SidebarHeader className="pt-10 pb-0 mb-10 px-4">
        <a href="https://advantage-analytics.com" className="relative flex items-center h-6">
          {/* Expanded logo – fades out fast when collapsing, fades in slow when expanding */}
          <Image
            src="/logos/logo4.svg"
            alt="Advantage"
            width={141}
            height={24}
            priority
            className="absolute left-1/2 -translate-x-1/2 opacity-100 group-data-[collapsible=icon]:opacity-0 transition-opacity duration-800 delay-150 ease-in group-data-[collapsible=icon]:duration-0 group-data-[collapsible=icon]:delay-0 group-data-[collapsible=icon]:ease-out"
          />
          {/* Collapsed logo – fades in slow when collapsing, fades out fast when expanding */}
          <Image
            src="/logos/logo3.svg"
            alt="Advantage"
            width={30}
            height={21}
            priority
            className="absolute left-1/2 -translate-x-1/2 opacity-0 group-data-[collapsible=icon]:opacity-100 transition-opacity duration-0 ease-out group-data-[collapsible=icon]:duration-800 group-data-[collapsible=icon]:delay-150 group-data-[collapsible=icon]:ease-in"
          />
        </a>
      </SidebarHeader>

      {/* Navigation - spans full height with justify-between */}
      <SidebarContent className="pb-10 justify-between px-4">
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
                  tooltip={name}
                  className={cn(
                    "h-9 rounded-lg text-[#8A8A8E] font-normal hover:bg-[#F5F5F5] hover:text-[#3C3C43] transition-colors duration-200 pl-[13px] pr-3.5 py-3 gap-3 [&>svg]:size-4",
                    active && "bg-[#F5F5F5] text-[#0D0D0D] font-medium hover:text-[#0D0D0D]",
                  )}
                >
                  <Link href={href}>
                    <Icon className="w-4 h-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
                    <span className="text-[13px] whitespace-nowrap group-data-[collapsible=icon]:opacity-0 group-data-[collapsible=icon]:w-0 transition-opacity duration-300 ease-out">
                      {name}
                    </span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>

        {/* Bottom Section */}
        <div>
          <SidebarSeparator className="mb-6 bg-[#F0F0F0] mx-0" />
          <SidebarMenu className="gap-2.5">
            {BOTTOM_LINKS.map(({ name, href, icon: Icon }) => {
              const active = pathname === href || pathname?.startsWith(href);

              return (
                <SidebarMenuItem key={href}>
                  <SidebarMenuButton
                    asChild
                    isActive={active}
                    tooltip={name}
                    className={cn(
                      "h-9 rounded-lg text-[#8A8A8E] font-normal hover:bg-[#F5F5F5] hover:text-[#3C3C43] transition-colors duration-200 pl-[13px] pr-3.5 py-3 gap-3 [&>svg]:size-4",
                      active && "bg-[#F5F5F5] text-[#0D0D0D] font-medium hover:text-[#0D0D0D]",
                    )}
                  >
                    <Link href={href}>
                      <Icon className="w-4 h-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
                      <span className="text-[13px] whitespace-nowrap group-data-[collapsible=icon]:opacity-0 group-data-[collapsible=icon]:w-0 transition-opacity duration-300 ease-out">
                        {name}
                      </span>
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
