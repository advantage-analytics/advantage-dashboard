/**
 * The peek-drawer selection model as a pure state machine — no React, no DOM,
 * so it runs in Node. `useRowSelection` (beside this file) is the wrapper that
 * owns the `useState`, the URL mirror, the timers and the focus/scroll calls.
 *
 * Every transition returns the SAME object when nothing changes, so a caller
 * can compare by identity to learn whether a step, or a cut, did anything.
 */

export interface RowSelectionState {
  /** The row carrying the wash and `aria-current`. Null while nothing is selected. */
  selectedId: string | null;
  /**
   * What the drawer shows. Equal to `selectedId` except while the slide-out
   * plays, when the selection is already gone and the drawer still is not.
   */
  drawerId: string | null;
  /** The drawer is sliding out. */
  closing: boolean;
  /** The last open came from a key, so the drawer should take focus. */
  openedByKeyboard: boolean;
}

export type RowSelectionAction =
  /** Open (or move) the drawer onto `id`. */
  | { type: "select"; id: string; viaKeyboard: boolean }
  /** A row click: open the drawer on `id`, or close it if it is already there. */
  | { type: "toggle"; id: string; viaKeyboard: boolean }
  /** Drop the selection and start the slide-out. */
  | { type: "close" }
  /** ↑/↓ — move one row through `ids`, the rows on screen in drawn order. */
  | { type: "step"; delta: -1 | 1; ids: readonly string[] }
  /**
   * The visible rows are now `ids`. If the drawer's row is not among them the
   * selection is dropped at once — unless a slide-out is already playing, which
   * is left to finish.
   */
  | { type: "cutHid"; ids: readonly string[] }
  /** The slide-out finished: the drawer lets go of its record. */
  | { type: "finishClose" };

/** Where a page lands: open on `initialId` only if it names a listed row. */
export function initialRowSelection(
  ids: readonly string[],
  initialId: string | null,
): RowSelectionState {
  const initial = initialId && ids.includes(initialId) ? initialId : null;
  return {
    selectedId: initial,
    drawerId: initial,
    closing: false,
    openedByKeyboard: false,
  };
}

export interface RowSelectionPosition {
  /** `drawerId`'s position among the visible `ids`, or -1. */
  index: number;
  /** How many rows are visible — the drawer counter's denominator. */
  total: number;
  canPrev: boolean;
  canNext: boolean;
}

/**
 * Where the drawer stands among the visible rows. Read off `drawerId`, not
 * `selectedId`, so the counter and the prev/next buttons hold their values
 * while the slide-out plays instead of blanking the moment a close starts.
 */
export function rowSelectionPosition(
  state: Pick<RowSelectionState, "drawerId">,
  ids: readonly string[],
): RowSelectionPosition {
  const index = state.drawerId ? ids.indexOf(state.drawerId) : -1;
  return {
    index,
    total: ids.length,
    canPrev: index > 0,
    canNext: index >= 0 && index < ids.length - 1,
  };
}

export function rowSelectionReducer(
  state: RowSelectionState,
  action: RowSelectionAction,
): RowSelectionState {
  switch (action.type) {
    case "select":
      return select(state, action.id, action.viaKeyboard);

    case "toggle":
      return state.selectedId === action.id
        ? close(state)
        : select(state, action.id, action.viaKeyboard);

    case "close":
      return close(state);

    case "step": {
      if (!state.selectedId) return state;
      const next =
        action.ids[action.ids.indexOf(state.selectedId) + action.delta];
      if (!next) return state;
      return select(state, next, true);
    }

    case "cutHid":
      if (state.drawerId === null || action.ids.includes(state.drawerId))
        return state;
      if (state.closing) return state;
      return { ...state, selectedId: null, drawerId: null, closing: false };

    case "finishClose":
      if (state.drawerId === null && !state.closing) return state;
      return { ...state, drawerId: null, closing: false };
  }
}

function select(
  state: RowSelectionState,
  id: string,
  viaKeyboard: boolean,
): RowSelectionState {
  if (
    state.selectedId === id &&
    state.drawerId === id &&
    !state.closing &&
    state.openedByKeyboard === viaKeyboard
  )
    return state;
  return {
    selectedId: id,
    drawerId: id,
    closing: false,
    openedByKeyboard: viaKeyboard,
  };
}

function close(state: RowSelectionState): RowSelectionState {
  if (state.selectedId === null && state.closing) return state;
  return { ...state, selectedId: null, closing: true };
}
