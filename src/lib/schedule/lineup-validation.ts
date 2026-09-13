import type { LineupLineInput } from "./actions";
import { splitNames } from "./format";
import type { LineupLine } from "./types";

/**
 * The identity of a doubles pairing, order-independent.
 *
 * The server refuses a save whose pairs collide; the builder greys the pairing
 * out and the picker drops it from the option list. All three must agree on
 * this string, or the picker offers a pair the save then rejects — the dead end
 * this validation exists to prevent. One spelling, imported by all three.
 */
export function pairKey(ids: readonly string[]): string {
  return JSON.stringify([...ids].sort());
}

/** Only stable identities establish duplicates; typed labels are not IDs. */
export function validateLineup(
  lines: readonly LineupLineInput[],
): { slot: string; reason: string }[] {
  const errors: { slot: string; reason: string }[] = [];
  const pairs = new Map<string, string>();

  for (const line of lines) {
    const ids = line.playerUserIds.filter((id) => id.length > 0);
    if (new Set(ids).size !== ids.length) {
      errors.push({
        slot: line.slot,
        reason: `${line.slot} selects the same athlete more than once. Choose distinct athletes for this line.`,
      });
      continue;
    }

    // Singles participation and other pairings are allowed. An incomplete
    // pair cannot establish the identity of both athletes.
    if (line.discipline !== "doubles" || ids.length !== 2) continue;
    const key = pairKey(ids);
    const firstSlot = pairs.get(key);
    if (firstSlot !== undefined) {
      errors.push({
        slot: line.slot,
        reason: `${line.slot} repeats the doubles pair selected on ${firstSlot}. Choose a different pair.`,
      });
    } else {
      pairs.set(key, line.slot);
    }
  }

  return errors;
}

/** A dual's nine courts, in order — the lineup a dual must field in full. */
export const DUAL_SLOTS = [
  "S1",
  "S2",
  "S3",
  "S4",
  "S5",
  "S6",
  "D1",
  "D2",
  "D3",
] as const;

/**
 * Is this line set — a player on a singles court, a pair on a doubles court,
 * or an explicit "No player"?
 *
 * By label, not id: a name typed in place is a real player with no roster
 * account yet. A doubles line with one partner picked is NOT set.
 */
export function isLineSet(line: {
  discipline: LineupLineInput["discipline"];
  playerLabels: readonly string[];
  noPlayer?: boolean;
}): boolean {
  const names = line.playerLabels.filter((label) => label.trim() !== "");
  if (line.noPlayer) return names.length === 0;
  return names.length === (line.discipline === "doubles" ? 2 : 1);
}

/**
 * Lines that put an athlete already on an EARLIER line of the same kind — two
 * singles courts, or two doubles courts — mapped to that earlier line.
 *
 * A player plays one singles line and one doubles line in a dual, so singles
 * plus doubles is fine; a second of either is not. By roster id, like every
 * duplicate rule here: typed labels are not identities. The builder hides the
 * athlete from the other lines' pickers and counts a clash as a line still to
 * set; `validateDualLineup` refuses one on save.
 */
export function lineupClashes(
  lines: readonly {
    slot: string;
    discipline: LineupLineInput["discipline"];
    ids: readonly string[];
  }[],
): Map<string, string> {
  const onLine = new Map<string, string>();
  const clashes = new Map<string, string>();
  for (const line of lines) {
    for (const id of line.ids) {
      if (id.length === 0) continue;
      const key = `${line.discipline}:${id}`;
      const earlier = onLine.get(key);
      if (earlier === undefined) onLine.set(key, line.slot);
      else if (earlier !== line.slot && !clashes.has(line.slot)) {
        clashes.set(line.slot, earlier);
      }
    }
  }
  return clashes;
}

function unsetReason(slot: string): string {
  return `${slot} needs a player, or No player. Every line must be set.`;
}

/**
 * A dual lineup is complete: every court S1–S6 and D1–D3 exactly once, each
 * with its player or pair, or marked "No player".
 *
 * Asked by `createDual` and `updateDual` only — a tournament has no courts. The
 * builder holds Continue until this is true; the server asks again because a
 * dual saved with a hole in it is the ambiguity this rule exists to remove —
 * an empty line reads as unfinished and as forfeited at once.
 */
