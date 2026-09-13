/**
 * Which scheduled lines a one-off team match could go on, and why the others
 * can't — pure, over a schedule already read, so the Edit Match dialog's
 * picker can be tested without a database.
 *
 * Every disabled reason here mirrors a refusal in
 * `attach_match_to_event_line` (the database is the authority; this only
 * keeps the menu honest before the click). Lines that can't take the match
 * are still listed, greyed, with the reason — a coach looking for S1 should
 * learn it already has a result, not wonder where it went.
 */

import { normalizedPersonName } from "@/lib/data/person-name";
import { normalizeRound } from "@/lib/matches/round-options";
import { resolveEntryResult } from "@/lib/schedule/entry-state";
import type { EventEntry, EventKind, ProgramEvent } from "@/lib/schedule/types";

export type AttachLineState =
  | "available"
  | "hasResult"
  | "doubles"
  | "forfeit"
  | "needsRound"
  | "roundTaken";

export interface AttachLine {
  entryId: string;
  eventId: string;
  eventName: string;
  eventKind: EventKind;
  /** 'S2' on a dual; null for a tournament entry. */
  slot: string | null;
  /** The round the match would take: the slot on a dual, the match's own round on a tournament. */
  round: string | null;
  startsOn: string;
  endsOn: string;
  surface: string | null;
  site: ProgramEvent["site"];
  /** Our side on the lineup, joined — "Dana Brooks". Empty when the lineup isn't set. */
  lineupLabel: string;
  opponentLabel: string;
  state: AttachLineState;
  /** What a disabled row says instead of its state. Null when available. */
  reason: string | null;
  /** The match's player is on this line's lineup. */
  playerOnLineup: boolean;
  /** The lineup names someone else. Null when it names the match's player, or nobody. */
  lineupMismatch: string | null;
  /** The event's format disagrees with the match's own. */
  formatDiffers: boolean;
  /** The event's own format, for the note that says how they differ. */
  eventBestOf: number;
  eventAdScoring: boolean | null;
  /** The event runs on the match's date. */
  sameDay: boolean;
}

export interface AttachLineGroups {
  /** Same day, open, and the match's player is on the lineup. */
  suggested: AttachLine[];
  /** Everything else on the match's date. */
  sameDay: AttachLine[];
  /** Name matches on other days. Empty without a query. */
  search: AttachLine[];
}

export interface AttachMatchFacts {
  /** YYYY-MM-DD. */
  date: string;
  round: string | null;
  player1Id: string | null;
  player1Name: string;
  bestOf: number;
  adScoring: boolean | null;
}

const SEARCH_LIMIT = 20;

function lineFor(
  event: ProgramEvent,
  entry: EventEntry,
  match: AttachMatchFacts,
  canonical: ReadonlyMap<string, string>,
): AttachLine {
  const canon = (id: string) => canonical.get(id) ?? id;
  const wanted = normalizedPersonName(match.player1Name);
  const byId =
    match.player1Id !== null &&
    entry.playerUserIds.some((id) => canon(id) === canon(match.player1Id!));
  const byName =
    wanted.length > 0 &&
    entry.playerLabels.some((label) => normalizedPersonName(label) === wanted);
  const playerOnLineup = byId || byName;
  const lineupLabel = entry.playerLabels.join(" · ");
  const hasLineup =
    entry.playerLabels.length > 0 || entry.playerUserIds.length > 0;

  // A tournament round in its short code ("QF"), whatever spelling the match
  // was saved with — attaching writes the code (`attachMatchToLine`), so the
  // taken-round check must compare codes too.
  const round =
    event.kind === "dual" ? entry.slot : normalizeRound(match.round);

  let state: AttachLineState = "available";
  let reason: string | null = null;
  if (entry.discipline !== "singles") {
    state = "doubles";
    reason = "Doubles";
  } else if (entry.forfeit !== null) {
    state = "forfeit";
    reason = "Forfeited";
  } else if (event.kind === "dual") {
    if (resolveEntryResult(entry, null).kind !== "unanswered") {
      state = "hasResult";
      reason = "Has a result";
    }
  } else if (round === null) {
    state = "needsRound";
    reason = "Set the round first";
  } else if (resolveEntryResult(entry, round).kind !== "unanswered") {
    state = "roundTaken";
    reason = `${round} has a result`;
  }

  const formatDiffers =
    event.format.bestOf !== match.bestOf ||
    (event.format.adScoring !== null &&
      match.adScoring !== null &&
      event.format.adScoring !== match.adScoring);

  return {
    entryId: entry.id,
    eventId: event.id,
    eventName: event.name,
    eventKind: event.kind,
    slot: entry.slot,
    round,
    startsOn: event.startsOn,
    endsOn: event.endsOn,
    surface: event.surface,
    site: event.site,
    lineupLabel,
    opponentLabel: entry.opponentLabels.join(" · "),
    state,
    reason,
    playerOnLineup,
    lineupMismatch:
      !playerOnLineup && hasLineup && lineupLabel !== "" ? lineupLabel : null,
    formatDiffers,
    eventBestOf: event.format.bestOf,
    eventAdScoring: event.format.adScoring,
    sameDay: match.date >= event.startsOn && match.date <= event.endsOn,
  };
}

/**
 * Group a program's lines for the picker.
 *
 * Duals list every line (a coach scans a dual by slot). Tournaments list only
 * the entries this player is on — a draw of forty names is not a choice.
 */
export function attachLineGroups(input: {
  events: readonly ProgramEvent[];
  entriesByEvent: ReadonlyMap<string, readonly EventEntry[]>;
  match: AttachMatchFacts;
  canonical?: ReadonlyMap<string, string>;
  query?: string;
}): AttachLineGroups {
  const canonical = input.canonical ?? new Map<string, string>();
  const needle = input.query?.trim().toLowerCase() ?? "";
  const suggested: AttachLine[] = [];
  const sameDay: AttachLine[] = [];
  const search: AttachLine[] = [];

  for (const event of input.events) {
    const nameHit = needle === "" || event.name.toLowerCase().includes(needle);
    const entries = input.entriesByEvent.get(event.id) ?? [];
    for (const entry of entries) {
      const line = lineFor(event, entry, input.match, canonical);
      if (event.kind === "tournament" && !line.playerOnLineup) continue;

      if (line.sameDay) {
        if (!nameHit) continue;
        if (line.state === "available" && line.playerOnLineup) {
          suggested.push(line);
        } else {
          sameDay.push(line);
        }
      } else if (needle !== "" && nameHit && search.length < SEARCH_LIMIT) {
        search.push(line);
      }
    }
  }

  const bySlot = (a: AttachLine, b: AttachLine) =>
    a.eventName.localeCompare(b.eventName) ||
    (a.slot ?? "").localeCompare(b.slot ?? "", undefined, { numeric: true });
  sameDay.sort(bySlot);
  search.sort((a, b) => a.startsOn.localeCompare(b.startsOn) || bySlot(a, b));
  return { suggested, sameDay, search };
}

/** "Singles 2" for S2, the round for a tournament, the slot otherwise. */
export function lineName(line: {
  eventKind: EventKind;
  slot: string | null;
  round: string | null;
}): string {
  if (line.eventKind === "dual" && line.slot) {
    const n = /^S(\d+)$/.exec(line.slot)?.[1];
    return n ? `Singles ${n}` : line.slot;
  }
  return line.round ?? line.slot ?? "";
}
