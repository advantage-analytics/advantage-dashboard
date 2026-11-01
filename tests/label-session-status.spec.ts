import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { labelConfirmCopy } from "@/components/admin/labels/label-confirm";
import {
  errorKindKeyPatch,
  errorKindShotId,
} from "@/components/admin/labels/stroke-keys";
import { buildAppliedRows } from "@/lib/services/labels/apply";
import { allErrorsJudged } from "@/lib/services/labels/ending-derived";
import type { AdminClient } from "@/lib/supabase/admin";
import {
  checkSessionOpen,
  PUBLISH_LEASE_MS,
  PUBLISHING,
} from "@/lib/services/labels/edit-session";
import type { LabelMarks } from "@/lib/services/labels/marks";
import { withLiveScoreMarks } from "@/lib/services/labels/score-marks";
import type { LabelSession } from "@/lib/services/labels/session";
import {
  completeWarnings,
  unmarkedErrors,
} from "@/lib/services/labels/session-status";
import {
  ANOTHER_SESSION_OPEN,
  completeLabelSession,
  reopenLabelSession,
  writeLabelSessionComplete,
  writeLabelSessionReopen,
} from "@/lib/services/labels/session-status-session";
import { tag } from "./fixtures/html-probe";
import {
  FIXTURE_POINT_IDS,
  labelPoint,
  labelSessionFixture,
  labelShot,
} from "./fixtures/label-session";
import { createLoader } from "./fixtures/vm-modules";

/**
 * "Mark complete" and "Reopen": the service over a fake client, what the
 * confirm warns is still open, and the console header's two buttons.
 */

const CONSOLE = "src/components/admin/labels/label-console.tsx";
const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const MATCH_ID = "22222222-2222-4222-8222-222222222222";
const ACTOR = "33333333-3333-4333-8333-333333333333";
const NAMES = { p1: "Lee", p2: "Vargas" };
const { P1, P2 } = FIXTURE_POINT_IDS;

// ── The service ────────────────────────────────────────────────────────────

interface Call {
  table: string;
  op: "select" | "update" | "rpc";
  values?: Record<string, unknown>;
  filters: Record<string, unknown>;
}

/** The lease's stamp, as the database's clock writes it. */
const CLAIM_STAMP = "2026-10-10T21:00:00.123456+00:00";

function fakeClient(rows: {
  session?: Record<string, unknown> | null;
  /** The compare-and-set matched nothing — another tab got there first. */
  raced?: boolean;
  /** The update is refused with this Postgres code. */
  failCode?: string;
  /** Updates from this one on (0-based) fail with a plain error. */
  failFromUpdate?: number;
  /** These RPCs (`verify_match`, `unverify_match`) fail. */
  failRpc?: string[];
}) {
  const calls: Call[] = [];
  let updateCount = 0;
  const client = {
    functions: { invoke: async () => ({ error: null }) },
    /** `claim_label_publish_lease`: the database's stamp, or none. */
    async rpc(fn: string, args: Record<string, unknown>) {
      calls.push({ table: fn, op: "rpc", values: args, filters: {} });
      if (rows.failRpc?.includes(fn)) {
        return { data: null, error: { message: `${fn} refused` } };
      }
      return { data: rows.raced ? null : CLAIM_STAMP, error: null };
    },
    from(table: string) {
      const call: Call = { table, op: "select", filters: {} };
      calls.push(call);
      const answer = () => {
        if (call.op === "update") {
          if (
            rows.failFromUpdate !== undefined &&
            updateCount++ >= rows.failFromUpdate
          ) {
            return { data: null, error: { message: "network down" } };
          }
          if (rows.failCode) {
            return {
              data: null,
              error: { message: "duplicate key", code: rows.failCode },
            };
          }
          return {
            data: rows.raced ? [] : [{ id: call.filters.id }],
            error: null,
          };
        }
        return {
          data:
            rows.session === undefined
              ? { status: "labelling", marks_enabled: true, match_id: MATCH_ID }
              : rows.session,
          error: null,
        };
      };
      const builder = {
        select: () => builder,
        update: (values: Record<string, unknown>) => {
          call.op = "update";
          call.values = values;
          return builder;
        },
        eq: (column: string, value: unknown) => {
          call.filters[column] = value;
          return builder;
        },
        or: (expression: string) => {
          call.filters.or = expression;
          return builder;
        },
        maybeSingle: async () => answer(),
        then: (
          resolve: (v: unknown) => unknown,
          reject?: (e: unknown) => unknown,
        ) => Promise.resolve(answer()).then(resolve, reject),
      };
      return builder;
    },
  };
  return { calls, supabase: client as unknown as AdminClient };
}

