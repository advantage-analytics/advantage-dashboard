import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

import { PLANS_BEGIN } from "@/lib/billing/plans";
import {
  buildLabelQueue,
  buildTodoCandidates,
  type LabelQueueSource,
  type QueueJobRow,
  type QueueMatchRow,
  type QueueSessionRow,
} from "@/lib/data/label-queue-server";
import { canAddToTodo, enterLabelQueue } from "@/lib/services/labels/queue";
import {
  isReviewEligible,
  plansBeginInstant,
  readReviewEligibility,
  reviewEligibilityFrom,
} from "@/lib/services/labels/review-eligibility";
import {
  TODO_NONE_ADDABLE,
  addToLabelTodo,
  type TodoDependencies,
} from "@/lib/services/labels/todo-session";
import type { LabelActor } from "@/lib/services/programs/admin-guard";
import type { AdminClient } from "@/lib/supabase/admin";

/**
 * Stage D of the 2027 plans: from `PLANS_BEGIN` the labellers' To do is
 * offered only matches that were paid for. Offline — the database's answer
 * (`label_review_eligibility`, proven in
 * `tests/database/plans-2027-gating.test.mjs`) is injected, and the client
 * is a recording fake.
 */

const OWNER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ADMIN_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const id = (n: number) => `0000000${n}-0000-4000-8000-000000000000`;

const BEFORE = new Date("2026-12-31T23:59:59Z");
const AFTER = new Date("2027-01-01T00:00:00Z");

function job(n: number, over: Partial<QueueJobRow> = {}): QueueJobRow {
  return {
    id: id(n),
    match_id: `match-${n}`,
    completed_at: `2027-01-1${n}T10:00:00Z`,
    priority: null,
    start_time_seconds: 0,
    end_time_seconds: 3600,
    billable_seconds: 3600,
    ...over,
  };
}

function match(n: number): QueueMatchRow {
  return {
    id: `match-${n}`,
    player1_name: `Player ${n}A`,
    player2_name: `Player ${n}B`,
    created_by: OWNER,
    verified: false,
    programs: null,
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

/** A fake client that answers `label_review_eligibility` and records calls. */
function rpcDb(
  answer: (ids: string[]) => {
    data: unknown;
    error: { code?: string; message: string } | null;
  },
) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const db = {
    rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      return Promise.resolve(answer(args.p_job_ids as string[]));
    },
  } as unknown as AdminClient;
  return { db, calls };
}

test.describe("review eligibility: reading the answer", () => {
  test("only a database 'no' refuses a job", () => {
    const map = reviewEligibilityFrom([
      { job_id: id(1), eligible: true },
      { job_id: id(2), eligible: false },
    ]);
    expect(isReviewEligible(map, id(1))).toBe(true);
    expect(isReviewEligible(map, id(2))).toBe(false);
    // Not asked about, or the gate is not in force: eligible, as before.
    expect(isReviewEligible(map, id(3))).toBe(true);
    expect(isReviewEligible(null, id(2))).toBe(true);
    expect(isReviewEligible(undefined, id(2))).toBe(true);
  });

  test("the date handed to the database is the plan module's", () => {
    expect(plansBeginInstant()).toBe(`${PLANS_BEGIN}T00:00:00Z`);
    expect(Date.parse(plansBeginInstant())).toBe(AFTER.getTime());
  });
});

