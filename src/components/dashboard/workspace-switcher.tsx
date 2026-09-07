"use client";

import { useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { MENU_LEAD_CLASS, MENU_ROW_CLASS } from "@/lib/ui/menu";
import { useWorkspace } from "@/components/dashboard/workspace-provider";
import { setActiveWorkspace } from "@/lib/workspace/actions";
import { squadDisambiguator, type Workspace } from "@/lib/workspace/types";

/**
 * The workspace list inside the header's profile menu.
 *
 * The sidebar has its own switcher — see `sidebar/workspace-row.tsx` — because
 * that one is a row that also serves as the rail's top item, with a hover
 * sub-label swap and a collapsed tooltip. This is the plain list the profile
 * menu needs. They share the server action and the ordering, not the chrome.
 */
export function WorkspaceOptionList({ onSwitched }: { onSwitched?: () => void }) {
  const { active, available } = useWorkspace();
  const [, startTransition] = useTransition();
  // One state, not two. `isPending` and a pending id answered the same question
  // and briefly disagreed, leaving every row disabled with no spinner anywhere.
  const [pendingId, setPendingId] = useState<string | null>(null);
  // Same rule as the sidebar menu: the squad is width worth spending only on
  // the rows a school name alone cannot tell apart. This list has no tooltip
  // to fall back on, so sharing the rule matters more here, not less.
  const squadFor = squadDisambiguator(available);

  const switchTo = (workspace: Workspace) => {
    if (workspace.id === active.id) {
      onSwitched?.();
      return;
    }
    setPendingId(workspace.id);
    startTransition(async () => {
      try {
        // Redirects on success, so this rejects with Next's internal redirect
        // signal rather than resolving — see `sidebar/workspace-row.tsx`. The
        // header survives the navigation, so the spinner and the open menu are
        // still this component's to clear.
        await setActiveWorkspace(workspace.id);
      } finally {
        setPendingId(null);
        onSwitched?.();
      }
    });
  };

  return (
    <div role="listbox" aria-label="Workspaces">
      {available.map((workspace) => {
        const isActive = workspace.id === active.id;
        const squad = squadFor(workspace);

        return (
          <button
            key={workspace.id}
            type="button"
            role="option"
            aria-selected={isActive}
            disabled={pendingId !== null}
            onClick={() => switchTo(workspace)}
            className={cn(
              MENU_ROW_CLASS,
              "text-left disabled:cursor-not-allowed disabled:opacity-60"
            )}
          >
            <span className={MENU_LEAD_CLASS}>
              {pendingId === workspace.id ? (
                <Loader2 className="size-3 animate-spin text-[var(--ink-400)]" aria-hidden="true" />
              ) : isActive ? (
                <Check className="size-[14px] text-[var(--blue)]" strokeWidth={2} aria-hidden="true" />
              ) : null}
            </span>

            <span
              className={cn(
                "min-w-0 flex-1 truncate text-[12px] text-[var(--ink-900)]",
                isActive && "font-medium"
              )}
            >
              {workspace.name}
              {squad && <span className="text-[var(--ink-500)]"> · {squad}</span>}
            </span>

            {workspace.kind === "team" && (
              <span className="shrink-0 text-[11px] text-[var(--ink-500)]">team</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