const updates = (fake: ReturnType<typeof fakeClient>) =>
  fake.calls.filter((c) => c.op === "update");

/** A publish that wrote: the writer's own tests are about the status. */
const PUBLISHED = async () => ({
  ok: true as const,
  points: 10,
  shots: 40,
  errorsJudged: true,
});

test.describe("writeLabelSessionComplete", () => {
  test("a lease, then the publish, then complete — all matched on that lease", async () => {
    const fake = fakeClient({});
    const order: string[] = [];
    const now = Date.parse("2026-10-10T21:00:00.000Z");
    expect(
      await writeLabelSessionComplete({
        actorId: ACTOR,
        supabase: fake.supabase,
        sessionId: SESSION_ID,
        now: () => now,
        publish: async (_db, id) => {
          order.push(`publish ${id} after ${fake.calls.at(-1)?.op}`);
          return PUBLISHED();
        },
      }),
    ).toEqual({
      ok: true,
      status: "complete",
      published: {
        points: 10,
        shots: 40,
        insightsRequested: true,
        leftOut: [],
      },
    });
    // The lease lands first, so a second tab finds it taken.
    expect(order).toEqual([`publish ${SESSION_ID} after rpc`]);
    // The lease, then — once the points are in — Verified by Advantage, as
    // the admin who pressed it, before the session closes.
    expect(fake.calls.filter((c) => c.op === "rpc")).toEqual([
      {
        table: "claim_label_publish_lease",
        op: "rpc",
        values: { p_session_id: SESSION_ID },
        filters: {},
      },
      {
        table: "verify_match",
        op: "rpc",
        // The publish's word that every error was marked rides along: the
        // function stamps matches.errors_judged_at and recounts forced errors.
        values: { p_match_id: MATCH_ID, p_actor: ACTOR, p_errors_judged: true },
        filters: {},
      },
    ]);
    const verifyAt = fake.calls.findIndex((c) => c.table === "verify_match");
    const closeAt = fake.calls.findIndex((c) => c.op === "update");
    expect(verifyAt).toBeLessThan(closeAt);
    const [close] = updates(fake);
    expect(close).toMatchObject({
      values: {
        status: "complete",
        completed_at: "2026-10-10T21:00:00.000Z",
        publishing_since: null,
      },
      filters: { id: SESSION_ID, publishing_since: CLAIM_STAMP },
    });
    for (const call of updates(fake)) expect(call.table).toBe("label_sessions");
  });

  test("a failed verify is a failed Complete: the lease is released, the session stays open", async () => {
    const fake = fakeClient({ failRpc: ["verify_match"] });
    const result = await writeLabelSessionComplete({
      actorId: ACTOR,
      supabase: fake.supabase,
      sessionId: SESSION_ID,
      publish: PUBLISHED,
    });
    expect(result).toEqual({
      error:
        "The labels are published, but the match could not be marked Verified by Advantage: verify_match refused. Mark complete again to retry.",
    });
    expect(updates(fake).map((c) => c.values)).toEqual([
      { publishing_since: null },
    ]);
  });

  test("a close that fails after the verify takes Verified by Advantage back off", async () => {
    const fake = fakeClient({ failFromUpdate: 0 });
    const result = await writeLabelSessionComplete({
      actorId: ACTOR,
      supabase: fake.supabase,
      sessionId: SESSION_ID,
      publish: PUBLISHED,
    });
    expect(result).toEqual({
      error:
        "The labels are published, but the session could not be marked complete: network down",
    });
    expect(
      fake.calls.filter((c) => c.op === "rpc").map((c) => c.table),
    ).toEqual(["claim_label_publish_lease", "verify_match", "unverify_match"]);
    expect(fake.calls.at(-1)?.values).toEqual({ p_match_id: MATCH_ID });
  });

  test("a refused publish never verifies", async () => {
    const fake = fakeClient({});
    await writeLabelSessionComplete({
      actorId: ACTOR,
      supabase: fake.supabase,
      sessionId: SESSION_ID,
      publish: async () => ({ ok: false, error: "Not published: no." }),
    });
    expect(fake.calls.some((c) => c.table === "verify_match")).toBe(false);
  });

  test("a refused or failed publish releases only its own lease; the session stays open", async () => {
    const released = (fake: ReturnType<typeof fakeClient>) =>
      updates(fake).map((c) => c.values);

    const refusedPublish = fakeClient({});
    expect(
      await writeLabelSessionComplete({
        actorId: ACTOR,
        supabase: refusedPublish.supabase,
        sessionId: SESSION_ID,
        publish: async () => ({ ok: false, error: "Not published: no." }),
      }),
    ).toEqual({ error: "Not published: no." });
    const [release] = updates(refusedPublish);
    expect(released(refusedPublish)).toEqual([{ publishing_since: null }]);
    expect(release.filters.publishing_since).toBe(CLAIM_STAMP);

    const threw = fakeClient({});
    expect(
      await writeLabelSessionComplete({
        actorId: ACTOR,
        supabase: threw.supabase,
        sessionId: SESSION_ID,
        publish: async () => {
          throw new Error("boom");
        },
      }),
    ).toEqual({ error: "Could not publish the labels: boom" });
    expect(released(threw)).toEqual([{ publishing_since: null }]);
    // Never a status write: a failed publish leaves the session labelling.
    expect(released(threw).some((v) => v && "status" in v)).toBe(false);
  });

  test("a release that fails says the session stays held, and for how long", async () => {
    const fake = fakeClient({ failFromUpdate: 0 });
    expect(
      await writeLabelSessionComplete({
        actorId: ACTOR,
        supabase: fake.supabase,
        sessionId: SESSION_ID,
        publish: async () => ({ ok: false, error: "Not published: no." }),
      }),
    ).toEqual({
      error:
        "Not published: no. The session stays held for up to 5 minutes before it takes edits again (network down).",
    });
  });

  test("a fresh lease refuses edits and a second Complete; a stale one does not", async () => {
    const now = Date.now();
    let ran = false;
    const held = fakeClient({
      session: {
        status: "labelling",
        marks_enabled: true,
        publishing_since: new Date(now - 30_000).toISOString(),
      },
    });
    expect(
      await writeLabelSessionComplete({
        actorId: ACTOR,
        supabase: held.supabase,
        sessionId: SESSION_ID,
        publish: async () => {
          ran = true;
          return PUBLISHED();
        },
      }),
    ).toEqual({ error: PUBLISHING });
    expect(ran).toBe(false);
    expect(updates(held)).toEqual([]);
    expect(await checkSessionOpen(held.supabase, SESSION_ID)).toBe(PUBLISHING);

    const stale = fakeClient({
      session: {
        status: "labelling",
        marks_enabled: true,
        publishing_since: new Date(now - PUBLISH_LEASE_MS - 1000).toISOString(),
      },
    });
    expect(await checkSessionOpen(stale.supabase, SESSION_ID)).toBeNull();
    expect(
      await writeLabelSessionComplete({
        actorId: ACTOR,
        supabase: stale.supabase,
        sessionId: SESSION_ID,
        publish: PUBLISHED,
      }),
    ).toMatchObject({ ok: true, status: "complete" });
  });

  test("a session labelled without marks completes like any other", async () => {
    const blind = fakeClient({
      session: {
        status: "labelling",
        marks_enabled: false,
        match_id: MATCH_ID,
      },
    });
    expect(
      await writeLabelSessionComplete({
        actorId: ACTOR,
        publish: PUBLISHED,
        supabase: blind.supabase,
        sessionId: SESSION_ID,
      }),
    ).toEqual({
      ok: true,
      status: "complete",
      published: {
        points: 10,
        shots: 40,
        insightsRequested: true,
        leftOut: [],
      },
    });
  });

  test("refused: a bad id, a missing or complete session, and a race", async () => {
    const none = fakeClient({});
    expect(
      await writeLabelSessionComplete({
        actorId: ACTOR,
        publish: PUBLISHED,
        supabase: none.supabase,
        sessionId: "nope",
      }),
    ).toEqual({ error: "Invalid session id." });
    expect(none.calls).toEqual([]);

    expect(
      await writeLabelSessionComplete({
        actorId: ACTOR,
        publish: PUBLISHED,
        supabase: fakeClient({ session: null }).supabase,
        sessionId: SESSION_ID,
      }),
    ).toEqual({ error: "Session not found." });

    const frozen = fakeClient({
      session: { status: "complete", marks_enabled: true },
    });
    expect(
      await writeLabelSessionComplete({
        actorId: ACTOR,
        publish: PUBLISHED,
        supabase: frozen.supabase,
        sessionId: SESSION_ID,
      }),
    ).toEqual({
      error: "This session is complete, so its labels can no longer change.",
    });
    expect(updates(frozen)).toEqual([]);

    expect(
      await writeLabelSessionComplete({
        actorId: ACTOR,
        publish: PUBLISHED,
        supabase: fakeClient({ raced: true }).supabase,
        sessionId: SESSION_ID,
      }),
    ).toEqual({ error: PUBLISHING });
  });
});

