/**
 * Reading a program's schedule.
 *
 * Three round trips, never N: events, then every entry under them, then every
 * match pointing at those entries. A dual has nine lines and a tournament
 * weekend can have thirty results, so a per-entry query would be a page of
 * round trips for one screen.
 */

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { loadMatchAnalysis } from "@/lib/data/match-analysis-server";
import { isWorking } from "@/lib/data/match-analysis";
import { dualScore, entryPlayed } from "@/lib/schedule/entry-state";
import { roundRank } from "@/lib/schedule/format";
import type {
  EntryMatch,
  EventDetail,
  EventEntry,
  EventSite,
  EventKind,
  ProgramEvent,
  ScheduleRow,
  UploadQueueGroup,
} from "@/lib/schedule/types";

const EVENT_COLUMNS =
  "id, program_id, kind, name, starts_on, ends_on, site, surface, host, format";

const ENTRY_COLUMNS =
  "id, event_id, discipline, slot, position, draw, seed, player_user_ids, player_labels, opponent_labels, opponent_school, forfeit";

const MATCH_COLUMNS =
  "id, event_entry_id, round, score, player2_name, source_provider";

interface DbEvent {
  id: string;
  program_id: string;
  kind: string;
  name: string;
  starts_on: string;
  ends_on: string;
  site: string;
  surface: string | null;
  host: string | null;
  format: { best_of?: number; ad_scoring?: boolean | null } | null;
}

interface DbEntry {
  id: string;
  event_id: string;
  discipline: string;
  slot: string | null;
  position: number;
  draw: string | null;
  seed: number | null;
  player_user_ids: string[] | null;
  player_labels: string[] | null;
  opponent_labels: string[] | null;
  opponent_school: string | null;
  forfeit: string | null;
}

interface DbEntryMatch {
  id: string;
  event_entry_id: string | null;
  round: string | null;
  score: { player1: number[]; player2: number[] } | null;
  player2_name: string | null;
}

function toEvent(row: DbEvent): ProgramEvent {
  return {
    id: row.id,
    programId: row.program_id,
    kind: row.kind as EventKind,
    name: row.name,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    site: row.site as EventSite,
    surface: row.surface,
    host: row.host,
    format: {
      bestOf: row.format?.best_of ?? 3,
      // `?? null`, never `?? false`. The vision pipeline refuses a job without
      // an answer here, and a false default is a wrong answer that looks real.
      adScoring: row.format?.ad_scoring ?? null,
    },
  };
}

/**
 * One program's schedule, as everything below reads it.
 *
 * `events` is newest first — the schedule page's own reading order. A surface
 * that asks its questions forwards in time reverses this list rather than
 * ordering `program_events` a second way; two orderings of one table that have
 * to agree are two chances to disagree.
 */
export interface ProgramSchedule {
  events: ProgramEvent[];
  entriesByEvent: Map<string, EventEntry[]>;
}

/**
 * Everything one program's schedule needs, in three reads.
 *
 * Returns events oldest-last, entries keyed to them, and the matches those
 * entries have produced with their analysis state resolved.
 *
 * **Uncached on purpose.** It has two shapes — the whole program, and one
 * event — and each is memoised where it is read: `getProgramSchedule` and
 * `getEventDetail` below. Memoisation used to sit on the exported *derived*
 * functions instead, one `cache()` per wrapper over this one uncached
 * function, which dedupes nothing: React's `cache` keys on the wrapped
 * function's identity, so two wrappers are two caches, and Team Home — reading
 * through both — paid for the whole read twice in one render.
 */
