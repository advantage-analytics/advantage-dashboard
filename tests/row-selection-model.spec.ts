import { expect, test } from "@playwright/test";

import {
  initialRowSelection,
  rowSelectionPosition,
  rowSelectionReducer,
  type RowSelectionAction,
  type RowSelectionState,
} from "@/components/dashboard/schedule/row-selection-model";

/**
 * The peek-drawer selection model with no page behind it — the pure reducer
 * only, in Node. `useRowSelection` wraps it with the `useState`, the URL
 * mirror, the close timer and the DOM calls, none of which are exercised here.
 *
 * `ALL` is every row; `VISIBLE` is the same list after a filter hid "b" and
 * "d", so a step that walked the full list instead of the supplied one would
 * land on a row these tests never expect.
 */

const ALL = ["a", "b", "c", "d", "e"] as const;
const VISIBLE = ["a", "c", "e"] as const;

const IDLE: RowSelectionState = {
  selectedId: null,
  drawerId: null,
  closing: false,
  openedByKeyboard: false,
};

/** Run `actions` in order from `state`. */
function run(
  state: RowSelectionState,
  ...actions: RowSelectionAction[]
): RowSelectionState {
  return actions.reduce(rowSelectionReducer, state);
}

/** The drawer open on `id`, opened by pointer unless told otherwise. */
function openOn(id: string, viaKeyboard = false): RowSelectionState {
  return run(IDLE, { type: "select", id, viaKeyboard });
}

test.describe("initialRowSelection", () => {
  test("opens on an initialId that names a listed row", () => {
    expect(initialRowSelection(ALL, "c")).toEqual({
      selectedId: "c",
      drawerId: "c",
      closing: false,
      openedByKeyboard: false,
    });
  });

  test("stays shut when initialId is not in ids, is null, or is empty", () => {
    expect(initialRowSelection(ALL, "zzz")).toEqual(IDLE);
    expect(initialRowSelection(ALL, null)).toEqual(IDLE);
    expect(initialRowSelection(ALL, "")).toEqual(IDLE);
    expect(initialRowSelection([], "a")).toEqual(IDLE);
  });

  test("judges initialId against the list it is given, not every row", () => {
    expect(initialRowSelection(VISIBLE, "b")).toEqual(IDLE);
    expect(initialRowSelection(VISIBLE, "c").drawerId).toBe("c");
  });
});

test.describe("select and toggle", () => {
  test("toggle on an unselected id selects it", () => {
    const state = run(IDLE, { type: "toggle", id: "b", viaKeyboard: false });

    expect(state).toEqual({
      selectedId: "b",
      drawerId: "b",
      closing: false,
      openedByKeyboard: false,
    });
  });

  test("toggle on another row moves the drawer without closing it", () => {
    const state = run(openOn("b"), {
      type: "toggle",
      id: "d",
      viaKeyboard: false,
    });

    expect(state.selectedId).toBe("d");
    expect(state.drawerId).toBe("d");
    expect(state.closing).toBe(false);
  });

  test("toggle on the selected id starts a close and keeps the drawer's record", () => {
    const state = run(openOn("b"), {
      type: "toggle",
      id: "b",
      viaKeyboard: false,
    });

    expect(state.selectedId).toBeNull();
    expect(state.closing).toBe(true);
    expect(state.drawerId).toBe("b");
  });

  test("a select mid-close reopens the drawer and cancels the slide-out", () => {
    const closing = run(openOn("b"), { type: "close" });

    // The row being closed: `selectedId` is already null, so the toggle opens.
    expect(
      run(closing, { type: "toggle", id: "b", viaKeyboard: false }),
    ).toEqual(openOn("b"));
    expect(
      run(closing, { type: "select", id: "d", viaKeyboard: false }),
    ).toEqual(openOn("d"));
  });

  test("openedByKeyboard follows how the last select or toggle arrived", () => {
    for (const type of ["select", "toggle"] as const) {
      expect(
        run(IDLE, { type, id: "a", viaKeyboard: true }).openedByKeyboard,
        `${type} by key`,
      ).toBe(true);
      expect(
        run(IDLE, { type, id: "a", viaKeyboard: false }).openedByKeyboard,
        `${type} by pointer`,
      ).toBe(false);
      // A pointer open after a keyboard one clears the flag, and the reverse.
      expect(
        run(openOn("a", true), { type, id: "b", viaKeyboard: false })
          .openedByKeyboard,
        `${type} by pointer after a key`,
      ).toBe(false);
      expect(
        run(openOn("a", false), { type, id: "b", viaKeyboard: true })
          .openedByKeyboard,
        `${type} by key after a pointer`,
      ).toBe(true);
    }
  });

  test("re-selecting the open row by the other input updates openedByKeyboard", () => {
    const state = run(openOn("a", false), {
      type: "select",
      id: "a",
      viaKeyboard: true,
    });

    expect(state).toEqual(openOn("a", true));
  });
});