test.describe("writeLabelSessionReopen", () => {
  test("a complete session back to labelling, completed_at cleared, matched on the complete status", async () => {
    const fake = fakeClient({
      session: { status: "complete", match_id: MATCH_ID, completed_at: "x" },
    });
    expect(
      await writeLabelSessionReopen({
        supabase: fake.supabase,
        sessionId: SESSION_ID,
      }),
    ).toEqual({ ok: true, status: "labelling" });
    expect(updates(fake)).toEqual([
      {
        table: "label_sessions",
        op: "update",
        values: { status: "labelling", completed_at: null },
        filters: { id: SESSION_ID, status: "complete" },
      },
    ]);
    // Then Verified by Advantage comes off the match.
    expect(fake.calls.at(-1)).toEqual({
      table: "unverify_match",
      op: "rpc",
      values: { p_match_id: MATCH_ID },
      filters: {},
    });
  });

  test("a failed unverify puts the session back to complete", async () => {
    const completedAt = "2026-10-20T10:00:00.000Z";
    const fake = fakeClient({
      session: {
        status: "complete",
        match_id: MATCH_ID,
        completed_at: completedAt,
      },
      failRpc: ["unverify_match"],
    });
    expect(
      await writeLabelSessionReopen({
        supabase: fake.supabase,
        sessionId: SESSION_ID,
      }),
    ).toEqual({
      error:
        "Could not remove Verified by Advantage, so the session stays complete: unverify_match refused",
    });
    expect(updates(fake).at(-1)).toEqual({
      table: "label_sessions",
      op: "update",
      values: { status: "complete", completed_at: completedAt },
      filters: { id: SESSION_ID, status: "labelling" },
    });
  });

  test("a refused reopen never touches Verified by Advantage", async () => {
    const fake = fakeClient({ session: { status: "complete" }, raced: true });
    await writeLabelSessionReopen({
      supabase: fake.supabase,
      sessionId: SESSION_ID,
    });
    expect(fake.calls.some((c) => c.op === "rpc")).toBe(false);
  });

  test("refused: an open session, another open session of the match, a race", async () => {
    const open = fakeClient({});
    expect(
      await writeLabelSessionReopen({
        supabase: open.supabase,
        sessionId: SESSION_ID,
      }),
    ).toEqual({ error: "This session is already open for labelling." });
    expect(updates(open)).toEqual([]);

    expect(
      await writeLabelSessionReopen({
        supabase: fakeClient({
          session: { status: "complete" },
          failCode: "23505",
        }).supabase,
        sessionId: SESSION_ID,
      }),
    ).toEqual({ error: ANOTHER_SESSION_OPEN });
    expect(ANOTHER_SESSION_OPEN).toContain(
      "Another labelling session is open for this match",
    );

    expect(
      await writeLabelSessionReopen({
        supabase: fakeClient({ session: { status: "complete" }, raced: true })
          .supabase,
        sessionId: SESSION_ID,
      }),
    ).toEqual({
      error: "This session changed in another tab. Reload to see it.",
    });
    expect(
      await writeLabelSessionReopen({
        supabase: fakeClient({ session: null }).supabase,
        sessionId: SESSION_ID,
      }),
    ).toEqual({ error: "Session not found." });
  });
});

