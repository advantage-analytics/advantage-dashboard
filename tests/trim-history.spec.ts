import { expect, test } from "@playwright/test";
import {
  EMPTY_TRIM_HISTORY,
  TRIM_HISTORY_LIMIT,
  recordTrim,
  redoTrim,
  trimHistoryKey,
  undoTrim,
} from "@/components/dashboard/matches/new-match-wizard/trim-history";

// ⌘Z / ⌘⇧Z on the upload wizard's trim step. Pure rules, no browser.

const A = { start: 0, end: 600 };
const B = { start: 30, end: 600 };
const C = { start: 30, end: 540 };

test.describe("trim history", () => {
  test("undo walks back, redo walks forward", () => {
    let h = recordTrim(EMPTY_TRIM_HISTORY, A, B);
    h = recordTrim(h, B, C);

    const u1 = undoTrim(h, C);
    expect(u1?.window).toEqual(B);
    const u2 = undoTrim(u1!.history, B);
    expect(u2?.window).toEqual(A);
    expect(undoTrim(u2!.history, A)).toBeNull();

    const r1 = redoTrim(u2!.history, A);
    expect(r1?.window).toEqual(B);
    const r2 = redoTrim(r1!.history, B);
    expect(r2?.window).toEqual(C);
    expect(redoTrim(r2!.history, C)).toBeNull();
  });

  test("a new change after an undo drops the redo branch", () => {
    let h = recordTrim(EMPTY_TRIM_HISTORY, A, B);
    const u = undoTrim(h, B)!;
    h = recordTrim(u.history, A, C);
    expect(redoTrim(h, C)).toBeNull();
    expect(undoTrim(h, C)?.window).toEqual(A);
  });

  test("a change that moves nothing records nothing", () => {
    const h = recordTrim(EMPTY_TRIM_HISTORY, A, { ...A });
    expect(h).toBe(EMPTY_TRIM_HISTORY);
  });

  test("history is bounded", () => {
    let h = EMPTY_TRIM_HISTORY;
    for (let i = 0; i < TRIM_HISTORY_LIMIT + 10; i++) {
      h = recordTrim(h, { start: i, end: 600 }, { start: i + 1, end: 600 });
    }
    expect(h.past).toHaveLength(TRIM_HISTORY_LIMIT);
    expect(h.past[0]).toEqual({ start: 10, end: 600 });
  });
});

test.describe("trim history keys", () => {
  const key = (over: Partial<Parameters<typeof trimHistoryKey>[0]>) =>
    trimHistoryKey({
      key: "z",
      code: "KeyZ",
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      ...over,
    });

  test("⌘Z and Ctrl+Z undo; with shift they redo; Ctrl+Y redoes", () => {
    expect(key({ metaKey: true })).toBe("undo");
    expect(key({ ctrlKey: true })).toBe("undo");
    expect(key({ metaKey: true, shiftKey: true, key: "Z" })).toBe("redo");
    expect(key({ ctrlKey: true, shiftKey: true, key: "Z" })).toBe("redo");
    expect(key({ ctrlKey: true, key: "y", code: "KeyY" })).toBe("redo");
  });

  test("a bare Z, an alt chord or ⌘Y is not ours", () => {
    expect(key({})).toBeNull();
    expect(key({ metaKey: true, altKey: true })).toBeNull();
    expect(key({ metaKey: true, key: "y", code: "KeyY" })).toBeNull();
  });
});
