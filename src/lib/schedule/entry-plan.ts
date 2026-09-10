/**
 * Reconciling an event's saved entries against the ones a coach just submitted.
 *
 * Pure, and deliberately separate from `actions.ts`: the interesting part of
 * editing a lineup is not the SQL, it is deciding which rows may move. A line
 * that already has a match — or a forfeit — is a line the rest of the product
 * has already answered questions about: a `matches` row points at it, the team
 * score counts it, the upload queue has stopped offering it. Re-pointing that
 * row at a different player would re-attribute a played match with nothing on
 * screen looking broken, which is the exact class of silent corruption
 * `docs/ui-revamp-guardrails.md` exists to prevent.
 *
 * So the plan has a fourth list beside insert/update/delete: `refuse`. A
 * non-empty `refuse` is not a partial success to be applied around — the caller
 * writes NOTHING and reports the first refused slot. Half-applying a lineup
 * edit leaves a dual that matches neither what was saved nor what was
 * submitted, and nobody can tell which lines took.
 *
 * Nothing here touches `matches`. A played line is refused, never rewritten and
 * never deleted.
 */

import type { LineupLineInput, TournamentEntryInput } from "./actions";
import type { EventEntry } from "./types";

/**
 * One submitted row, either kind, optionally carrying the id of the entry it
 * came from.
 *
 * The id is what a form round-trips when it loaded an existing lineup; a row
 * typed fresh has none and is matched on its slot instead. Both are optional
 * inputs to `createDual`/`createTournament` too, where they are simply ignored.
 */
export type IncomingEntry = (LineupLineInput | TournamentEntryInput) & {
  id?: string;
};

export interface EntryPlan {
  /** Submitted rows with no saved counterpart. */
  insert: { slot: string; row: IncomingEntry }[];
  /** Saved rows the submission changed, and that are free to change. */
  update: { id: string; slot: string; row: IncomingEntry }[];
  /** Saved rows the submission dropped, and that are free to disappear. */
  delete: { id: string; slot: string }[];
  /**
   * Rows the submission would have moved or removed but must not. Any entry
   * here means the whole save is refused — see the header.
   */
  refuse: { slot: string; reason: string }[];
}

/**
 * A tournament row carries a draw, a dual line carries a slot. Written as a
 * runtime discriminator rather than a `kind` parameter because both call sites
 * already know which shape they built, and one union is easier to keep honest
 * than two near-identical planners.
 */
function isTournamentRow(
  row: IncomingEntry,
): row is TournamentEntryInput & { id?: string } {
  return !("slot" in row);
}

/**
 * The human name of a row, and the key it is matched on when it has no id.
 *
 * A dual line has a real slot ('S1', 'D2'). A tournament entry has none — the
 * column is null by design, because an entry there has a draw rather than a
 * court — so its draw and position stand in. That label is what a refusal
 * names, so it has to read like something a coach can find on screen.
 */
export function slotKey(row: IncomingEntry): string {
  if (!isTournamentRow(row) && row.slot) return row.slot;
  const draw = isTournamentRow(row) ? row.draw : null;
  return `${draw ?? "Draw"} #${row.position}`;
}

function existingSlotKey(entry: EventEntry): string {
  if (entry.slot) return entry.slot;
  return `${entry.draw ?? "Draw"} #${entry.position}`;
}

const sameList = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((value, index) => value === b[index]);

/**
 * Is this saved entry settled — has the rest of the product already answered a
 * question about it?
 *
 * A match or a forfeit, in either order. `entryPlayed` in `entry-state.ts`
 * asks a narrower question (is it *decided*), which is not the one here: an
 * entry with a match whose score is still blank is just as unsafe to
 * re-attribute as one with a final score, because the match row exists and
 * points at these players.
 */
export function isSettled(entry: EventEntry): boolean {
  return entry.forfeit !== null || entry.matches.length > 0;
}

/** Why a settled entry cannot be touched, in the coach's own vocabulary. */
function settledReason(entry: EventEntry, dropped: boolean): string {
  const slot = existingSlotKey(entry);
  if (entry.forfeit !== null) {
    return dropped
      ? `${slot} is forfeited, so it can't be removed. Clear the forfeit first.`
      : `${slot} is forfeited. Clear the forfeit before changing this line.`;
  }
  return dropped
    ? `${slot} has a recorded match, so it can't be removed. Delete the match first.`
    : `${slot} has a recorded match. Delete the match before changing this line.`;
}

/**
 * Did the submission actually change this saved row?
 *
 * Compared field by field over only what the incoming shape carries. A
 * tournament row has no `opponent_labels` of its own — `recordResult` writes
 * that column when a round is scored — so folding it into the comparison would
 * report every scored entry as edited and refuse a save that changed nothing.
 */
function changed(entry: EventEntry, row: IncomingEntry): boolean {
  if (entry.discipline !== row.discipline) return true;
  if (!sameList(entry.playerUserIds, row.playerUserIds)) return true;
  if (!sameList(entry.playerLabels, row.playerLabels)) return true;

  if (isTournamentRow(row)) {
    // A tournament entry has no slot — `position` IS half of its identity
    // (see `slotKey`), so a row that moved is a row that changed.
    if (entry.position !== row.position) return true;
    return entry.draw !== row.draw || entry.seed !== row.seed;
  }

  // `position` is deliberately NOT compared for a dual line. A court's
  // position is a fact about its slot, compared on the next line, so the two
  // can never disagree about anything a coach did. Comparing it as well only
  // adds a way to be wrong: a row whose stored position came from an older
  // scheme reads as edited, and if that line is settled the save is refused
  // over a court nobody touched.
  if ((entry.slot ?? "") !== row.slot) return true;
  if (!sameList(entry.opponentLabels, row.opponentLabels)) return true;
  return entry.forfeit !== (row.forfeit ?? null);
}

/**
 * The plan for one save.
 *
 * Matched by entry id where the submitted row carries one, and by slot
 * otherwise — a coach who retypes a lineup without ids still lands on the same
 * rows rather than deleting nine lines and inserting nine more, which would
 * orphan every match hanging off them.
 */
export function planEntryChanges(
  existing: EventEntry[],
  incoming: LineupLineInput[] | TournamentEntryInput[],
): EntryPlan {
  const plan: EntryPlan = { insert: [], update: [], delete: [], refuse: [] };

  const byId = new Map(existing.map((entry) => [entry.id, entry]));
  const bySlot = new Map(
    existing.map((entry) => [existingSlotKey(entry), entry]),
  );

  const matched = new Set<string>();

  for (const row of incoming as IncomingEntry[]) {
    const slot = slotKey(row);
    const entry = row.id ? byId.get(row.id) : bySlot.get(slot);

    if (!entry) {
      plan.insert.push({ slot, row });
      continue;
    }

    matched.add(entry.id);

    if (!changed(entry, row)) continue;

    if (isSettled(entry)) {
      plan.refuse.push({
        slot: existingSlotKey(entry),
        reason: settledReason(entry, false),
      });
      continue;
    }

    plan.update.push({ id: entry.id, slot, row });
  }

  for (const entry of existing) {
    if (matched.has(entry.id)) continue;
    const slot = existingSlotKey(entry);
    if (isSettled(entry)) {
      plan.refuse.push({ slot, reason: settledReason(entry, true) });
      continue;
    }
    plan.delete.push({ id: entry.id, slot });
  }

  return plan;
}
