"use client";

/**
 * DraftRow — a saved upload at the top of the Matches table (design 11c).
 *
 * The same tracks as a match row, with the honest gaps: Result and Score
 * read an em-dash because there is nothing yet, and the opponent carries a grey
 * Draft pill — a row's exception is a grey pill, never a colour, which is what
 * separates it from the blue "New". Round has no answer either, so the Event
 * cell carries the one thing a draft can say.
 *
 * The one thing a draft has that a match does not is how far through it is, and
 * that is the whole of what its Event cell says: "Resume · step 3 of 4", so you
 * know what is left before you click. The ⋯ menu holds Discard with the
 * consequence spelled out, in the same lane every row's menu uses.
 */

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { StatePill } from "@/components/ui/state-pill";
import {
  deleteMatchDraft,
  type DraftRow as DraftRowData,
} from "@/lib/wizard/actions";
import { formatShortDate } from "@/lib/ui/date-format";
import { ACTIONS_LANE, LIST_ROW_FRAME, listGridCols } from "./match-card-list";
import { EmptyMark } from "@/components/ui/empty-mark";

export type { DraftRowData };

export function DraftRow({
  draft,
  scope,
  compact = false,
}: {
  draft: DraftRowData;
  scope: "personal" | "team";
  /** The team table beside the open drawer, with its Event track dropped. */
  compact?: boolean;
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

  const resume = (
    <Link
      href={resumeHref}
      className="relative z-[1] min-w-0 truncate text-[12px] font-medium text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)]"
    >
      Resume · step {draft.stepIndex + 1} of {draft.stepCount}
    </Link>
  );

  return (
    <div
      className={`${LIST_ROW_FRAME} group relative -mx-4 h-[52px] rounded-[var(--radius-element)] bg-[var(--surface-muted)] px-4 transition-opacity duration-200${
        pending ? "opacity-50" : ""
      }`}
      style={listGridCols(scope, compact)}
      role="row"
    >
      {/* Date — when the draft was last touched. */}
      <span
        className="tabular text-[12px] whitespace-nowrap"
        style={{ color: "var(--ink-700)" }}
      >
        {formatShortDate(draft.updatedAt)}
      </span>

      {scope === "team" && (
        <EmptyMark label="Roster player not available in draft summary" />
      )}

      {/* Opponent — the name, then the grey Draft pill. The whole row resumes. */}
      <Link
        href={resumeHref}
        className="flex min-w-0 items-center gap-2 rounded-sm after:absolute after:inset-0 focus-visible:outline-none"
      >
        <span className="truncate text-[13px] font-medium text-[var(--ink-900)]">
          {draft.playerName ?? "Untitled match"}
        </span>
        <StatePill className="shrink-0">Draft</StatePill>
      </Link>

      {/* Result and Score — not yet. One mark, one size, centred under its own
          heading (law 1), so the two absences read as one "nothing yet". */}
      <EmptyMark label="Not played yet" />
      <EmptyMark label="No score yet" />

      {/* Event — the draft's own progress, which is the only thing it can say
          about itself that a finished match row cannot. Beside the open team
          drawer the Event track is gone, so it moves into the lifecycle cell. */}
      {!(scope === "team" && compact) && resume}
      {scope === "team" && compact ? resume : <span />}

      <span className={ACTIONS_LANE}>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            aria-label="Draft actions"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex size-7 items-center justify-center rounded-[var(--radius-element)] bg-[var(--surface-subtle)] text-[var(--ink-500)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--ink-900)] focus-visible:outline-none data-[state=open]:text-[var(--ink-900)]"
          >
            <MoreHorizontal
              className="size-3.5"
              strokeWidth={1.75}
              aria-hidden="true"
            />
          </PopoverTrigger>
          <PopoverContent
            align="end"
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
              <span className="text-[12px] font-medium text-[var(--danger)]">
                Discard
              </span>
              <span className="text-[11px] text-[var(--ink-500)]">
                the answers go; a video already sent stays
              </span>
            </button>
          </PopoverContent>
        </Popover>
      </span>
    </div>
  );
}
