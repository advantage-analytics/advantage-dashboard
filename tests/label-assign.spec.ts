import { expect, test } from "@playwright/test";

import { listLabelJobs } from "@/lib/data/labels-server";
import {
  ASSIGN_FROZEN,
  assignLabelSession,
  listLabellers,
  NO_SUCH_USER,
  NOT_A_LABELLER,
  type AssignDependencies,
} from "@/lib/services/labels/assign-session";
import { ADMIN_REQUIRED } from "@/lib/services/labels/edit-session";
import { jobState, jobStatusText } from "@/lib/services/labels/job-groups";
import { fakeLabelClient, type FakeLabelCall } from "./fixtures/label-session";

/**
 * Admin › Labels' Assign over a fake client (assign-session.ts): who may
 * assign, whom to, which sessions, and exactly what is written; the list of
 * labellers; and the list's new session fields.
 */

const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const ADMIN_ID = "22222222-2222-4222-8222-222222222222";
const LABELLER_ID = "33333333-3333-4333-8333-333333333333";
const NOW = Date.parse("2026-11-03T22:00:00.000Z");

const LABELLER = {
  id: LABELLER_ID,
  email: "lena@example.com",
  first_name: "Lena",
  last_name: "Park",
  is_labeller: true,
};

function client(options: {
  session?: { status: string } | null;
  user?: Record<string, unknown> | null;
}) {
  return fakeLabelClient((call) => {
    if (call.table === "label_sessions" && call.op === "select") {
      return { data: options.session ?? null, error: null };
    }
    if (call.table === "users" && call.op === "select") {
      return { data: options.user ?? null, error: null };
    }
    return undefined;
  });
}

function deps(
  fake: ReturnType<typeof client>,
  admin: { id: string } | null = { id: ADMIN_ID },
): AssignDependencies {
  return {
    requireAdmin: async () => admin,
    createAdminClient: () => fake.supabase,
    now: () => NOW,
  };
}

const writes = (calls: readonly FakeLabelCall[]) =>
  calls.filter((c) => c.op === "insert" || c.op === "update");

test.describe("assignLabelSession", () => {
  test("a non-admin is refused before anything is read", async () => {
    const fake = client({ session: { status: "labelling" }, user: LABELLER });
    expect(
      await assignLabelSession(SESSION_ID, LABELLER_ID, deps(fake, null)),
    ).toEqual({ error: ADMIN_REQUIRED });
    expect(fake.calls).toEqual([]);
  });

  test("a user whose is_labeller is false is refused, nothing written", async () => {
    const fake = client({
      session: { status: "labelling" },
      user: { ...LABELLER, is_labeller: false },
    });
    expect(
      await assignLabelSession(SESSION_ID, LABELLER_ID, deps(fake)),
    ).toEqual({ error: NOT_A_LABELLER });
    expect(writes(fake.calls)).toEqual([]);
  });

  test("a user who does not exist is refused, nothing written", async () => {
    const fake = client({ session: { status: "labelling" }, user: null });
    expect(
      await assignLabelSession(SESSION_ID, LABELLER_ID, deps(fake)),
    ).toEqual({ error: NO_SUCH_USER });
    expect(writes(fake.calls)).toEqual([]);
  });

  test("a complete session is refused, assign or unassign, nothing written", async () => {
    for (const target of [LABELLER_ID, null]) {
      const fake = client({ session: { status: "complete" }, user: LABELLER });
      expect(await assignLabelSession(SESSION_ID, target, deps(fake))).toEqual({
        error: ASSIGN_FROZEN,
      });
      expect(writes(fake.calls)).toEqual([]);
    }
  });

  test("happy path: writes assigned_to and assigned_at, guarded against complete", async () => {
    const fake = client({ session: { status: "labelling" }, user: LABELLER });
    expect(
      await assignLabelSession(SESSION_ID, LABELLER_ID, deps(fake)),
    ).toEqual({
      ok: true,
      assignedTo: { id: LABELLER_ID, name: "Lena Park" },
      assignedAt: "2026-11-03T22:00:00.000Z",
    });
    expect(writes(fake.calls)).toEqual([
      {
        table: "label_sessions",
        op: "update",
        values: {
          assigned_to: LABELLER_ID,
          assigned_at: "2026-11-03T22:00:00.000Z",
        },
        filters: { id: SESSION_ID },
        negated: { status: "complete" },
      },
    ]);
  });

  test("a submitted session may be reassigned", async () => {
    const fake = client({ session: { status: "submitted" }, user: LABELLER });
    const result = await assignLabelSession(
      SESSION_ID,
      LABELLER_ID,
      deps(fake),
    );
    expect("ok" in result && result.ok).toBe(true);
  });

  test("unassign writes both columns null and never reads users", async () => {
    const fake = client({ session: { status: "labelling" } });
    expect(await assignLabelSession(SESSION_ID, null, deps(fake))).toEqual({
      ok: true,
      assignedTo: null,
      assignedAt: null,
    });
    expect(writes(fake.calls)).toEqual([
      {
        table: "label_sessions",
        op: "update",
        values: { assigned_to: null, assigned_at: null },
        filters: { id: SESSION_ID },
        negated: { status: "complete" },
      },
    ]);
    expect(fake.calls.some((c) => c.table === "users")).toBe(false);
  });

  test("a session published between the read and the write is not reassigned", async () => {
    const fake = fakeLabelClient((call) => {
      if (call.table === "label_sessions" && call.op === "select") {
        return { data: { status: "labelling" }, error: null };
      }
      if (call.table === "users") return { data: LABELLER, error: null };
      if (call.op === "update") return { data: [], error: null };
      return undefined;
    });
    const result = await assignLabelSession(SESSION_ID, LABELLER_ID, {
      requireAdmin: async () => ({ id: ADMIN_ID }),
      createAdminClient: () => fake.supabase,
    });
    expect(result).toEqual({
      error: "This session changed in another tab. Reload to see it.",
    });
  });

  test("bad ids are refused before anything is read", async () => {
    const fake = client({ session: { status: "labelling" }, user: LABELLER });
    expect(await assignLabelSession("nope", LABELLER_ID, deps(fake))).toEqual({
      error: "Invalid session id.",
    });
    expect(await assignLabelSession(SESSION_ID, "nope", deps(fake))).toEqual({
      error: "Invalid user id.",
    });
    expect(fake.calls).toEqual([]);
  });
});

