"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { useWorkspace } from "@/components/dashboard/workspace-provider";
import { WorkspaceSwitcher } from "@/components/dashboard/workspace-switcher";
import { useRequestLogout } from "@/components/dashboard/logout-dialog";
import {
  activeHref,
  PERSONAL_NAV,
  PERSONAL_BOTTOM,
  TEAM_NAV,
  TEAM_BOTTOM,
  type NavLink,
} from "@/lib/dashboard/nav";
import { useRef, useEffect, useCallback } from "react";

/**
 * Active nav is a muted grey wash, not the blue it used to be.
 *
 * Deliberate, and carried over from the v2 design, which overrides the design
 * system's own blue-soft treatment here. Blue stays reserved for actions; where
 * you already are is not an action.
 */
const NAV_ITEM_CLASS =
  "h-9 rounded-lg text-[var(--nav-fg)] font-normal hover:bg-[var(--surface-subtle)] hover:text-[var(--nav-fg-hover)] transition-colors duration-200 pl-[13px] pr-3.5 py-3 gap-3 [&>svg]:size-3.5 data-[active=true]:bg-[var(--surface-subtle)] data-[active=true]:text-[var(--ink-900)] data-[active=true]:font-medium";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-rows-[1fr] group-data-[collapsible=icon]:grid-rows-[0fr] mb-3 group-data-[collapsible=icon]:mb-0 transition-[grid-template-rows,margin] duration-300 ease-out">
      <div className="overflow-hidden">
        <p className="text-[10px] font-medium uppercase tracking-[2.5px] text-[var(--ink-400)] leading-[16px] pl-[13px] opacity-100 group-data-[collapsible=icon]:opacity-0 transition-opacity duration-300 ease-out">
          {children}
        </p>
      </div>
    </div>
  );
}

function NavItem({ name, href, icon: Icon, active }: NavLink & { active: boolean }) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={active}
        tooltip={name}
        className={NAV_ITEM_CLASS}
      >
        <Link href={href} aria-current={active ? "page" : undefined}>
          <Icon
            className="w-3.5 h-3.5 shrink-0 transition-colors duration-200"
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

/**
 * The viewer, pinned to the bottom of the rail.
 *
 * Sign out is here and in the header profile menu both — the v2 design puts it
 * in each — but they share one confirmation via `useRequestLogout`.
 */
function ViewerFooter() {
  const { viewer } = useWorkspace();
  const requestLogout = useRequestLogout();

  return (
    <div className="mt-2.5 flex items-center gap-2.5 border-t border-[var(--border-hairline)] px-2.5 pb-1 pt-3">
      <Link
        href="/dashboard/settings/profile"
        className="flex min-w-0 flex-1 items-center gap-2.5 rounded-[6px] transition-opacity duration-150 hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--blue-ring-40)] group-data-[collapsible=icon]:flex-none group-data-[collapsible=icon]:justify-center"
      >
        <span
          aria-hidden="true"
          className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--surface-subtle)] text-[9px] font-medium text-[var(--ink-700)]"
        >
          {viewer.initials}
        </span>
        <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--ink-700)] group-data-[collapsible=icon]:hidden">
          {viewer.name}
        </span>
      </Link>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={requestLogout}
            aria-label="Log out"
            className="flex size-6 shrink-0 items-center justify-center rounded-[6px] text-[var(--ink-400)] transition-colors duration-150 hover:bg-[var(--surface-subtle)] hover:text-[var(--ink-700)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--blue-ring-40)] cursor-pointer group-data-[collapsible=icon]:hidden"
          >
            <LogOut className="size-[13px]" strokeWidth={1.5} aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={4}>
          Log out
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

export function AppSidebar() {
  const pathname = usePathname();
  const { active } = useWorkspace();
  const mainNavRef = useRef<HTMLUListElement>(null);
  const bottomNavRef = useRef<HTMLUListElement>(null);

  const isTeam = active.kind === "team";
  const mainLinks = isTeam ? TEAM_NAV : PERSONAL_NAV;
  const bottomLinks = isTeam ? TEAM_BOTTOM : PERSONAL_BOTTOM;

  // Resolved across both menus at once, so the deepest match wins even when it
  // sits in the other group.
  const current = activeHref(pathname, [...mainLinks, ...bottomLinks]);

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
      className="h-screen border-r border-[var(--border-hairline)] bg-[var(--surface-card)]"
    >
      {/* The switcher takes the wordmark's place — which workspace you are in
          matters more, on every screen, than the product's own name. */}
      <SidebarHeader className="px-3 pb-0 pt-4">
        <WorkspaceSwitcher />
      </SidebarHeader>

      <SidebarContent className="justify-between px-3 pb-3 pt-10">
        <div>
          <SectionLabel>Menu</SectionLabel>
          <SidebarMenu className="gap-1.5" ref={mainNavRef}>
            {mainLinks.map((link) => (
              <NavItem key={link.href} {...link} active={current === link.href} />
            ))}
          </SidebarMenu>
        </div>

        <div>
          <SidebarMenu className="gap-1.5" ref={bottomNavRef}>
            {bottomLinks.map((link) => (
              <NavItem key={link.href} {...link} active={current === link.href} />
            ))}
          </SidebarMenu>
          <ViewerFooter />
        </div>
      </SidebarContent>
    </Sidebar>
  );
}