test.describe("close and finishClose", () => {
  test("close drops the selection, finishClose then empties the drawer", () => {
    const closing = run(openOn("c"), { type: "close" });

    expect(closing.selectedId).toBeNull();
    expect(closing.drawerId).toBe("c");
    expect(closing.closing).toBe(true);

    const closed = run(closing, { type: "finishClose" });

    expect(closed.selectedId).toBeNull();
    expect(closed.drawerId).toBeNull();
    expect(closed.closing).toBe(false);
  });

  test("a close leaves openedByKeyboard as the open set it", () => {
    const closed = run(
      openOn("c", true),
      { type: "close" },
      { type: "finishClose" },
    );

    expect(closed.openedByKeyboard).toBe(true);
  });
});

test.describe("step", () => {
  test("walks the supplied order forward and stops at the last row", () => {
    const down: RowSelectionAction = { type: "step", delta: 1, ids: VISIBLE };
    let state = openOn("a");

    state = run(state, down);
    expect(state.selectedId).toBe("c"); // not "b", which the filter hid
    expect(state.drawerId).toBe("c");

    state = run(state, down);
    expect(state.selectedId).toBe("e");

    const atEnd = run(state, down);
    expect(atEnd).toBe(state);
    expect(atEnd.selectedId).toBe("e");
  });

  test("walks the supplied order backward and stops at the first row", () => {
    const up: RowSelectionAction = { type: "step", delta: -1, ids: VISIBLE };
    let state = openOn("e");

    state = run(state, up);
    expect(state.selectedId).toBe("c");

    state = run(state, up);
    expect(state.selectedId).toBe("a");

    const atStart = run(state, up);
    expect(atStart).toBe(state);
    expect(atStart.selectedId).toBe("a");
  });

  test("follows a different order when one is supplied", () => {
    const sorted = ["e", "a", "c"];
    const state = run(openOn("e"), { type: "step", delta: 1, ids: sorted });

    expect(state.selectedId).toBe("a");
  });

  test("a step counts as a keyboard open", () => {
    const state = run(openOn("a", false), {
      type: "step",
      delta: 1,
      ids: VISIBLE,
    });

    expect(state.openedByKeyboard).toBe(true);
  });

  test("does nothing with no selection, including mid-close", () => {
    const down: RowSelectionAction = { type: "step", delta: 1, ids: VISIBLE };
    const closing = run(openOn("a"), { type: "close" });

    expect(run(IDLE, down)).toBe(IDLE);
    expect(run(closing, down)).toBe(closing);
  });

  // The selection is not among the rows being stepped through — `indexOf` is
  // -1, so ↓ lands on the first row and ↑ has nowhere to go. The hook never
  // reaches this in practice: `cutHid` clears such a selection during render.
  test("from a selection not in ids, ↓ lands on the first row and ↑ stands still", () => {
    const hidden = openOn("b");

    const down = run(hidden, { type: "step", delta: 1, ids: VISIBLE });
    expect(down.selectedId).toBe("a");
    expect(down.drawerId).toBe("a");

    expect(run(hidden, { type: "step", delta: -1, ids: VISIBLE })).toBe(hidden);
    expect(run(hidden, { type: "step", delta: 1, ids: [] })).toBe(hidden);
  });
});

