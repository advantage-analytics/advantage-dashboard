import { expect, test } from "@playwright/test";

import type { AdminClient } from "@/lib/supabase/admin";
import {
  ACTOR_REQUIRED,
  ADMIN_REQUIRED,
  checkSessionOpen,
  FROZEN,
  PUBLISHING,
  SUBMITTED,
} from "@/lib/services/labels/edit-session";
import type { LabelSession } from "@/lib/services/labels/session";
import {
  completeLabelSession,
  writeLabelSessionComplete,
  writeLabelSessionReopen,
} from "@/lib/services/labels/session-status-session";
import {
  submitLabelSession,
  writeLabelSubmit,
} from "@/lib/services/labels/submit-session";
import {
  fakeLabelClient,
  labelSessionFixture,
  type FakeLabelCall,
} from "./fixtures/label-session";

/**
 * "Submit for review" over a fake client: the snapshot, then the status; what
 * is refused; and the two admin paths that read a submitted session — Reopen
 * back to labelling and Mark complete through it.
 */

const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const MATCH_ID = "22222222-2222-4222-8222-222222222222";
const LABELLER = "33333333-3333-4333-8333-333333333333";
const SUBMISSION_ID = "44444444-4444-4444-8444-444444444444";
const CLAIM_STAMP = "2026-11-03T21:00:00.123456+00:00";
const RACED = "This session changed in another tab. Reload to see it.";

/** A `label_sessions` row as the gate and Reopen read it. */
function sessionRow(
  status: LabelSession["status"],
  extra: Record<string, unknown> = {},
) {
  return {
    status,
    marks_enabled: true,
    match_id: MATCH_ID,
    publishing_since: null,
    completed_at: status === "complete" ? "2026-11-01T10:00:00.000Z" : null,
    submitted_at: status === "submitted" ? "2026-11-02T10:00:00.000Z" : null,
    ...extra,
  };
}

/**
 * The client: `label_sessions` reads answer `session`; the submission insert
 * answers its id; an update matches one row unless `raced`.
 */
function client(options: {
  session: Record<string, unknown> | null;
  raced?: boolean;
  failInsert?: boolean;
}) {
  return fakeLabelClient((call) => {
    if (call.table === "label_sessions" && call.op === "select") {
      return { data: options.session, error: null };
    }
    if (call.table === "label_submissions" && call.op === "insert") {
      return options.failInsert
        ? { data: null, error: { message: "disk full" } }
        : { data: { id: SUBMISSION_ID }, error: null };
    }
    if (call.op === "update" && options.raced) return { data: [], error: null };
    if (call.op === "rpc") return { data: CLAIM_STAMP, error: null };
    return undefined;
  });
}

const writes = (calls: readonly FakeLabelCall[]) =>
  calls.filter((c) => c.op === "insert" || c.op === "update");

const fixture = labelSessionFixture();
const readFixture = async () => ({ session: fixture });

