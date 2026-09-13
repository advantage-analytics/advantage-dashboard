"use client";

/**
 * DraftRow — a saved upload at the top of the Matches table (design 11c).
 *
 * The same tracks as a match row, with the honest gaps: Result and Score
 * read an em-dash because there is nothing yet, and the name carries an
 * outlined Draft pill — a match promised rather than held, the variant Invited
 * uses on the roster, and lighter than the blue "New". The Event cell says
 * what the row leads to: "Continue".
 *
 * It behaves like every other row on the page: at rest on white, washed on
 * hover and while selected, and a click opens the drawer rather than
 * travelling. The drawer holds Discard, so the row carries no ⋯. "Continue" in
 * the cell and ⌘-click on the row still go straight back into the wizard.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { StatePill } from "@/components/ui/state-pill";
import { EmptyMark } from "@/components/ui/empty-mark";
import type { DraftRow as DraftRowData } from "@/lib/wizard/actions";
import { formatShortDate } from "@/lib/ui/date-format";
import { cn } from "@/lib/utils";
import { LIST_ROW_FRAME, listGridCols, matchRowId } from "./match-card-list";
import { LIST_TRACK_TRANSITION, eventCellFade } from "./match-list-layout";

export type { DraftRowData };

/** Where a draft resumes: the wizard of the workspace it was saved in. */
export function draftHref(id: string, scope: "personal" | "team"): string {
  return scope === "team"
    ? `/dashboard/team/upload?draft=${id}`
    : `/dashboard/matches/new?draft=${id}`;
}

export function DraftRow({
  draft,
  scope,
  compact = false,
  selected = false,
  onToggle,
}: {
  draft: DraftRowData;
  scope: "personal" | "team";
  /** The team table beside the open drawer, with its Event track dropped. */
  compact?: boolean;
  /** This draft is the one in the drawer. */
  selected?: boolean;
  /** Open or close the drawer on this row; `viaKeyboard` moves focus into it. */
  onToggle?: (id: string, viaKeyboard: boolean) => void;
}): React.JSX.Element {
  const router = useRouter();
  const href = draftHref(draft.id, scope);
  const eventHidden = scope === "team" && compact;

  const resume = (
    <Link
      href={href}
      onClick={(event) => event.stopPropagation()}
      className="relative z-[1] min-w-0 justify-self-start truncate text-[12px] font-medium text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)]"
    >
      Continue
    </Link>
  );

  return (
    <div
      id={matchRowId(draft.id)}
      role="row"
      tabIndex={0}
      aria-current={selected ? "true" : undefined}
      aria-label={`${draft.playerName ?? "Untitled match"}, draft`}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || !onToggle) {
          router.push(href);
          return;
        }
        onToggle(draft.id, false);
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          if (onToggle) onToggle(draft.id, true);
          else router.push(href);
        }
      }}
      className={cn(
        LIST_ROW_FRAME,
        LIST_TRACK_TRANSITION,
        "group relative -mx-4 h-[52px] cursor-pointer rounded-[var(--radius-element)] px-4 hover:bg-[var(--surface-muted)] focus-visible:bg-[var(--surface-muted)] focus-visible:outline-none",
        selected && "bg-[var(--surface-muted)]",
      )}
      style={listGridCols(scope, compact)}
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

      {/* The name, then the outlined Draft pill. */}
      <span className="flex min-w-0 items-center gap-2">
        <span className="truncate text-[13px] font-medium text-[var(--ink-900)]">
          {draft.playerName ?? "Untitled match"}
        </span>
        <StatePill outline className="shrink-0">
          Draft
        </StatePill>
      </span>

      {/* Result and Score — not yet. One mark each, flush under its heading,
          so the two absences read as one "nothing yet". */}
      <EmptyMark label="Not played yet" />
      <EmptyMark label="No score yet" />

      {/* Event — the way back in. Beside the open team drawer the Event track
          collapses, so the link fades out of it and takes the lifecycle cell
          instead; `inert` keeps the faded copy out of the tab order. */}
      <span
        aria-hidden={eventHidden || undefined}
        inert={eventHidden}
        className={cn(
          "grid min-w-0 overflow-hidden",
          eventCellFade(eventHidden),
        )}
      >
        {resume}
      </span>
      {eventHidden ? resume : <span />}
    </div>
  );
}
