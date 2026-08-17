"use client";

import { useState, useTransition } from "react";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/components/dashboard/workspace-provider";
import { setActiveWorkspace } from "@/lib/workspace/actions";
import {
  teamLabel,
  workspaceSubtitle,
  type Workspace,
} from "@/lib/workspace/types";

/**
 * The workspace mark — a personal workspace wears the viewer's initials in
 * blue, a program wears its first letter in near-black. The colour is the
 * fastest read of which kind you are in, which matters because the navigation
 * beneath it changes with the answer.
 */
function WorkspaceMark({ workspace }: { workspace: Workspace }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-[26px] shrink-0 items-center justify-center rounded-[6px] text-[11px] font-medium text-white",
        workspace.kind === "team" ? "bg-[var(--ink-900)]" : "bg-[var(--blue)]"
      )}
    >
      {workspace.mark}
    </span>
  );
}

/**
 * The selectable list of workspaces.
 *
 * Shared by the sidebar switcher and the header profile menu — the design puts
 * a workspace list in both, and they must agree about ordering, the active
 * marker, and how a men's and women's program at one school are told apart.
 */
export function WorkspaceOptionList({
  onSwitched,
}: {
  onSwitched?: () => void;
}) {
  const { active, available } = useWorkspace();
  const [, startTransition] = useTransition();
  // One state, not two. `isPending` and `pendingId` answered the same question
  // and briefly disagreed — `pendingId` is set synchronously and cleared inside
  // the transition, leaving a window where every row was disabled and none
  // showed a spinner.
  const [pendingId, setPendingId] = useState<string | null>(null);

  const switchTo = (workspace: Workspace) => {
    if (workspace.id === active.id) {
      onSwitched?.();
      return;
    }
    setPendingId(workspace.id);
    startTransition(async () => {
      await setActiveWorkspace(workspace.id);
      setPendingId(null);
      onSwitched?.();
    });
  };

  return (
    <div role="listbox" aria-label="Workspaces">
      {available.map((workspace) => {
        const isActive = workspace.id === active.id;
        const squad = teamLabel(workspace.team);

        return (
          <button
            key={workspace.id}
            type="button"
            role="option"
            aria-selected={isActive}
            disabled={pendingId !== null}
            onClick={() => switchTo(workspace)}
            className="flex w-full items-center gap-2.5 rounded-[8px] px-2.5 py-[7px] text-left transition-colors duration-150 hover:bg-[var(--surface-subtle)] focus-visible:bg-[var(--surface-subtle)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
          >
            <span className="flex w-[13px] shrink-0 justify-center">
              {pendingId === workspace.id ? (
                <Loader2
                  className="size-3 animate-spin text-[var(--ink-400)]"
                  aria-hidden="true"
                />
              ) : isActive ? (
                <Check
                  className="size-[13px] text-[var(--blue)]"
                  strokeWidth={2}
                  aria-hidden="true"
                />
              ) : null}
            </span>

            <span
              className={cn(
                "min-w-0 flex-1 truncate text-[12px] text-[var(--ink-900)]",
                isActive && "font-medium"
              )}
            >
              {workspace.name}
              {squad && (
                <span className="text-[var(--ink-500)]"> · {squad}</span>
              )}
            </span>

            {workspace.kind === "team" && (
              <span className="shrink-0 text-[11px] text-[var(--ink-500)]">
                team
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Sidebar workspace switcher — the top of the rail.
 *
 * Takes the position the wordmark used to hold. In the collapsed rail only the
 * mark survives, which is why the mark has to carry the personal/team
 * distinction on its own.
 */
export function WorkspaceSwitcher() {
  const { active } = useWorkspace();
  const [isOpen, setIsOpen] = useState(false);
  const squad = teamLabel(active.team);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Workspace: ${active.name}. Switch workspace`}
          className="flex w-full items-center gap-2.5 rounded-[8px] p-2 transition-colors duration-150 hover:bg-[var(--surface-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--blue-ring-40)] cursor-pointer group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
        >
          <WorkspaceMark workspace={active} />

          <span className="min-w-0 flex-1 text-left group-data-[collapsible=icon]:hidden">
            <span className="block truncate text-[13px] font-medium leading-tight text-[var(--ink-900)]">
              {active.name}
              {squad && (
                <span className="font-normal text-[var(--ink-500)]">
                  {" "}
                  · {squad}
                </span>
              )}
            </span>
            <span className="block text-[10px] leading-tight text-[var(--ink-500)]">
              {workspaceSubtitle(active)}
            </span>
          </span>

          <ChevronsUpDown
            className="size-[13px] shrink-0 text-[var(--ink-400)] group-data-[collapsible=icon]:hidden"
            strokeWidth={1.5}
            aria-hidden="true"
          />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-[232px] rounded-[12px] border-[var(--border-medium)] p-1.5"
      >
        <p className="px-2.5 pb-1.5 pt-1 text-[10px] font-medium uppercase tracking-[1.5px] text-[var(--ink-500)]">
          Workspace
        </p>
        <WorkspaceOptionList onSwitched={() => setIsOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}