test.describe("review eligibility: the read", () => {
  test("before PLANS_BEGIN nothing is read and nothing is gated", async () => {
    const { db, calls } = rpcDb(() => ({ data: [], error: null }));
    expect(await readReviewEligibility(db, [id(1)], BEFORE)).toBeNull();
    expect(calls).toEqual([]);
  });

  test("from PLANS_BEGIN it asks the database, in chunks, with the date", async () => {
    const ids = Array.from(
      { length: 150 },
      (_, n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    );
    const { db, calls } = rpcDb((asked) => ({
      data: asked.map((job_id, n) => ({
        job_id,
        eligible: n % 2 === 0,
        paid_basis: n % 2 === 0 ? "plan" : null,
      })),
      error: null,
    }));
    const map = await readReviewEligibility(db, ids, AFTER);
    expect(calls.map((call) => call.name)).toEqual([
      "label_review_eligibility",
      "label_review_eligibility",
    ]);
    expect(
      calls.map((call) => (call.args.p_job_ids as string[]).length),
    ).toEqual([100, 50]);
    for (const call of calls) {
      expect(call.args.p_plans_begin).toBe("2027-01-01T00:00:00Z");
    }
    expect(map?.size).toBe(150);
    expect(map?.get(ids[0])).toBe(true);
    expect(map?.get(ids[1])).toBe(false);
  });

  test("no jobs: an empty answer, no request", async () => {
    const { db, calls } = rpcDb(() => ({ data: [], error: null }));
    expect((await readReviewEligibility(db, [], AFTER))?.size).toBe(0);
    expect(calls).toEqual([]);
  });

  test("a database without the function gates nothing", async () => {
    for (const code of ["PGRST202", "42883"]) {
      const { db } = rpcDb(() => ({
        data: null,
        error: { code, message: "missing" },
      }));
      expect(await readReviewEligibility(db, [id(1)], AFTER)).toBeNull();
    }
  });

  test("any other error throws, like the queue's other reads", async () => {
    const { db } = rpcDb(() => ({
      data: null,
      error: { code: "57014", message: "statement timeout" },
    }));
    await expect(readReviewEligibility(db, [id(1)], AFTER)).rejects.toThrow(
      "Could not read review eligibility: statement timeout",
    );
  });
});

test.describe("review eligibility: the queue's rule", () => {
  const added = {
    id: id(1),
    completedAt: "2027-01-11T10:00:00Z",
    start_time_seconds: 0,
    end_time_seconds: 3600,
    billable_seconds: 3600,
    ownerEmail: "coach@ravenmoor.edu",
    session: null,
  };

  test("an unpaid match cannot be added to To do", () => {
    expect(canAddToTodo({ ...added })).toBe(true);
    expect(canAddToTodo({ ...added, reviewEligible: true })).toBe(true);
    expect(canAddToTodo({ ...added, reviewEligible: false })).toBe(false);
  });

  test("work already in or past To do is never dropped", () => {
    // Added before the gate, or held by a labeller: it stays on the boards.
    expect(
      enterLabelQueue({
        ...added,
        addedAt: "2027-01-12T00:00:00Z",
        reviewEligible: false,
      }),
    ).toBe(true);
    expect(
      enterLabelQueue({
        ...added,
        reviewEligible: false,
        session: { status: "labelling", assignedTo: OWNER },
      }),
    ).toBe(true);
  });
});

test.describe("Not in To do: paid matches only, from PLANS_BEGIN", () => {
  test("an unpaid match is not offered; paid and unasked ones are", () => {
    const rows = buildTodoCandidates(
      source({
        jobs: [job(1), job(2), job(3)],
        reviewEligible: new Map([
          [id(1), true],
          [id(2), false],
        ]),
      }),
    );
    expect(rows.map((row) => row.jobId)).toEqual([id(3), id(1)]);
  });

  test("with the gate not in force every match is offered", () => {
    for (const reviewEligible of [null, undefined]) {
      const rows = buildTodoCandidates(
        source({ jobs: [job(1), job(2)], reviewEligible }),
      );
      expect(rows.map((row) => row.jobId)).toEqual([id(2), id(1)]);
    }
  });

  test("the board keeps an unpaid match a labeller already holds", () => {
    const held: QueueSessionRow = {
      id: "s-1",
      job_id: id(1),
      status: "labelling",
      started_at: "2027-01-12T00:00:00Z",
      open_counts: null,
      start_open_counts: null,
      assigned_to: OWNER,
      assigned_at: "2027-01-12T00:00:00Z",
      claimed_at: "2027-01-12T00:00:00Z",
      submitted_at: null,
      checked_at: null,
      sent_back_at: null,
      sent_back_note: null,
      labeller: OWNER,
      assignee: null,
    };
    const entries = buildLabelQueue({
      ...source({
        jobs: [job(1)],
        sessions: [held],
        reviewEligible: new Map([[id(1), false]]),
      }),
      photoUrl: () => null,
    });
    expect(entries.map((entry) => entry.id)).toEqual([id(1)]);
  });
});

/** A fake client that records what `label_todo` was asked to do. */
function todoDb() {
  const calls: unknown[] = [];
  const db = {
    from(table: string) {
      expect(table).toBe("label_todo");
      return {
        upsert(rows: { job_id: string }[]) {
          calls.push(rows);
          return {
            select: async () => ({
              data: rows.map((row) => ({ job_id: row.job_id })),
              error: null,
            }),
          };
        },
      };
    },
  } as unknown as AdminClient;
  return { db, calls };
}

function deps(
  db: AdminClient,
  readSource: TodoDependencies["readSource"],
): TodoDependencies {
  return {
    requireLabelActor: async () =>
      ({ kind: "admin", id: ADMIN_ID }) as LabelActor,
    createAdminClient: () => db,
    readSource,
  };
}

test.describe("Add to To do: the gate holds for an id sent by hand", () => {
  test("an unpaid match is skipped and the paid one is added", async () => {
    const { db, calls } = todoDb();
    const readSource = async () =>
      source({
        jobs: [job(1), job(2)],
        reviewEligible: new Map([
          [id(1), true],
          [id(2), false],
        ]),
      });
    expect(await addToLabelTodo([id(1), id(2)], deps(db, readSource))).toEqual({
      ok: true,
      added: 1,
    });
    expect(calls).toEqual([
      [{ job_id: id(1), match_id: "match-1", added_by: ADMIN_ID }],
    ]);
  });

  test("only unpaid matches chosen: refused, nothing written", async () => {
    const { db, calls } = todoDb();
    const readSource = async () =>
      source({
        jobs: [job(2)],
        reviewEligible: new Map([[id(2), false]]),
      });
    expect(await addToLabelTodo([id(2)], deps(db, readSource))).toEqual({
      error: TODO_NONE_ADDABLE,
    });
    expect(calls).toEqual([]);
  });
});

test.describe("the gating migration", () => {
  const sql = readFileSync(
    resolve(
      __dirname,
      "../supabase/migrations/20261126090000_plans_2027_gating.sql",
    ),
    "utf8",
  );
  const code = sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");

  test("says it is not applied, and drops nothing", () => {
    expect(sql).toContain("NOT YET APPLIED TO THE LIVE DATABASE");
    expect(code).not.toMatch(/\bdrop\s/i);
  });

  test("keeps the date out of the gate's SQL", () => {
    // `PLANS_BEGIN` is handed in as `p_plans_begin`. The only date written
    // here is the pilots' last day, which the allowances migration spells.
    expect(code).not.toContain("2027-01-01");
    expect(code).toContain("p_plans_begin");
  });

  test("the eligibility function is the server's alone", () => {
    expect(code).toMatch(
      /revoke all on function public\.label_review_eligibility\(uuid\[\], timestamptz\) from public, anon, authenticated;/,
    );
    expect(code).toMatch(
      /grant\s+execute on function public\.label_review_eligibility\(uuid\[\], timestamptz\) to service_role;/,
    );
  });
});
