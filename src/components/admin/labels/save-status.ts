/**
 * The console header's autosave indicator — its state machine and its words.
 * Pure, so every transition is a spec. There is no Save button anywhere on the
 * page: every edit writes the moment it is made, and this is the only place
 * the labeller learns whether it landed.
 *
 *   idle     nothing saved yet this visit — the indicator draws nothing
 *   saving   at least one write in flight — "Saving…"
 *   saved    the last write to settle succeeded — "Saved · just now"
 *   error    the last write to settle failed — "Not saved · <reason>"; the
 *            console has already put the old value back
 *
 * The last write to SETTLE decides between saved and error, whichever
 * started first: each edit reverts on its own failure, so what is on screen
 * after a later success is saved data, and the error it replaced is stale.
 */

export interface SaveStatus {
  /** Writes started and not yet settled. */
  pending: number;
  last:
    | { kind: "idle" }
    | { kind: "saved"; at: number }
    | { kind: "error"; message: string };
}

export type SaveEvent =
  | { type: "start" }
  | { type: "success"; at: number }
  | { type: "failure"; message: string };

export const INITIAL_SAVE_STATUS: SaveStatus = {
  pending: 0,
  last: { kind: "idle" },
};

export function saveStatusReducer(
  state: SaveStatus,
  event: SaveEvent,
): SaveStatus {
  switch (event.type) {
    case "start":
      return { ...state, pending: state.pending + 1 };
    case "success":
      return {
        pending: Math.max(0, state.pending - 1),
        last: { kind: "saved", at: event.at },
      };
    case "failure":
      return {
        pending: Math.max(0, state.pending - 1),
        last: { kind: "error", message: event.message },
      };
  }
}

export type SaveStatusView =
  { tone: "idle" } | { tone: "saving" | "saved" | "error"; text: string };

/** Under a minute reads "just now"; after that, whole minutes, then hours. */
function ago(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ago`;
}

export function saveStatusView(
  status: SaveStatus,
  now: number,
): SaveStatusView {
  if (status.pending > 0) return { tone: "saving", text: "Saving…" };
  switch (status.last.kind) {
    case "idle":
      return { tone: "idle" };
    case "saved":
      return {
        tone: "saved",
        text: `Saved · ${ago(Math.max(0, now - status.last.at))}`,
      };
    case "error":
      return { tone: "error", text: `Not saved · ${status.last.message}` };
  }
}