test("both entry points refuse without an admin, before a client is built", async () => {
  for (const entry of [completeLabelSession, reopenLabelSession]) {
    let built = 0;
    const result = await entry(SESSION_ID, {
      requireAdmin: async () => null,
      createAdminClient: () => {
        built += 1;
        return fakeClient({}).supabase;
      },
    });
    expect(result).toEqual({ error: "Administrator access is required." });
    expect(built).toBe(0);
  }
});

// ── What the confirm warns of ──────────────────────────────────────────────

const EMPTY_MARKS: LabelMarks = {
  points: {},
  shots: {},
  suggestions: [],
  serveSides: {},
};

function warningsOf(session: LabelSession, marks: LabelMarks | null) {
  return completeWarnings({
    points: session.points,
    adScoring: session.adScoring,
    marks,
    finalScore: session.finalScore,
    videoEndsEarly: session.videoEndsEarly,
    matchScore: session.matchScore,
  });
}

test.describe("completeWarnings", () => {
  test("an error with no shots to mark says the match shows Errors only", () => {
    const session = labelSessionFixture();
    const noShots = (id: string, index: number) =>
      labelPoint(id, index, { ending: "error", endedBy: "p2", shots: [] });
    const lines = (points: LabelSession["points"]) =>
      warningsOf({ ...session, points }, EMPTY_MARKS).filter((w) =>
        w.includes("no shots to mark"),
      );
    expect(lines(session.points)).toEqual([]);
    expect(lines([...session.points, noShots("x", 9)])).toEqual([
      "1 error has no shots to mark, so this match shows Errors only",
    ]);
    expect(
      lines([...session.points, noShots("x", 9), noShots("y", 10)]),
    ).toEqual([
      "2 errors have no shots to mark, so this match shows Errors only",
    ]);
  });

  test("a stored ending that cannot be true of its winner is named, dismissed hint or not", () => {
    const session = labelSessionFixture();
    const lines = (fields: Partial<LabelSession["points"][number]>) =>
      warningsOf(
        {
          ...session,
          points: [...session.points, labelPoint("x", 9, { ...fields })],
        },
        EMPTY_MARKS,
      ).filter((w) => w.startsWith("Point 10"));
    expect(
      lines({ ending: "winner", endedBy: "p2", winner: "p1", shots: [] }),
    ).toEqual(["Point 10 reads a winner by player 2, but player 1 won it"]);
    expect(
      lines({
        ending: "error",
        endedBy: "p1",
        winner: "p1",
        dismissed: ["ending_stale"],
        shots: [],
      }),
    ).toEqual(["Point 10 reads an error by player 1, but player 1 won it"]);
    // An ending that fits its winner says nothing.
    expect(
      lines({ ending: "error", endedBy: "p2", winner: "p1", shots: [] }),
    ).toEqual([]);
  });

  test("the points left to check, each game left short or run over, and the entered score the sets disagree with", () => {
    expect(warningsOf(labelSessionFixture(), EMPTY_MARKS)).toEqual([
      "2 points of 3 not checked",
      "Game 1 unfinished (15–15)",
      "Game 2 unfinished (0–0)",
      "Set 1 labelled 0–0, the match record says 6–3 — it publishes as labelled",
      // The fixture's open point: its strokes disagree with its winner.
      "Point 4's strokes say player 2 won, not the labelled winner — it publishes with the labelled winner",
    ]);
  });

  test("no score line once the video ends early, and none with nothing entered", () => {
    const early = { ...labelSessionFixture(), videoEndsEarly: true };
    expect(warningsOf(early, EMPTY_MARKS)).not.toContainEqual(
      expect.stringContaining("entered"),
    );
    const unscored = { ...labelSessionFixture(), matchScore: null };
    expect(warningsOf(unscored, EMPTY_MARKS)).not.toContainEqual(
      expect.stringContaining("entered"),
    );
  });

  test("the open marks, counted as the rail counts them; none on a session without marks", () => {
    // Point 2 unchecked, served from the wrong side for its labelled score:
    // two score flags open on it, as the rail reads them live.
    const fixture = labelSessionFixture();
    const session = {
      ...fixture,
      // `serve_side` is never seeded, so the vendor's side (below) is read.
      points: fixture.points.map((p) =>
        p.id === P2 ? { ...p, checkedAt: null, serveSide: null } : p,
      ),
    };
    const marks = withLiveScoreMarks(
      { ...EMPTY_MARKS, serveSides: { [P1]: "deuce", [P2]: "deuce" } },
      session.points,
      true,
    );
    expect(warningsOf(session, marks)).toContain(
      "2 marks still open on 1 point",
    );
    expect(warningsOf(session, null)).not.toContainEqual(
      expect.stringContaining("mark"),
    );
  });

  test("how the publish will read a point with no ending: from its strokes, as score only, or refused", () => {
    const fixture = labelSessionFixture();
    const [first, second] = fixture.points;
    const third = {
      ...second,
      id: "x-point",
      pointIndex: second.pointIndex + 1,
    };
    const points = [
      // No stroke: off the video.
      { ...first, ending: null, endedBy: null, shots: [] },
      // A rally ball marked in by its hitter, the labelled winner.
      {
        ...second,
        ending: null,
        endedBy: null,
        winner: "p1" as const,
        shots: [
          labelShot("x-1", second.id, {
            hitter: "p1",
            stroke: "first_serve",
            result: "in",
          }),
          labelShot("x-2", second.id, {
            hitter: "p2",
            stroke: "backhand",
            result: "out",
          }),
        ],
      },
      // A lone first serve out settles nothing.
      {
        ...third,
        ending: null,
        endedBy: null,
        shots: [
          labelShot("x-3", third.id, {
            hitter: "p1",
            stroke: "first_serve",
            result: "out",
          }),
        ],
      },
    ];
    const warnings = completeWarnings({
      points,
      adScoring: fixture.adScoring,
      marks: null,
      finalScore: null,
      videoEndsEarly: true,
      matchScore: null,
      names: NAMES,
    });
    expect(warnings).toContain(
      `Point ${first.pointIndex + 1} isn't on the video and will publish as score only`,
    );
    expect(warnings).toContain(
      `Point ${second.pointIndex + 1}'s ending will be taken from its strokes (a service winner by ${NAMES.p1})`,
    );
    expect(warnings).toContain(
      `Point ${third.pointIndex + 1} has no ending its strokes can settle — it publishes with no ending`,
    );
  });

  test("the games the caller already scored are the ones read", () => {
    const session = labelSessionFixture();
    expect(
      completeWarnings({
        points: session.points,
        adScoring: session.adScoring,
        marks: EMPTY_MARKS,
        finalScore: null,
        videoEndsEarly: true,
        matchScore: null,
        games: [],
      }),
    ).toEqual([
      "2 points of 3 not checked",
      "Point 4's strokes say player 2 won, not the labelled winner — it publishes with the labelled winner",
    ]);
  });

  test("nothing at all on a session with nothing left", () => {
    const empty = {
      ...labelSessionFixture(),
      points: [],
      matchScore: null,
      finalScore: null,
    };
    expect(warningsOf(empty, EMPTY_MARKS)).toEqual([]);
  });

  test("the confirm's copy: warn, then allow", () => {
    expect(
      labelConfirmCopy(
        { kind: "complete-session", warnings: [], blockers: [] },
        NAMES,
      ),
    ).toEqual({
      title: "Mark complete and publish?",
      description:
        "Every point is checked and the score adds up. The athlete's match is rebuilt from these labels: statistics, points and summary, and it shows Verified by Advantage. The version it replaces is backed up, and Reopen lets you edit and publish again.",
      confirmLabel: "Publish",
      pendingLabel: "Publishing…",
      tone: "primary",
    });
    expect(
      labelConfirmCopy(
        {
          kind: "complete-session",
          warnings: ["Game 1 unfinished (15–15)"],
          blockers: [],
        },
        NAMES,
      ),
    ).toMatchObject({
      description:
        "Some things are still open. Publishing anyway rebuilds the athlete's match from these labels as they are, and it shows Verified by Advantage. The version it replaces is backed up, and Reopen lets you fix them and publish again.",
      confirmLabel: "Publish",
    });
  });

  test("errors not yet marked forced or unforced hold the publish, and the copy names them", () => {
    const blocked = (blockers: number[]) =>
      labelConfirmCopy(
        { kind: "complete-session", warnings: [], blockers },
        NAMES,
      );
    expect(blocked([31, 58, 140])).toEqual({
      title: "Mark 3 errors before publishing",
      description:
        "Every error needs forced or unforced before this match can be verified. They're points 31, 58 and 140.",
      confirmLabel: "Publish",
      pendingLabel: "Publishing…",
      tone: "primary",
      blocked: { goToLabel: "Go to point 31", pointNumber: 31 },
    });
    expect(blocked([31, 58])).toMatchObject({
      title: "Mark 2 errors before publishing",
      description:
        "Every error needs forced or unforced before this match can be verified. They're points 31 and 58.",
    });
    expect(blocked([31])).toMatchObject({
      title: "Mark 1 error before publishing",
      description:
        "Every error needs forced or unforced before this match can be verified. It's point 31.",
      blocked: { goToLabel: "Go to point 31", pointNumber: 31 },
    });
  });

  test("Reopen asks first, and says Verified by Advantage comes off", () => {
    expect(labelConfirmCopy({ kind: "reopen-session" }, NAMES)).toMatchObject({
      title: "Reopen and remove Verified by Advantage?",
      confirmLabel: "Reopen",
    });
  });
});

