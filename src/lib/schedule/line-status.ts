/**
 * The words a line's state is spelled with, and how the chip carries them.
 *
 * `entry-state.ts` is the one answer to *what* a line is waiting for; this is
 * the one answer to what that is CALLED. The event page's line rows and Team
 * Home's dual sheet had the same three words typed into their own JSX, which is
 * how two screens start telling a coach different stories about one job — the
 * same failure the shared `EntryState` exists to prevent, one step down.
 *
 * Tone and `live` ride along with the word rather than staying at the call
 * sites, because they are the same claim: "failed is loss-toned" and "analyzing
 * is the state that pulses" are decisions about the state, not about the
 * surface. Two files deciding them independently is the duplication this file
 * removes, not a smaller version of it left behind. `live` on `working` and not
 * on `waiting` is the distinction `isWorking` draws — something is queued;
 * nothing is moving.
 *
 * Only the three waiting states are here. `empty`, `no-video` and `ready` end
 * their row with an action or with nothing at all, and what those actions are
 * differs by surface — the event page can write, Team Home cannot — so each
 * file still owns its own.
 */

import type { StatusTone } from "@/components/ui/status-chip";
import type { EntryState } from "./entry-state";

export type LineStatus = {
  label: string;
  tone: StatusTone;
  /** Pulses. True only where something is happening right now. */
  live?: boolean;
};

export const LINE_STATUS: Partial<Record<EntryState, LineStatus>> = {
  working: { label: "Analyzing", tone: "blue", live: true },
  waiting: { label: "In line", tone: "blue" },
  failed: { label: "Analysis failed", tone: "loss" },
  forfeited: { label: "Forfeited", tone: "neutral" },
};
