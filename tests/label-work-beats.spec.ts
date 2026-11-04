import { expect, test } from "@playwright/test";

import { listLabelJobs } from "@/lib/data/labels-server";
import { ACTOR_REQUIRED } from "@/lib/services/labels/edit-session";
import { beatMinute, shouldBeat } from "@/lib/services/labels/work-beats";
import {
  recordLabelWorkBeat,
  WORK_BEAT_CONFLICT,
  type WorkBeatDependencies,
} from "@/lib/services/labels/work-beats-session";
import {
  requireLabelActor,
  type LabelActorDependencies,
} from "@/lib/services/programs/admin-guard";
import type { AdminClient } from "@/lib/supabase/admin";
import { fakeLabelClient } from "./fixtures/label-session";

/**
 * The console's active-time heartbeat: when a beat is due (`shouldBeat`), the
 * write and its dedupe (`recordLabelWorkBeat`, over a fake client keyed on the
 * table's primary key), the gate, and minutes worked on the Labels list.
 */

const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const ADMIN_ID = "22222222-2222-4222-8222-222222222222";
const LABELLER_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_ID = "44444444-4444-4444-8444-444444444444";
const NOW = Date.parse("2026-11-03T22:15:42.318Z");

test.describe("shouldBeat", () => {
  const base = {
    now: NOW,
    visible: true,
    lastInputAt: NOW - 10_000,
    lastBeatAt: NOW - 61_000,
  };

  test("beats when visible, recently active and a minute since the last", () => {
    expect(shouldBeat(base)).toBe(true);
    expect(shouldBeat({ ...base, lastBeatAt: null })).toBe(true);
  });

  test("never on a hidden tab", () => {
    expect(shouldBeat({ ...base, visible: false })).toBe(false);
  });

  test("never once idle past idleAfter, or before any input", () => {
    expect(shouldBeat({ ...base, lastInputAt: NOW - 150_001 })).toBe(false);
    expect(shouldBeat({ ...base, lastInputAt: NOW - 150_000 })).toBe(true);
    expect(shouldBeat({ ...base, lastInputAt: null })).toBe(false);
    expect(
      shouldBeat({ ...base, lastInputAt: NOW - 20_000 }, { idleAfter: 15_000 }),
    ).toBe(false);
  });

  test("a playing film counts as working with no key pressed, for a while", () => {
    // A watch-through: minutes of film and nothing pressed.
    const watching = { ...base, lastInputAt: NOW - 540_000, playing: true };
    expect(shouldBeat(watching)).toBe(true);
    expect(shouldBeat({ ...watching, lastInputAt: NOW - 600_000 })).toBe(true);
    // Still not on a hidden tab, and still at most once an interval.
    expect(shouldBeat({ ...watching, visible: false })).toBe(false);
    expect(shouldBeat({ ...watching, lastBeatAt: NOW - 30_000 })).toBe(false);
    // Paused and idle is idle.
    expect(shouldBeat({ ...watching, playing: false })).toBe(false);
  });

  test("a film left looping with nobody there stops counting", () => {
    const abandoned = { ...base, playing: true };
    expect(shouldBeat({ ...abandoned, lastInputAt: NOW - 600_001 })).toBe(
      false,
    );
    expect(shouldBeat({ ...abandoned, lastInputAt: NOW - 3_600_000 })).toBe(
      false,
    );
    // Nothing ever pressed: a film that started on its own is not work.
    expect(shouldBeat({ ...abandoned, lastInputAt: null })).toBe(false);
    expect(
      shouldBeat(
        { ...abandoned, lastInputAt: NOW - 120_000 },
        { watchAfter: 60_000 },
      ),
    ).toBe(false);
  });

  test("never sooner than interval after the last beat", () => {
    expect(shouldBeat({ ...base, lastBeatAt: NOW - 59_999 })).toBe(false);
    expect(shouldBeat({ ...base, lastBeatAt: NOW - 60_000 })).toBe(true);
    expect(
      shouldBeat({ ...base, lastBeatAt: NOW - 30_000 }, { interval: 20_000 }),
    ).toBe(true);
  });
});

test("beatMinute truncates to the UTC minute", () => {
  expect(beatMinute(NOW)).toBe("2026-11-03T22:15:00.000Z");
});

/**
 * `label_work_beats` in memory, keyed on its primary key: an upsert with
 * `ignoreDuplicates` on that key is `ON CONFLICT DO NOTHING`; a plain insert
 * of a duplicate answers 23505 as Postgres would.
 */
