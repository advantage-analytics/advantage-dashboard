"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Home, Calendar, BarChart3, Settings, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import { useRef, useEffect, useCallback } from "react";

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
  { name: "Settings", href: "/dashboard/settings", icon: Settings },
  { name: "Help Center", href: "/dashboard/help", icon: HelpCircle },
] as const;

const NAV_ITEM_CLASS =
  "h-9 rounded-lg text-[#8A8A8E] font-normal hover:bg-[#F5F5F5] hover:text-[#3C3C43] transition-colors duration-200 pl-[13px] pr-3.5 py-3 gap-3 [&>svg]:size-3.5 data-[active=true]:bg-[#EBF2FD] data-[active=true]:text-[#3B82F6]";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-rows-[1fr] group-data-[collapsible=icon]:grid-rows-[0fr] mb-3 group-data-[collapsible=icon]:mb-0 transition-[grid-template-rows,margin] duration-300 ease-out">
      <div className="overflow-hidden">
        <p className="text-[10px] font-medium uppercase tracking-[2.5px] text-[#AAAAAA] leading-[16px] pl-[13px] opacity-100 group-data-[collapsible=icon]:opacity-0 transition-opacity duration-300 ease-out">
          {children}
        </p>
      </div>
    </div>
  );
}

function NavItem({
  name,
  href,
  icon: Icon,
  active,
}: {
  name: string;
  href: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement> & { strokeWidth?: number }>;
  active: boolean;
}) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={active}
        tooltip={name}
        className={cn(
          NAV_ITEM_CLASS,
          active && "hover:bg-[#3B82F6]/10 hover:text-[#3B82F6]"
        )}
      >
        <Link href={href} aria-current={active ? "page" : undefined}>
          <Icon
            className={cn(
              "w-3.5 h-3.5 shrink-0 transition-colors duration-200",
              active && "text-[#3B82F6]"
            )}
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <span className="text-[13px] whitespace-nowrap group-data-[collapsible=icon]:opacity-0 group-data-[collapsible=icon]:w-0 transition-opacity duration-300 ease-out">
            {name}
          </span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export function AppSidebar() {
  const pathname = usePathname();
  const mainNavRef = useRef<HTMLUListElement>(null);
  const bottomNavRef = useRef<HTMLUListElement>(null);

  const handleArrowNav = useCallback((event: KeyboardEvent) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;

    const mainItems = mainNavRef.current
      ? Array.from(mainNavRef.current.querySelectorAll<HTMLElement>("a[href]"))
      : [];
    const bottomItems = bottomNavRef.current
      ? Array.from(bottomNavRef.current.querySelectorAll<HTMLElement>("a[href]"))
      : [];
    const allItems = [...mainItems, ...bottomItems];

    const index = allItems.indexOf(document.activeElement as HTMLElement);
    if (index === -1) return;

    event.preventDefault();
    if (event.key === "ArrowDown") {
      allItems[(index + 1) % allItems.length].focus();
    } else {
      allItems[(index - 1 + allItems.length) % allItems.length].focus();
    }
  }, []);

  useEffect(() => {
    const mainEl = mainNavRef.current;
    const bottomEl = bottomNavRef.current;
    mainEl?.addEventListener("keydown", handleArrowNav);
    bottomEl?.addEventListener("keydown", handleArrowNav);
    return () => {
      mainEl?.removeEventListener("keydown", handleArrowNav);
      bottomEl?.removeEventListener("keydown", handleArrowNav);
    };
  }, [handleArrowNav]);

  return (
    <Sidebar
      collapsible="icon"
      className="h-screen border-r border-[#F0F0F0] bg-white"
    >
      {/* Logo Section - 40px (pt-10) from top, 40px (mb-10) gap to nav */}
      <SidebarHeader className="pt-10 pb-0 mb-10 px-4">
        <Link href="/dashboard" className="relative flex items-center h-6">
          {/* Expanded logo – fades out fast when collapsing, fades in slow when expanding */}
          <Image
            src="/logos/logo4.svg"
            alt="Advantage"
            width={141}
            height={24}
            style={{ width: 141, height: 24 }}
            priority
            className="absolute left-1/2 -translate-x-1/2 opacity-100 group-data-[collapsible=icon]:opacity-0 transition-opacity duration-800 delay-150 ease-in group-data-[collapsible=icon]:duration-0 group-data-[collapsible=icon]:delay-0 group-data-[collapsible=icon]:ease-out"
          />
          {/* Collapsed logo – fades in slow when collapsing, fades out fast when expanding */}
          <Image
            src="/logos/logo3.svg"
            alt="Advantage"
            width={30}
            height={21}
            style={{ width: 30, height: 21 }}
            priority
            className="absolute left-1/2 -translate-x-1/2 opacity-0 group-data-[collapsible=icon]:opacity-100 transition-opacity duration-0 ease-out group-data-[collapsible=icon]:duration-800 group-data-[collapsible=icon]:delay-150 group-data-[collapsible=icon]:ease-in"
          />
        </Link>
      </SidebarHeader>

      {/* Navigation - spans full height with justify-between */}
      <SidebarContent className="pb-10 justify-between px-4">
        {/* Main Navigation */}
        <div>
          <SectionLabel>Menu</SectionLabel>
          <SidebarMenu className="gap-1.5" ref={mainNavRef}>
            {MAIN_LINKS.map(({ name, href, icon }) => {
              const active =
                pathname === href ||
                (href !== "/dashboard" && pathname?.startsWith(href));

              return (
                <NavItem
                  key={href}
                  name={name}
                  href={href}
                  icon={icon}
                  active={!!active}
                />
              );
            })}
          </SidebarMenu>
        </div>

        {/* Bottom Section */}
        <div>
          <SectionLabel>Support</SectionLabel>
          <SidebarMenu className="gap-1.5" ref={bottomNavRef}>
            {BOTTOM_LINKS.map(({ name, href, icon }) => {
              const active = pathname === href || pathname?.startsWith(href);

              return (
                <NavItem
                  key={href}
                  name={name}
                  href={href}
                  icon={icon}
                  active={!!active}
                />
              );
            })}
          </SidebarMenu>
        </div>
      </SidebarContent>
    </Sidebar>
  );
}
