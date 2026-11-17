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
 * "Continue", the way back into the wizard; the word truncates before
 * Continue ever does.
 *
 * It behaves like every other row on the page: at rest on white, washed on
 * hover, and a click travels — into the wizard, the only page a draft has.
 * Where a match row draws its chevron the draft draws its ⋯, which holds
 * Discard (`DraftDiscardMenu`): "Continue" already says where the row goes,
 * and a draft has no report whose menu could hold the action instead.
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
import { DraftDiscardMenu } from "./draft-discard-menu";
import { draftHref } from "./draft-href";
import {
  LIST_ROW_FRAME,
  ROW_TRAIL_PAD,
  listGridCols,
} from "./match-list-layout";

export type { DraftRowData };

export { draftHref };

export function DraftRow({
  draft,
  scope,
}: {
  draft: DraftRowData;
  scope: "personal" | "team";
}): React.JSX.Element {
  const router = useRouter();
  const href = draftHref(draft.id, scope);
  const isTeam = scope === "team";
  const name = draftTitle(draft, scope);
  const title = name ?? UNTITLED_DRAFT;

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
      aria-label={`${title}, draft`}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey) {
          window.open(href, "_blank", "noopener");
          return;
        }
        router.push(href);
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          router.push(href);
        }
      }}
      className={cn(
        LIST_ROW_FRAME,
        "group relative -mx-4 h-[52px] cursor-pointer rounded-[var(--radius-element)] px-4 transition-colors duration-[var(--duration-hover)] hover:bg-[var(--surface-muted)] focus-visible:bg-[var(--surface-muted)] focus-visible:outline-none",
      )}
      style={listGridCols(scope)}
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
      <EventCell name={draft.eventLabel} />

      {/* Lifecycle — the step it stopped at, then the way back in. The ring is
          the list's "waiting on something real"; the word is the step's own
          name. The mark never shrinks; the word truncates before Continue
          ever does, and below `xl` — where the track is near its floor and
          would cut the word to a letter — it is for screen readers only. */}
      <span className={cn("flex min-w-0 items-center gap-3.5", ROW_TRAIL_PAD)}>
        <AnalysisStatusLine
          mark="wait"
          className="min-w-0 [&>span:first-child]:shrink-0 [&>span:last-child]:min-w-0 [&>span:last-child]:truncate max-xl:[&>span:last-child]:sr-only"
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

      {/* Where a match row draws its chevron: the ⋯ that holds Discard. */}
      <DraftDiscardMenu
        draftId={draft.id}
        matchName={name}
        focusAfterDiscard={() => {
          const row = document.getElementById(matchRowId(draft.id));
          const neighbour = (row?.nextElementSibling ??
            row?.previousElementSibling) as HTMLElement | null;
          return neighbour?.getAttribute("role") === "row" ? neighbour : null;
        }}
        className="absolute top-1/2 right-2 -translate-y-1/2"
      />
    </div>
  );
}