// ── Unmarked errors ────────────────────────────────────────────────────────

test.describe("unmarkedErrors", () => {
  let clock = 0;
  const shot = (pointId: string, fields: Parameters<typeof labelShot>[2]) => {
    clock += 1;
    return labelShot(`s-${pointId}-${clock}`, pointId, {
      eventId: clock,
      stroke: "forehand",
      result: "in",
      videoTime: clock,
      ...fields,
    });
  };
  /** A rally whose last ball, by p2, went out: an error. */
  const errorPoint = (
    id: string,
    index: number,
    fields: Parameters<typeof labelPoint>[2] = {},
  ) =>
    labelPoint(id, index, {
      winner: "p1",
      shots: [
        shot(id, { hitter: "p1", stroke: "first_serve" }),
        shot(id, { hitter: "p2" }),
        shot(id, { hitter: "p1" }),
        shot(id, { hitter: "p2", result: "out" }),
      ],
      ...fields,
    });
  /** A rally p1 won with a winner: nothing to mark. */
  const winnerPoint = (
    id: string,
    index: number,
    fields: Parameters<typeof labelPoint>[2] = {},
  ) =>
    labelPoint(id, index, {
      winner: "p1",
      shots: [
        shot(id, { hitter: "p1", stroke: "first_serve" }),
        shot(id, { hitter: "p2" }),
        shot(id, { hitter: "p1" }),
      ],
      ...fields,
    });

  test("none when every error is marked, and a stale kind on a winner counts nothing", () => {
    const points = [
      errorPoint("a", 0, { errorKind: "forced" }),
      // Once an error, now a winner: its leftover kind neither blocks nor counts.
      winnerPoint("b", 1, { errorKind: "unforced" }),
      winnerPoint("c", 2),
    ];
    expect(unmarkedErrors(points)).toEqual([]);
  });

  test("one: the rail's number, not an index", () => {
    const points = [
      winnerPoint("a", 0),
      errorPoint("b", 1),
      errorPoint("c", 2, { errorKind: "unforced" }),
    ];
    expect(unmarkedErrors(points)).toEqual([2]);
  });

  test("three, ascending, past deleted points, lets and non-points", () => {
    const points = [
      errorPoint("e", 139),
      errorPoint("a", 30),
      errorPoint("deleted", 40, { status: "deleted" }),
      errorPoint("let", 45, { ending: "let_replayed" }),
      errorPoint("b", 57),
      winnerPoint("w", 60),
    ];
    expect(unmarkedErrors(points)).toEqual([31, 58, 140]);
  });

  /** The gate, the tray's pair and E, read together off one point. */
  const readings = (point: LabelSession["points"][number]) => ({
    gate: unmarkedErrors([point]),
    tray: errorKindShotId(point),
    key: errorKindShotId(point)
      ? errorKindKeyPatch(point, errorKindShotId(point)!)
      : null,
    judged: allErrorsJudged([point]),
  });
  const lastLiveId = (point: LabelSession["points"][number]) =>
    point.shots.at(-1)!.id;
  const built = (point: LabelSession["points"][number]) =>
    buildAppliedRows({
      points: [{ ...point, setNumber: 1, gameNumber: 1, server: "p1" }],
      adScoring: true,
      bestOf: 3,
    });

  test("a stored error whose last ball is in is offered, blocks until marked, and then counts", () => {
    const point = winnerPoint("a", 0, { ending: "error", endedBy: "p2" });
    expect(readings(point)).toEqual({
      gate: [1],
      tray: lastLiveId(point),
      key: { error_kind: "forced" },
      judged: false,
    });
    const marked = { ...point, errorKind: "forced" as const };
    expect(readings(marked)).toMatchObject({
      gate: [],
      tray: lastLiveId(point),
      key: { error_kind: "unforced" },
      judged: true,
    });
    expect(built(marked).points[0].result_type).toBe("Forehand Forced Error");
  });

  test("a stored winner whose last ball missed is neither offered nor blocked, and a stale kind on it counts nothing", () => {
    const point = errorPoint("a", 0, {
      ending: "winner",
      endedBy: "p2",
      errorKind: "forced",
    });
    expect(readings(point)).toEqual({
      gate: [],
      tray: null,
      key: null,
      judged: true,
    });
    const row = built(point).points[0];
    expect(row.result_type).toBe("Forehand Winner");
    expect(row.errorKind).toBeNull();
  });

  test("a stored error with no strokes does not dead-end: not offered, not blocked, publishes Unforced, keeps the match at Errors", () => {
    const point = labelPoint("a", 0, {
      winner: "p1",
      ending: "error",
      endedBy: "p2",
      shots: [],
    });
    expect(readings(point)).toEqual({
      gate: [],
      tray: null,
      key: null,
      judged: false,
    });
    const applied = built(point);
    expect(applied.errorsJudged).toBe(false);
    expect(applied.points[0].result_type).toBe("Unforced Error");

    // A kind left from before its strokes went cannot make it judged.
    const stale = { ...point, errorKind: "forced" as const };
    expect(allErrorsJudged([stale])).toBe(false);
    expect(built(stale).points[0].result_type).toBe("Unforced Error");
    expect(built(stale).points[0].errorKind).toBeNull();

    // And it holds down every other point's forced string with it.
    const other = errorPoint("b", 1, { errorKind: "forced" });
    expect(allErrorsJudged([other, point])).toBe(false);
  });

  test("the gate and the tray read a ghost as the publish does, marks on or off", () => {
    // The miss is the last stroke the publish writes; the site removed the
    // ball after it, which a session labelled without marks still draws.
    const point = errorPoint("a", 0);
    point.shots = [
      ...point.shots,
      shot("a", {
        hitter: "p1",
        result: "in",
        siteRemoval: "hit_after_fault",
      }),
    ];
    const miss = point.shots.at(-2)!.id;
    expect(readings(point)).toMatchObject({ gate: [1], tray: miss });
    expect(built(point).points[0].result_type).toBe("Forehand Unforced Error");
  });
});