test.describe("writeLabelSubmit", () => {
  test("on a labelling session: the snapshot first, then the status, both stamped alike", async () => {
    const fake = client({ session: sessionRow("labelling") });
    const now = Date.parse("2026-11-03T21:00:00.000Z");
    expect(
      await writeLabelSubmit({
        supabase: fake.supabase,
        sessionId: SESSION_ID,
        actorId: LABELLER,
        readRows: readFixture,
        now: () => now,
      }),
    ).toEqual({ ok: true, status: "submitted", submissionId: SUBMISSION_ID });

    expect(writes(fake.calls)).toEqual([
      {
        table: "label_submissions",
        op: "insert",
        values: {
          session_id: SESSION_ID,
          submitted_by: LABELLER,
          submitted_at: "2026-11-03T21:00:00.000Z",
          // The points as the console reads them, each with its shots.
          rows: { points: fixture.points },
        },
        filters: {},
      },
      {
        table: "label_sessions",
        op: "update",
        values: {
          status: "submitted",
          submitted_at: "2026-11-03T21:00:00.000Z",
          labeller: LABELLER,
        },
        filters: { id: SESSION_ID, status: "labelling" },
      },
    ]);
    expect(fixture.points.length).toBeGreaterThan(0);
    expect(fixture.points.every((p) => Array.isArray(p.shots))).toBe(true);
  });

  test("never writes matches, points or shots, and never calls a function", async () => {
    const fake = client({ session: sessionRow("labelling") });
    await writeLabelSubmit({
      supabase: fake.supabase,
      sessionId: SESSION_ID,
      actorId: LABELLER,
      readRows: readFixture,
    });
    const touched = new Set(writes(fake.calls).map((c) => c.table));
    expect([...touched].sort()).toEqual([
      "label_sessions",
      "label_submissions",
    ]);
    expect(fake.calls.some((c) => c.op === "rpc")).toBe(false);
  });

  test("refused with the gate's sentences on a submitted, complete or publishing session — nothing read or written past the gate", async () => {
    let read = 0;
    const counting = async () => {
      read += 1;
      return { session: fixture };
    };
    const cases: [Record<string, unknown>, string][] = [
      [sessionRow("submitted"), SUBMITTED],
      [sessionRow("complete"), FROZEN],
      [
        sessionRow("labelling", {
          publishing_since: new Date(Date.now() - 30_000).toISOString(),
        }),
        PUBLISHING,
      ],
    ];
    for (const [session, sentence] of cases) {
      const fake = client({ session });
      expect(
        await writeLabelSubmit({
          supabase: fake.supabase,
          sessionId: SESSION_ID,
          actorId: LABELLER,
          readRows: counting,
        }),
      ).toEqual({ error: sentence });
      expect(writes(fake.calls)).toEqual([]);
    }
    expect(read).toBe(0);
    expect(SUBMITTED).toBe(
      "This session has been submitted for review, so its labels can no longer change.",
    );
    expect(FROZEN).toBe(
      "This session is complete, so its labels can no longer change.",
    );
  });

  test("refused: a bad id before any call, a missing session, a failed snapshot", async () => {
    const none = client({ session: sessionRow("labelling") });
    expect(
      await writeLabelSubmit({
        supabase: none.supabase,
        sessionId: "nope",
        actorId: LABELLER,
        readRows: readFixture,
      }),
    ).toEqual({ error: "Invalid session id." });
    expect(none.calls).toEqual([]);

    expect(
      await writeLabelSubmit({
        supabase: client({ session: null }).supabase,
        sessionId: SESSION_ID,
        actorId: LABELLER,
        readRows: readFixture,
      }),
    ).toEqual({ error: "Session not found." });

    const gone = client({ session: sessionRow("labelling") });
    expect(
      await writeLabelSubmit({
        supabase: gone.supabase,
        sessionId: SESSION_ID,
        actorId: LABELLER,
        readRows: async () => null,
      }),
    ).toEqual({ error: "Session not found." });
    expect(writes(gone.calls)).toEqual([]);

    const failed = client({
      session: sessionRow("labelling"),
      failInsert: true,
    });
    expect(
      await writeLabelSubmit({
        supabase: failed.supabase,
        sessionId: SESSION_ID,
        actorId: LABELLER,
        readRows: readFixture,
      }),
    ).toEqual({ error: "Could not submit the session: disk full" });
    // The status never moves without its snapshot.
    expect(writes(failed.calls).map((c) => c.op)).toEqual(["insert"]);
  });

  test("a race on the status is reported; the snapshot already written is left in place", async () => {
    const fake = client({ session: sessionRow("labelling"), raced: true });
    expect(
      await writeLabelSubmit({
        supabase: fake.supabase,
        sessionId: SESSION_ID,
        actorId: LABELLER,
        readRows: readFixture,
      }),
    ).toEqual({ error: RACED });
    expect(writes(fake.calls).map((c) => c.op)).toEqual(["insert", "update"]);
  });
});

test.describe("submitLabelSession", () => {
  test("refuses without an actor, before a client is built", async () => {
    let built = 0;
    expect(
      await submitLabelSession(SESSION_ID, {
        requireLabelActor: async () => null,
        createAdminClient: () => {
          built += 1;
          return client({ session: sessionRow("labelling") }).supabase;
        },
      }),
    ).toEqual({ error: ACTOR_REQUIRED });
    expect(built).toBe(0);
  });

  test("admits a labeller and an admin alike, asked about the session, and writes who submitted", async () => {
    for (const kind of ["labeller", "admin"] as const) {
      const asked: unknown[] = [];
      const fake = client({ session: sessionRow("labelling") });
      const result = await submitLabelSession(SESSION_ID, {
        requireLabelActor: async (target) => {
          asked.push(target);
          return { id: LABELLER, kind };
        },
        createAdminClient: () => fake.supabase,
      });
      expect(asked).toEqual([{ sessionId: SESSION_ID }]);
      // The default reader hits `matches` and the row tables, which the fake
      // does not answer: the gate passed and the writer's own sentence came
      // back, never a throw.
      expect(result).toMatchObject({
        error: expect.stringMatching(/^Could not submit the session: /),
      });
      expect(writes(fake.calls)).toEqual([]);
    }
  });
});

