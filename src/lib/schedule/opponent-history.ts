/**
 * This program's dual history against an opponent school, purely from its
 * schedule.
 *
 * T5/T6 render an opponent list where each row wants a subline like "Men's ·
 * Big Ten · you lead 3–1" — this module is the "you lead 3–1" half. The design
 * mock also shows an opponent's OWN season record (an "18–4"-style figure);
 * that figure comes from matches this program never saw and does not exist
 * anywhere in this app, so nothing below invents one. Everything here
 * describes only this program's own duals against a name.
 *
 * A pure mapping over an already-read `ProgramSchedule`, same shape as
 * `roster-match.ts`: no Supabase client, no `"use client"`, testable without a
 * database. Callers here are staff-only builder screens, so `resultsScope` is
 * always `program` for them — there is no narrowed-read case to gate against,
 * unlike `scheduleRowsFrom`.
 */

import { dualScore } from "@/lib/schedule/entry-state";
import { formatEventSpan } from "@/lib/schedule/format";
import type { ProgramSchedule } from "@/lib/data/schedule-server";

/**
 * This program's decided duals against one opponent school.
 *
 * `us` / `them` count dual WINS, not games or sets — a 4–3 dual is one win,
 * the same unit `dualScore` already settles on. `played` can exceed
 * `us + them`: a dual can tie (an even split of lines with no doubles point to
 * break it), which counts as played without moving either win counter.
 */
export interface OpponentDualHistory {
  /** Decided duals against this opponent, home or away, any season. */
  played: number;
  /** Duals this program won. */
  us: number;
  /** Duals this program lost. */
  them: number;
  /** YYYY-MM-DD of the most recent decided dual, or null if never played. */
  lastPlayedOn: string | null;
}

const EMPTY_HISTORY: OpponentDualHistory = {
  played: 0,
  us: 0,
  them: 0,
  lastPlayedOn: null,
};

/**
 * Case/whitespace-insensitive rule for a school name: "Duke" and " duke  "
 * are one opponent, nothing looser than that.
 *
 * Deliberately not `normalizedPersonName` (`lib/data/person-name.ts`) despite
 * doing the same two things to a string. That function is "the one definition
 * of 'the same name'" for a PERSON, wired to a SQL twin
 * (`normalized_person_name`) and to the roster-merge tooling built on it — a
 * school name reusing it would borrow a comparison whose other end is scoped
 * to people. This is that same rule, copied rather than shared, for the one
 * string that is actually a school.
 */
function normalizedOpponentName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * This program's dual history against every opponent it has a decided dual
 * against, keyed by `normalizedOpponentName`.
 *
 * Duals are matched by `event.name` — the opponent school string every dual
 * event carries (see `ProgramEvent.name` in `lib/schedule/types.ts`). Some
 * entries also carry `opponent_program_id`, a stronger key once both sides of
 * a fixture are on the platform, but it is not on every event the way the name
 * is — a dual entered as free text has a name and no id — so name is what this
 * keys on. A caller that already has both programs' ids should prefer them.
 *
 * Gated by `dualScore(entries).decided` — exactly the gate `scheduleRowsFrom`
 * (`lib/data/schedule-server.ts`) uses before it will print a score. A dual
 * with lines still unplayed contributes nothing here, for the same reason it
 * prints no score there: a partial score is a result nobody has reached yet,
 * and folding it into a running tally would credit a win or loss that has not
 * happened.
 *
 * Tournament events are skipped outright: a tournament's `name` is its own
 * name, not an opponent's, and a bracket has no team-vs-team result to fold
 * into a dual tally.
 */
export function opponentDualHistory(
  schedule: ProgramSchedule
): Map<string, OpponentDualHistory> {
  const histories = new Map<string, OpponentDualHistory>();

  for (const event of schedule.events) {
    if (event.kind !== "dual") continue;

    const entries = schedule.entriesByEvent.get(event.id) ?? [];
    const score = dualScore(entries);
    if (!score.decided) continue;

    const key = normalizedOpponentName(event.name);
    const existing = histories.get(key) ?? EMPTY_HISTORY;

    histories.set(key, {
      played: existing.played + 1,
      us: existing.us + (score.us > score.them ? 1 : 0),
      them: existing.them + (score.them > score.us ? 1 : 0),
      // The later of what is already recorded and this event's date, found by
      // comparison rather than by trusting iteration order — correct even if
      // `schedule.events` is ever read in something other than today's
      // newest-first order.
      lastPlayedOn:
        existing.lastPlayedOn && existing.lastPlayedOn > event.startsOn
          ? existing.lastPlayedOn
          : event.startsOn,
    });
  }

  return histories;
}

/**
 * One opponent's record, defaulting to a clean slate for a name this program
 * has no decided dual against.
 *
 * Saves every caller from re-deriving `normalizedOpponentName` — which this
 * module does not export — just to do its own `?? EMPTY_HISTORY` on a lookup.
 */
export function opponentHistoryFor(
  histories: Map<string, OpponentDualHistory>,
  opponentSchoolName: string
): OpponentDualHistory {
  return (
    histories.get(normalizedOpponentName(opponentSchoolName)) ?? EMPTY_HISTORY
  );
}

/**
 * The design's head-to-head vocabulary: "never played", "you lead 3–1",
 * "they lead 1–3", "split 1–1".
 *
 * Always prints `us`–`them` in that order, win or lose — the same order
 * `dual-detail.tsx` and `schedule-list.tsx` print a live score in — so "they
 * lead 1–3" reads as *our* 1 against *their* 3, not the leader's number first.
 */
export function formatOpponentRecord(history: OpponentDualHistory): string {
  if (history.played === 0) return "never played";
  if (history.us > history.them) return `you lead ${history.us}–${history.them}`;
  if (history.them > history.us) return `they lead ${history.us}–${history.them}`;
  return `split ${history.us}–${history.them}`;
}

/**
 * Short last-played date ("26 Sep"), or "—" when there is none.
 *
 * Reuses `formatEventSpan` with the same date for both ends rather than a new
 * formatter: passed one date twice it already collapses to the single-day form
 * `formatEventSpan` produces for a dual, which is the plain "did we play them,
 * when" a subline wants — no year, matching the row it sits next to.
 */
export function formatLastPlayed(history: OpponentDualHistory): string {
  return history.lastPlayedOn
    ? formatEventSpan(history.lastPlayedOn, history.lastPlayedOn)
    : "—";
}
