"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Check, ChevronsUpDown, Plus, Loader2 } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/components/dashboard/workspace-provider";
import { ChromeTooltip } from "@/components/dashboard/shared/chrome-tooltip";
import { setActiveWorkspace } from "@/lib/workspace/actions";
import {
  squadDisambiguator,
  teamLabel,
  workspaceSubtitle,
  type Workspace,
} from "@/lib/workspace/types";
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
 * In the open menu the current workspace sits on a bare row — no wash, no
 * hover — with a blue check as its only mark. The check is the one chroma the
 * sidebar spends.
 */
export function WorkspaceRow({ expanded }: { expanded: boolean }) {
  const { active, available } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);
  // Row buttons, keyed by workspace id, so the open menu can put focus on the
  // current workspace and so ArrowUp/ArrowDown can walk the list. Radix's own
  // arrow handling belongs to menus, and this popover is not one.
  const rowRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  /**
   * Opening the menu lands focus on the row you are already in, so the list
   * starts where you are rather than at its first entry. Nothing here draws a
   * ring: `focus.css` rings every `<button>` on `:focus-visible`, and a
   * programmatic `.focus()` inherits the browser's own keyboard-vs-mouse
   * modality — so a click leaves the row focused but unringed, and Enter rings
   * it. If the active row is missing (an empty list, or an active workspace
   * that is not in `available`), we leave Radix's default focus alone.
   */
  function focusActiveRow(event: Event) {
    const button = rowRefs.current.get(active.id);
    if (!button) return;
    event.preventDefault();
    button.focus();
  }

  function handleMenuKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    // Mid-switch every row is disabled; moving focus onto one would be a lie.
    if (pendingId !== null) return;

    const index = available.findIndex(
      (workspace) =>
        rowRefs.current.get(workspace.id) === document.activeElement,
    );
    if (index === -1) return;

    // preventDefault even at the ends — the key was ours to handle either way,
    // and letting it through would scroll the page behind the open menu.
    event.preventDefault();
    // Clamped, not wrapped: the ends of a short list should feel like ends.
    const next = event.key === "ArrowDown" ? index + 1 : index - 1;
    if (next < 0 || next >= available.length) return;
    rowRefs.current.get(available[next].id)?.focus();
  }

  // The squad lives on the subtitle line now — `workspaceSubtitle` returns
  // "Men's team workspace" — so the name above it gets the full width. A
  // collegiate name truncates in a 232px rail long before a trailing
  // possessive would have been read.
  const subLabel =
    hovered || open ? "Switch workspace" : workspaceSubtitle(active);
  // Only the rows that share a school name still spend width on the squad.
  const squadFor = squadDisambiguator(available);

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
        await setActiveWorkspace(workspace.id);
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
      className="flex h-[42px] w-full cursor-pointer items-center overflow-hidden rounded-[8px] transition-colors duration-200 ease-[var(--ease-primary)] hover:bg-[var(--surface-subtle)] focus-visible:outline-none"
    >
      {/* Same 40px column as every nav row, so the mark does not move. */}
      <span className="flex size-10 shrink-0 items-center justify-center">
        <span
          aria-hidden="true"
          className={cn(
            "flex size-[26px] items-center justify-center rounded-[6px] text-[11px] font-medium text-white",
            active.kind === "team" ? "bg-[var(--ink-900)]" : "bg-[var(--blue)]",
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
            : "opacity-0 delay-0 duration-[80ms]",
        )}
      >
        <span className="block truncate text-[13px] leading-tight font-medium text-[var(--ink-900)]">
          {active.name}
        </span>
        <span className="block truncate text-[10px] leading-tight text-[var(--ink-500)]">
          {subLabel}
        </span>
      </span>

      <ChevronsUpDown
        className={cn(
          "mr-1 size-[13px] shrink-0 transition-[color,opacity] duration-200",
          hovered || open ? "text-[var(--ink-700)]" : "text-[var(--ink-400)]",
          expanded ? "opacity-100" : "opacity-0",
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
        sideOffset={expanded ? 6 : 8}
        style={{ width: PANEL_WIDTH }}
        className="rounded-[12px] border-[var(--border-medium)] p-1.5"
        onOpenAutoFocus={focusActiveRow}
        onKeyDown={handleMenuKeyDown}
      >
        {/* Role out, squad out except where it disambiguates — every row
            here is one line, so they are all the same height and the list
            reads as a list.

            The role lives in the row's dark tooltip: it is the same word on
            both of a coach's rows, so it never decides which one to click,
            and carrying it inline cost a stacked second line on team rows
            only. The squad is there too, and on the name line only where
            `squadDisambiguator` says two rows share a school name.

            The tooltip names the squad ONCE, in `detail`. Hanging it off
            `label` as well is the bug this shape prevents — a two-line
            tooltip that said "Men's" in both lines. */}
        {available.map((workspace) => {
          const isActive = workspace.id === active.id;
          // Two questions, not one: the tooltip always names the squad, the
          // name line only when it is what tells two rows apart.
          const squad = teamLabel(workspace.team);
          const squadLabel = squadFor(workspace);
          const roleWord =
            workspace.role.charAt(0).toUpperCase() + workspace.role.slice(1);
          const tipDetail =
            workspace.kind === "team"
              ? [squad && `${squad} team`, roleWord].filter(Boolean).join(" · ")
              : "Personal workspace";
          return (
            <ChromeTooltip
              key={workspace.id}
              label={workspace.name}
              detail={tipDetail}
              side="right"
              align="start"
              sideOffset={8}
            >
              <button
                type="button"
                ref={(node) => {
                  if (node) rowRefs.current.set(workspace.id, node);
                  else rowRefs.current.delete(workspace.id);
                }}
                disabled={pendingId !== null}
                // Hover opens this row's tooltip; focus must not. Radix's
                // TooltipTrigger opens with no delay on focus, so the menu's
                // own focus work — landing on the active row when it opens,
                // ArrowUp/ArrowDown walking the list — would pop a dark label
                // over the menu on every keystroke, and each open tooltip then
                // swallows an Escape that was meant for the menu. Radix
                // composes this handler ahead of its own and skips its own
                // once the event is defaultPrevented, which leaves the pointer
                // path (where the role and squad are actually wanted) intact.
                onFocus={(event) => event.preventDefault()}
                onClick={() => switchTo(workspace)}
                className={cn(
                  "flex w-full cursor-pointer items-center gap-2.5 rounded-[8px] px-2 py-2 text-left transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-60",
                  // The current workspace sits bare — no wash, even on hover.
                  // The blue check is its whole mark.
                  !isActive &&
                    "hover:bg-[var(--surface-subtle)] focus-visible:bg-[var(--surface-subtle)]",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex size-[22px] shrink-0 items-center justify-center rounded-[6px] text-[10px] font-medium text-white",
                    workspace.kind === "team"
                      ? "bg-[var(--ink-900)]"
                      : "bg-[var(--blue)]",
                  )}
                >
                  {workspace.mark}
                </span>

                <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--ink-900)]">
                  {workspace.name}
                  {squadLabel && (
                    <span className="text-[var(--ink-500)]">
                      {" "}
                      · {squadLabel}
                    </span>
                  )}
                </span>

                {pendingId === workspace.id ? (
                  <Loader2
                    className="size-3 shrink-0 animate-spin text-[var(--ink-400)]"
                    aria-hidden="true"
                  />
                ) : isActive ? (
                  <Check
                    className="size-[13px] shrink-0 text-[var(--blue)]"
                    strokeWidth={2}
                    aria-hidden="true"
                  />
                ) : null}
              </button>
            </ChromeTooltip>
          );
        })}

        <div className="-mx-1.5 my-1.5 h-px bg-[var(--border-hairline)]" />

        {/* Straight to the fork (5.1). The viewer is signed in and their
            persona is already known, so re-asking "how do you use Advantage?"
            at /claim would be a question they've answered — the fork is the
            right first screen for someone adding a team from here. */}
        <Link
          href="/claim/team"
          className="flex w-full items-center gap-2.5 rounded-[8px] px-2 py-2 text-[12px] text-[var(--ink-700)] transition-colors duration-150 hover:bg-[var(--surface-subtle)] focus-visible:bg-[var(--surface-subtle)]"
        >
          <span className="flex size-[22px] shrink-0 items-center justify-center">
            <Plus
              className="size-3.5 text-[var(--ink-500)]"
              strokeWidth={1.5}
              aria-hidden="true"
            />
          </span>
          Create team workspace
        </Link>
      </PopoverContent>
    </Popover>
  );
}
