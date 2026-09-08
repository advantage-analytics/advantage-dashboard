"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/components/dashboard/workspace-provider";
import type { Workspace } from "@/lib/workspace/types";
import { WorkspaceRow } from "@/components/dashboard/sidebar/workspace-row";
import { RailItem } from "@/components/dashboard/sidebar/rail-item";
import {
  useSidebarState,
  RAIL_WIDTH,
  PANEL_WIDTH,
} from "@/components/dashboard/sidebar/sidebar-state";
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
  const { expanded, toggle } = useSidebarState();

  const isTeam = active.kind === "team";
  const mainLinks = isTeam ? TEAM_NAV : PERSONAL_NAV;
  const bottomLinks = isTeam ? TEAM_BOTTOM : PERSONAL_BOTTOM;

  // A player's own profile is the footer's destination, not the Roster's
  // (Platform Audit `Te`: "a personal destination kept out of the
  // team-content list"). Longest-prefix matching would light Roster for it,
  // so the footer wins when the page is the one it links to.
  const footerHref = viewerFooterHref(active);
  const onOwnProfile = pathname === footerHref;
  const current = onOwnProfile
    ? null
    : activeHref(pathname, [...mainLinks, ...bottomLinks]);

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
            comingSoon={link.comingSoon}
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

      <ViewerFooter expanded={expanded} href={footerHref} active={onOwnProfile} />
    </nav>
  );
}

/**
 * The footer is a single profile link; only its label fades on collapse, same
 * as the rail items above it. Sign-out lives elsewhere — Settings → Account
 * and the header profile menu — not in the sidebar chrome.
 *
 * Where it goes depends on who is standing here. A player inside their team
 * workspace has a page of their own — the roster's profile, Platform Audit
 * `Te` — and their name at the foot of the rail is how they reach it: "a
 * personal destination, not team-content nav", so it is this row rather than
 * an item in the list above. Everyone else (staff, and anyone in a personal
 * workspace) still lands on Settings → Profile. The row lights like a rail
 * item when its page is the one on screen, which only ever happens on the
 * profile: Settings has its own row above.
 */
function viewerFooterHref(active: Workspace): string {
  return active.kind === "team" && active.role === "player" && active.myPlayerId
    ? `/dashboard/team/roster/${active.myPlayerId}`
    : "/dashboard/settings/profile";
}

function ViewerFooter({
  expanded,
  href,
  active: isActive,
}: {
  expanded: boolean;
  href: string;
  active: boolean;
}) {
  const { viewer } = useWorkspace();

  return (
    <div className="mt-2 flex items-center overflow-hidden border-t border-[var(--border-hairline)] pt-2.5">
      <Link
        href={href}
        aria-label={viewer.name}
        aria-current={isActive ? "page" : undefined}
        className="flex min-w-0 flex-1 items-center rounded-[8px] transition-opacity duration-150 hover:opacity-80 focus-visible:outline-none"
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
            "min-w-0 truncate text-[12px] transition-opacity ease-[var(--ease-primary)]",
            isActive
              ? "font-medium text-[var(--ink-900)]"
              : "text-[var(--ink-700)]",
            expanded
              ? "opacity-100 delay-[80ms] duration-[120ms]"
              : "opacity-0 delay-0 duration-[80ms]"
          )}
        >
          {viewer.name}
        </span>
      </Link>
    </div>
  );
}
