"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { EmptyMark } from "@/components/ui/empty-mark";
import { PersonAvatar } from "@/components/ui/person-avatar";
import { getInitials } from "@/lib/data/match-utils";
import { StatusChip } from "@/components/ui/status-chip";
import { ResultMark } from "@/components/dashboard/result-mark";
import { ScoreLine } from "@/components/dashboard/score-line";
import { scoreSetsFrom } from "@/lib/ui/score-format";
import { ScoreEntry } from "@/components/dashboard/schedule/score-entry";
import { RowAction } from "@/components/dashboard/schedule/row-action";
import {
  outcomeForRound,
  resolveEntryResult,
  resultState,
  resultWon,
  supportsVideo,
  type EntryState,
} from "@/lib/schedule/entry-state";
import { LINE_STATUS } from "@/lib/schedule/line-status";
import type { EntryMatch, EventEntry } from "@/lib/schedule/types";

/**
 * One line, on the event page.
 *
 * Shared by the dual's court list and the tournament's result rows, because
 * they are the same claim in the same vocabulary — slot, outcome, matchup,
 * score, and one action that depends only on what the line is waiting for.
 * Two spellings of that action is two screens disagreeing about one job.
 */
export function LineRow({
  entry,
  match,
  label,
  round,
  canEdit,
  columns,
  showSchool = true,
  last,
  split = false,
  viewer = null,
}: {
  entry: EventEntry;
  /** The match this row shows. Absent on a line nobody has recorded yet. */
  match: EntryMatch | null;
  /** 'S1' for a dual, 'R16' for a tournament round. */
  label: string;
  /** Passed to recordResult. Null on a dual, whose slot is its round. */
  round: string | null;
  canEdit: boolean;
  columns: string;
  /**
   * Print the opponent's school after their name.
   *
   * True for a tournament, where every round can be against a different
   * program and the name alone says nothing about who. False on a dual, whose
   * title already names the one school every line is played against — repeating
   * it on all nine rows is the same word nine times.
   */
  showSchool?: boolean;
  last?: boolean;
  /**
   * The dual page's record-row layout (Data Table laws): our player and the
   * opponent in their own columns, Score and Result flush left with an em dash
   * where nothing is decided, the lifecycle action, and a chevron to the match
   * when there is one. The tournament page keeps the one-cell matchup.
   */
  split?: boolean;
  /**
   * The signed-in person, so their own line shows their photo — the roster's
   * rule: our only photo is the viewer's, everyone else is initials.
   * `ids` covers both id spaces a line's player can carry (auth uid and the
   * claimed `program_players.id`).
   */
  viewer?: LineViewer | null;
}) {
  const [scoring, setScoring] = useState(false);

  const result = resolveEntryResult(entry, round);
  const outcome = outcomeForRound(entry, round);
  const isNonPlayed = result.kind === "non-played";

  // A non-played line with no player on our side renders "— no available
  // player" rather than a bare em dash, because the outcome explains why.
  const ourLabel =
    isNonPlayed && entry.playerLabels.length === 0
      ? "— no available player"
      : entry.playerLabels.join(" / ");
  const theirLabel =
    match?.opponentLabels.join(" / ") || entry.opponentLabels.join(" / ");

  // One round's result decides its mark. A tournament sibling must not leak
  // into this row, and a schedule outcome takes precedence over a match.
  const won = resultWon(result);

  // This row's exact result, not the whole entry. A tournament entry renders
  // one row per round, so asking the entry would give sibling rounds one state.
  const state = resultState(result);

  if (scoring) {
    return (
      <ScoreEntry
        entryId={entry.id}
        ourLabel={entry.playerLabels[0] ?? "Our player"}
        round={round}
        initialOpponent={theirLabel}
        initialOutcome={outcome?.outcome ?? null}
        onDone={() => setScoring(false)}
      />
    );
  }

  const action = (
    <Action
      state={state}
      match={match}
      entryId={entry.id}
      matchId={match?.id ?? null}
      videoAllowed={supportsVideo(entry, round)}
      canEdit={canEdit}
      onScore={() => setScoring(true)}
    />
  );

  if (split) {
    const sets = isNonPlayed || !match ? [] : scoreSetsFrom(match.score);
    const unset = entry.playerLabels.length === 0 && !isNonPlayed;
    return (
      <div className={`${SPLIT_ROW} ${columns}`}>
        <SlotLabel>{label}</SlotLabel>

        {unset ? (
          <span className="flex">
            <EmptyMark label="Line not set" />
          </span>
        ) : (
          <span className="flex min-w-0 items-center gap-2.5">
            <PlayerAvatars
              labels={entry.playerLabels}
              userIds={entry.playerUserIds}
              viewer={viewer}
            />
            <span className="truncate text-[13px] font-medium text-[var(--ink-900)]">
              {ourLabel || "—"}
            </span>
          </span>
        )}

        <span
          className="flex min-w-0 truncate text-[12px]"
          style={{ color: "var(--ink-600)" }}
        >
          {theirLabel ? (
            <span className="truncate">{theirLabel}</span>
          ) : (
            <EmptyMark label="No opponent yet" />
          )}
        </span>

        {/* Result: the outcome mark, then the score it belongs to, in one
            fixed track so neither floats alone. An undecided line is one
            dash; a non-played line is its mark with no invented score. Each
            cell is one element — `EmptyMark` is a fragment whose sr-only
            sibling would otherwise become a grid item of its own. */}
        <span className="flex items-center gap-2">
          {won === null ? (
            <EmptyMark label="No result yet" />
          ) : (
            <ResultMark won={won} />
          )}
          {sets.length > 0 ? (
            <ScoreLine
              sets={sets}
              className="tabular text-[13px] whitespace-nowrap"
              style={{ color: "var(--ink-900)" }}
            />
          ) : null}
        </span>

        <span className="flex min-w-0">
          {unset ? (
            canEdit ? (
              <SetLineAction eventId={entry.eventId} />
            ) : null
          ) : (
            action
          )}
        </span>

        <span className="flex">
          {match ? (
            <Link
              href={`/dashboard/matches/${match.id}`}
              aria-label={`Open ${label} match`}
              className="rounded-[4px] text-[var(--ink-300)] transition-colors duration-[var(--duration-hover)] outline-none hover:text-[var(--ink-900)] focus-visible:shadow-[var(--focus-ring)]"
            >
              <ChevronRight
                className="size-[13px]"
                strokeWidth={1.5}
                aria-hidden="true"
              />
            </Link>
          ) : null}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`grid ${columns} items-center gap-4 py-[11px] ${
        last ? "" : "border-b border-[var(--border-hairline)]"
      }`}
    >
      <span className="mono text-[11px]" style={{ color: "var(--ink-500)" }}>
        {label}
      </span>

      {/* The shared result glyph is the product's one outcome register.
          "Won"/"Lost" survives as the mark's accessible name. */}
      <span>{won === null ? null : <ResultMark won={won} />}</span>

      <span className="min-w-0 truncate text-[13px] text-[var(--ink-900)]">
        {ourLabel || "—"}{" "}
        <span style={{ color: "var(--ink-600)" }}>
          {isNonPlayed ? "vs" : won === null ? "vs" : won ? "d." : "f."}
        </span>{" "}
        {theirLabel || "—"}
        {showSchool && entry.opponentSchool ? (
          <span style={{ color: "var(--ink-600)" }}>
            {" "}
            {entry.opponentSchool}
          </span>
        ) : null}
      </span>

      {/* A non-played line carries no set score — never an invented one. */}
      <ScoreLine
        sets={isNonPlayed ? [] : match ? scoreSetsFrom(match.score) : []}
        className="tabular text-right text-[13px]"
        style={{ color: "var(--ink-900)" }}
      />

      <span className="flex justify-end text-right">{action}</span>
    </div>
  );
}

