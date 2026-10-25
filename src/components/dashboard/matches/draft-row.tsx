"use client";

/**
 * DraftRow — a saved upload at the top of the Matches table (design 11c,
 * redrawn 2026-10-25).
 *
 * The same tracks as a match row, filled with what the draft has answered so
 * far and honest about the rest. Date is the match day entered, "—" until
 * one is. Opponent is the opponent, with the outlined Draft pill — a match
 * promised rather than held, the variant Invited uses on the roster; on a
 * team table the player takes the pill and the opponent stands alone, as a
 * match row does. Result is "—": nothing is decided until the match exists.
 * Score is the sets typed so far, one ink quieter than a match's because
 * nothing has checked them, "—" until a set is in. Event is the label the
 * row stores, in the cell a match row draws. The lifecycle cell is the
 * draft's own: the dashed wait ring the list uses for "something real is
 * waiting", the step it stopped at as one word (`stepLabel`), then
 * "Continue", the way back into the wizard. Beside the open rail the track
 * is at its 96px floor, so the word is screen-reader-only there (the rail
 * names the step); at rest it truncates before Continue ever does.
 *
 * It behaves like every other row on the page: at rest on white, washed on
 * hover and while selected, and a click opens the drawer rather than
 * travelling. The drawer holds Discard, so the row carries no ⋯. "Continue"
 * in the cell and ⌘-click on the row still go straight back into the wizard.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { StatePill } from "@/components/ui/state-pill";
import { EmptyMark } from "@/components/ui/empty-mark";
import { PlayerMark } from "@/components/ui/player-mark";
import { ScoreLine } from "@/components/dashboard/score-line";
import { AnalysisStatusLine } from "@/components/dashboard/shared/analysis-status-line";
import type { DraftRow as DraftRowData } from "@/lib/wizard/actions";
import {
  UNTITLED_DRAFT,
  draftTitle,
  stepLabel,
} from "@/lib/wizard/draft-row-fields";
import { formatMatchDayShortYear } from "@/lib/data/match-day";
import { cn } from "@/lib/utils";
import { EventCell } from "./event-cell";
import { matchRowId } from "./match-card-list";
import {
  LIST_ROW_FRAME,
  LIST_TRACK_TRANSITION,
  listGridCols,
} from "./match-list-layout";

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
  /** The table beside the open drawer, with its Event track dropped. */
  compact?: boolean;
  /** This draft is the one in the drawer. */
  selected?: boolean;
  /** Open or close the drawer on this row; `viaKeyboard` moves focus into it. */
  onToggle?: (id: string, viaKeyboard: boolean) => void;
}): React.JSX.Element {
  const router = useRouter();
  const href = draftHref(draft.id, scope);
  const isTeam = scope === "team";
  const title = draftTitle(draft, scope) ?? UNTITLED_DRAFT;

  const draftPill = (
    <StatePill outline className="shrink-0">
      Draft
    </StatePill>
  );

  return (
    <div
      id={matchRowId(draft.id)}
      role="row"
      tabIndex={0}
      aria-current={selected ? "true" : undefined}
      aria-label={`${title}, draft`}
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
      {/* Date — the match day entered so far, read the one way a match day is
          read; a dash until there is one. */}
      {draft.matchDate ? (
        <span
          className="tabular text-[12px] whitespace-nowrap"
          style={{ color: "var(--ink-700)" }}
        >
          {formatMatchDayShortYear(draft.matchDate)}
        </span>
      ) : (
        <EmptyMark label="No date yet" />
      )}

      {/* Player (team) — the roster's mark and the name, with the pill. A
          draft that has not named its player yet gets no mark: initials for
          a placeholder would read as a person. */}
      {isTeam && (
        <span className="flex min-w-0 items-center gap-2.5">
          {draft.playerName ? (
            <>
              <PlayerMark name={draft.playerName} viewer={null} />
              <span className="min-w-0 truncate text-[13px] font-medium text-[var(--ink-900)]">
                {draft.playerName}
              </span>
            </>
          ) : (
            <span className="min-w-0 truncate text-[13px] font-medium text-[var(--ink-900)]">
              {UNTITLED_DRAFT}
            </span>
          )}
          {draftPill}
        </span>
      )}

      {/* Opponent — the name a reader scans for on a personal list, where it
          also carries the pill; the quiet second name on a team list. */}
      {isTeam ? (
        draft.opponentName ? (
          <span className="min-w-0 truncate text-[13px] text-[var(--ink-700)]">
            {draft.opponentName}
          </span>
        ) : (
          <EmptyMark label="No opponent yet" />
        )
      ) : (
        <span className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate text-[13px] font-medium text-[var(--ink-900)]">
            {draft.opponentName ?? UNTITLED_DRAFT}
          </span>
          {draftPill}
        </span>
      )}

      {/* Result — not yet: nothing is decided until the match exists. */}
      <EmptyMark label="Not played yet" />

      {/* Score — the sets typed so far, one ink quieter than a match's
          because nothing has checked them; a dash until a set is in. */}
      {draft.score.length > 0 ? (
        <ScoreLine
          sets={draft.score}
          className="min-w-0 truncate text-[13px] text-[var(--ink-600)]"
        />
      ) : (
        <EmptyMark label="No score yet" />
      )}

      {/* Event — the label the row stores, in the match row's own cell. */}
      <EventCell name={draft.eventLabel} hidden={compact} />

      {/* Lifecycle — the step it stopped at, then the way back in. The ring is
          the list's "waiting on something real"; the word is the step's own
          name. Beside the open rail the track is at its 96px floor, which
          holds the ring and Continue and nothing else, so the word goes to
          screen readers only there — the rail names the step — rather than
          truncating to a letter. The mark never shrinks; the word truncates
          before Continue ever does. */}
      <span className="flex min-w-0 items-center gap-3.5">
        <AnalysisStatusLine
          mark="wait"
          className={cn(
            "min-w-0 [&>span:first-child]:shrink-0 [&>span:last-child]:min-w-0 [&>span:last-child]:truncate",
            compact && "[&>span:last-child]:sr-only",
          )}
        >
          {stepLabel(draft.step, draft.providerKind)}
        </AnalysisStatusLine>
        <Link
          href={href}
          onClick={(event) => event.stopPropagation()}
          className="relative z-[1] shrink-0 text-[12px] font-medium text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)]"
        >
          Continue
        </Link>
      </span>
    </div>
  );
}
