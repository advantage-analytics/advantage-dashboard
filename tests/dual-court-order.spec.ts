import { expect, test } from "@playwright/test";

import {
  compareEntryOrder,
  courtIndex,
  DUAL_SLOT_ORDER,
} from "@/lib/schedule/courts";

/**
 * A dual's court order must not depend on `program_event_entries.position`.
 *
 * The column is written from `DUAL_SLOT_ORDER` now, but rows written under two
 * earlier schemes are still on disk — a 1-based list, and before that an index
 * into only the FILLED courts. A court inserted next to one of those lands on
 * a number another row already holds, and Postgres then breaks the tie however
 * it likes. Ordering by the slot makes that unreachable instead of unlikely.
 */

const row = (slot: string | null, position: number) => ({ slot, position });

test.describe("dual court order", () => {
  test("the nine courts are singles then doubles", () => {
    expect([...DUAL_SLOT_ORDER]).toEqual([
      "S1",
      "S2",
      "S3",
      "S4",
      "S5",
      "S6",
      "D1",
      "D2",
      "D3",
    ]);
  });

  test("a court is found by its own name, and an unknown one sorts first", () => {
    expect(courtIndex("S1")).toBe(0);
    expect(courtIndex("D3")).toBe(8);
    expect(courtIndex(null)).toBe(-1);
    expect(courtIndex("Q7")).toBe(-1);
  });

  test("duals sort by court even when the stored positions collide", () => {
    // S1 inserted today (slot-derived 0) beside an S2 left over from the
    // 1-based scheme (also 0 after its own court moved). Sorting on the
    // integer alone is a coin flip; sorting on the court is not.
    const collided = [row("S2", 0), row("S1", 0)];
    expect(collided.sort(compareEntryOrder).map((r) => r.slot)).toEqual([
      "S1",
      "S2",
    ]);
  });

  test("duals sort by court even when the stored positions are reversed", () => {
    const reversed = [row("D1", 0), row("S3", 8), row("S1", 4)];
    expect(reversed.sort(compareEntryOrder).map((r) => r.slot)).toEqual([
      "S1",
      "S3",
      "D1",
    ]);
  });

  test("a tournament entry has no slot and keeps its stored order", () => {
    // Position IS half a tournament entry's identity — see `slotKey` in
    // `entry-plan.ts` — so it is the only thing there is to sort on.
    const draw = [row(null, 2), row(null, 0), row(null, 1)];
    expect(draw.sort(compareEntryOrder).map((r) => r.position)).toEqual([
      0, 1, 2,
    ]);
  });
});
