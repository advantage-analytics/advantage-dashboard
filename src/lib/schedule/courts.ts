/**
 * A dual's courts, and the order they are always in.
 *
 * Six singles then three doubles, fixed. Every surface that lists a dual's
 * lines — the builder, the event page, the pinned bar's Change menu — draws
 * them in this order, so the order belongs in one place rather than being
 * agreed on separately by each of them.
 *
 * ── Why this is not read from `position` ────────────────────────────────────
 * `program_event_entries.position` exists and is written from this list, but
 * NOTHING should sort a dual by it. The column is a stored integer, so it can
 * disagree with the court it describes — rows written before this list was the
 * source (a 1-based scheme, and before that an index into only the FILLED
 * courts) are still on disk, and a court inserted next to one of those can land
 * on the same number. Postgres then breaks the tie however it likes and S2
 * draws above S1.
 *
 * Sorting by the slot instead makes that unreachable rather than unlikely: the
 * slot is the court's identity, it is never null on a dual line, and it cannot
 * drift from itself. A stale `position` becomes a value nothing reads, which is
 * the only kind of stale value that is safe to leave alone.
 *
 * A tournament entry is the opposite case and must NOT use this: it has no
 * slot, and its `position` really is part of its identity (see `slotKey` in
 * `entry-plan.ts`), so it is ordered by the column.
 */
export const DUAL_SLOT_ORDER = [
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
 * Where this court sits, or `-1` for anything that is not one of the nine.
 *
 * An unknown slot sorts before S1 rather than throwing. A dual's slots are
 * written by this app and are always in the list; a row that somehow is not
 * should still be visible on the page, where somebody can see it and fix it.
 */
export function courtIndex(slot: string | null): number {
  if (!slot) return -1;
  return (DUAL_SLOT_ORDER as readonly string[]).indexOf(slot);
}

/**
 * Order two entries of one event.
 *
 * By court where both carry one — every dual line does — and by the stored
 * `position` otherwise, which is what a tournament entry is ordered by and all
 * it has.
 */
export function compareEntryOrder(
  a: { slot: string | null; position: number },
  b: { slot: string | null; position: number }
): number {
  if (a.slot && b.slot) {
    const byCourt = courtIndex(a.slot) - courtIndex(b.slot);
    if (byCourt !== 0) return byCourt;
  }
  return a.position - b.position;
}
