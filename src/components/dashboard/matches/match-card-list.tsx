"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import {
  LIST_ROW_FRAME,
  ROW_TRAIL_PAD,
  listGridCols,
} from "./match-list-layout";
import type { DisplayMatch } from "@/lib/data/matches-list-types";
import { ResultMark } from "@/components/dashboard/result-mark";
import { EmptyMark } from "@/components/ui/empty-mark";
import { isPracticeMatch } from "@/lib/matches/match-type";
import { ScoreLine } from "@/components/dashboard/score-line";
import { formatMatchDayShortYear } from "@/lib/data/match-day";
import { PlayerMark } from "@/components/ui/player-mark";
import { StatePill } from "@/components/ui/state-pill";
import { useWorkspace } from "@/components/dashboard/workspace-provider";
import { RowLifecycle } from "./row-state";
import { EventCell } from "./event-cell";
import { cn } from "@/lib/utils";

/**
 * Date · (Player) · Opponent · Result · Score · Event · lifecycle
 *
 * The order is `match-list-layout.ts`'s, and its comment says why the outcome
 * glyph now leads the score and Event trails the numbers.
 *
 * No mark before the opponent. The initials circle read as a profile picture
 * for someone who is not in the product, and on the team table it put a second
 * face beside the player the match actually belongs to. On the team table the
 * player carries the row (13/500 ink-900) and the opponent follows at regular
 * weight in ink-700, so the two names do not compete.
 *
 * The row OPENS THE REPORT (`tables.md` rule 3): a click, Enter or Space
 * travels, ⌘/Ctrl-click opens it in a new tab, and the trailing chevron says
 * so. Nothing else on the row is a link — the player's name is plain text,
 * because a name that led to the player page was the click readers made when
 * they wanted the match (2026-11-17).
 */

/**
 * `formatMatchDayShortYear` stamps the year once a match is not from this year
 * ("Nov 13, 2025", ~80px), which at 72px runs into the Event cell. Each row is
 * its own grid, so the track cannot size to its content and still line up:
 * `MatchesGrid` measures the list once and sets `--date-col` on the card when
 * any row needs the wider one. A list of this year's matches is the 72px frame.
 */

/**
 * The LIFECYCLE cell is the fluid track, and everything else is bounded.
 *
 * That is the opposite of what a table usually does, and each alternative was
 * tried and broke the row. Slack given to Event grew it past 300px while a
 * typical name draws ~140, pushing the round away from its own event. Slack
 * given to Opponent stranded the name far from the score it belongs with.
 * Slack left after the Result was simply air — and air is exactly what the
 * lifecycle cell needs, since it is empty on a settled row.
 *
 * So the leftover width IS the lifecycle column. It carries a 96px minimum, so
 * at the narrow end of `lg` the upload's bar collapses before its words do —
 * the chip is what has to survive — and every bounded column gives up its own
 * slack first. It is headed Analysis and names the settled outcome as well as
 * active work, so an empty-looking trailing track is no longer ambiguous.
 *
 * Opponent's cap was measured with the 26px mark it no longer carries (a full
 * 13/500 name plus the "New" pill came to 240px); the freed 36px is left as
 * headroom rather than re-tuned. Result is 60px — its "RESULT" heading, not the
 * 14px glyph, sets the width. Score is 116px at one precision.
 */

/**
 * The grid frame, shared with the header row above. The 16px column gap is
 * most of what separates this row from the one it replaced — the columns
 * changed less than the air between them did.
 *
 * The header sits flush at the card's inset while data rows pull out 16px each
 * side for a rounded, inset hover wash (SKILL 8a). Both still land content on
 * the same x because the row's `-mx-4 px-4` cancels to the header's edge.
 */

interface MatchCardListProps {
  match: DisplayMatch;
  /** Highlights briefly right after this match was created, this session. */
  isNew?: boolean;
  /** Never opened on this device — draws the unread dot after the opponent's name. */
  unseen?: boolean;
  /**
   * A saved upload fills this match (a draft folded onto it by `foldDrafts`) —
   * draws the outlined Draft pill beside the row's name, `DraftRow`'s variant.
   */
  hasDraft?: boolean;
  /**
   * Where that saved upload resumes (`draftHref`), drawn as "Continue" in the
   * lifecycle cell — a draft row's own way back into the wizard.
   */
  continueHref?: string | null;
  scope?: "personal" | "team";
}

/** The row's DOM id, so a discarded draft can hand focus to its neighbour. */
export function matchRowId(matchId: string): string {
  return `match-row-${matchId}`;
}

