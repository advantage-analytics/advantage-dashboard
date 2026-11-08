/**
 * Undo and redo for the trim step's window (⌘Z / ⌘⇧Z).
 *
 * Pure, so the rules are pinned offline (`tests/trim-history.spec.ts`). The
 * trim step keeps one of these in a ref and records every COMMITTED change —
 * a drag's release, an arrow nudge, `I`/`O`, a Set button — never the live
 * frames of a drag, so one gesture is one undo.
 *
 * An undo is an ordinary trim change: the step hands the restored window to
 * `onTrimChange`, which runs the top-player drift rule exactly as a drag would
 * (`docs/ui-revamp-guardrails.md` §4). Nothing here remembers or restores a
 * camera answer — undoing back over a start that cleared one leaves it
 * unanswered, because a false keep costs the match and a false clear costs a
 * click.
 */

export interface TrimWindow {
  start: number;
  end: number;
}

export interface TrimHistory {
  /** Older windows, most recent last. */
  past: TrimWindow[];
  /** Windows undone from, the next redo last. */
  future: TrimWindow[];
}

/** How many steps back are kept — far more than anyone presses ⌘Z. */
export const TRIM_HISTORY_LIMIT = 100;

export const EMPTY_TRIM_HISTORY: TrimHistory = { past: [], future: [] };

function same(a: TrimWindow, b: TrimWindow): boolean {
  return a.start === b.start && a.end === b.end;
}

/**
 * Record a move from `from` to `to`. A change that moves nothing records
 * nothing; any real change drops the redo branch, as every editor does.
 */
export function recordTrim(
  history: TrimHistory,
  from: TrimWindow,
  to: TrimWindow,
): TrimHistory {
  if (same(from, to)) return history;
  const past = [...history.past, from];
  if (past.length > TRIM_HISTORY_LIMIT) past.shift();
  return { past, future: [] };
}

/** Step back from `current`. Null when there is nothing to undo. */
export function undoTrim(
  history: TrimHistory,
  current: TrimWindow,
): { history: TrimHistory; window: TrimWindow } | null {
  const window = history.past.at(-1);
  if (!window) return null;
  return {
    window,
    history: {
      past: history.past.slice(0, -1),
      future: [...history.future, current],
    },
  };
}

/** Step forward from `current`. Null when there is nothing to redo. */
export function redoTrim(
  history: TrimHistory,
  current: TrimWindow,
): { history: TrimHistory; window: TrimWindow } | null {
  const window = history.future.at(-1);
  if (!window) return null;
  return {
    window,
    history: {
      past: [...history.past, current],
      future: history.future.slice(0, -1),
    },
  };
}

/**
 * Is this key event ⌘Z / Ctrl+Z (undo) or ⌘⇧Z / Ctrl+⇧Z / Ctrl+Y (redo)?
 *
 * Either modifier is accepted on every platform: nothing else on this step
 * claims Ctrl+Z, and guessing the platform wrong would make the key dead.
 * `code` first, so a non-QWERTY layout's Z still works.
 */
export function trimHistoryKey(e: {
  key: string;
  code?: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}): "undo" | "redo" | null {
  if (e.altKey || !(e.metaKey || e.ctrlKey)) return null;
  const isZ = e.code ? e.code === "KeyZ" : /^z$/i.test(e.key);
  if (isZ) return e.shiftKey ? "redo" : "undo";
  const isY = e.code ? e.code === "KeyY" : /^y$/i.test(e.key);
  if (isY && e.ctrlKey && !e.metaKey && !e.shiftKey) return "redo";
  return null;
}