function fakeBeatsTable() {
  const rows = new Map<string, Record<string, unknown>>();
  const writes: {
    op: "upsert" | "insert";
    row: Record<string, unknown>;
    options?: { onConflict?: string; ignoreDuplicates?: boolean };
  }[] = [];
  const key = (row: Record<string, unknown>) =>
    `${row.session_id}|${row.user_id}|${row.minute}`;
  const client = {
    from(table: string) {
      expect(table).toBe("label_work_beats");
      return {
        upsert: async (
          row: Record<string, unknown>,
          options?: { onConflict?: string; ignoreDuplicates?: boolean },
        ) => {
          writes.push({ op: "upsert", row, options });
          if (!rows.has(key(row))) rows.set(key(row), row);
          else if (!options?.ignoreDuplicates) rows.set(key(row), row);
          return { data: null, error: null };
        },
        insert: async (row: Record<string, unknown>) => {
          writes.push({ op: "insert", row });
          if (rows.has(key(row))) {
            return {
              data: null,
              error: { code: "23505", message: "duplicate key" },
            };
          }
          rows.set(key(row), row);
          return { data: null, error: null };
        },
      };
    },
  };
  return { client: client as unknown as AdminClient, rows, writes };
}

function beatDeps(
  client: AdminClient,
  actor: { id: string; kind: "admin" | "labeller" } | null,
  now: () => number = () => NOW,
): WorkBeatDependencies {
  return {
    requireLabelActor: async () => actor,
    createAdminClient: () => client,
    now,
  };
}

test.describe("recordLabelWorkBeat", () => {
  test("two beats in one minute: one write each, the second ignored by the key", async () => {
    const table = fakeBeatsTable();
    let clock = NOW;
    const deps = beatDeps(
      table.client,
      { id: LABELLER_ID, kind: "labeller" },
      () => clock,
    );

    expect(await recordLabelWorkBeat(SESSION_ID, deps)).toEqual({ ok: true });
    clock = NOW + 12_000; // still 22:15
    expect(await recordLabelWorkBeat(SESSION_ID, deps)).toEqual({ ok: true });

    expect(table.writes).toHaveLength(2);
    for (const write of table.writes) {
      expect(write.op).toBe("upsert");
      expect(write.options).toEqual({
        onConflict: WORK_BEAT_CONFLICT,
        ignoreDuplicates: true,
      });
      expect(write.row).toEqual({
        session_id: SESSION_ID,
        user_id: LABELLER_ID,
        minute: "2026-11-03T22:15:00.000Z",
      });
    }
    expect(WORK_BEAT_CONFLICT).toBe("session_id,user_id,minute");
    expect(table.rows.size).toBe(1);

    clock = NOW + 30_000; // 22:16
    expect(await recordLabelWorkBeat(SESSION_ID, deps)).toEqual({ ok: true });
    expect(table.rows.size).toBe(2);
  });

  test("a 23505 that reaches it is still ok", async () => {
    const client = {
      from: () => ({
        upsert: async () => ({
          data: null,
          error: { code: "23505", message: "duplicate key" },
        }),
      }),
    } as unknown as AdminClient;
    expect(
      await recordLabelWorkBeat(
        SESSION_ID,
        beatDeps(client, { id: ADMIN_ID, kind: "admin" }),
      ),
    ).toEqual({ ok: true });
  });

  test("any other failure, or a throw, is an error and never a throw", async () => {
    const failing = {
      from: () => ({
        upsert: async () => ({
          data: null,
          error: { code: "42501", message: "permission denied" },
        }),
      }),
    } as unknown as AdminClient;
    expect(
      await recordLabelWorkBeat(
        SESSION_ID,
        beatDeps(failing, { id: ADMIN_ID, kind: "admin" }),
      ),
    ).toEqual({ error: "Could not record the minute." });

    const throwing = {
      from: () => {
        throw new Error("boom");
      },
    } as unknown as AdminClient;
    expect(
      await recordLabelWorkBeat(
        SESSION_ID,
        beatDeps(throwing, { id: ADMIN_ID, kind: "admin" }),
      ),
    ).toEqual({ error: "Could not record the minute." });
  });

  test("an admin on a malformed id writes nothing", async () => {
    const table = fakeBeatsTable();
    expect(
      await recordLabelWorkBeat(
        "nope",
        beatDeps(table.client, { id: ADMIN_ID, kind: "admin" }),
      ),
    ).toEqual({ error: "No such session." });
    expect(table.writes).toEqual([]);
  });

  test("the real gate refuses a labeller the session is not assigned to", async () => {
    const table = fakeBeatsTable();
    // A service-role client for the gate's two reads: the caller is a
    // labeller, the session is labelling but assigned to someone else.
    const gateClient = {
      from(name: string) {
        const row =
          name === "users"
            ? { is_labeller: true }
            : name === "label_sessions"
              ? { assigned_to: OTHER_ID, status: "labelling" }
              : null;
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: row, error: null }),
            }),
          }),
        };
      },
    } as unknown as AdminClient;
    const actorDeps = (uid: string): LabelActorDependencies => ({
      checkAdmin: async () => ({
        ok: false,
        status: 403,
      }),
      createClient: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: uid } } }) },
      }),
      createAdminClient: () => gateClient,
    });
    const deps = (uid: string): WorkBeatDependencies => ({
      requireLabelActor: (id) => requireLabelActor(id, actorDeps(uid)),
      createAdminClient: () => table.client,
      now: () => NOW,
    });

    expect(await recordLabelWorkBeat(SESSION_ID, deps(LABELLER_ID))).toEqual({
      error: ACTOR_REQUIRED,
    });
    expect(table.writes).toEqual([]);

    // The labeller it IS assigned to gets through, as themselves.
    expect(await recordLabelWorkBeat(SESSION_ID, deps(OTHER_ID))).toEqual({
      ok: true,
    });
    expect(table.writes.map((w) => w.row.user_id)).toEqual([OTHER_ID]);
  });
});

