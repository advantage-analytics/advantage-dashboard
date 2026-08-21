"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { PanelLeftClose, PanelLeftOpen, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/components/dashboard/workspace-provider";
import { WorkspaceRow } from "@/components/dashboard/sidebar/workspace-row";
import { RailItem } from "@/components/dashboard/sidebar/rail-item";
import {
  useSidebarState,
  RAIL_WIDTH,
  PANEL_WIDTH,
} from "@/components/dashboard/sidebar/sidebar-state";
import { useRequestLogout } from "@/components/dashboard/logout-dialog";
import {
  activeHref,
  PERSONAL_NAV,
  PERSONAL_BOTTOM,
  TEAM_NAV,
  TEAM_BOTTOM,
} from "@/lib/dashboard/nav";

/**
 * Two committed widths: a 64px icon rail and a 232px panel.
 *
 * The toggle is the committed control — one persistent state, no hover
 * surprises. Content reflows with the panel, and that is the trade the button
 * makes versus a hover peek: it only happens on a deliberate click, so a match
 * report, a KPI strip or a chart never resizes under the cursor while you are
 * reading it.
 *
 * Icons sit in a fixed 40px column pinned to the panel's left padding at BOTH
 * widths, so nothing shifts horizontally — only the panel edge travels, and the
 * labels fade in behind it.
 */
export function AppSidebar() {
  const pathname = usePathname();
  const { active } = useWorkspace();
  const requestLogout = useRequestLogout();
  const { expanded, toggle } = useSidebarState();

  const isTeam = active.kind === "team";
  const mainLinks = isTeam ? TEAM_NAV : PERSONAL_NAV;
  const bottomLinks = isTeam ? TEAM_BOTTOM : PERSONAL_BOTTOM;
  const current = activeHref(pathname, [...mainLinks, ...bottomLinks]);

  return (
    <nav
      aria-label="Main"
      className={cn(
        "relative z-40 flex shrink-0 flex-col overflow-hidden p-3",
        "border-r border-[var(--border-hairline)] bg-[var(--surface-card)]",
        "transition-[width] duration-200 ease-[var(--ease-primary)] motion-reduce:transition-none"
      )}
      style={{
        width: expanded ? PANEL_WIDTH : RAIL_WIDTH,
        // Collapsing reverses the order: the labels leave in the first 80ms and
        // only then does the edge travel, so text never clips mid-word.
        transitionDelay: expanded ? "0ms" : "80ms",
      }}
    >
      <WorkspaceRow expanded={expanded} />

      <div className="h-6 shrink-0" />

      <div className="flex flex-col gap-1">
        {mainLinks.map((link) => (
          <RailItem
            key={link.href}
            href={link.href}
            label={link.name}
            icon={link.icon}
            active={current === link.href}
            expanded={expanded}
          />
        ))}
      </div>

      <div className="flex-1" />

      <div className="flex flex-col gap-1">
        {bottomLinks.map((link) => (
          <RailItem
            key={link.href}
            href={link.href}
            label={link.name}
            icon={link.icon}
            active={current === link.href}
            expanded={expanded}
          />
        ))}

        {/* The toggle is the last row of the bottom group at BOTH widths, so it
            never moves relative to Settings and Help. Icon and label both flip;
            the icons cross-fade in place, with no glyph rotation. */}
        <RailItem
          as="button"
          label={expanded ? "Collapse" : "Expand sidebar"}
          icon={expanded ? PanelLeftClose : PanelLeftOpen}
          expanded={expanded}
          shortcut="⌘\"
          ariaExpanded={expanded}
          onClick={toggle}
        />
      </div>

      <ViewerFooter expanded={expanded} onSignOut={requestLogout} />
    </nav>
  );
}

/**
 * Sign-out and the workspace sub-label are the only things dropped on collapse.
 * Nothing else disappears — the rail is the same list with its labels hidden,
 * so muscle memory holds.
 */
function ViewerFooter({
  expanded,
  onSignOut,
}: {
  expanded: boolean;
  onSignOut: () => void;
}) {
  const { viewer } = useWorkspace();

  return (
    <div className="mt-2 flex items-center overflow-hidden border-t border-[var(--border-hairline)] pt-2.5">
      <Link
        href="/dashboard/settings/profile"
        aria-label={viewer.name}
        className="flex min-w-0 flex-1 items-center rounded-[8px] transition-opacity duration-150 hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--blue-ring-40)]"
      >
        <span className="flex size-10 shrink-0 items-center justify-center">
          <span
            aria-hidden="true"
            className="flex size-6 items-center justify-center rounded-full bg-[var(--surface-subtle)] text-[9px] font-medium text-[var(--ink-700)]"
          >
            {viewer.initials}
          </span>
        </span>
        <span
          className={cn(
            "min-w-0 truncate text-[12px] text-[var(--ink-700)] transition-opacity ease-[var(--ease-primary)]",
            expanded
              ? "opacity-100 delay-[80ms] duration-[120ms]"
              : "opacity-0 delay-0 duration-[80ms]"
          )}
        >
          {viewer.name}
        </span>
      </Link>

      {expanded && (
        <button
          type="button"
          onClick={onSignOut}
          aria-label="Sign out"
          className="flex size-8 shrink-0 items-center justify-center rounded-[6px] text-[var(--ink-400)] transition-colors duration-150 hover:bg-[var(--surface-subtle)] hover:text-[var(--ink-700)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--blue-ring-40)] cursor-pointer"
        >
          <LogOut className="size-[13px]" strokeWidth={1.5} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
