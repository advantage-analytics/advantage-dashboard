/**
 * What a line on an event page offers next, as a pure rule.
 *
 * No JSX and no `"use client"`: the drawer maps the answer to buttons, and a
 * spec can pin the rule without rendering anything. Lifted out of the retired
 * `line-row.tsx` when the event pages became tables with a peek drawer.
 */

import { LINE_STATUS, type LineStatus } from "./line-status";
import type { EntryState } from "./entry-state";
import type { EntryMatch } from "./types";

/**
 * What a line offers next — the one rule, read by the event pages' line
 * drawer (`event-line-drawer.tsx`) for its footer, so a dual line and a
 * tournament match are offered the same next step for the same state.
 *
 * - `outcome` — forfeited, defaulted or withdrawn: the outcome's words, and
 *   the score flow to correct it when the viewer can.
 * - `add-result` — nobody has recorded anything, and the viewer can.
 * - `status` — a waiting state (working, waiting, failed), words from
 *   `LINE_STATUS`.
 * - `view-report` — there is a report to read.
 * - `add-video` — a scored singles line nothing was sent for.
 * - `null` — nothing to offer this viewer.
 */
export type LineAction =
  | { kind: "outcome"; status: LineStatus; editHref: string | null }
  | { kind: "add-result"; href: string }
  | { kind: "status"; status: LineStatus }
  | { kind: "view-report"; href: string }
  | { kind: "add-video"; href: string }
  | null;

export function lineAction({
  state,
  match,
  entryId,
  matchId,
  doubles,
  canEdit,
  scoreHref,
}: {
  state: EntryState;
  match: EntryMatch | null;
  entryId: string;
  /** Which of the entry's matches this row is. Null on an unplayed line. */
  matchId: string | null;
  /** A doubles line is score-only: once scored it offers no upload. */
  doubles: boolean;
  canEdit: boolean;
  /** The score flow with this line preset — where a result is written. */
  scoreHref: string;
}): LineAction {
  if (state === "forfeited" || state === "defaulted" || state === "withdrawn") {
    return {
      kind: "outcome",
      status: LINE_STATUS[state]!,
      editHref: canEdit ? scoreHref : null,
    };
  }

  if (state === "empty") {
    return canEdit ? { kind: "add-result", href: scoreHref } : null;
  }

  // The waiting states — working, waiting, failed — and their words come from
  // `LINE_STATUS`, which the dual sheet on Team Home reads too. The words are
  // not retyped here.
  const status = LINE_STATUS[state];
  if (status) return { kind: "status", status };

  if (state === "ready" && match) {
    return { kind: "view-report", href: `/dashboard/matches/${match.id}` };
  }

  // Played, scored, nothing sent. The one thing left to do with this line — and
  // the pinned entry point 22f describes: the wizard opens on its video step
  // with this line already the destination.
  //
  // A doubles line is score-only — neither video analysis nor SwingVision
  // statistics take it — so a scored doubles line has nothing left to do.
  if (!canEdit || doubles) return null;
  // The match id rides along, because a tournament ENTRY has many matches. A
  // link carrying only the entry would preset every round's upload to whichever
  // match came back first — attaching a video to Q1 when the coach clicked R32,
  // with nothing on screen to show for it.
  return {
    kind: "add-video",
    href: matchId
      ? `/dashboard/team/upload?entry=${entryId}&match=${matchId}`
      : `/dashboard/team/upload?entry=${entryId}`,
  };
}