function Action({
  state,
  match,
  entryId,
  matchId,
  videoAllowed,
  canEdit,
  onScore,
}: {
  state: EntryState;
  match: EntryMatch | null;
  entryId: string;
  /** Which of the entry's matches this row is. Null on an unplayed line. */
  matchId: string | null;
  videoAllowed: boolean;
  canEdit: boolean;
  onScore: () => void;
}) {
  if (state === "forfeited" || state === "defaulted" || state === "withdrawn") {
    const status = LINE_STATUS[state]!;
    if (!canEdit) {
      return <StatusChip tone={status.tone}>{status.label}</StatusChip>;
    }
    return (
      <span className="flex items-center justify-end gap-2">
        <StatusChip tone={status.tone}>{status.label}</StatusChip>
        <RowAction onClick={onScore}>Edit result</RowAction>
      </span>
    );
  }

  if (state === "empty") {
    if (!canEdit) return null;

    return <RowAction onClick={onScore}>Add result</RowAction>;
  }

  // The waiting states — working, waiting, failed — and their words come from
  // `LINE_STATUS`, which the dual sheet on Team Home reads too. The words are
  // not retyped here.
  const status = LINE_STATUS[state];
  if (status) {
    return (
      <StatusChip tone={status.tone} live={status.live}>
        {status.label}
      </StatusChip>
    );
  }

  if (state === "ready" && match) {
    return (
      <RowAction href={`/dashboard/matches/${match.id}`}>View report</RowAction>
    );
  }

  // Played, scored, nothing sent. The one thing left to do with this line — and
  // the pinned entry point 22f describes: the wizard opens on its video step
  // with this line already the destination.
  //
  // "Add file" on a doubles line, not "Add video": the vision pipeline is
  // singles-only, so a doubles line can only take a SwingVision export and a
  // button promising video would be a promise the submit route refuses.
  if (!canEdit) return null;
  // The match id rides along, because a tournament ENTRY has many matches. A
  // link carrying only the entry would preset every round's upload to whichever
  // match came back first — attaching a video to Q1 when the coach clicked R32,
  // with nothing on screen to show for it.
  return (
    <RowAction
      href={
        matchId
          ? `/dashboard/team/upload?entry=${entryId}&match=${matchId}`
          : `/dashboard/team/upload?entry=${entryId}`
      }
    >
      {videoAllowed ? "Add video" : "Add file"}
    </RowAction>
  );
}

