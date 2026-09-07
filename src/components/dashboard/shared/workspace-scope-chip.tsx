"use client";

import { useWorkspace } from "@/components/dashboard/workspace-provider";
import { cn } from "@/lib/utils";

/**
 * The chip that says which workspace a panel is scoped to.
 *
 * One object in two places — the activity tray's header and the search
 * palette's field — so the chrome has one scope vocabulary. Grey at rest;
 * blue when the palette has widened its search, because a widened scope is a
 * transient thing you did, like a mode.
 *
 * Absent for a viewer holding one workspace: there is nothing it would be
 * distinguishing from. Both callers used to re-derive that rule themselves.
 *
 * Deliberately not a button. The profile menu switches workspaces, and a
 * scope indicator that also switched would make two panels into hidden
 * second doors for the same action.
 */
export function WorkspaceScopeChip({
  wide = false,
  className,
}: {
  /** The palette's ⇧↵ state: every workspace at once. */
  wide?: boolean;
  className?: string;
}) {
  const { active, available } = useWorkspace();
  if (available.length <= 1) return null;

  return (
    <span
      className={cn(
        "flex h-5 shrink-0 items-center rounded-[6px] px-[7px] text-[11px]",
        wide
          ? "bg-[var(--blue-soft)] font-medium text-[var(--blue)]"
          : "bg-[var(--surface-subtle)] text-[var(--ink-700)]",
        className
      )}
    >
      {wide ? "All workspaces" : active.name}
    </span>
  );
}
