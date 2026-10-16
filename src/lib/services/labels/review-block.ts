/**
 * The open point's review block, as data: which of its flag's items
 * (`reviewFlag`, marks-state.ts) are still asked, which were answered while
 * the point was open, and which an answer above them cleared; and, for the
 * items that live on one stroke, which stroke that is. Pure, so a spec reads
 * every state without drawing it; label-black-mark.tsx `ReviewBlock` draws it.
 */

import type { LabelMarks } from "./marks";
import type {
  ReviewFlag,
  ReviewItem,
  ReviewItemId,
  ReviewMember,
} from "./marks-state";
import {
  isGhostShot,
  isWithdrawnAdd,
  orderLabelShots,
  type LabelPoint,
} from "./session";
import { suggestionState } from "./suggestions";

/**
 * How a row of the block is drawn: `open` asks its question; `done` is
 * collapsed to what became of it (its item no longer `open`); `cleared` is
 * collapsed to the item whose answer took it away (`clearedBy`).
 */
export type ReviewRowDisplay = "open" | "done" | "cleared";

export interface ReviewBlockRow {
  id: ReviewItemId;
  /** The item as it stands, or as it stood at the open for a cleared one. */
  item: ReviewItem;
  display: ReviewRowDisplay;
  /**
   * For a cleared row, the lowest-numbered item that changed state between
   * the open and now — the answer that cleared it. Null when none did.
   */
  clearedBy: ReviewItemId | null;
}

/**
 * The block's rows in id order: every item of `current`, open or collapsed
 * to `done`, and every item of `previous` (the items as they stood when the
 * point was opened) that is absent from `current`, collapsed to `cleared`.
 *
 * An item changed state when it is in both lists with a different `state`.
 * Where none did — an item's answer can take its own question away with it,
 * as a split takes "Did the point end here?" — a cleared item is put down to
 * the lowest-numbered item cleared before it, and to none when it is the
 * first.
 */
export function reviewBlockRows(
  previous: readonly ReviewItem[] | null,
  current: ReviewFlag | null,
): ReviewBlockRow[] {
  const now = current?.items ?? [];
  const before = previous ?? [];
  const changed = now
    .filter((item) => {
      const was = before.find((old) => old.id === item.id);
      return was !== undefined && was.state !== item.state;
    })
    .map((item) => item.id);
  const gone = before.filter((old) => !now.some((item) => item.id === old.id));
  const rows: ReviewBlockRow[] = [
    ...now.map((item) => ({
      id: item.id,
      item,
      display: (item.state === "open" ? "open" : "done") as ReviewRowDisplay,
      clearedBy: null,
    })),
    ...gone.map((item) => ({
      id: item.id,
      item,
      display: "cleared" as const,
      clearedBy:
        lowest(changed) ??
        lowest(gone.map((g) => g.id).filter((id) => id < item.id)),
    })),
  ];
  return rows.sort((a, b) => a.id - b.id);
}

const lowest = (ids: readonly ReviewItemId[]): ReviewItemId | null =>
  ids.length === 0 ? null : (Math.min(...ids) as ReviewItemId);

/**
 * Each stroke's number as the well draws it: 1…n among the live strokes in
 * video order — a tombstone and a stroke added then withdrawn take none, nor
 * does a ghost while `ghosts` draws it as one.
 */
export function wellShotNumbers(
  point: Pick<LabelPoint, "shots">,
  ghosts: boolean,
): Map<string, number> {
  const numbers = new Map<string, number>();
  for (const shot of orderLabelShots(point.shots)) {
    if (isWithdrawnAdd(shot) || shot.status === "deleted") continue;
    if (ghosts && isGhostShot(shot)) continue;
    numbers.set(shot.id, numbers.size + 1);
  }
  return numbers;
}

/**
 * The stroke an open member's inline suggestion row sits under in the well,
 * if it has one: "Missing shot?" at its first open slot, "Did the point end
 * here?" at the ball called out, and "Second serve?", "Serve after a serve in
 * play" and "Serve in, landing outside the box" at their own serve. Null for
 * every other member, which the block asks itself.
 */
export function memberShotId(
  member: ReviewMember,
  point: LabelPoint,
  marks: LabelMarks,
): string | null {
  const { mark } = member;
  switch (mark.code) {
    case "same_player_consecutive": {
      const slot = marks.suggestions.find(
        (s) =>
          s.kind === "missing_shot" &&
          s.pointId === point.id &&
          suggestionState(s, point) === "open",
      );
      return slot && slot.kind === "missing_shot" ? slot.afterShotId : null;
    }
    case "shot_after_point_end":
    case "second_serve_as_first":
    case "serve_after_serve_in":
    case "serve_in_landing_out":
      return mark.params.shotId;
    default:
      return null;
  }
}

/**
 * Where an open item points instead of asking: the stroke number its inline
 * row sits under, when every open member of the item has such a row under a
 * stroke the well numbers. Null when any open member is the block's to ask —
 * the item is then asked in full, and its stroke rows keep their own answers.
 */
export function reviewItemPointer(
  item: ReviewItem,
  point: LabelPoint,
  marks: LabelMarks,
  numbers: ReadonlyMap<string, number>,
): number | null {
  const open = item.members.filter((member) => member.state === "open");
  if (open.length === 0) return null;
  let first: number | null = null;
  for (const member of open) {
    const shotId = memberShotId(member, point, marks);
    const number = shotId === null ? undefined : numbers.get(shotId);
    if (number === undefined) return null;
    first = first === null ? number : Math.min(first, number);
  }
  return first;
}
