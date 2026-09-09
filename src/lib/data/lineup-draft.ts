/**
 * The lineup draft the Roster page edits, as a pure model.
 *
 * While Set lineup is on, the table holds ONE reorderable sequence: player
 * ids with a single `BENCH` sentinel among them. Everything before the
 * sentinel holds a line, in order; everything after it does not. This module
 * is the arithmetic on that sequence — kept out of the component so the page
 * and its test agree on what a save would write, and so a Playwright spec can
 * import it without dragging framer-motion and `next/link` into node.
 */

/** The sentinel in a lineup sequence: above it is the lineup, below it the bench. */
export const BENCH = "__bench__";

/** The lined-up ids, in order — the part of a sequence before the sentinel. */
export function lineupOrder(sequence: string[]): string[] {
  const at = sequence.indexOf(BENCH);
  return at < 0 ? sequence : sequence.slice(0, at);
}

/**
 * The display sequence for a roster: everyone holding a line, in order, then
 * the sentinel, then everyone who is not.
 *
 * Both callers used to build this inline — the mode's opening draft and the
 * table's resting order — differing only in whether the sentinel appears when
 * nobody is benched. That put the invariant "ranked, then BENCH, then rest" in
 * two files and under no test. `sentinel: "always"` is the editor, which needs
 * somewhere to drop a player being benched; `"if-needed"` is the resting
 * table, which should not draw an empty heading.
 */
export function sequenceFrom(
  members: readonly { playerId: string; lineupSpot: number | null }[],
  { sentinel }: { sentinel: "always" | "if-needed" },
): string[] {
  const ranked: string[] = [];
  const bench: string[] = [];
  for (const member of members) {
    (member.lineupSpot === null ? bench : ranked).push(member.playerId);
  }
  if (sentinel === "if-needed" && bench.length === 0) return ranked;
  return [...ranked, BENCH, ...bench];
}

/**
 * The spot each player would hold after a save: 1..N down the lineup, null
 * on the bench. This is exactly what `set_program_lineup` writes, so it is
 * what "changed" has to be measured against.
 */
export function lineupSpots(
  sequence: string[],
  playerIds: readonly string[],
): Map<string, number | null> {
  const order = lineupOrder(sequence);
  const spots = new Map<string, number | null>();
  for (const id of playerIds) spots.set(id, null);
  order.forEach((id, index) => spots.set(id, index + 1));
  return spots;
}

/**
 * Would saving this sequence change anything?
 *
 * Compared spot by spot against what the roster holds now, not order against
 * order: two players parked on one line from the Edit player form, or a gap
 * in the numbering, are states the draft normalises to 1..N — so saving an
 * "unchanged" order over them IS a change, and the button should say so.
 * Conversely, re-entering the mode and dragging a row back to where it
 * started is not one, and Save stays quiet.
 *
 * The button is disabled when this is false. The database would shrug at a
 * no-op save — the RPC already skips rows whose spot is unchanged — but it
 * would still write a `lineup.set` audit row for an edit nobody made, and an
 * enabled Save is a promise that there is something to save.
 */
export function lineupChanged(
  sequence: string[],
  members: readonly { playerId: string; lineupSpot: number | null }[],
): boolean {
  const next = lineupSpots(
    sequence,
    members.map((m) => m.playerId),
  );
  return members.some((m) => next.get(m.playerId) !== m.lineupSpot);
}

/**
 * A draft as the resting table should draw it once saved: the same order,
 * minus a trailing sentinel when nobody is benched.
 *
 * The editor's draft always carries `BENCH` (it needs somewhere to drop a
 * player); the resting table only draws the divider when somebody is under
 * it (`sequenceFrom`'s `"if-needed"`). This is the bridge between the two,
 * for the moment after Save when the draft is still the truth on screen and
 * the server's rows have not caught up yet.
 */
export function settledSequence(sequence: string[]): string[] {
  const at = sequence.indexOf(BENCH);
  return at === sequence.length - 1 ? sequence.slice(0, at) : sequence;
}