export interface LineViewer {
  ids: string[];
  avatarUrl: string | null;
  initials: string;
}

const SPLIT_ROW =
  "-mx-4 grid h-[52px] items-center gap-x-5 rounded-[var(--radius-element)] px-4 transition-colors duration-[var(--duration-hover)] hover:bg-[var(--surface-muted)]";

/** The lineup list's line label: 11px mono ink-500 (primitives → Dual). */
function SlotLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="mono text-[11px]" style={{ color: "var(--ink-500)" }}>
      {children}
    </span>
  );
}

/**
 * "+ Set line" — the dual page's unset-line action, pointing at the edit flow
 * where lines are set. The drawer's blue row, as a row action.
 */
function SetLineAction({ eventId }: { eventId: string }) {
  return (
    <RowAction href={`/dashboard/team/schedule/${eventId}/edit`}>
      + Set line
    </RowAction>
  );
}

/**
 * One 26px avatar per player on the line (Data Table law 1), overlapping by
 * 8px with a card-coloured ring on a doubles pair. The viewer's own avatar is
 * their photo; everyone else's is initials — the roster's rule, since the
 * viewer's is the only photo the page has.
 */
function PlayerAvatars({
  labels,
  userIds,
  viewer,
}: {
  labels: string[];
  userIds: string[];
  viewer: LineViewer | null;
}) {
  return (
    <span className="flex shrink-0">
      {labels.map((name, index) => {
        const isViewer =
          viewer !== null && viewer.ids.includes(userIds[index] ?? "");
        return (
          <PersonAvatar
            key={`${name}-${index}`}
            initials={isViewer ? viewer.initials : getInitials(name)}
            photoUrl={isViewer ? viewer.avatarUrl : null}
            className={
              index > 0
                ? "-ml-2 size-[26px] text-[9px] shadow-[0_0_0_2px_var(--surface-card)]"
                : "size-[26px] text-[9px]"
            }
          />
        );
      })}
    </span>
  );
}

/**
 * A lineup slot the dual has no entry for at all. Every dual draws its full
 * card — six singles, three doubles — so a missing line still holds its row:
 * dashes where the facts go and, for someone who may set lines, the action.
 */
export function UnsetLineRow({
  slot,
  eventId,
  canEdit,
  columns,
}: {
  slot: string;
  eventId: string;
  canEdit: boolean;
  columns: string;
}) {
  return (
    <div className={`${SPLIT_ROW} ${columns}`}>
      <SlotLabel>{slot}</SlotLabel>
      <span className="flex">
        <EmptyMark label="Line not set" />
      </span>
      <span className="flex">
        <EmptyMark />
      </span>
      <span className="flex">
        <EmptyMark />
      </span>
      <span className="flex min-w-0">
        {canEdit ? <SetLineAction eventId={eventId} /> : null}
      </span>
      <span />
    </div>
  );
}
