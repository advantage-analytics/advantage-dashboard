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
  SUBMIT_PRACTICE_FAILED,
  SUBMIT_PUBLISH_FAILED,
  submitLabelSession,
  writeLabelSubmit,
} from "@/lib/services/labels/submit-session";
import {
  fakeLabelClient,
  labelSessionFixture,
  type FakeLabelCall,
} from "./fixtures/label-session";

/**
 * Submit over a fake client. A practice copy: the snapshot, then the status.
 * Every other session: the snapshot under the publish lease, then the publish
 * Mark complete makes. What is refused; and the two admin paths that read a
 * submitted session — Reopen back to labelling and Mark complete through it.
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
  /** `claim_label_publish_lease` answers no stamp: another publish holds it. */
  noLease?: boolean;
  /** This function fails, with `failRpcMessage` or "<name> refused". */
  failRpc?: string;
  failRpcMessage?: string;
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
    if (call.op === "rpc") {
      if (call.table === options.failRpc) {
        return {
          data: null,
          error: {
            message: options.failRpcMessage ?? `${call.table} refused`,
          },
        };
      }
      return { data: options.noLease ? null : CLAIM_STAMP, error: null };
    }
    return undefined;
  });
}

/** The gate answering one actor, over `fake`. */
function as(kind: "labeller" | "admin", fake: ReturnType<typeof client>) {
  return {
    requireLabelActor: async () => ({ id: LABELLER, kind }),
    createAdminClient: () => fake.supabase,
  };
}

/** A publish that wrote. */
const PUBLISHED = async () => ({ ok: true as const, points: 3, shots: 9 });