// ── The console header ─────────────────────────────────────────────────────

function renderConsole(
  session: LabelSession,
  operations: Record<string, unknown> | undefined,
): { html: string; called: string[] } {
  const { LabelConsole } = createLoader().load(CONSOLE) as {
    LabelConsole: React.ComponentType<Record<string, unknown>>;
  };
  const html = renderToStaticMarkup(
    React.createElement(LabelConsole, {
      session,
      video: null,
      marks: null,
      // The page's header, with Mark complete and Reopen, is the overview's.
      initialLayoutMode: "overview",
      operations,
      onSaveShot: async () => ({ ok: true, status: "edited" }),
      onSavePoint: async () => ({ ok: true, status: "edited" }),
    }),
  );
  return { html, called: [] };
}

/** The console's operations, each counting a call; a render makes none. */
function counting(names: readonly string[]) {
  const called: string[] = [];
  const operations = Object.fromEntries(
    names.map((name) => [
      name,
      async () => {
        called.push(name);
        return { error: "not in a render" };
      },
    ]),
  );
  return { called, operations };
}

/** The docked header: from its marker to the console's view. */
function headerOf(html: string): string {
  const at = html.indexOf("data-console-header");
  expect(at).toBeGreaterThan(-1);
  return html.slice(at, at + 4000);
}

