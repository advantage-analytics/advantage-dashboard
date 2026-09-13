import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  readScheduleWithClient,
  scheduleRowsFrom,
  seasonSummaryFrom,
  uploadQueueFrom,
} from "@/lib/data/schedule-server";
import { lineCoverageFrom } from "@/lib/schedule/entry-state";

type QueryCall = { method: string; column?: string; value?: unknown };

class Query implements PromiseLike<{ data: unknown[] }> {
  constructor(
    readonly table: string,
    private readonly data: unknown[],
    readonly calls: QueryCall[] = [],
  ) {}

  select(value: string) {
    this.calls.push({ method: "select", value });
    return this;
  }

  eq(column: string, value: unknown) {
    this.calls.push({ method: "eq", column, value });
    return this;
  }

  in(column: string, value: unknown[]) {
    this.calls.push({ method: "in", column, value });
    return this;
  }

  order(column: string, value: unknown) {
    this.calls.push({ method: "order", column, value });
    return this;
  }

  then<TResult1 = { data: unknown[] }, TResult2 = never>(
    onfulfilled?:
      ((value: { data: unknown[] }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve({ data: this.data }).then(onfulfilled, onrejected);
  }
}

function fakeClient(rows: Record<string, unknown[]>) {
  const queries: Query[] = [];
  const client = {
    from(table: string) {
      const query = new Query(table, rows[table] ?? []);
      queries.push(query);
      return query;
    },
  } as unknown as SupabaseClient;
  return { client, queries };
}

const events = [
  {
    id: "event-a",
    program_id: "program-a",
    kind: "tournament",
    name: "Invite A",
    starts_on: "2026-09-10",
    ends_on: "2026-09-12",
    site: "neutral",
    surface: "hard",
    host: null,
    format: { best_of: 3, ad_scoring: true },
  },
  {
    id: "event-b",
    program_id: "program-a",
    kind: "dual",
    name: "Rival B",
    starts_on: "2026-09-09",
    ends_on: "2026-09-09",
    site: "away",
    surface: "hard",
    host: null,
    format: { best_of: 3, ad_scoring: true },
  },
];

const entries = [
  {
    id: "entry-a",
    event_id: "event-a",
    discipline: "singles",
    slot: null,
    position: 1,
    draw: "main",
    seed: null,
    player_user_ids: ["player-a"],
    player_labels: ["Alex"],
    opponent_labels: [],
    opponent_school: null,
    opponent_program_id: null,
    forfeit: null,
  },
  {
    id: "entry-b",
    event_id: "event-b",
    discipline: "singles",
    slot: "S1",
    position: 1,
    draw: null,
    seed: null,
    player_user_ids: ["player-b"],
    player_labels: ["Blake"],
    opponent_labels: ["Casey"],
    opponent_school: "Rival B",
    opponent_program_id: null,
    forfeit: null,
  },
];

function outcome(overrides: Record<string, unknown> = {}) {
  return {
    id: "outcome-a-r16",
    entry_id: "entry-a",
    event_id: "event-a",
    program_id: "program-a",
    round: "R16",
    kind: "withdrawal",
    side: "theirs",
    actor_user_id: "coach-a",
    recorded_at: "2026-09-10T12:00:00Z",
    ...overrides,
  };
}

test("loads outcome-only rounds at the correct event and entry grain", async () => {
  const { client, queries } = fakeClient({
    program_events: events,
    program_event_entries: entries,
    matches: [],
    program_event_outcomes: [
      outcome(),
      // Impossible under the composite FK, but the loader still fails closed
      // instead of associating by entry id alone.
      outcome({ id: "cross-event", event_id: "event-b" }),
      outcome({ id: "cross-program", program_id: "program-b" }),
    ],
  });
  const analyzedIds: string[][] = [];

  const schedule = await readScheduleWithClient(
    client as never,
    "program-a",
    undefined,
    (async (_client: SupabaseClient, ids: string[]) => {
      analyzedIds.push(ids);
      return new Map();
    }) as never,
  );

  const [loaded] = schedule.entriesByEvent.get("event-a") ?? [];
  expect(loaded.matches).toEqual([]);
  expect(loaded.outcomes).toEqual([
    {
      id: "outcome-a-r16",
      round: "R16",
      kind: "withdrawal",
      side: "theirs",
      actorUserId: "coach-a",
      recordedAt: "2026-09-10T12:00:00Z",
    },
  ]);
  expect(schedule.entriesByEvent.get("event-b")?.[0].outcomes).toEqual([]);
  expect(analyzedIds).toEqual([[]]);

  const query = queries.find((item) => item.table === "program_event_outcomes");
  expect(query?.calls).toContainEqual({
    method: "eq",
    column: "program_id",
    value: "program-a",
  });
  expect(query?.calls).toContainEqual({
    method: "in",
    column: "event_id",
    value: ["event-a", "event-b"],
  });
  expect(query?.calls).toContainEqual({
    method: "in",
    column: "entry_id",
    value: ["entry-a", "entry-b"],
  });

  // The result is visible/decided, but never masquerades as a match or report.
  expect(
    scheduleRowsFrom(schedule).find((row) => row.id === "event-a"),
  ).toMatchObject({ entryCount: 1, playedCount: 1, workingCount: 0 });
  expect(lineCoverageFrom([loaded])).toEqual({ analyzed: 0, total: 0 });
  // The one total line is event B's still-unanswered entry, not this outcome.
  expect(seasonSummaryFrom(schedule).lines).toEqual({ analyzed: 0, total: 1 });
  expect(uploadQueueFrom(schedule).map((group) => group.event.id)).toEqual([
    "event-b",
  ]);
});

test("an outcome hides only its tournament round from analysis totals", async () => {
  const r32Match = {
    id: "match-a-r32",
    event_entry_id: "entry-a",
    round: "R32",
    score: { player1: [6, 6], player2: [2, 3] },
    player2_name: "Dana",
    source_provider: "manual",
  };
  const { client } = fakeClient({
    program_events: [events[0]],
    program_event_entries: [entries[0]],
    matches: [r32Match],
    program_event_outcomes: [outcome()],
  });
  const analyzedIds: string[][] = [];
  const schedule = await readScheduleWithClient(
    client as never,
    "program-a",
    undefined,
    (async (_client: SupabaseClient, ids: string[]) => {
      analyzedIds.push(ids);
      return new Map();
    }) as never,
  );

  expect(analyzedIds).toEqual([["match-a-r32"]]);
  expect(seasonSummaryFrom(schedule).lines).toEqual({ analyzed: 0, total: 1 });
  const [queue] = uploadQueueFrom(schedule);
  expect(queue.entries[0].matches.map((match) => match.round)).toEqual(["R32"]);
  expect(queue.total).toBe(1);
});

test("a single-event read scopes outcomes to that event", async () => {
  const { client, queries } = fakeClient({
    program_events: [events[0]],
    program_event_entries: [entries[0]],
    matches: [],
    program_event_outcomes: [outcome()],
  });

  await readScheduleWithClient(
    client as never,
    "program-a",
    "event-a",
    (async () => new Map()) as never,
  );

  const eventQuery = queries.find((item) => item.table === "program_events");
  expect(eventQuery?.calls).toContainEqual({
    method: "eq",
    column: "id",
    value: "event-a",
  });
  const outcomeQuery = queries.find(
    (item) => item.table === "program_event_outcomes",
  );
  expect(outcomeQuery?.calls).toContainEqual({
    method: "in",
    column: "event_id",
    value: ["event-a"],
  });
});
