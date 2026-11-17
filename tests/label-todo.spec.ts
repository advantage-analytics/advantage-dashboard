import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

import {
  buildTodoCandidates,
  type LabelQueueEntry,
  type LabelQueueSource,
  type QueueJobRow,
  type QueueMatchRow,
  type QueueSessionRow,
} from "@/lib/data/label-queue-server";
import type { LabelActor } from "@/lib/services/programs/admin-guard";
import {
  TODO_NONE_ADDABLE,
  TODO_NOT_REMOVABLE,
  TODO_NOTHING_CHOSEN,
  addToLabelTodo,
  removeFromLabelTodo,
  type TodoDependencies,
} from "@/lib/services/labels/todo-session";
import { ADMIN_REQUIRED } from "@/lib/services/labels/edit-session";
import type { AdminClient } from "@/lib/supabase/admin";

/**
 * The admin-chosen To do (Labeller To-do Picker, option A): which matches
 * Not in To do offers, Add and Remove, and the migration's lock-down.
 * Offline — reads are injected and the client is a recording fake.
 */

const OWNER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ADMIN_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const id = (n: number) => `0000000${n}-0000-4000-8000-000000000000`;

function job(n: number, over: Partial<QueueJobRow> = {}): QueueJobRow {
  return {
    id: id(n),
    match_id: `match-${n}`,
    completed_at: `2026-11-1${n}T10:00:00Z`,
    priority: null,
    start_time_seconds: 0,
    end_time_seconds: 3600,
    billable_seconds: 3600,
    ...over,
  };
}

function match(n: number, over: Partial<QueueMatchRow> = {}): QueueMatchRow {
  return {
    id: `match-${n}`,
    player1_name: `Player ${n}A`,
    player2_name: `Player ${n}B`,
    created_by: OWNER,
    verified: false,
    programs: null,
    ...over,
  };
}

function session(
  n: number,
  over: Partial<QueueSessionRow> = {},
): QueueSessionRow {
  return {
    id: `s-${n}`,
    job_id: id(n),
    status: "labelling",
    started_at: "2026-11-12T00:00:00Z",
    open_counts: null,
    start_open_counts: null,
    assigned_to: null,
    assigned_at: null,
    claimed_at: null,
    submitted_at: null,
    checked_at: null,
    sent_back_at: null,
    sent_back_note: null,
    labeller: null,
    assignee: null,
    ...over,
  };
}

function source(
  over: Partial<LabelQueueSource> = {},
): Omit<LabelQueueSource, "photoUrl"> {
  const jobs = over.jobs ?? [];
  return {
    jobs,
    matches: jobs.map((row) => match(Number(row.id[7]))),
    sessions: [],
    ownerEmails: new Map([[OWNER, "coach@ravenmoor.edu"]]),
    todo: new Map(),
    ...over,
  };
}

test.describe("Not in To do: which matches it offers", () => {
  test("an untouched or abandoned match is offered, newest first", () => {
    const rows = buildTodoCandidates(
      source({
        jobs: [job(1), job(2), job(3)],
        sessions: [session(2)],
      }),
    );
    expect(rows.map((row) => row.jobId)).toEqual([id(3), id(2), id(1)]);
    expect(rows[0]).toEqual({
      jobId: id(3),
      matchId: "match-3",
      completedAt: "2026-11-13T10:00:00Z",
      videoSeconds: 3600,
      player1Name: "Player 3A",
      player2Name: "Player 3B",
      programName: "Personal",
    });
  });

  test("added, held, sent back, handed in or published: not offered", () => {
    const rows = buildTodoCandidates(
      source({
        jobs: [job(1), job(2), job(3), job(4), job(5), job(6)],
        todo: new Map([[id(1), "2026-11-15T00:00:00Z"]]),
        sessions: [
          session(2, { assigned_to: OWNER }),
          session(3, { sent_back_at: "2026-11-14T00:00:00Z" }),
          session(4, { status: "submitted", assigned_to: OWNER }),
          session(5, {
            status: "complete",
            checked_at: "2026-11-15T00:00:00Z",
          }),
        ],
      }),
    );
    expect(rows.map((row) => row.jobId)).toEqual([id(6)]);
  });

  test("no video, a test owner or a verified match: not offered", () => {
    const rows = buildTodoCandidates(
      source({
        jobs: [
          job(1, { end_time_seconds: null, billable_seconds: 0 }),
          job(2),
          job(3),
          job(4),
        ],
        matches: [
          match(1),
          match(2, { created_by: "test-owner" }),
          match(3, { verified: true }),
          match(4),
        ],
        ownerEmails: new Map([
          [OWNER, "coach@ravenmoor.edu"],
          ["test-owner", "run42-coach@example.com"],
        ]),
      }),
    );
    expect(rows.map((row) => row.jobId)).toEqual([id(4)]);
  });
});

/** A fake client that records what `label_todo` was asked to do. */
function fakeDb() {
  const calls: { op: string; payload: unknown }[] = [];
  const db = {
    from(table: string) {
      expect(table).toBe("label_todo");
      return {
        upsert(rows: unknown[], options: unknown) {
          calls.push({ op: "upsert", payload: { rows, options } });
          return {
            select: async () => ({
              data: (rows as { job_id: string }[]).map((row) => ({
                job_id: row.job_id,
              })),
              error: null,
            }),
          };
        },
        delete() {
          return {
            eq: async (column: string, value: string) => {
              calls.push({ op: "delete", payload: { column, value } });
              return { error: null };
            },
          };
        },
      };
    },
  } as unknown as AdminClient;
  return { db, calls };
}