export function validateDualLineup(
  lines: readonly LineupLineInput[],
): { slot: string; reason: string }[] {
  const errors: { slot: string; reason: string }[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    if (!(DUAL_SLOTS as readonly string[]).includes(line.slot)) {
      errors.push({
        slot: line.slot,
        reason: `${line.slot} isn't a dual line.`,
      });
      continue;
    }
    if (seen.has(line.slot)) {
      errors.push({
        slot: line.slot,
        reason: `${line.slot} appears more than once.`,
      });
      continue;
    }
    seen.add(line.slot);
    const doubles = line.slot.startsWith("D");
    if (line.discipline !== (doubles ? "doubles" : "singles")) {
      errors.push({
        slot: line.slot,
        reason: `${line.slot} is a ${doubles ? "doubles" : "singles"} line.`,
      });
      continue;
    }
    if (line.noPlayer && line.playerUserIds.length > 0) {
      errors.push({
        slot: line.slot,
        reason: `${line.slot} can't have a player and No player.`,
      });
      continue;
    }
    if (line.opponentNoPlayer && line.noPlayer) {
      errors.push({
        slot: line.slot,
        reason: `${line.slot} can't be No player on both sides.`,
      });
      continue;
    }
    if (line.opponentNoPlayer && line.opponentLabels.length > 0) {
      errors.push({
        slot: line.slot,
        reason: `${line.slot} can't have an opponent and No player.`,
      });
      continue;
    }
    if (
      doubles &&
      !line.noPlayer &&
      line.opponentLabels.filter((label) => label.trim() !== "").length === 1
    ) {
      errors.push({
        slot: line.slot,
        reason: `${line.slot} needs both opponents in the pair, or neither yet.`,
      });
      continue;
    }
    if (!isLineSet(line)) {
      errors.push({ slot: line.slot, reason: unsetReason(line.slot) });
    }
  }

  const clashes = lineupClashes(
    lines.map((line) => ({
      slot: line.slot,
      discipline: line.discipline,
      ids: line.playerUserIds,
    })),
  );
  for (const [slot, earlier] of clashes) {
    const kind = slot.startsWith("D") ? "doubles" : "singles";
    errors.push({
      slot,
      reason: `${slot} has a player already on ${earlier}. A player can play one ${kind} line.`,
    });
  }

  for (const slot of DUAL_SLOTS) {
    if (!seen.has(slot)) {
      errors.push({ slot, reason: unsetReason(slot) });
    }
  }

  return errors;
}

/**
 * Our side of a draft line, as the save will send it — doubles keep their two
 * labels as picked, singles split on the slash so "A / B" is two names.
 */
export function draftOurNames(line: LineupLine): string[] {
  return line.discipline === "doubles"
    ? line.ourLabels.map((label) => label.trim()).filter(Boolean)
    : splitNames(line.ourLabels.join(" / "));
}

/** `lineupClashes` over builder lines — our side's roster ids, by court. */
export function draftClashes(
  lines: readonly LineupLine[],
): Map<string, string> {
  return lineupClashes(
    lines.map((line) => ({
      slot: line.slot,
      discipline: line.discipline,
      ids: line.noPlayer ? [] : line.ourIds,
    })),
  );
}

/** Our side of a builder line is set — `isLineSet` over the draft. */
export function isDraftOurSideSet(line: LineupLine): boolean {
  return isLineSet({
    discipline: line.discipline,
    playerLabels: draftOurNames(line),
    noPlayer: line.noPlayer,
  });
}

/**
 * The opponent side of a builder line is not left half-done.
 *
 * Opponent names stay optional — lineups are often exchanged on match day —
 * so an unnamed opponent is fine. A doubles pair with ONE name is not: a pair
 * is two players, or none yet, or their No player.
 */
export function isDraftOpponentSet(line: LineupLine): boolean {
  if (line.discipline !== "doubles" || line.noPlayer || line.theirNoPlayer) {
    return true;
  }
  return splitNames(line.theirLabels.join(" / ")).length !== 1;
}

/** A builder line counts toward "N of 9 set": both sides answered. */
export function isDraftLineSet(line: LineupLine): boolean {
  return isDraftOurSideSet(line) && isDraftOpponentSet(line);
}
