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
  "id, event_id, discipline, slot, position, draw, seed, player_user_ids, player_labels, opponent_labels, opponent_school";

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
 * Everything one program's schedule needs, in three reads.
 *
 * Returns events oldest-last, entries keyed to them, and the matches those
 * entries have produced with their analysis state resolved.
 */
async function readSchedule(
  programId: string,
  eventId?: string
): Promise<{ events: ProgramEvent[]; entriesByEvent: Map<string, EventEntry[]> }> {
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
      matches: matchesByEntry.get(row.id) ?? [],
    };
    const list = entriesByEvent.get(row.event_id);
    if (list) list.push(entry);
    else entriesByEvent.set(row.event_id, [entry]);
  }

  return { events, entriesByEvent };
}

/** The schedule page's rows, newest event first. */
export const getScheduleRows = cache(async function getScheduleRows(
  programId: string
): Promise<ScheduleRow[]> {
  const { events, entriesByEvent } = await readSchedule(programId);

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
});

/** One event and its entries, or null when it is not this program's. */
export const getEventDetail = cache(async function getEventDetail(
  programId: string,
  eventId: string
): Promise<EventDetail | null> {
  const { events, entriesByEvent } = await readSchedule(programId, eventId);
  const event = events[0];
  if (!event) return null;
  return { event, entries: entriesByEvent.get(event.id) ?? [] };
});

/**
 * Every line in the program that has no video yet, grouped by event.
 *
 * This is the whole answer to "what needs me": the upload wizard's first step
 * is this list and nothing else.
 */
export const getUploadQueue = cache(async function getUploadQueue(
  programId: string
): Promise<UploadQueueGroup[]> {
  const { events, entriesByEvent } = await readSchedule(programId);

  return events
    .map((event) => {
      const all = entriesByEvent.get(event.id) ?? [];
      const withVideo = all.filter((entry) =>
        entry.matches.some((match) => match.hasVideo)
      ).length;
      const waiting = all.filter(
        (entry) => !entry.matches.some((match) => match.hasVideo)
      );
      return { event, entries: waiting, withVideo, total: all.length };
    })
    .filter((group) => group.entries.length > 0);
});
