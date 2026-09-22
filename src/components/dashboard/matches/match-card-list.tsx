"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  LIST_ROW_FRAME,
  LIST_TRACK_TRANSITION,
  eventCellFade,
  listGridCols,
} from "./match-list-layout";
import type { DisplayMatch } from "@/lib/data/matches-list-types";
import { ResultMark } from "@/components/dashboard/result-mark";
import { ScoreLine } from "@/components/dashboard/score-line";
import { formatShortDate } from "@/lib/ui/date-format";
import { PlayerMark } from "@/components/ui/player-mark";
import { useWorkspace } from "@/components/dashboard/workspace-provider";
import { RowLifecycle } from "./row-state";
import { profileHref } from "@/components/dashboard/team/roster-table";
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
 * The row PEEKS. A click opens the match drawer beside the table; ⌘/Ctrl-click
 * and the drawer's title go to the report; Enter or Space opens it from the
 * keyboard. It is the Roster's selection model, owned by `MatchesPageContent`.
 */

/**
 * `formatShortDate` stamps the year once a match is not from this year
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
  /** Never opened on this device — draws the unread dot in the row's left gutter. */
  unseen?: boolean;
  scope?: "personal" | "team";
  /** The team table beside the open drawer, with its Event track dropped. */
  compact?: boolean;
  /** This row's match is the one in the drawer. */
  selected?: boolean;
  /** Open or close the drawer on this row; `viaKeyboard` moves focus into it. */
  onToggle?: (id: string, viaKeyboard: boolean) => void;
}

/** The row's DOM id, so stepping in the drawer can scroll and focus it. */
export function matchRowId(matchId: string): string {
  return `match-row-${matchId}`;
}

export function MatchCardList({
  match,
  isNew,
  unseen,
  scope = "personal",
  compact = false,
  selected = false,
  onToggle,
}: MatchCardListProps): React.JSX.Element {
  const router = useRouter();
  const isWin = match.score.winner === "player1";
  const href = `/dashboard/matches/${match.id}`;
  const isTeam = scope === "team";
  const eventHidden = isTeam && compact;
  const { viewer, active } = useWorkspace();
  const playerId = match.player1.id ?? null;
  const isViewerRow =
    playerId !== null &&
    (playerId === viewer.id || playerId === active.myPlayerId);

  return (
    <div
      id={matchRowId(match.id)}
      role="row"
      tabIndex={0}
      aria-current={selected ? "true" : undefined}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey) {
          router.push(href);
          return;
        }
        if (onToggle) onToggle(match.id, false);
        else router.push(href);
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          if (onToggle) onToggle(match.id, true);
          else router.push(href);
        }
      }}
      className={cn(
        LIST_ROW_FRAME,
        LIST_TRACK_TRANSITION,
        "group relative -mx-4 h-[52px] cursor-pointer rounded-[var(--radius-element)] px-4 hover:bg-[var(--surface-muted)] focus-visible:bg-[var(--surface-muted)] focus-visible:outline-none",
        selected && "bg-[var(--surface-muted)]",
        isNew && "animate-[highlight-new-match_1.5s_ease-out_0.4s_both]",
      )}
      style={listGridCols(scope, compact)}
    >
      {/* Unread marker — a dot in the row's own left padding (the `-mx-4
          px-4` gutter, outside every grid cell), not a grid child, so it
          never shifts a track or the opponent name's x. */}
      {unseen && (
        <>
          <span
            aria-hidden="true"
            className="absolute top-1/2 left-[6px] h-[5px] w-[5px] -translate-y-1/2 rounded-full"
            style={{ background: "var(--blue)" }}
          />
          <span className="sr-only">Unread</span>
        </>
      )}

      {/* Date — the key column, tabular, matching Schedule and the roster card. */}
      <span
        className="tabular text-[12px] whitespace-nowrap"
        style={{ color: "var(--ink-700)" }}
      >
        {formatShortDate(match.date)}
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
          {match.player1.profileId ? (
            <Link
              href={profileHref(match.player1.profileId)}
              // The row opens the drawer; the name goes to the player.
              onClick={(event) => event.stopPropagation()}
              className="min-w-0 truncate rounded-[var(--radius-cell)] text-[13px] font-medium text-[var(--ink-900)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
            >
              {match.player1.name}
            </Link>
          ) : (
            <span className="min-w-0 truncate text-[13px] font-medium text-[var(--ink-900)]">
              {match.player1.name}
            </span>
          )}
        </span>
      )}

      {/* Opponent — the name a reader scans for on a personal list; the quiet
          second name on a team list. Nothing follows it: unread is the gutter
          dot, never a mark in this cell. */}
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

      {/* Result — the outcome glyph, flush left under its heading, ahead of
          the score it belongs to. */}
      <ResultMark won={isWin} className="justify-self-start" />

      {/* Score — flush left in its fixed track, one precision, tabular, so
          every row's numbers start at the same x. */}
      <ScoreLine
        sets={match.score.sets}
        className="min-w-0 truncate text-[13px] text-[var(--ink-900)]"
      />

      {/* Event — the occasion, with the round trailing it in mono. The round
          never truncates; a tournament losing its tail is the smaller loss.
          Beside the open team drawer its track collapses to nothing and the
          cell fades, rather than leaving the tree — see
          `TEAM_LIST_GRID_COLS_COMPACT`. */}
      <span
        aria-hidden={eventHidden || undefined}
        className={cn(
          "flex min-w-0 items-baseline gap-1 overflow-hidden text-[12px]",
          eventCellFade(eventHidden),
        )}
        style={{ color: "var(--ink-600)" }}
      >
        <span className="min-w-0 truncate">{match.tournamentName}</span>
        {match.round && (
          <span
            className="mono shrink-0 text-[11px]"
            style={{ color: "var(--ink-400)" }}
          >
            · {match.round}
          </span>
        )}
      </span>

      {/* Analysis — the settled outcome, the upload's chip and bar, or the
          one word that explains an exception, on the rest. `grid` blockifies
          the chip onto the cell's line and stretches it across the track;
          `row-lifecycle` identifies the lifecycle container (see globals.css). */}
      <div className="row-lifecycle grid min-w-0 items-center">
        <RowLifecycle
          analysis={match.analysis}
          label={`${match.player2.name}, ${match.tournamentName}`}
        />
      </div>
    </div>
  );
}