/** Swap `console.error` for a recorder until `stop()`: the raw detail lands there. */
function captureErrors() {
  const calls: unknown[][] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    calls.push(args);
  };
  return {
    calls,
    stop: () => {
      console.error = original;
    },
  };
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

  test("asks the gate about the session, for a labeller and an admin alike", async () => {
    for (const kind of ["labeller", "admin"] as const) {
      const asked: unknown[] = [];
      const fake = client({ session: sessionRow("labelling") });
      await submitLabelSession(
        SESSION_ID,
        {
          requireLabelActor: async (target) => {
            asked.push(target);
            return { id: LABELLER, kind };
          },
          createAdminClient: () => fake.supabase,
        },
        { publish: PUBLISHED, readRows: readFixture },
      );
      expect(asked).toEqual([{ sessionId: SESSION_ID }]);
    }
  });

  test("a practice copy: the snapshot, then `submitted` — no lease, no publish, no verify", async () => {
    const fake = client({
      session: sessionRow("labelling", { kind: "practice" }),
    });
    const now = Date.parse("2026-11-14T09:00:00.000Z");
    let published = 0;
    expect(
      await submitLabelSession(SESSION_ID, as("labeller", fake), {
        readRows: readFixture,
        now: () => now,
        publish: async () => {
          published += 1;
          return PUBLISHED();
        },
      }),
    ).toEqual({ ok: true, status: "submitted" });
    expect(published).toBe(0);
    expect(fake.calls.some((c) => c.op === "rpc")).toBe(false);
    // Exactly `writeLabelSubmit`'s two writes.
    expect(writes(fake.calls)).toEqual([
      {
        table: "label_submissions",
        op: "insert",
        values: {
          session_id: SESSION_ID,
          submitted_by: LABELLER,
          submitted_at: "2026-11-14T09:00:00.000Z",
          rows: { points: fixture.points },
        },
        filters: {},
      },
      {
        table: "label_sessions",
        op: "update",
        values: {
          status: "submitted",
          submitted_at: "2026-11-14T09:00:00.000Z",
          labeller: LABELLER,
        },
        filters: { id: SESSION_ID, status: "labelling" },
      },
    ]);
  });

  test("a real session is published: lease, snapshot, publish, verify as the labeller, then a close with no check", async () => {
    const fake = client({ session: sessionRow("labelling") });
    const now = Date.parse("2026-11-14T09:00:00.000Z");
    const order: string[] = [];
    expect(
      await submitLabelSession(SESSION_ID, as("labeller", fake), {
        readRows: readFixture,
        now: () => now,
        publish: async (_db, id) => {
          order.push(`publish ${id}`);
          return { ...(await PUBLISHED()), leftOut: ["Point 3: no winner"] };
        },
      }),
    ).toEqual({
      ok: true,
      status: "complete",
      published: {
        points: 3,
        shots: 9,
        // The fake has no `functions`, so the summary was not asked for.
        insightsRequested: false,
        leftOut: ["Point 3: no winner"],
      },
    });

    // Everything past the reads, in the order it happened. The publish is
    // placed by what had been called when it ran.
    const steps = fake.calls
      .filter((c) => c.op !== "select")
      .map((c) => `${c.op} ${c.table}`);
    expect(steps).toEqual([
      "rpc claim_label_publish_lease",
      "insert label_submissions",
      "rpc verify_match",
      "update label_sessions",
    ]);
    expect(order).toEqual([`publish ${SESSION_ID}`]);

    const [snapshot, close] = writes(fake.calls);
    expect(snapshot.values).toEqual({
      session_id: SESSION_ID,
      submitted_by: LABELLER,
      submitted_at: "2026-11-14T09:00:00.000Z",
      rows: { points: fixture.points },
    });
    expect(fake.calls.find((c) => c.table === "verify_match")?.values).toEqual({
      p_match_id: MATCH_ID,
      p_actor: LABELLER,
      p_errors_judged: false,
    });
    expect(close).toEqual({
      table: "label_sessions",
      op: "update",
      // No `checked_at`: a labeller's publish waits for an admin's check.
      values: {
        status: "complete",
        completed_at: "2026-11-14T09:00:00.000Z",
        submitted_at: null,
        publishing_since: null,
      },
      filters: { id: SESSION_ID, publishing_since: CLAIM_STAMP },
    });
    // One lease and one verify: nothing is published twice.
    expect(fake.calls.filter((c) => c.op === "rpc")).toHaveLength(2);
  });

  test("the publish runs after the snapshot is in", async () => {
    const fake = client({ session: sessionRow("labelling") });
    let before: string[] = [];
    await submitLabelSession(SESSION_ID, as("labeller", fake), {
      readRows: readFixture,
      publish: async () => {
        before = fake.calls
          .filter((c) => c.op !== "select")
          .map((c) => `${c.op} ${c.table}`);
        return PUBLISHED();
      },
    });
    expect(before).toEqual([
      "rpc claim_label_publish_lease",
      "insert label_submissions",
    ]);
  });

  test("an admin's submit is its own check: the close stamps checked_at and checked_by", async () => {
    const fake = client({ session: sessionRow("labelling") });
    const now = Date.parse("2026-11-14T09:00:00.000Z");
    await submitLabelSession(SESSION_ID, as("admin", fake), {
      readRows: readFixture,
      now: () => now,
      publish: PUBLISHED,
    });
    expect(writes(fake.calls).at(-1)?.values).toEqual({
      status: "complete",
      completed_at: "2026-11-14T09:00:00.000Z",
      submitted_at: null,
      publishing_since: null,
      checked_at: "2026-11-14T09:00:00.000Z",
      checked_by: LABELLER,
    });
  });

  test("a refused gate or a lease not taken writes nothing and says why", async () => {
    let published = 0;
    const publish = async () => {
      published += 1;
      return PUBLISHED();
    };
    const cases: [Record<string, unknown>, string][] = [
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
        await submitLabelSession(SESSION_ID, as("labeller", fake), {
          readRows: readFixture,
          publish,
        }),
      ).toEqual({ error: sentence });
      expect(fake.calls.filter((c) => c.op !== "select")).toEqual([]);
    }

    // The gate passed, but another publish took the lease first.
    const lost = client({ session: sessionRow("labelling"), noLease: true });
    expect(
      await submitLabelSession(SESSION_ID, as("labeller", lost), {
        readRows: readFixture,
        publish,
      }),
    ).toEqual({ error: PUBLISHING });
    expect(writes(lost.calls)).toEqual([]);
    expect(published).toBe(0);

    expect(
      await submitLabelSession(
        SESSION_ID,
        as("labeller", client({ session: null })),
        { readRows: readFixture, publish },
      ),
    ).toEqual({ error: "Session not found." });
  });

  test("a failed snapshot releases the lease and never publishes", async () => {
    const fake = client({ session: sessionRow("labelling"), failInsert: true });
    let published = 0;
    expect(
      await submitLabelSession(SESSION_ID, as("admin", fake), {
        readRows: readFixture,
        publish: async () => {
          published += 1;
          return PUBLISHED();
        },
      }),
    ).toEqual({ error: "Could not submit the session: disk full" });
    expect(published).toBe(0);
    expect(fake.calls.some((c) => c.table === "verify_match")).toBe(false);
    expect(writes(fake.calls).map((c) => [c.op, c.values])).toEqual([
      ["insert", expect.objectContaining({ session_id: SESSION_ID })],
      ["update", { publishing_since: null }],
    ]);
    expect(writes(fake.calls).at(-1)?.filters).toEqual({
      id: SESSION_ID,
      publishing_since: CLAIM_STAMP,
    });
  });

  test("a refused publish leaves the snapshot, releases the lease and leaves the session labelling", async () => {
    const fake = client({ session: sessionRow("labelling") });
    expect(
      await submitLabelSession(SESSION_ID, as("labeller", fake), {
        readRows: readFixture,
        publish: async () => ({
          ok: false,
          error: "Not published: there are no points to write.",
        }),
      }),
    ).toEqual({ error: "Not published: there are no points to write." });
    expect(fake.calls.some((c) => c.table === "verify_match")).toBe(false);
    // The snapshot is in and nothing takes it back; the one update is the
    // lease's release, which names no status.
    expect(
      writes(fake.calls).map((c) => [c.table, c.op, c.values?.status]),
    ).toEqual([
      ["label_submissions", "insert", undefined],
      ["label_sessions", "update", undefined],
    ]);
    expect(writes(fake.calls).at(-1)).toMatchObject({
      values: { publishing_since: null },
      filters: { id: SESSION_ID, publishing_since: CLAIM_STAMP },
    });
  });

  test("a failed verify releases the lease and asks for the publish again", async () => {
    const fake = client({
      session: sessionRow("labelling"),
      failRpc: "verify_match",
    });
    const result = await submitLabelSession(SESSION_ID, as("admin", fake), {
      readRows: readFixture,
      publish: PUBLISHED,
    });
    expect(result).toEqual({
      error:
        "The labels are published, but the match could not be marked Verified by Advantage: verify_match refused. Publish again to retry.",
    });
    expect(writes(fake.calls).at(-1)).toMatchObject({
      values: { publishing_since: null },
      filters: { id: SESSION_ID, publishing_since: CLAIM_STAMP },
    });
    expect(writes(fake.calls).some((c) => c.values?.status)).toBe(false);
  });

  test("a labeller reads a failure after the gate as the fixed sentence; an admin reads it whole", async () => {
    const sentence = `Match ${MATCH_ID} not found`;
    const answers: Record<string, unknown> = {};
    const logged = captureErrors();
    for (const kind of ["labeller", "admin"] as const) {
      const fake = client({
        session: sessionRow("labelling"),
        failRpc: "verify_match",
        failRpcMessage: sentence,
      });
      answers[kind] = await submitLabelSession(SESSION_ID, as(kind, fake), {
        readRows: readFixture,
        publish: PUBLISHED,
      });
    }
    logged.stop();
    expect(answers.admin).toEqual({
      error: `The labels are published, but the match could not be marked Verified by Advantage: ${sentence}. Publish again to retry.`,
    });
    expect(answers.labeller).toEqual({ error: SUBMIT_PUBLISH_FAILED });
    expect(JSON.stringify(answers.labeller)).not.toContain(MATCH_ID);
    // The raw text is logged once, for the labeller's answer.
    const refusals = logged.calls.filter(
      ([line]) => line === "[labels:submit] refused a labeller",
    );
    expect(refusals).toHaveLength(1);
    expect(JSON.stringify(refusals)).toContain(sentence);
  });

  test("a labeller never reads the database's words: a failed snapshot, a failed read, a thrown publish", async () => {
    const logged = captureErrors();
    const snapshot = client({
      session: sessionRow("labelling"),
      failInsert: true,
    });
    expect(
      await submitLabelSession(SESSION_ID, as("labeller", snapshot), {
        readRows: readFixture,
        publish: PUBLISHED,
      }),
    ).toEqual({ error: SUBMIT_PUBLISH_FAILED });

    const thrown = client({ session: sessionRow("labelling") });
    expect(
      await submitLabelSession(SESSION_ID, as("labeller", thrown), {
        readRows: readFixture,
        publish: async () => {
          throw new Error(
            'duplicate key value violates unique constraint "points_match_id_point_index_key"',
          );
        },
      }),
    ).toEqual({ error: SUBMIT_PUBLISH_FAILED });

    const practice = client({
      session: sessionRow("labelling", { kind: "practice" }),
      failInsert: true,
    });
    expect(
      await submitLabelSession(SESSION_ID, as("labeller", practice), {
        readRows: readFixture,
      }),
    ).toEqual({ error: SUBMIT_PRACTICE_FAILED });
    logged.stop();
    expect(JSON.stringify(logged.calls)).toContain("disk full");
    expect(JSON.stringify(logged.calls)).toContain(
      "points_match_id_point_index_key",
    );
  });

  test("a labeller still reads the deliberate refusals as they are", async () => {
    const refused = client({ session: sessionRow("labelling") });
    expect(
      await submitLabelSession(SESSION_ID, as("labeller", refused), {
        readRows: readFixture,
        publish: async () => ({
          ok: false,
          error: "Not published: there are no points to write.",
        }),
      }),
    ).toEqual({ error: "Not published: there are no points to write." });
    const raced = client({ session: sessionRow("labelling"), raced: true });
    expect(
      await submitLabelSession(SESSION_ID, as("labeller", raced), {
        readRows: readFixture,
        publish: PUBLISHED,
      }),
    ).toEqual({ error: RACED });
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
        values: {
          status: "labelling",
          completed_at: null,
          checked_at: null,
          checked_by: null,
        },
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