export function MatchCardList({
  match,
  isNew,
  unseen,
  hasDraft = false,
  continueHref = null,
  scope = "personal",
}: MatchCardListProps): React.JSX.Element {
  const router = useRouter();
  const isWin = match.score.winner === "player1";
  const href = `/dashboard/matches/${match.id}`;
  const isTeam = scope === "team";
  // A practice session records no result: its Result cell is the em dash, its
  // empty Event cell reads "Practice".
  const isPractice = isPracticeMatch(match.matchType);
  // Both seats resolve to this roster (`withRosterProfiles`, team scope only):
  // the opponent is a teammate, not a rival. A folded draft's "Draft" pill wins:
  // StatePill allows one pill per row.
  const isTeammate =
    isTeam &&
    !hasDraft &&
    Boolean(match.player1.profileId) &&
    Boolean(match.player2.profileId);
  const { viewer, active } = useWorkspace();
  const playerId = match.player1.id ?? null;
  const isViewerRow =
    playerId !== null &&
    (playerId === viewer.id || playerId === active.myPlayerId);
  // Beside the row's primary name — the player on a team table, the opponent
  // on a personal one — and never truncated (tables.md rule 4).
  const draftPill = hasDraft ? (
    <StatePill outline className="shrink-0">
      Draft
    </StatePill>
  ) : null;

  return (
    <div
      id={matchRowId(match.id)}
      role="row"
      tabIndex={0}
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
        isNew && "animate-[highlight-new-match_1.5s_ease-out_0.4s_both]",
      )}
      style={listGridCols(scope)}
    >
      {/* Date — the key column, tabular, matching Schedule and the roster card. */}
      <span
        className="tabular text-[12px] whitespace-nowrap"
        style={{ color: "var(--ink-700)" }}
      >
        {formatMatchDayShortYear(match.date)}
      </span>

      {/* Player — the roster's name column: the 26px mark, then the name.
          Your own rows carry your photo; a teammate's photo is not readable
          (`users` RLS is own-row only), so theirs is initials, as on Roster. */}
      {isTeam && (
        <span className="flex min-w-0 items-center gap-2.5">
          <PlayerMark
            name={match.player1.name}
            viewer={isViewerRow ? viewer : null}
          />
          <span className="min-w-0 truncate text-[13px] font-medium text-[var(--ink-900)]">
            {match.player1.name}
          </span>
          {draftPill}
        </span>
      )}

      {/* Opponent — the name a reader scans for on a personal list; the quiet
          second name on a team list. An unread match's dot trails the name
          8px after it: it follows the name, so the name's x never changes,
          and the name truncates while the dot stays pinned after it. */}
      <span className="flex min-w-0 items-center gap-2">
        <span
          className={cn(
            "min-w-0 truncate text-[13px]",
            isTeam
              ? "text-[var(--ink-700)]"
              : "font-medium text-[var(--ink-900)]",
          )}
        >
          {match.player2.name}
        </span>
        {/* The Draft pill's outlined grammar: a fact about the row, grey. */}
        {isTeammate && (
          <StatePill outline className="shrink-0">
            Teammate
          </StatePill>
        )}
        {unseen && (
          <>
            <span
              aria-hidden="true"
              className="size-[5px] shrink-0 rounded-full"
              style={{ background: "var(--blue)" }}
            />
            <span className="sr-only">Unread</span>
          </>
        )}
        {!isTeam && draftPill}
      </span>

      {/* Result — the outcome glyph, flush left under its heading, ahead of
          the score it belongs to. A practice session decides nothing, so it
          draws the draft row's dash instead. */}
      {isPractice ? (
        <EmptyMark label="Practice, no result" />
      ) : (
        <ResultMark won={isWin} className="justify-self-start" />
      )}

      {/* Score — flush left in its fixed track, one precision, tabular, so
          every row's numbers start at the same x. */}
      <ScoreLine
        sets={match.score.sets}
        className="min-w-0 truncate text-[13px] text-[var(--ink-900)]"
      />

      {/* Event — the occasion, with the round trailing it in mono; the one
          cell a draft row draws too (`EventCell`). */}
      <EventCell
        name={match.tournamentName}
        round={match.round}
        practice={isPractice}
      />

      {/* Analysis — the settled outcome, the upload's chip and bar, or the
          one word that explains an exception, on the rest. `grid` blockifies
          the chip onto the cell's line and stretches it across the track;
          `row-lifecycle` identifies the lifecycle container (see globals.css).
          A saved upload that fills this match adds its "Continue", the draft
          row's own link back into the wizard. */}
      <div className={cn("flex min-w-0 items-center gap-3.5", ROW_TRAIL_PAD)}>
        <div className="row-lifecycle grid min-w-0 flex-1 items-center">
          <RowLifecycle
            analysis={match.analysis}
            verification={match.verification}
            verificationPending={match.verificationPending}
            label={[match.player2.name, match.tournamentName]
              .filter(Boolean)
              .join(", ")}
          />
        </div>
        {continueHref && (
          <Link
            href={continueHref}
            onClick={(event) => event.stopPropagation()}
            className="shrink-0 rounded-[var(--radius-cell)] text-[12px] font-medium text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
          >
            Continue
          </Link>
        )}
      </div>

      <RowChevron />
    </div>
  );
}

/**
 * The record chevron (`tables.md` rule 3): 13px, ink-300 at rest and ink-900
 * while the row is hovered or focused, pinned to the row's right edge in the
 * room `ROW_TRAIL_PAD` keeps clear.
 */
export function RowChevron(): React.JSX.Element {
  return (
    <ChevronRight
      aria-hidden="true"
      strokeWidth={1.5}
      className="pointer-events-none absolute top-1/2 right-4 size-[13px] -translate-y-1/2 text-[var(--ink-300)] transition-colors duration-[var(--duration-hover)] group-hover:text-[var(--ink-900)] group-focus-visible:text-[var(--ink-900)]"
    />
  );
}
