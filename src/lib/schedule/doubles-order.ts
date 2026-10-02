import {
  EMPTY_OCCUPANT,
  isEmptyOccupant,
  type SinglesOccupant,
} from "./singles-order";
import type { LineupLine } from "./types";

/**
 * The doubles lineup's drag arithmetic, as a pure model — the doubles half of
 * `singles-order.ts`, with the same rules and one thing fewer.
 *
 * A coach drags OUR pair between D1–D3. What moves is the pair — `ourIds` and
 * `ourLabels` together — and nothing else: the opponent pair belongs to the
 * court, because the other school's D2 is D2 whoever we send out. There is no
 * doubles bench, so an order is exactly the doubles lines' occupants in their
 * new order; the keyboard's step is `moveToken`, shared with singles.
 */

/** Our side of one doubles line — the pair a drag carries. */
export type DoublesOccupant = SinglesOccupant;

/**
 * Write a new doubles order onto the draft.
 *
 * `order[i]` becomes D(i+1)'s pair; a line past the end of `order` is emptied,
 * as `applySinglesOrder` does. Addressed by the doubles lines' own order in
 * `lines`. Opponent labels, `theirNoPlayer` and every singles line stay as
 * they are; a court that receives a pair stops being our forfeit.
 *
 * Refused outright (the draft is returned unchanged) when any doubles line is
 * settled — `planEntryChanges` rejects a save that moves one, and a refusal is
 * total.
 */
export function applyDoublesOrder(
  lines: readonly LineupLine[],
  order: readonly DoublesOccupant[],
  locked: Readonly<Record<string, unknown>>,
): LineupLine[] {
  const doubles = lines.filter((line) => line.discipline === "doubles");
  if (doubles.some((line) => locked[line.key] !== undefined)) {
    return [...lines];
  }
  const next = new Map(
    doubles.map((line, index) => [line.key, order[index] ?? EMPTY_OCCUPANT]),
  );
  return lines.map((line) => {
    const pair = next.get(line.key);
    if (!pair) return line;
    return {
      ...line,
      ourIds: [...pair.ids],
      ourLabels: [...pair.labels],
      noPlayer: isEmptyOccupant(pair) ? line.noPlayer : false,
    };
  });
}