test.describe("listLabellers", () => {
  test("a non-admin is refused before anything is read", async () => {
    const fake = client({});
    expect(await listLabellers(deps(fake, null))).toEqual({
      error: ADMIN_REQUIRED,
    });
    expect(fake.calls).toEqual([]);
  });

  test("reads users where is_labeller, named and sorted", async () => {
    const fake = fakeLabelClient((call) =>
      call.table === "users"
        ? {
            data: [
              LABELLER,
              {
                id: ADMIN_ID,
                email: "ana@example.com",
                first_name: null,
                last_name: null,
              },
            ],
            error: null,
          }
        : undefined,
    );
    expect(await listLabellers(deps(fake))).toEqual({
      ok: true,
      labellers: [
        { id: ADMIN_ID, name: "ana", email: "ana@example.com" },
        { id: LABELLER_ID, name: "Lena Park", email: "lena@example.com" },
      ],
    });
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0].filters).toEqual({ is_labeller: true });
  });
});

test.describe("the Labels list's session fields", () => {
  test("listLabelJobs fills assignedTo, assignedAt and submittedAt from the session read", async () => {
    const JOB = "44444444-4444-4444-8444-444444444444";
    const MATCH = "55555555-5555-4555-8555-555555555555";
    const fake = fakeLabelClient((call) => {
      if (call.table === "processing_jobs") {
        return {
          data: [{ id: JOB, match_id: MATCH, completed_at: null }],
          error: null,
        };
      }
      if (call.table === "matches") return { data: [], error: null };
      if (call.table === "points") return { data: null, error: null };
      if (call.table === "label_points") return { data: [], error: null };
      if (call.table === "label_work_beats") return { data: [], error: null };
      if (call.table === "label_sessions") {
        return {
          data: [
            {
              id: SESSION_ID,
              job_id: JOB,
              status: "submitted",
              started_at: "2026-11-01T00:00:00Z",
              open_counts: null,
              assigned_at: "2026-11-02T00:00:00Z",
              submitted_at: "2026-11-03T00:00:00Z",
              assignee: LABELLER,
            },
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
    expect(result.rows[0].session).toMatchObject({
      id: SESSION_ID,
      status: "submitted",
      assignedTo: { id: LABELLER_ID, name: "Lena Park" },
      assignedAt: "2026-11-02T00:00:00Z",
      submittedAt: "2026-11-03T00:00:00Z",
    });
    // One label_sessions read, the assignee embedded in it.
    const sessionReads = fake.calls.filter((c) => c.table === "label_sessions");
    expect(sessionReads).toHaveLength(1);
    expect(sessionReads[0].columns).toContain("assignee:users!assigned_to(");
    expect(fake.calls.some((c) => c.table === "users")).toBe(false);
  });

  test("a submitted session is in progress, with its own pill words", () => {
    const job = { session: { status: "submitted" as const } };
    expect(
      jobState({
        jobId: "j",
        matchId: "m",
        player1Name: "A",
        player2Name: "B",
        completedAt: null,
        ...job,
      }),
    ).toBe("doing");
    expect(jobStatusText(job)).toBe("Submitted for review");
    expect(
      jobStatusText({
        session: { status: "labelling", checked: 3, total: 9 },
      }),
    ).toBe("In progress · 3 of 9");
    expect(jobStatusText({ session: null })).toBe("Needs labelling");
    expect(jobStatusText({ session: { status: "complete" } })).toBe("Labelled");
  });
});