test.describe("cutHid", () => {
  test("clears selection and drawer when the selected row left the list", () => {
    const state = run(openOn("b", true), { type: "cutHid", ids: VISIBLE });

    expect(state.selectedId).toBeNull();
    expect(state.drawerId).toBeNull();
    expect(state.closing).toBe(false);
    // Only the open/close fields move; the flag is left as it was.
    expect(state.openedByKeyboard).toBe(true);
  });

  test("leaves a selection that is still listed alone", () => {
    const open = openOn("c");

    expect(run(open, { type: "cutHid", ids: VISIBLE })).toBe(open);
  });

  test("stands down while a slide-out is playing", () => {
    // The caller's `close(null)` ahead of its cut: the drawer keeps its
    // record so the slide-out can finish, and `finishClose` drops it.
    const closing = run(openOn("b"), { type: "close" });
    const afterCut = run(closing, { type: "cutHid", ids: VISIBLE });

    expect(afterCut).toBe(closing);
    expect(afterCut.drawerId).toBe("b");
    expect(afterCut.closing).toBe(true);

    expect(run(afterCut, { type: "finishClose" })).toEqual(IDLE);
  });

  test("an emptied list clears an open drawer", () => {
    expect(run(openOn("a"), { type: "cutHid", ids: [] })).toEqual(IDLE);
  });
});

test.describe("no-op transitions return the same object", () => {
  test("select onto the row already open, by the same input", () => {
    const open = openOn("a", true);

    expect(run(open, { type: "select", id: "a", viaKeyboard: true })).toBe(
      open,
    );
    // The other input is a real change — see openedByKeyboard above.
    expect(run(open, { type: "select", id: "a", viaKeyboard: false })).not.toBe(
      open,
    );
  });

  test("close while a close is already playing", () => {
    const closing = run(openOn("a"), { type: "close" });

    expect(run(closing, { type: "close" })).toBe(closing);
  });

  test("finishClose with nothing to finish", () => {
    expect(run(IDLE, { type: "finishClose" })).toBe(IDLE);

    const closed = run(openOn("a"), { type: "close" }, { type: "finishClose" });
    expect(run(closed, { type: "finishClose" })).toBe(closed);
  });

  test("cutHid with no drawer, or with its row still listed", () => {
    const open = openOn("a");

    expect(run(IDLE, { type: "cutHid", ids: VISIBLE })).toBe(IDLE);
    expect(run(IDLE, { type: "cutHid", ids: [] })).toBe(IDLE);
    expect(run(open, { type: "cutHid", ids: ALL })).toBe(open);
  });

  test("a real transition never mutates the state it was given", () => {
    const open = Object.freeze(openOn("b"));
    const snapshot = { ...open };

    run(open, { type: "close" });
    run(open, { type: "toggle", id: "b", viaKeyboard: true });
    run(open, { type: "step", delta: 1, ids: ALL });
    run(open, { type: "cutHid", ids: VISIBLE });
    run(open, { type: "finishClose" });

    expect(open).toEqual(snapshot);
  });
});

test.describe("rowSelectionPosition", () => {
  test("reports the drawer's place among the visible rows", () => {
    expect(rowSelectionPosition(openOn("a"), VISIBLE)).toEqual({
      index: 0,
      total: 3,
      canPrev: false,
      canNext: true,
    });
    expect(rowSelectionPosition(openOn("c"), VISIBLE)).toEqual({
      index: 1,
      total: 3,
      canPrev: true,
      canNext: true,
    });
    expect(rowSelectionPosition(openOn("e"), VISIBLE)).toEqual({
      index: 2,
      total: 3,
      canPrev: true,
      canNext: false,
    });
  });

  test("is -1 with neither direction when nothing is open or the row is unlisted", () => {
    const nowhere = { index: -1, total: 3, canPrev: false, canNext: false };

    expect(rowSelectionPosition(IDLE, VISIBLE)).toEqual(nowhere);
    expect(rowSelectionPosition(openOn("b"), VISIBLE)).toEqual(nowhere);
  });

  test("a single visible row can go neither way", () => {
    expect(rowSelectionPosition(openOn("a"), ["a"])).toEqual({
      index: 0,
      total: 1,
      canPrev: false,
      canNext: false,
    });
  });

  test("derives from drawerId, not selectedId, while a close plays", () => {
    const closing = run(openOn("c"), { type: "close" });

    // The selection is gone; the drawer still shows "c" and so does the count.
    expect(closing.selectedId).toBeNull();
    expect(closing.drawerId).toBe("c");
    expect(rowSelectionPosition(closing, VISIBLE)).toEqual({
      index: 1,
      total: 3,
      canPrev: true,
      canNext: true,
    });

    // Once the slide-out finishes there is no drawer to place.
    expect(
      rowSelectionPosition(run(closing, { type: "finishClose" }), VISIBLE),
    ).toEqual({ index: -1, total: 3, canPrev: false, canNext: false });
  });
});
