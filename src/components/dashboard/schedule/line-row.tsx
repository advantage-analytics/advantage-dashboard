"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { StatusChip } from "@/components/ui/status-chip";
import { ResultMark } from "@/components/dashboard/result-mark";
import { ScoreLine } from "@/components/dashboard/score-line";
import { scoreSetsFrom } from "@/lib/ui/score-format";
import { ScoreEntry } from "@/components/dashboard/schedule/score-entry";
import { RowAction } from "@/components/dashboard/schedule/row-action";
import {
  entryState,
  forfeitWon,
  matchState,
  matchWon,
  supportsVideo,
} from "@/lib/schedule/entry-state";
import { LINE_STATUS } from "@/lib/schedule/line-status";
import { setForfeit } from "@/lib/schedule/actions";
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
  last,
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
  last?: boolean;
}) {
  const [scoring, setScoring] = useState(false);

  const isForfeited = entry.forfeit !== null;

  // A forfeited line with no player on our side renders "— no available
  // player" rather than a bare em dash, because the forfeit explains why.
  const ourLabel = isForfeited && entry.playerLabels.length === 0
    ? "— no available player"
    : entry.playerLabels.join(" / ");
  const theirLabel =
    match?.opponentLabels.join(" / ") || entry.opponentLabels.join(" / ");

  // A forfeit's outcome is on the entry, not on a match.
  const won = isForfeited
    ? forfeitWon(entry)
    : match
      ? matchWon(match)
      : null;

  // This row's own match, not the entry's. A tournament entry renders one row
  // per round, and asking the entry gives every round the loudest round's
  // answer. `entryState` is still right for the matchless row, where there is
  // no match to ask.
  const state = isForfeited
    ? ("forfeited" as const)
    : match
      ? matchState(match)
      : entryState(entry);

  if (scoring) {
    return (
      <ScoreEntry
        entryId={entry.id}
        ourLabel={entry.playerLabels[0] ?? "Our player"}
        round={round}
        initialOpponent={theirLabel}
        onDone={() => setScoring(false)}
      />
    );
  }

  return (
    <div
      className={`grid ${columns} items-center gap-3.5 py-[11px] ${
        last ? "" : "border-b border-[var(--border-hairline)]"
      }`}
    >
      <span className="mono text-[11px]" style={{ color: "var(--ink-600)" }}>
        {label}
      </span>

      {/* Round 44: the glyph, not the word. This row already spells the outcome
          a second way in the d./f. verb beside the matchup, and it has no
          Result header to read a badge against — one outcome vocabulary per row
          shape. "Won"/"Lost" survives as the mark's accessible name. */}
      <span>{won === null ? null : <ResultMark won={won} />}</span>

      <span className="min-w-0 truncate text-[13px] text-[var(--ink-900)]">
        {ourLabel || "—"}{" "}
        <span style={{ color: "var(--ink-600)" }}>
          {isForfeited ? "vs" : won === null ? "vs" : won ? "d." : "f."}
        </span>{" "}
        {theirLabel || "—"}
        {entry.opponentSchool ? (
          <span style={{ color: "var(--ink-600)" }}> {entry.opponentSchool}</span>
        ) : null}
      </span>

      {/* A forfeited line carries no set score — never an invented one. */}
      <ScoreLine
        sets={isForfeited ? [] : match ? scoreSetsFrom(match.score) : []}
        className="tabular text-right text-[13px]"
        style={{ color: "var(--ink-900)" }}
      />

      <span className="flex justify-end text-right">
        <Action
          state={state}
          match={match}
          entry={entry}
          entryId={entry.id}
          matchId={match?.id ?? null}
          videoAllowed={supportsVideo(entry)}
          canEdit={canEdit}
          onScore={() => setScoring(true)}
        />
      </span>
    </div>
  );
}

function Action({
  state,
  match,
  entry,
  entryId,
  matchId,
  videoAllowed,
  canEdit,
  onScore,
}: {
  state: ReturnType<typeof entryState>;
  match: EntryMatch | null;
  entry: EventEntry;
  entryId: string;
  /** Which of the entry's matches this row is. Null on an unplayed line. */
  matchId: string | null;
  videoAllowed: boolean;
  canEdit: boolean;
  onScore: () => void;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState<"ours" | "theirs" | null>(null);
  const [pending, startTransition] = useTransition();

  function handleForfeit(side: "ours" | "theirs") {
    startTransition(async () => {
      const result = await setForfeit(entryId, side);
      if ("error" in result) return;
      setConfirming(null);
      router.refresh();
    });
  }

  function handleClearForfeit() {
    startTransition(async () => {
      const result = await setForfeit(entryId, null);
      if ("error" in result) return;
      router.refresh();
    });
  }

  // Forfeited: show status and a clear action for editors.
  if (state === "forfeited") {
    if (!canEdit) {
      const status = LINE_STATUS.forfeited!;
      return (
        <StatusChip tone={status.tone}>
          {status.label}
        </StatusChip>
      );
    }
    return (
      <RowAction onClick={handleClearForfeit}>
        {pending ? "Clearing…" : "Clear forfeit"}
      </RowAction>
    );
  }

  if (state === "empty") {
    if (!canEdit) return null;

    // Confirming which side forfeited — a small inline picker.
    if (confirming !== null) {
      return (
        <span className="flex items-center gap-2 text-[11px]">
          <RowAction onClick={() => handleForfeit("ours")}>
            {pending ? "…" : "Ours"}
          </RowAction>
          <span style={{ color: "var(--ink-300)" }}>·</span>
          <RowAction onClick={() => handleForfeit("theirs")}>
            {pending ? "…" : "Theirs"}
          </RowAction>
          <span style={{ color: "var(--ink-300)" }}>·</span>
          <button
            type="button"
            onClick={() => setConfirming(null)}
            className="text-[11px] text-[var(--ink-500)] outline-none"
          >
            Cancel
          </button>
        </span>
      );
    }

    return (
      <span className="flex items-center gap-2">
        <RowAction onClick={onScore}>Add score</RowAction>
        <span style={{ color: "var(--ink-300)" }}>·</span>
        <RowAction onClick={() => setConfirming("ours")}>Forfeit</RowAction>
      </span>
    );
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
      <RowAction href={`/dashboard/matches/${match.id}`}>Report</RowAction>
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