test.describe("the admin paths on a submitted session", () => {
  test("checkSessionOpen refuses it unless told to let it through; the lease still refuses", async () => {
    const submitted = client({ session: sessionRow("submitted") });
    expect(await checkSessionOpen(submitted.supabase, SESSION_ID)).toBe(
      SUBMITTED,
    );
    expect(
      await checkSessionOpen(submitted.supabase, SESSION_ID, {
        allowSubmitted: true,
      }),
    ).toBeNull();
    const held = client({
      session: sessionRow("submitted", {
        publishing_since: new Date(Date.now() - 30_000).toISOString(),
      }),
    });
    expect(
      await checkSessionOpen(held.supabase, SESSION_ID, {
        allowSubmitted: true,
      }),
    ).toBe(PUBLISHING);
    // A complete session is still frozen either way.
    expect(
      await checkSessionOpen(
        client({ session: sessionRow("complete") }).supabase,
        SESSION_ID,
        { allowSubmitted: true },
      ),
    ).toBe(FROZEN);
  });

  test("Reopen from submitted: back to labelling with submitted_at cleared, matched on submitted, and no unverify", async () => {
    const fake = client({ session: sessionRow("submitted") });
    expect(
      await writeLabelSessionReopen({
        supabase: fake.supabase,
        sessionId: SESSION_ID,
      }),
    ).toEqual({ ok: true, status: "labelling" });
    expect(writes(fake.calls)).toEqual([
      {
        table: "label_sessions",
        op: "update",
        values: { status: "labelling", submitted_at: null },
        filters: { id: SESSION_ID, status: "submitted" },
      },
    ]);
    expect(fake.calls.some((c) => c.op === "rpc")).toBe(false);

    const raced = client({ session: sessionRow("submitted"), raced: true });
    expect(
      await writeLabelSessionReopen({
        supabase: raced.supabase,
        sessionId: SESSION_ID,
      }),
    ).toEqual({ error: RACED });
    expect(raced.calls.some((c) => c.op === "rpc")).toBe(false);
  });

  test("Reopen from complete still calls unverify_match", async () => {
    const fake = client({ session: sessionRow("complete") });
    expect(
      await writeLabelSessionReopen({
        supabase: fake.supabase,
        sessionId: SESSION_ID,
      }),
    ).toEqual({ ok: true, status: "labelling" });
    expect(writes(fake.calls)).toEqual([
      {
        table: "label_sessions",
        op: "update",
        values: { status: "labelling", completed_at: null },
        filters: { id: SESSION_ID, status: "complete" },
      },
    ]);
    expect(fake.calls.at(-1)).toMatchObject({
      table: "unverify_match",
      op: "rpc",
      values: { p_match_id: MATCH_ID },
    });
  });

  test("Mark complete publishes a submitted session; the close clears submitted_at with the status", async () => {
    const fake = client({ session: sessionRow("submitted") });
    const now = Date.parse("2026-11-03T22:00:00.000Z");
    let published = 0;
    expect(
      await writeLabelSessionComplete({
        supabase: fake.supabase,
        sessionId: SESSION_ID,
        actorId: LABELLER,
        now: () => now,
        publish: async () => {
          published += 1;
          return { ok: true, points: 3, shots: 9 };
        },
      }),
    ).toMatchObject({ ok: true, status: "complete" });
    expect(published).toBe(1);
    expect(
      fake.calls.filter((c) => c.op === "rpc").map((c) => c.table),
    ).toEqual(["claim_label_publish_lease", "verify_match"]);
    const [close] = writes(fake.calls);
    expect(close).toEqual({
      table: "label_sessions",
      op: "update",
      values: {
        status: "complete",
        completed_at: "2026-11-03T22:00:00.000Z",
        submitted_at: null,
        publishing_since: null,
      },
      filters: { id: SESSION_ID, publishing_since: CLAIM_STAMP },
    });
    // The submission row is not touched: it keeps the time it was handed in.
    expect(fake.calls.some((c) => c.table === "label_submissions")).toBe(false);
  });

  test("Mark complete refuses a labeller before any read, even on a session they submitted", async () => {
    let built = 0;
    expect(
      await completeLabelSession(SESSION_ID, {
        requireLabelActor: async () => ({ id: LABELLER, kind: "labeller" }),
        createAdminClient: () => {
          built += 1;
          return client({ session: sessionRow("submitted") }).supabase;
        },
      }),
    ).toEqual({ error: ADMIN_REQUIRED });
    expect(built).toBe(0);
  });
});
