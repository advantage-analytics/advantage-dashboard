/** Serializable member schedule action inputs; safe for type-only client imports. */
import type { Discipline, EventSite, MatchEnding, OutcomeSide } from "./types";
import type { DoublesGamesTo } from "./format";

export type ActionError = { error: string };

export interface LineupLineInput {
  /**
   * The `program_event_entries` row this line came from, when a form loaded an
   * existing lineup. Absent on a line typed fresh, and ignored entirely by
   * `createDual` — it exists so `planEntryChanges` can match a submitted line
   * to a saved one by identity rather than by slot, which is what lets a coach
   * rename a slot without the save reading as "deleted S1, inserted S2".
   */
  id?: string;
  discipline: Discipline;
  slot: string;
  position: number;
  playerUserIds: string[];
  playerLabels: string[];
  opponentLabels: string[];
  /**
   * A dual line our side cannot field. Its players are empty, and saving it
   * records a forfeit for our side — the point goes to THEM. Absent on a
   * tournament entry, and false on every named line.
   */
  noPlayer?: boolean;
  /**
   * A dual line the OPPONENT cannot field. Its opponent names are empty, and
   * saving it records a forfeit for their side — the point goes to US. Never
   * true alongside `noPlayer`.
   */
  opponentNoPlayer?: boolean;
}

export interface CreateDualInput {
  opponent: string;
  /**
   * `programs.program_key` when the coach picked the opponent out of the
   * directory, null when they typed a name. Not the uuid: `search_programs`
   * returns the key and nothing else, and widening a shipped SECURITY DEFINER
   * function's return shape to carry an id is the change 20260822090500 warns
   * lands two things broken at once. Resolved server-side instead.
   */
  opponentProgramKey: string | null;
  date: string;
  /** "HH:MM" local start time, or null when the coach left it unset. */
  startsAtTime: string | null;
  site: EventSite;
  surface: string;
  bestOf: number;
  adScoring: boolean | null;
  /**
   * The doubles lines' format. `bestOf`/`adScoring` are the singles format;
   * doubles is always one set, of this length, with its own ad scoring.
   */
  doublesGamesTo: DoublesGamesTo;
  doublesAdScoring: boolean;
  lines: LineupLineInput[];
}

export interface TournamentEntryInput {
  /** See `LineupLineInput.id` — the saved row this entry came from, if any. */
  id?: string;
  discipline: Discipline;
  position: number;
  draw: string | null;
  seed: number | null;
  playerUserIds: string[];
  playerLabels: string[];
}

export interface CreateTournamentInput {
  name: string;
  startsOn: string;
  endsOn: string;
  site: EventSite;
  surface: string;
  host: string | null;
  bestOf: number;
  /**
   * Ad or no-ad. Not optional even though a tournament has no single format in
   * theory: the vision pipeline refuses a job without it, and leaving it null
   * meant every tournament video failed submission after the coach had gone.
   */
  adScoring: boolean;
  entries: TournamentEntryInput[];
}

export interface RecordResultInput {
  entryId: string;
  /** 'R16' for a tournament. Null on a dual line, whose slot is its round. */
  round: string | null;
  opponentLabels: string[];
  opponentSchool?: string | null;
  /** Game counts, ours first. A 7-6 set is 7 here — never the tiebreak points. */
  ourGames: number[];
  theirGames: number[];
  ourTiebreaks: (number | null)[];
  theirTiebreaks: (number | null)[];
  /**
   * A match that stopped: who retired or defaulted, which decides the winner
   * the games cannot. Absent or null for a match played out.
   */
  ending?: { kind: MatchEnding; side: OutcomeSide } | null;
}

/**
 * Editing an event that already exists.
 *
 * `updateDual` and `updateTournament` are `createDual`/`createTournament` a
 * second time — the same staff gate, the same `program_events` columns — plus
 * the one thing creating has no need of: deciding what may happen to lines the
 * rest of the product has already built on. That decision is
 * `planEntryChanges` in `entry-plan.ts`, pure and specced, and this half only
 * carries it out.
 *
 * **The plan is consulted before ANY write, the event row included.** A save
 * that renamed the tournament and then discovered it could not move a scored
 * entry would leave the coach with half their edit applied and no way to see
 * which half. Refusal is total.
 */

/** `{ eventId }` and everything `createDual` takes except who we are playing. */
export type UpdateDualInput = Omit<
  CreateDualInput,
  "opponent" | "opponentProgramKey"
> & {
  eventId: string;
};

export type UpdateTournamentInput = CreateTournamentInput & { eventId: string };
