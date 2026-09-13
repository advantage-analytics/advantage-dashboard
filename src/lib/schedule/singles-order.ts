import { BENCH } from "@/lib/data/lineup-draft";
import type { LineupLine } from "./types";

/**
 * The singles lineup's drag arithmetic, as a pure model.
 *
 * The lineup step lets a coach drag OUR players between S1–S6 and across a
 * "Not in the lineup" line, the Roster's gesture. What moves is the occupant —
 * `ourIds` and `ourLabels` together — and nothing else: a line's opponent
 * belongs to the line, because the other school's S3 is S3
 * whoever we put on it. Kept out of the component so a spec can hold the rules
 * without mounting framer-motion.
 *
 * A sequence is tokens with one `BENCH` among them (the Roster's sentinel,
 * reused): above it the six lines in order, below it roster players holding
 * none. Tokens are opaque to this module; the component mints them.
 */

export { BENCH };

/** Our side of one singles line — the part a drag carries. */
export interface SinglesOccupant {
  ids: string[];
  labels: string[];
}

export const EMPTY_OCCUPANT: SinglesOccupant = { ids: [], labels: [] };

/** A line with nobody on it: no id, and no label with anything in it. */
export function isEmptyOccupant(
  occupant: SinglesOccupant | undefined,
): boolean {
  return (
    !occupant ||
    (occupant.ids.length === 0 &&
      occupant.labels.every((label) => label.trim() === ""))
  );
}

/**
 * The tokens that hold a line after a drop, at most `size` of them.
 *
 * Dragging a bench player above the line puts seven tokens above it. The one
 * that gives way is the last EMPTY line if there is one — an empty court is
 * the natural place for a sub — and otherwise the last line, which is the
 * lineup's own order saying who drops out. Short lineups are not padded here;
 * `applySinglesOrder` empties the lines past the end.
 */
export function fitLineup(
  above: readonly string[],
  occupants: ReadonlyMap<string, SinglesOccupant>,
  size: number,
): string[] {
  const fitted = [...above];
  while (fitted.length > size) {
    let drop = -1;
    for (let index = fitted.length - 1; index >= 0; index -= 1) {
      if (isEmptyOccupant(occupants.get(fitted[index]))) {
        drop = index;
        break;
      }
    }
    fitted.splice(drop === -1 ? fitted.length - 1 : drop, 1);
  }
  return fitted;
}

/** The tokens above the bench line, in order. */
export function aboveBench(sequence: readonly string[]): string[] {
  const at = sequence.indexOf(BENCH);
  return at < 0 ? [...sequence] : sequence.slice(0, at);
}

/**
 * One keyboard step: swap `token` with its neighbour. The bench line is a
 * neighbour like any other, which is how ↑/↓ cross it.
 */
export function moveToken(
  sequence: readonly string[],
  token: string,
  direction: 1 | -1,
): string[] {
  const from = sequence.indexOf(token);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= sequence.length) return [...sequence];
  const next = [...sequence];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

/**
 * Write a new singles order onto the draft.
 *
 * `order[i]` becomes S(i+1)'s occupant; lines past the end of `order` are
 * emptied. Addressed by the singles lines' own order in `lines`, never by a
 * slot string parsed from a token. Opponent labels stay where they are.
 *
 * Refused outright (the draft is returned unchanged) when any singles line is
 * settled: `planEntryChanges` rejects a save that moves a line with a saved
 * result, and a refusal is total — so a reorder that touched one would take the
 * whole lineup down with it.
 */
export function applySinglesOrder(
  lines: readonly LineupLine[],
  order: readonly SinglesOccupant[],
  locked: Readonly<Record<string, unknown>>,
): LineupLine[] {
  const singles = lines.filter((line) => line.discipline === "singles");
  if (singles.some((line) => locked[line.key] !== undefined)) {
    return [...lines];
  }
  const next = new Map(
    singles.map((line, index) => [line.key, order[index] ?? EMPTY_OCCUPANT]),
  );
  return lines.map((line) => {
    const occupant = next.get(line.key);
    if (!occupant) return line;
    return {
      ...line,
      ourIds: [...occupant.ids],
      ourLabels: [...occupant.labels],
      // "No player" belongs to the court, like its opponent — but a player
      // dropped onto it answers the court, so it stops being a forfeit.
      noPlayer: isEmptyOccupant(occupant) ? line.noPlayer : false,
    };
  });
}
