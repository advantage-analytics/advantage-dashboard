"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Check, ChevronsUpDown, Plus, Loader2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/components/dashboard/workspace-provider";
import { setActiveWorkspace } from "@/lib/workspace/actions";
import { teamLabel, workspaceSubtitle, type Workspace } from "@/lib/workspace/types";
import { PANEL_WIDTH } from "./sidebar-state";
import { RailTooltip } from "./rail-tooltip";

/**
 * The workspace row — the only thing at the top of both widths, and also the
 * switcher.
 *
 * It is the one place in the sidebar where a label changes on hover: the
 * sub-label swaps from "Personal workspace" to "Switch workspace", which is how
 * the row admits it is a control rather than a heading. No border, no shadow,
 * no blue on the row itself.
 *
 * The open menu carries the single blue-soft row in the whole sidebar — the
 * current workspace. That is the only chroma the sidebar spends.
 */
export function WorkspaceRow({ expanded }: { expanded: boolean }) {
  const { active, available } = useWorkspace();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const squad = teamLabel(active.team);
  const subLabel = hovered || open ? "Switch workspace" : workspaceSubtitle(active);

  function switchTo(workspace: Workspace) {
    if (workspace.id === active.id) {
      setOpen(false);
      return;
    }
    setPendingId(workspace.id);
    startTransition(async () => {
      try {
        // The action redirects into the new workspace, so on success this
        // rejects with Next's internal redirect signal instead of resolving —
        // by then the navigation is already under way and the router handles
        // it. Only a refused switch comes back normally. Either way the
        // sidebar survives that navigation, so clearing the spinner and
        // closing the menu is this component's job.
        await setActiveWorkspace(workspace.id, pathname);
      } finally {
        setPendingId(null);
        setOpen(false);
      }
    });
  }

  const trigger = (
    <button
      type="button"
      aria-label={`Workspace: ${active.name}. Switch workspace`}
      aria-expanded={open}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="flex h-[42px] w-full items-center overflow-hidden rounded-[8px] transition-colors duration-200 ease-[var(--ease-primary)] hover:bg-[var(--surface-subtle)] focus-visible:outline-none cursor-pointer"
    >
      {/* Same 40px column as every nav row, so the mark does not move. */}
      <span className="flex size-10 shrink-0 items-center justify-center">
        <span
          aria-hidden="true"
          className={cn(
            "flex size-[26px] items-center justify-center rounded-[6px] text-[11px] font-medium text-white",
            active.kind === "team" ? "bg-[var(--ink-900)]" : "bg-[var(--blue)]"
          )}
        >
          {active.mark}
        </span>
      </span>

      <span
        className={cn(
          "min-w-0 flex-1 text-left transition-opacity ease-[var(--ease-primary)]",
          expanded
            ? "opacity-100 delay-[80ms] duration-[120ms]"
            : "opacity-0 delay-0 duration-[80ms]"
        )}
      >
        <span className="block truncate text-[13px] font-medium leading-tight text-[var(--ink-900)]">
          {active.name}
          {squad && (
            <span className="font-normal text-[var(--ink-500)]"> · {squad}</span>
          )}
        </span>
        <span className="block truncate text-[10px] leading-tight text-[var(--ink-500)]">
          {subLabel}
        </span>
      </span>

      <ChevronsUpDown
        className={cn(
          "mr-1 size-[13px] shrink-0 transition-[color,opacity] duration-200",
          hovered || open ? "text-[var(--ink-700)]" : "text-[var(--ink-400)]",
          expanded ? "opacity-100" : "opacity-0"
        )}
        strokeWidth={1.5}
        aria-hidden="true"
      />
    </button>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {/* Collapsed, the row answers with the same dark tooltip as every other
          rail row — name on top, what the row does underneath. Suppressed once
          the menu is open, which says both of those things already. */}
      <RailTooltip
        label={active.name}
        detail="Switch workspace"
        hidden={expanded || open}
      >
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      </RailTooltip>

      <PopoverContent
        // Collapsed, a 232px menu anchored under a 40px row would cover the
        // rail it was opened from; beside it, the icons stay visible.
        side={expanded ? "bottom" : "right"}
        align="start"
        sideOffset={8}
        style={{ width: PANEL_WIDTH }}
        className="rounded-[12px] border-[var(--border-medium)] p-1.5"
      >
        {/* Squad in, role out — every row here is one line, so they are all
            the same height and the list reads as a list.

            The squad stays because it is the only thing separating two rows
            that both say "Meridian State". The role goes: it is the same word
            on both of a coach's rows, so it never decides which one to click,
            and carrying it cost a stacked second line on team rows only —
            "ZZ Test Program · Men's" over "Coach" standing visibly taller
            than "Personal". Condensing it onto the line was the other option
            and is worse: 232px leaves about 149px for text here, roughly 24
            characters, and a third `·` segment would truncate the squad to
            pay for a word that disambiguates nothing. Role is a fact about a
            workspace you are already in — the Team pages state it. */}
        {available.map((workspace) => {
          const isActive = workspace.id === active.id;
          const squadLabel = teamLabel(workspace.team);
          return (
            <button
              key={workspace.id}
              type="button"
              disabled={pendingId !== null}
              onClick={() => switchTo(workspace)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-[8px] px-2 py-2 text-left transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer",
                // The single blue-soft row in the sidebar.
                isActive
                  ? "bg-[var(--blue-soft)]"
                  : "hover:bg-[var(--surface-subtle)]"
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "flex size-[22px] shrink-0 items-center justify-center rounded-[6px] text-[10px] font-medium text-white",
                  workspace.kind === "team"
                    ? "bg-[var(--ink-900)]"
                    : "bg-[var(--blue)]"
                )}
              >
                {workspace.mark}
              </span>

              <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--ink-900)]">
                {workspace.name}
                {squadLabel && (
                  <span className="text-[var(--ink-500)]"> · {squadLabel}</span>
                )}
              </span>

              {pendingId === workspace.id ? (
                <Loader2 className="size-3 shrink-0 animate-spin text-[var(--ink-400)]" aria-hidden="true" />
              ) : isActive ? (
                <Check className="size-[13px] shrink-0 text-[var(--blue)]" strokeWidth={2} aria-hidden="true" />
              ) : null}
            </button>
          );
        })}

        <div className="-mx-1.5 my-1.5 h-px bg-[var(--border-hairline)]" />

        <Link
          href="/claim"
          className="flex w-full items-center gap-2.5 rounded-[8px] px-2 py-2 text-[12px] text-[var(--ink-700)] transition-colors duration-150 hover:bg-[var(--surface-subtle)]"
        >
          <span className="flex size-[22px] shrink-0 items-center justify-center">
            <Plus className="size-3.5 text-[var(--ink-500)]" strokeWidth={1.5} aria-hidden="true" />
          </span>
          Create team workspace
        </Link>
      </PopoverContent>
    </Popover>
  );
}
