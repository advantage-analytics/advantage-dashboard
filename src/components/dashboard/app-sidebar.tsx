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
 * The rail is the default. Reaching for navigation opens a PEEK — the panel
 * floats over the page rather than pushing it — which is the reason this shape
 * was chosen over a plain toggle: a match report, a KPI strip or a chart never
 * reflows while you reach past it. Pinning is the opt-in, and pinned is layout
 * rather than overlay.
 *
 * The outer element holds the LAYOUT width and the inner one the VISUAL width.
 * When peeking they disagree — the layout box stays at 64 while the panel
 * overlays at 232 — and that disagreement is the whole feature.
 */
export function AppSidebar() {
  const pathname = usePathname();
  const { active } = useWorkspace();
  const requestLogout = useRequestLogout();
  const { pinned, peeking, expanded, togglePinned, openPeek, cancelPeek, closePeek } =
    useSidebarState();

  const isTeam = active.kind === "team";
  const mainLinks = isTeam ? TEAM_NAV : PERSONAL_NAV;
  const bottomLinks = isTeam ? TEAM_BOTTOM : PERSONAL_BOTTOM;
  const current = activeHref(pathname, [...mainLinks, ...bottomLinks]);

  return (
    <div
      // Layout width. Only the pin moves this; a peek deliberately does not.
      className="relative z-40 shrink-0 transition-[width] duration-200 ease-[var(--ease-primary)] motion-reduce:transition-none"
      style={{ width: pinned ? PANEL_WIDTH : RAIL_WIDTH }}
      onMouseEnter={openPeek}
      onMouseLeave={cancelPeek}
    >
      <nav
        aria-label="Main"
        // Focusing any rail item opens the peek — keyboard users must never be
        // asked to navigate by icon alone.
        onFocus={openPeek}
        className={cn(
          "absolute inset-y-0 left-0 flex flex-col border-r border-[var(--border-hairline)] bg-[var(--surface-card)] p-3",
          "transition-[width,box-shadow] duration-200 ease-[var(--ease-primary)] motion-reduce:transition-none",
          // Float role. The system already reserves shadow for exactly this.
          peeking && "shadow-[0_8px_30px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)]"
        )}
        style={{
          width: expanded ? PANEL_WIDTH : RAIL_WIDTH,
          // Collapsing: labels leave first, then the edge travels, so text
          // never clips mid-word.
          transitionDelay: expanded ? "0ms" : "80ms",
        }}
      >
        <WorkspaceRow expanded={expanded} onNavigate={closePeek} />

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
              onClick={closePeek}
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
              onClick={closePeek}
            />
          ))}

          {/* The toggle is the last row of the bottom group at BOTH widths, so
              it never moves relative to Settings and Help. Icon and label both
              flip; there is no glyph rotation. */}
          <RailItem
            as="button"
            label={pinned ? "Collapse" : "Expand sidebar"}
            icon={pinned ? PanelLeftClose : PanelLeftOpen}
            expanded={expanded}
            shortcut="⌘\"
            onClick={togglePinned}
          />
        </div>

        <ViewerFooter expanded={expanded} onSignOut={requestLogout} />
      </nav>
    </div>
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
