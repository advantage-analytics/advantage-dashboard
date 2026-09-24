"use client";

/**
 * SubjectBar — the 36px bar under the step bar on steps 2–4 of a team upload
 * that did NOT start from a lineup slot.
 *
 * Step 1's For field is the answer every statistic is attributed by, and past
 * step 1 it is otherwise out of sight. This keeps it on screen: "For Marcus
 * Reid", a hairline, the workspace, and a quiet "Not Marcus?" (or "Not you?"
 * when the subject is the viewer's own profile) that goes back to fix it.
 *
 * Same shell as `PinnedLineBar`, which owns this slot on a preset flow. The bar
 * only READS the subject — it never sets or changes it; the way to change it is
 * the For field on step 1, which `onNotSubject` leads back to.
 *
 * Team-only by construction: in a personal workspace the uploader IS the
 * player and step 1 has no picker to return to.
 */

import { Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Workspace } from "@/lib/workspace/types";
import { workspaceLabel } from "./RosterMenu";
import type { MatchSubject } from "./subject-eligibility";
import { focusRingCls } from "./styles";
import { subjectFirstNameOf } from "./wizard-view";

export function SubjectBar({
  subject,
  workspace,
  onNotSubject,
}: {
  /** `wizard.whoPlayed.subject` — the chosen athlete, read-only here. */
  subject: MatchSubject | null;
  workspace: Workspace;
  /** "Not Marcus?" — back toward the For field. */
  onNotSubject: () => void;
}) {
  // A team subject is always a roster athlete; `self` is personal-only.
  if (subject?.kind !== "roster") return null;

  const isViewer =
    workspace.myPlayerId !== null && subject.playerId === workspace.myPlayerId;
  const firstName = subjectFirstNameOf({
    whoPlayed: { subject },
    preset: null,
    playerName: "",
  });

  return (
    <div className="flex h-9 shrink-0 items-center gap-2 border-b border-[var(--border-hairline)] bg-[var(--surface-subtle)] px-[18px]">
      <span className="text-[11px] text-[var(--ink-500)]">For</span>
      <span className="min-w-0 truncate text-[12px] font-medium text-[var(--ink-900)]">
        {subject.name}
      </span>
      <span
        className="mx-2 h-3.5 w-px shrink-0 bg-[var(--border-medium)]"
        aria-hidden="true"
      />
      <span className="inline-flex min-w-0 items-center gap-1.5 text-[11px] text-[var(--ink-600)]">
        <Users
          className="size-[13px] shrink-0 text-[var(--ink-400)]"
          strokeWidth={1.5}
          aria-hidden="true"
        />
        <span className="truncate">{workspaceLabel(workspace)}</span>
      </span>
      <span className="flex-1" />
      <button
        type="button"
        onClick={onNotSubject}
        className={cn(
          "inline-flex h-[22px] shrink-0 cursor-pointer items-center rounded-[var(--radius-button)] px-2 text-[11px] font-medium text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)]",
          focusRingCls,
        )}
      >
        {isViewer ? "Not you?" : firstName ? `Not ${firstName}?` : "Not them?"}
      </button>
    </div>
  );
}