async function readSchedule(
  programId: string,
  eventId?: string
): Promise<ProgramSchedule> {
  const supabase = await createClient();

  let eventQuery = supabase
    .from("program_events")
    .select(EVENT_COLUMNS)
    .eq("program_id", programId)
    .order("starts_on", { ascending: false });

  if (eventId) eventQuery = eventQuery.eq("id", eventId);

  const { data: eventRows } = await eventQuery;
  const events = ((eventRows ?? []) as DbEvent[]).map(toEvent);
  if (events.length === 0) {
    return { events, entriesByEvent: new Map() };
  }

  const { data: entryRows } = await supabase
    .from("program_event_entries")
    .select(ENTRY_COLUMNS)
    .in(
      "event_id",
      events.map((event) => event.id)
    )
    .order("position", { ascending: true });

  const entries = (entryRows ?? []) as DbEntry[];

  const { data: matchRows } = entries.length
    ? await supabase
        .from("matches")
        .select(MATCH_COLUMNS)
        .in(
          "event_entry_id",
          entries.map((entry) => entry.id)
        )
    : { data: [] as DbEntryMatch[] };

  const matches = (matchRows ?? []) as DbEntryMatch[];

  // `reap: true` is deliberately NOT passed. It is a write, and it belongs to
  // the surfaces that draw a progress bar big enough for a frozen one to
  // mislead — the matches list and match detail. These draw a dot.
  const jobs = await loadMatchAnalysis(
    supabase,
    matches.map((match) => match.id)
  );

  const matchesByEntry = new Map<string, EntryMatch[]>();
  for (const match of matches) {
    if (!match.event_entry_id) continue;
    const analysis = jobs.get(match.id);
    const entryMatch: EntryMatch = {
      id: match.id,
      round: match.round,
      // No job row means nobody ever sent video: scored by hand, which is what
      // an event line is until somebody uploads one.
      status: analysis?.status ?? "manual",
      score: match.score,
      opponentLabels: match.player2_name ? [match.player2_name] : [],
      hasVideo: analysis !== undefined,
    };
    const list = matchesByEntry.get(match.event_entry_id);
    if (list) list.push(entryMatch);
    else matchesByEntry.set(match.event_entry_id, [entryMatch]);
  }

  const entriesByEvent = new Map<string, EventEntry[]>();
  for (const row of entries) {
    const entry: EventEntry = {
      id: row.id,
      eventId: row.event_id,
      discipline: row.discipline as EventEntry["discipline"],
      slot: row.slot,
      position: row.position,
      draw: row.draw,
      seed: row.seed,
      playerUserIds: row.player_user_ids ?? [],
      playerLabels: row.player_labels ?? [],
      opponentLabels: row.opponent_labels ?? [],
      opponentSchool: row.opponent_school,
      forfeit: (row.forfeit as EventEntry["forfeit"]) ?? null,
      // Sorted by the round ladder: `matches` has no created_at, so without
      // this a tournament run renders in whatever order Postgres returned.
      matches: (matchesByEntry.get(row.id) ?? []).sort(
        (a, b) => roundRank(a.round) - roundRank(b.round)
      ),
    };
    const list = entriesByEvent.get(row.event_id);
    if (list) list.push(entry);
    else entriesByEvent.set(row.event_id, [entry]);
  }

  return { events, entriesByEvent };
}

/**
 * One program's whole schedule, read once per request.
 *
 * **The memoisation lives here, on the read, and nowhere above it.** Every
 * surface that wants the schedule — the schedule page's rows, the upload
 * queue, Team Home's KPI strip and weekend dual — derives from this one call,
 * so React's per-request `cache` has a single key to hit and two readers on one
 * render cost one set of round trips rather than two. Wrapping the derived
 * functions below instead is what made a Team Home render with a dual in range
 * cost 19 round trips where it now costs 14.
 *
 * `getUploadQueue` is therefore a plain async function —
 * pure mapping over this one await. A second `cache()` layer over a shared one
 * only invites the question of which is doing the work.
 */
export const getProgramSchedule = cache(async function getProgramSchedule(
  programId: string
): Promise<ProgramSchedule> {
  return readSchedule(programId);
});

/**
 * The schedule page's rows, newest event first.
 *
 * Pure, over a schedule already read, so a caller holding one can have the rows
 * without a second trip — and so this mapping can be tested without a database.
 */