test("listLabelJobs counts every labeller's beats and no reviewer's, in one read", async () => {
  const JOB_A = "55555555-5555-4555-8555-555555555551";
  const JOB_B = "55555555-5555-4555-8555-555555555552";
  const JOB_C = "55555555-5555-4555-8555-555555555553";
  const JOB_D = "55555555-5555-4555-8555-555555555554";
  const SESSION_B = "66666666-6666-4666-8666-666666666666";
  const SESSION_C = "66666666-6666-4666-8666-666666666667";
  const SESSION_D = "66666666-6666-4666-8666-666666666668";
  const MATCH = "77777777-7777-4777-8777-777777777777";
  const session = (id: string, job: string, assignee: string | null) => ({
    id,
    job_id: job,
    status: "labelling",
    started_at: "2026-11-01T00:00:00Z",
    open_counts: null,
    assigned_at: assignee ? "2026-11-01T00:00:00Z" : null,
    submitted_at: null,
    // An admin started every session.
    labeller: ADMIN_ID,
    assignee: assignee
      ? { id: assignee, email: null, first_name: null, last_name: null }
      : null,
  });
  const vendor = { is_admin: false };
  const admin = { is_admin: true };
  const fake = fakeLabelClient((call) => {
    if (call.table === "processing_jobs") {
      return {
        data: [JOB_A, JOB_B, JOB_C, JOB_D].map((id) => ({
          id,
          match_id: MATCH,
          completed_at: null,
        })),
        error: null,
      };
    }
    if (call.table === "matches") return { data: [], error: null };
    if (call.table === "points") return { data: null, error: null };
    if (call.table === "label_points") return { data: [], error: null };
    if (call.table === "label_sessions") {
      return {
        data: [
          session(SESSION_ID, JOB_A, OTHER_ID),
          session(SESSION_B, JOB_B, OTHER_ID),
          session(SESSION_C, JOB_C, OTHER_ID),
          session(SESSION_D, JOB_D, null),
        ],
        error: null,
      };
    }
    if (call.table === "label_work_beats") {
      return {
        data: [
          // A: three minutes from the labeller, two from the admin
          // reviewing it. Only the labeller's three count.
          { session_id: SESSION_ID, user_id: OTHER_ID, user: vendor },
          { session_id: SESSION_ID, user_id: OTHER_ID, user: vendor },
          { session_id: SESSION_ID, user_id: OTHER_ID, user: vendor },
          { session_id: SESSION_ID, user_id: ADMIN_ID, user: admin },
          { session_id: SESSION_ID, user_id: ADMIN_ID, user: admin },
          // B: nothing.
          // C: reassigned — two minutes from the first labeller, one from
          // the one it is assigned to now. Both people's time counts.
          { session_id: SESSION_C, user_id: LABELLER_ID, user: vendor },
          { session_id: SESSION_C, user_id: LABELLER_ID, user: vendor },
          { session_id: SESSION_C, user_id: OTHER_ID, user: vendor },
          // D: an admin labelling it themselves, no labeller involved:
          // their own minutes are the work.
          { session_id: SESSION_D, user_id: ADMIN_ID, user: admin },
          { session_id: SESSION_D, user_id: ADMIN_ID, user: admin },
        ],
        error: null,
      };
    }
    return undefined;
  });

  const result = await listLabelJobs({
    requireAdmin: async () => ({ id: ADMIN_ID }),
    createAdminClient: () => fake.supabase,
  });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  const byJob = new Map(result.rows.map((row) => [row.jobId, row]));
  expect(byJob.get(JOB_A)?.session?.minutesWorked).toBe(3);
  expect(byJob.get(JOB_B)?.session?.minutesWorked).toBe(0);
  expect(byJob.get(JOB_C)?.session?.minutesWorked).toBe(3);
  expect(byJob.get(JOB_D)?.session?.minutesWorked).toBe(2);

  const beatReads = fake.calls.filter((c) => c.table === "label_work_beats");
  expect(beatReads).toHaveLength(1);
  expect(beatReads[0].columns).toBe(
    "session_id, user_id, user:users(is_admin)",
  );
  expect(beatReads[0].in?.session_id).toEqual(
    expect.arrayContaining([SESSION_ID, SESSION_B, SESSION_C, SESSION_D]),
  );
});
