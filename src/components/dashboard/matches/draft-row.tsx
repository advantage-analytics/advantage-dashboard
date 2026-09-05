"use client";

/**
 * DraftRow — a saved upload at the top of the Matches table (design 11c).
 *
 * The same seven columns as a match row, with the honest gaps: Score and
 * Result read an em-dash because there is nothing yet, the player carries a
 * grey Draft StatePill (a row's exception is a grey pill, never a colour),
 * and the lifecycle cell holds the only action that matters — Resume · step 3
 * of 4 — so you know how much is left before you click. On hover that cell
 * swaps for the row's ⋯ menu, exactly as a match row's does; Resume is the
 * menu's first item, so nothing is lost, and Discard sits last with the
 * consequence spelled out.
 */

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, MoreHorizontal } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { StatePill } from "@/components/ui/state-pill";
import { deleteMatchDraft, type DraftRow as DraftRowData } from "@/lib/wizard/actions";
import { formatShortDate } from "@/lib/ui/date-format";
import {
  LIFECYCLE_ACTIONS_SLOT,
  LIFECYCLE_CONTENT,
  LIFECYCLE_TRIGGER,
  LIST_GRID_COLS,
  LIST_ROW_FRAME,
} from "./match-card-list";

export type { DraftRowData };

export function DraftRow({
  draft,
  scope,
}: {
  draft: DraftRowData;
  scope: "personal" | "team";
}): React.JSX.Element {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const resumeHref =
    scope === "team"
      ? `/dashboard/team/upload?draft=${draft.id}`
      : `/dashboard/matches/new?draft=${draft.id}`;

  const discard = () => {
    setOpen(false);
    startTransition(async () => {
      await deleteMatchDraft(draft.id);
      router.refresh();
    });
  };

  return (
    <div
      className={`${LIST_ROW_FRAME} group relative -mx-4 h-[52px] rounded-[var(--radius-element)] bg-[var(--surface-muted)] px-4 transition-opacity duration-200${
        pending ? " opacity-50" : ""
      }`}
      style={LIST_GRID_COLS}
      role="row"
    >
      {/* Date — when the draft was last touched, in the key column. */}
      <span className="tabular whitespace-nowrap text-[12px]" style={{ color: "var(--ink-700)" }}>
        {formatShortDate(draft.updatedAt)}
      </span>

      <Link
        href={resumeHref}
        className="flex min-w-0 items-center gap-[7px] rounded-sm after:absolute after:inset-0 focus-visible:outline-none"
      >
        <span className="truncate text-[13px] font-medium text-[var(--ink-900)]">
          {draft.playerName ?? "Untitled match"}
        </span>
        <StatePill className="shrink-0">Draft</StatePill>
      </Link>

      <span className="min-w-0 truncate text-[12px]" style={{ color: "var(--ink-600)" }}>
        {draft.eventLabel ?? (draft.fileName ? draft.fileName : "")}
      </span>

      {/* Lifecycle — Resume at rest, the ⋯ menu on hover, the same slot. */}
      <div className="relative min-w-0">
        <div className={LIFECYCLE_ACTIONS_SLOT}>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger
              aria-label="Draft actions"
              onClick={(e) => e.stopPropagation()}
              className={`inline-flex size-7 items-center justify-center rounded-[var(--radius-element)] text-[var(--ink-500)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--ink-900)] data-[state=open]:text-[var(--ink-900)] focus-visible:outline-none ${LIFECYCLE_TRIGGER}`}
            >
              <MoreHorizontal className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
            </PopoverTrigger>
            <PopoverContent
              align="start"
              sideOffset={6}
              className="flex w-[280px] flex-col rounded-[var(--radius-dropdown)] border-[var(--border-hairline)] bg-white p-1.5 shadow-[var(--shadow-dropdown)]"
            >
              <Link
                href={resumeHref}
                className="flex h-[38px] items-center rounded-[var(--radius-element)] px-2.5 text-[12px] font-medium text-[var(--ink-900)] transition-colors duration-[var(--duration-hover)] hover:bg-[var(--surface-subtle)]"
              >
                Resume
              </Link>
              <span className="my-[5px] h-px bg-[var(--border-hairline)]" />
              <button
                type="button"
                onClick={discard}
                className="flex h-[38px] cursor-pointer items-center gap-2.5 rounded-[var(--radius-element)] px-2.5 text-left transition-colors duration-[var(--duration-hover)] hover:bg-[var(--surface-subtle)]"
              >
                <span className="text-[12px] font-medium text-[var(--danger)]">Discard</span>
                <span className="text-[11px] text-[var(--ink-500)]">the answers go; a video already sent stays</span>
              </button>
            </PopoverContent>
          </Popover>
        </div>
        <div className={LIFECYCLE_CONTENT}>
          <Link
            href={resumeHref}
            className="relative z-[1] whitespace-nowrap text-[11px] font-medium text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)]"
          >
            Resume · step {draft.stepIndex + 1} of {draft.stepCount}
          </Link>
        </div>
      </div>

      {/* Score and Result — nothing yet, said honestly, in the same right-aligned
          tracks the finished rows use. */}
      <span className="text-micro text-right">—</span>
      <span className="text-micro justify-self-end">—</span>

      {/* Row end — the chevron holds; the row opens the wizard. */}
      <ChevronRight
        className="size-[13px] text-[var(--ink-300)]"
        strokeWidth={1.5}
        aria-hidden="true"
      />
    </div>
  );
}
