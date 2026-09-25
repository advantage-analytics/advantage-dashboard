"use client";

import { FlaskConical, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { RailItem } from "@/components/dashboard/sidebar/rail-item";
import {
  PANEL_WIDTH,
  RAIL_WIDTH,
} from "@/components/dashboard/sidebar/sidebar-state";
import { PERSONAL_BOTTOM, PERSONAL_NAV } from "@/lib/dashboard/nav";
import { PersonAvatar } from "@/components/ui/person-avatar";

/**
 * A stand-in for `AppSidebar` at one width, with the proposed "Beta" row above
 * Settings. The real sidebar needs a signed-in workspace; this one only needs
 * the rail rows, so `/design` can show it without a session. Links go nowhere.
 */
export function SidebarPreview({
  expanded,
  onOpenBeta,
}: {
  expanded: boolean;
  onOpenBeta: () => void;
}) {
  const stay = (event: React.MouseEvent<HTMLElement>) => event.preventDefault();

  return (
    <nav
      aria-label={expanded ? "Sidebar preview, expanded" : "Sidebar preview"}
      className="flex h-[640px] shrink-0 flex-col overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-hairline)] bg-[var(--surface-card)] p-3"
      style={{ width: expanded ? PANEL_WIDTH : RAIL_WIDTH }}
    >
      <div className="flex h-10 items-center">
        <span className="flex size-10 shrink-0 items-center justify-center">
          <span className="flex size-6 items-center justify-center rounded-[6px] bg-[var(--ink-900)] text-[10px] font-medium text-white">
            A
          </span>
        </span>
        {expanded && (
          <span className="truncate text-[13px] font-medium text-[var(--ink-900)]">
            Alex Rivera
          </span>
        )}
      </div>

      <div className="h-6 shrink-0" />

      <div className="flex flex-col gap-1">
        {PERSONAL_NAV.map((link, i) => (
          <RailItem
            key={link.href}
            href={link.href}
            label={link.name}
            icon={link.icon}
            active={i === 0}
            expanded={expanded}
            comingSoon={link.comingSoon}
            onClick={stay}
          />
        ))}
      </div>

      <div className="flex-1" />

      <div className="flex flex-col gap-1">
        <RailItem
          as="button"
          label="Beta"
          icon={FlaskConical}
          expanded={expanded}
          onClick={onOpenBeta}
        />
        {PERSONAL_BOTTOM.map((link) => (
          <RailItem
            key={link.href}
            href={link.href}
            label={link.name}
            icon={link.icon}
            expanded={expanded}
            onClick={stay}
          />
        ))}
        <RailItem
          as="button"
          label={expanded ? "Collapse" : "Expand sidebar"}
          icon={expanded ? PanelLeftClose : PanelLeftOpen}
          expanded={expanded}
          shortcut="⌘\"
        />
      </div>

      <div className="mt-2 flex h-10 items-center border-t border-[var(--border-hairline)] pt-2.5">
        <span className="flex size-10 shrink-0 items-center justify-center">
          <PersonAvatar initials="AR" className="size-6 text-[9px]" />
        </span>
        <span
          className={cn(
            "truncate text-[12px] text-[var(--ink-700)]",
            !expanded && "hidden",
          )}
        >
          Alex Rivera
        </span>
      </div>
    </nav>
  );
}
