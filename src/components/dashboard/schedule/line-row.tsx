"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { StatusChip } from "@/components/ui/status-chip";
import { ScoreEntry } from "@/components/dashboard/schedule/score-entry";
import { entryState, matchWon } from "@/lib/schedule/entry-state";
import { formatScore } from "@/lib/schedule/format";
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

  const ourLabel = entry.playerLabels.join(" / ");
  const theirLabel =
    match?.opponentLabels.join(" / ") || entry.opponentLabels.join(" / ");
  const won = match ? matchWon(match) : null;
  const state = entryState(entry);

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

      <span>
        {won === null ? null : (
          <Badge variant={won ? "win" : "loss"}>{won ? "Won" : "Lost"}</Badge>
        )}
      </span>

      <span className="min-w-0 truncate text-[13px] text-[var(--ink-900)]">
        {ourLabel || "—"}{" "}
        <span style={{ color: "var(--ink-600)" }}>
          {won === null ? "vs" : won ? "d." : "f."}
        </span>{" "}
        {theirLabel || "—"}
        {entry.opponentSchool ? (
          <span style={{ color: "var(--ink-600)" }}> {entry.opponentSchool}</span>
        ) : null}
      </span>

      <span
        className="tabular text-right text-[13px]"
        style={{ color: "var(--ink-900)" }}
      >
        {match ? formatScore(match.score?.player1, match.score?.player2) : ""}
      </span>

      <span className="flex justify-end text-right">
        <Action
          state={state}
          match={match}
          entryId={entry.id}
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
  entryId,
  canEdit,
  onScore,
}: {
  state: ReturnType<typeof entryState>;
  match: EntryMatch | null;
  entryId: string;
  canEdit: boolean;
  onScore: () => void;
}) {
  if (state === "empty") {
    if (!canEdit) return null;
    return (
      <button
        type="button"
        onClick={onScore}
        className="cursor-pointer text-[11px] font-medium text-[var(--blue)]"
      >
        Add score
      </button>
    );
  }

  if (state === "working") {
    return (
      <StatusChip tone="blue" live>
        Analyzing
      </StatusChip>
    );
  }

  if (state === "failed") {
    return <StatusChip tone="loss">Analysis failed</StatusChip>;
  }

  if (state === "ready" && match) {
    return (
      <Link
        href={`/dashboard/matches/${match.id}`}
        className="text-[11px] font-medium text-[var(--blue)]"
      >
        Report
      </Link>
    );
  }

  // Played, scored, no video. The one thing left to do with this line — and the
  // pinned entry point 22f describes: the wizard opens on its video step with
  // this line already the destination.
  if (!canEdit) return null;
  return (
    <Link
      href={`/dashboard/team/upload?entry=${entryId}`}
      className="text-[11px] font-medium text-[var(--blue)]"
    >
      Add video
    </Link>
  );
}
