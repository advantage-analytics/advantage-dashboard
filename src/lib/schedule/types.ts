/**
 * The schedule's shapes — events, the entries under them, and the matches an
 * entry has produced.
 *
 * An entry is somebody on our side, in a slot, at an event. It deliberately
 * carries no score and no result: the moment anyone records how a line went, a
 * `matches` row exists and the score lives there. See
 * `supabase/migrations/20260820072347_program_event_entries.sql`.
 */

import type { AnalysisStatus } from "@/lib/data/match-analysis";

export type EventKind = "dual" | "tournament";
export type EventSite = "home" | "away" | "neutral";
export type Discipline = "singles" | "doubles";

export interface EventFormat {
  bestOf: number;
  /**
   * Ad or no-ad. Nullable because "not chosen" is a real state — the vision
   * pipeline rejects a job without it, and a `false` default would be a wrong
   * answer that looks like a real one.
   */
  adScoring: boolean | null;
}

export interface ProgramEvent {
  id: string;
  programId: string;
  kind: EventKind;
  /** Opponent school for a dual, the tournament's own name for a tournament. */
  name: string;
  /** YYYY-MM-DD. */
  startsOn: string;
  /** Equal to `startsOn` for a dual. */
  endsOn: string;
  site: EventSite;
  surface: string | null;
  host: string | null;
  format: EventFormat;
}

/** A match hanging off an entry, reduced to what a schedule surface needs. */
export interface EntryMatch {
  id: string;
  /** 'R16' for a tournament. Null on a dual line, whose slot is its round. */
  round: string | null;
  /**
   * From `resolveAnalysisStatus` — the shared vocabulary, so "Analyzing" here
   * and "Analyzing" on the match page are the same claim about the same job.
   */
  status: AnalysisStatus;
  /**
   * Game counts. `player1` is always our side. A 7-6 set is 7 here, not the
   * tiebreak.
   *
   * The tiebreak POINTS ride along in the same `matches.score` JSONB — the
   * loader selects the whole column and hands it over untouched — and are
   * stored against whoever LOST the set. Optional because a match scored before
   * the tiebreak cells existed has neither array.
   */
  score: {
    player1: number[];
    player2: number[];
    player1_tiebreaks?: (number | null)[];
    player2_tiebreaks?: (number | null)[];
  } | null;
  opponentLabels: string[];
  /** Has a processing job, i.e. video was actually sent. */
  hasVideo: boolean;
}

export interface EventEntry {
  id: string;
  eventId: string;
  discipline: Discipline;
  /** 'S1'…'D3' for a dual; null for a tournament entry, which has a draw. */
  slot: string | null;
  position: number;
  /** Where a tournament player STARTS — 'main', 'qualifying', a flight label. */
  draw: string | null;
  seed: number | null;
  playerUserIds: string[];
  /** Written at create, never re-derived. A lineup must survive a roster edit. */
  playerLabels: string[];
  opponentLabels: string[];
  opponentSchool: string | null;
  /** 0..1 for a dual line; 0..n for a tournament entry — that is its run. */
  matches: EntryMatch[];
}

/** One row on the schedule page. Everything here is computed, nothing stored. */
export interface ScheduleRow {
  id: string;
  kind: EventKind;
  name: string;
  startsOn: string;
  endsOn: string;
  site: EventSite;
  entryCount: number;
  /** Entries with at least one decided match. */
  playedCount: number;
  /** Matches with something happening right now. */
  workingCount: number;
  /** Only for a dual, and only once every line is in. */
  teamScore: { us: number; them: number } | null;
}

export interface EventDetail {
  event: ProgramEvent;
  entries: EventEntry[];
}

/** A group in the upload wizard's first step — one event, its videoless lines. */
export interface UploadQueueGroup {
  event: ProgramEvent;
  /** Entries with no video yet. Never the whole event. */
  entries: EventEntry[];
  withVideo: number;
  total: number;
}