function deps(
  actor: LabelActor | null,
  db: AdminClient,
  over: Partial<TodoDependencies> = {},
): TodoDependencies {
  return {
    requireLabelActor: async () => actor,
    createAdminClient: () => db,
    ...over,
  };
}

const ADMIN = { kind: "admin", id: ADMIN_ID } as LabelActor;
const LABELLER = { kind: "labeller", id: OWNER } as LabelActor;

test.describe("Add to To do", () => {
  test("a labeller or a signed-out caller is refused before any read", async () => {
    const { db, calls } = fakeDb();
    let read = false;
    const readSource = async () => {
      read = true;
      return source();
    };
    for (const actor of [LABELLER, null]) {
      expect(
        await addToLabelTodo([id(1)], deps(actor, db, { readSource })),
      ).toEqual({ error: ADMIN_REQUIRED });
    }
    expect(read).toBe(false);
    expect(calls).toEqual([]);
  });

  test("nothing chosen is refused", async () => {
    const { db } = fakeDb();
    expect(await addToLabelTodo([], deps(ADMIN, db))).toEqual({
      error: TODO_NOTHING_CHOSEN,
    });
  });

  test("inserts only what is still on offer, as the admin", async () => {
    const { db, calls } = fakeDb();
    const readSource = async () =>
      source({
        jobs: [job(1), job(2)],
        sessions: [session(2, { assigned_to: OWNER })],
      });
    const result = await addToLabelTodo(
      [id(1), id(2), id(1)],
      deps(ADMIN, db, { readSource }),
    );
    expect(result).toEqual({ ok: true, added: 1 });
    expect(calls).toEqual([
      {
        op: "upsert",
        payload: {
          rows: [{ job_id: id(1), match_id: "match-1", added_by: ADMIN_ID }],
          options: { onConflict: "job_id", ignoreDuplicates: true },
        },
      },
    ]);
  });

  test("none left on offer is refused, with nothing written", async () => {
    const { db, calls } = fakeDb();
    const readSource = async () =>
      source({ jobs: [job(1)], todo: new Map([[id(1), "2026-11-15"]]) });
    expect(
      await addToLabelTodo([id(1)], deps(ADMIN, db, { readSource })),
    ).toEqual({ error: TODO_NONE_ADDABLE });
    expect(calls).toEqual([]);
  });
});

function entry(over: Partial<LabelQueueEntry>): LabelQueueEntry {
  return {
    id: id(1),
    matchId: "match-1",
    completedAt: "2026-11-11T10:00:00Z",
    dueAt: "2026-11-16T22:00:00Z",
    addedAt: "2026-11-15T10:00:00Z",
    videoSeconds: 3600,
    urgency: "standard",
    player1Name: "A",
    player2Name: "B",
    programName: "Personal",
    session: null,
    ...over,
  };
}

test.describe("Remove from To do", () => {
  test("only an admin", async () => {
    const { db, calls } = fakeDb();
    expect(await removeFromLabelTodo(id(1), deps(LABELLER, db))).toEqual({
      error: ADMIN_REQUIRED,
    });
    expect(calls).toEqual([]);
  });

  test("removes an added row nobody holds", async () => {
    const { db, calls } = fakeDb();
    const readQueue = async () => [entry({})];
    expect(
      await removeFromLabelTodo(id(1), deps(ADMIN, db, { readQueue })),
    ).toEqual({ ok: true });
    expect(calls).toEqual([
      { op: "delete", payload: { column: "job_id", value: id(1) } },
    ]);
  });

  test("refuses a held, sent-back, never-added or missing row", async () => {
    const held = {
      id: "s",
      status: "labelling",
      assignedTo: OWNER,
    } as LabelQueueEntry["session"];
    const sentBack = {
      id: "s",
      status: "labelling",
      assignedTo: null,
      sentBackAt: "2026-11-16T00:00:00Z",
    } as LabelQueueEntry["session"];
    for (const queue of [
      [entry({ session: held })],
      [entry({ session: sentBack })],
      [entry({ addedAt: null })],
      [],
    ]) {
      const { db, calls } = fakeDb();
      expect(
        await removeFromLabelTodo(
          id(1),
          deps(ADMIN, db, { readQueue: async () => queue }),
        ),
      ).toEqual({ error: TODO_NOT_REMOVABLE });
      expect(calls).toEqual([]);
    }
  });
});

test.describe("the label_todo migration", () => {
  const dir = resolve(process.cwd(), "supabase/migrations");
  const file = readdirSync(dir).find((name) =>
    name.endsWith("_label_todo.sql"),
  );
  const sql = (file ? readFileSync(resolve(dir, file), "utf8") : "").replace(
    /--.*$/gm,
    "",
  );

  test("the table is locked to the service role", () => {
    expect(file).toBeDefined();
    expect(sql).toContain("create table public.label_todo");
    expect(sql).toContain(
      "alter table public.label_todo enable row level security",
    );
    expect(sql).toContain(
      "revoke all on table public.label_todo from anon, authenticated",
    );
    expect(sql).not.toMatch(/create policy/i);
    expect(sql).not.toMatch(/\bgrant\b/i);
  });

  test("verification pending keeps its signature and reads label_todo", () => {
    expect(sql).toContain(
      "create or replace function public.match_label_states(p_match_ids uuid[])",
    );
    expect(sql).toContain(
      "returns table (match_id uuid, results_at timestamptz, has_video boolean, labelling boolean)",
    );
    expect(sql).toContain("from public.label_todo t");
    expect(sql).not.toMatch(/\bdrop\b/i);
  });
});