export function scheduleRowsFrom(
  { events, entriesByEvent }: ProgramSchedule
): ScheduleRow[] {
  return events.map((event) => {
    const entries = entriesByEvent.get(event.id) ?? [];
    const played = entries.filter(entryPlayed).length;
    const working = entries.reduce(
      (count, entry) =>
        count + entry.matches.filter((match) => isWorking(match.status)).length,
      0
    );

    const score = event.kind === "dual" ? dualScore(entries) : null;

    return {
      id: event.id,
      kind: event.kind,
      name: event.name,
      startsOn: event.startsOn,
      endsOn: event.endsOn,
      site: event.site,
      entryCount: entries.length,
      playedCount: played,
      workingCount: working,
      // Only once every line is in. A partial dual score printed as final is a
      // result the page invented.
      teamScore: score?.decided ? { us: score.us, them: score.them } : null,
    };
  });
}

/** Did this entry produce any match at all? Distinguishes "unplayed" from "filmed". */
function hasAnyMatch(all: EventEntry[], entryId: string): boolean {
  return (all.find((entry) => entry.id === entryId)?.matches.length ?? 0) > 0;
}

/**
 * One event off a schedule already read, or null when it is not in it.
 *
 * The `programId` check the query does is done by the read that produced
 * `schedule`: an event that is not this program's is not in this list.
 */
export function eventDetailFrom(
  { events, entriesByEvent }: ProgramSchedule,
  eventId: string
): EventDetail | null {
  const event = events.find((candidate) => candidate.id === eventId);
  if (!event) return null;
  return { event, entries: entriesByEvent.get(event.id) ?? [] };
}

/**
 * One event and its entries, or null when it is not this program's.
 *
 * Reads the one event rather than the season, and stays that way: the event
 * page is the only caller, and making a single event's page pull every entry
 * and every match the program has ever recorded would pay Team Home's
 * economies with the event page's rows. A caller that already holds a
 * `ProgramSchedule` should use `eventDetailFrom` above and add no read at all.
 *
 * `cache()` sits directly on its read for the same reason
 * `getProgramSchedule`'s does — the memo has to be on the thing that costs
 * round trips, not on a wrapper over it.
 */
export const getEventDetail = cache(async function getEventDetail(
  programId: string,
  eventId: string
): Promise<EventDetail | null> {
  return eventDetailFrom(await readSchedule(programId, eventId), eventId);
});

/**
 * Every line in the program that has no video yet, grouped by event.
 *
 * This is the whole answer to "what needs me": the upload wizard's first step
 * is this list and nothing else.
 */
export async function getUploadQueue(
  programId: string
): Promise<UploadQueueGroup[]> {
  const { events, entriesByEvent } = await getProgramSchedule(programId);

  return events
    .map((event) => {
      const all = entriesByEvent.get(event.id) ?? [];

      // Filtered per MATCH, not per entry. A tournament entry is a whole run,
      // so dropping the entry as soon as any one round had video hid the other
      // rounds entirely — a coach who filmed R32 could no longer reach Q1.
      // A forfeited line has no match to film, so it is out of the queue and
      // out of both counts. Filtered once, up here, rather than twice: the
      // waiting list and the totals have to be about the same set of lines,
      // and two filters are two chances for them to stop being.
      const nonForfeited = all.filter((entry) => entry.forfeit === null);

      const waiting = nonForfeited
        .map((entry) => ({
          ...entry,
          matches: entry.matches.filter((match) => !match.hasVideo),
        }))
        .filter((entry) => entry.matches.length > 0 || !hasAnyMatch(all, entry.id));

      const withVideo = nonForfeited.reduce(
        (count, entry) => count + entry.matches.filter((m) => m.hasVideo).length,
        0
      );
      const total = nonForfeited.reduce(
        (count, entry) => count + Math.max(1, entry.matches.length),
        0
      );

      return { event, entries: waiting, withVideo, total };
    })
    .filter((group) => group.entries.length > 0);
}