test.describe("the console header", () => {
  const BOTH = ["completeSession", "reopenSession", "updateSessionFields"];

  test("a labelling session offers Mark complete, not Reopen — and a render writes nothing", () => {
    const { called, operations } = counting(BOTH);
    const head = headerOf(
      renderConsole(labelSessionFixture(), operations).html,
    );
    expect(called).toEqual([]);
    const button = tag(head, 'data-mark-complete=""');
    expect(button).toContain('type="button"');
    expect(head).toContain(">Mark complete<");
    expect(head).not.toContain("data-reopen-session");
    expect(head).not.toContain("data-session-complete");
  });

  test("a complete session reads Complete and offers Reopen, outside the editable gate", () => {
    const { operations } = counting(BOTH);
    const complete = { ...labelSessionFixture(), status: "complete" as const };
    const head = headerOf(renderConsole(complete, operations).html);
    expect(head).toContain("data-session-complete");
    expect(head).toContain(">Reopen<");
    expect(head).not.toContain("data-mark-complete");
  });

  test("neither without its action", () => {
    const { operations } = counting(["updateSessionFields"]);
    for (const status of ["labelling", "complete"] as const) {
      const head = headerOf(
        renderConsole({ ...labelSessionFixture(), status }, operations).html,
      );
      expect(head).not.toContain("data-mark-complete");
      expect(head).not.toContain("data-reopen-session");
    }
    // Read-only, with no operations at all: neither.
    const head = headerOf(renderConsole(labelSessionFixture(), undefined).html);
    expect(head).not.toContain("data-mark-complete");
  });
});
