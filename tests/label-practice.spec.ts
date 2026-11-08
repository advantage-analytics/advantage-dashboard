import { expect, test } from "@playwright/test";

import {
  publishPlanned,
  refusePracticePublish,
} from "@/lib/services/labels/apply-session";
import {
  ADMIN_REQUIRED,
  PRACTICE_NEVER_PUBLISHED,
} from "@/lib/services/labels/edit-session";
import {
  gradePractice,
  pairPoints,
  strokeFamily,
  toCsv,
  type GradePoint,
} from "@/lib/services/labels/practice-grading";
import {
  createPracticeCopies,
  deletePracticeCopy,
  NOT_A_PRACTICE_COPY,
  PRACTICE_SOURCE_NOT_KEY,
  practiceSessionFields,
  practiceWindow,
  seedInWindow,
} from "@/lib/services/labels/practice-session";
import type { LabelSeed } from "@/lib/services/labels/seed";
import { writeLabelSessionComplete } from "@/lib/services/labels/session-status-session";
import { jobVideoSeconds, parseDay } from "@/lib/data/practice-server";
import type { AdminClient } from "@/lib/supabase/admin";
import { fakeLabelClient } from "./fixtures/label-session";

/**
 * Practice copies (paid reviewer tests): they never publish, they are graded
 * against the answer key, and the admin writes that make and remove them touch
 * nothing but the copies. Offline — fake clients throughout.
 */

const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const KEY_ID = "22222222-2222-4222-8222-222222222222";
const ADMIN = "33333333-3333-4333-8333-333333333333";
const LABELLER = "44444444-4444-4444-8444-444444444444";

// ── Never published ──────────────────────────────────────────────────────────

test.describe("a practice session never publishes", () => {
  test("Mark complete refuses it at the gate, before the lease or any publish", async () => {
    let published = false;
    const { supabase, calls } = fakeLabelClient((call) => {
      if (call.table === "label_sessions" && call.op === "select") {
        return {
          data: {
            status: "submitted",
            marks_enabled: true,
            publishing_since: null,
            kind: "practice",
          },
          error: null,
        };
      }
      return undefined;
    });
    const result = await writeLabelSessionComplete({
      supabase: supabase as unknown as AdminClient,
      sessionId: SESSION_ID,
      actorId: ADMIN,
      publish: async () => {
        published = true;
        return { ok: true, points: 0, shots: 0 };
      },
    });
    expect(result).toEqual({ error: PRACTICE_NEVER_PUBLISHED });
    expect(published).toBe(false);
    expect(calls.map((c) => c.table)).toEqual(["label_sessions"]);
    expect(calls.some((c) => c.op === "rpc")).toBe(false);
  });

  test("an analyst session still passes the same gate", async () => {
    const { supabase, calls } = fakeLabelClient((call) => {
      if (call.table === "label_sessions" && call.op === "select") {
        return {
          data: {
            status: "submitted",
            marks_enabled: true,
            publishing_since: null,
            kind: "analyst",
          },
          error: null,
        };
      }
      if (call.op === "rpc") return { data: null, error: null };
      return undefined;
    });
    await writeLabelSessionComplete({
      supabase: supabase as unknown as AdminClient,
      sessionId: SESSION_ID,
      actorId: ADMIN,
    });
    expect(calls.some((c) => c.table === "claim_label_publish_lease")).toBe(
      true,
    );
  });

  test("the publish door itself refuses a practice copy before reading or writing anything", async () => {
    const touched: string[] = [];
    const db = {
      from(table: string) {
        touched.push(table);
        throw new Error("no database call expected");
      },
      rpc(fn: string) {
        touched.push(fn);
        throw new Error("no database call expected");
      },
      storage: {
        from() {
          touched.push("storage");
          throw new Error("no storage call expected");
        },
      },
    } as unknown as AdminClient;
    const context = {
      session: { kind: "practice", matchId: "m", jobId: "j", points: [] },
      beside: { vendor: [], startTimeSeconds: 0, bestOf: 3 },
    } as unknown as Parameters<typeof publishPlanned>[0]["context"];
    const plan = {
      mismatch: null,
      built: { points: [{}], problems: [], errorsJudged: true },
    } as unknown as Parameters<typeof publishPlanned>[0]["plan"];
    const result = await publishPlanned({
      db,
      context,
      plan,
      acceptScore: true,
    });
    expect(result).toEqual({ ok: false, error: PRACTICE_NEVER_PUBLISHED });
    expect(touched).toEqual([]);
  });

  test("refusePracticePublish answers only for practice", () => {
    expect(refusePracticePublish({ kind: "practice" })).toBe(
      PRACTICE_NEVER_PUBLISHED,
    );
    expect(refusePracticePublish({ kind: "analyst" })).toBeNull();
    expect(refusePracticePublish({})).toBeNull();
  });
});

// ── Making and deleting copies ───────────────────────────────────────────────

test.describe("creating and deleting practice copies", () => {
  test("refuses a non-admin before any read", async () => {
    let read = false;
    const result = await createPracticeCopies(
      { sourceSessionId: KEY_ID, setNumber: 1, labellerIds: [LABELLER] },
      {
        requireAdmin: async () => null,
        createAdminClient: () => {
          read = true;
          throw new Error("no client expected");
        },
      },
    );
    expect(result).toEqual({ error: ADMIN_REQUIRED });
    expect(read).toBe(false);
  });

  test("refuses a source that is not a completed analyst session", async () => {
    for (const key of [
      { kind: "analyst", status: "labelling" },
      { kind: "practice", status: "submitted" },
      { kind: "self", status: "complete" },
    ]) {
      const { supabase, calls } = fakeLabelClient((call) => {
        if (call.table === "label_sessions" && call.op === "select") {
          return {
            data: {
              id: KEY_ID,
              job_id: "j",
              match_id: "m",
              ad_scoring: null,
              ...key,
            },
            error: null,
          };
        }
        return undefined;
      });
      const result = await createPracticeCopies(
        { sourceSessionId: KEY_ID, setNumber: 1, labellerIds: [LABELLER] },
        {
          requireAdmin: async () => ({ id: ADMIN }),
          createAdminClient: () => supabase as unknown as AdminClient,
        },
      );
      expect(result).toEqual({ error: PRACTICE_SOURCE_NOT_KEY });
      expect(calls.every((c) => c.op === "select")).toBe(true);
    }
  });

  test("validates the set and the labeller list before reading", async () => {
    const deps = {
      requireAdmin: async () => ({ id: ADMIN }),
      createAdminClient: () => {
        throw new Error("no client expected");
      },
    };
    expect(
      await createPracticeCopies(
        { sourceSessionId: KEY_ID, setNumber: 9, labellerIds: [LABELLER] },
        deps,
      ),
    ).toEqual({ error: "Pick a set from 1 to 5, or the whole match." });
    expect(
      await createPracticeCopies(
        { sourceSessionId: KEY_ID, setNumber: 1, labellerIds: [] },
        deps,
      ),
    ).toEqual({ error: "Pick at least one labeller." });
  });

  test("delete is matched on kind = 'practice', so it can never take the key", async () => {
    const filters: Record<string, unknown>[] = [];
    const client = {
      from(table: string) {
        expect(table).toBe("label_sessions");
        const f: Record<string, unknown> = {};
        filters.push(f);
        const builder = {
          delete: () => builder,
          eq: (column: string, value: unknown) => {
            f[column] = value;
            return builder;
          },
          // Only a practice row would match; the key does not.
          select: async () => ({
            data:
              f.kind === "practice" && f.id === SESSION_ID
                ? [{ id: SESSION_ID }]
                : [],
            error: null,
          }),
        };
        return builder;
      },
    } as unknown as AdminClient;
    const deps = {
      requireAdmin: async () => ({ id: ADMIN }),
      createAdminClient: () => client,
    };
    expect(await deletePracticeCopy(SESSION_ID, deps)).toEqual({ ok: true });
    expect(await deletePracticeCopy(KEY_ID, deps)).toEqual({
      error: NOT_A_PRACTICE_COPY,
    });
    expect(filters.every((f) => f.kind === "practice")).toBe(true);
  });
});

// ── Set scope ────────────────────────────────────────────────────────────────

test.describe("one set's window", () => {
  const key = [
    { setNumber: 1, times: [100, 104] },
    { setNumber: 1, times: [1900, 1902] },
    { setNumber: 2, times: [2000, 2003] },
    { setNumber: null, times: [50] },
  ];

  test("spans the set, padded, and stops halfway to the next set", () => {
    expect(practiceWindow(key, 1, 4)).toEqual({ start: 96, end: 1906 });
    expect(practiceWindow(key, 1, 200)).toEqual({ start: -100, end: 1951 });
    expect(practiceWindow(key, 2, 4)).toEqual({ start: 1996, end: 2007 });
    expect(practiceWindow(key, 3)).toBeNull();
  });

  test("keeps the AI points whose first stroke is inside, renumbered from 0", () => {
    const point = (index: number, times: (number | null)[]) =>
      ({
        point_index: index,
        shots: times.map((t) => ({ video_time: t })),
      }) as unknown as LabelSeed["points"][number];
    const seed: LabelSeed = {
      points: [
        point(0, [90]),
        point(1, [97, 99]),
        point(2, [1905]),
        point(3, [1907]),
        point(4, [null]),
      ],
    };
    const kept = seedInWindow(seed, { start: 96, end: 1906 });
    expect(kept.points.map((p) => p.point_index)).toEqual([0, 1]);
    expect(kept.points.map((p) => p.shots[0].video_time)).toEqual([97, 1905]);
  });

  test("set 1 carries its own score; a later set starts from the sets won", () => {
    const score = { player1: [6, 4, 7], player2: [3, 6, 5] };
    expect(practiceSessionFields(score, 1, "p2")).toEqual({
      final_score: [[6, 3]],
      video_ends_early: false,
      start_score: null,
    });
    expect(practiceSessionFields(score, 3, "p2")).toEqual({
      final_score: null,
      video_ends_early: true,
      start_score: {
        sets: [1, 1],
        games: [0, 0],
        points: [0, 0],
        server: "p2",
      },
    });
    expect(practiceSessionFields(score, null, "p1")).toEqual({
      final_score: null,
      video_ends_early: null,
      start_score: null,
    });
  });
});

// ── Grading ──────────────────────────────────────────────────────────────────

function gp(
  id: string,
  at: number,
  fields: Partial<GradePoint> = {},
): GradePoint {
  return {
    id,
    setNumber: 1,
    server: "p1",
    winner: "p1",
    ending: "winner",
    endedBy: "p1",
    errorKind: null,
    status: "unchanged",
    seed: { server: "p1", winner: "p1", ending: "winner", ended_by: "p1" },
    shots: [
      { videoTime: at, stroke: "first_serve" },
      { videoTime: at + 1, stroke: "forehand" },
    ],
    seedLastStroke: "forehand",
    ...fields,
  };
}

test.describe("grading a copy against the key", () => {
  test("a copy that matches the key scores 100% with nothing missed", () => {
    const key = [gp("k1", 10), gp("k2", 30)];
    const copy = [gp("c1", 10.4), gp("c2", 29.8)];
    const grade = gradePractice(key, copy);
    expect(grade.accuracy).toBe(100);
    expect(grade.missedFixes).toBe(0);
    expect(grade.newErrors).toBe(0);
    expect(grade.matched).toBe(2);
    // Error kind is not graded where the key never judged it.
    expect(grade.byField.errorKind.checked).toBe(0);
  });

  test("a wrong AI value left alone is a missed fix; a right one changed is a new error", () => {
    const key = [gp("k1", 10, { winner: "p2", endedBy: "p2" }), gp("k2", 30)];
    const copy = [
      // AI said p1 won; the applicant left it.
      gp("c1", 10),
      // AI's server was right; the applicant changed it.
      gp("c2", 30, { server: "p2", status: "edited" }),
    ];
    const grade = gradePractice(key, copy);
    expect(grade.byField.winner).toMatchObject({
      missedFixes: 1,
      newErrors: 0,
    });
    expect(grade.byField.endedBy).toMatchObject({ missedFixes: 1 });
    expect(grade.byField.server).toMatchObject({
      newErrors: 1,
      missedFixes: 0,
    });
    expect(grade.fixesNeeded).toBe(2);
    expect(grade.fixesMade).toBe(0);
  });

  test("a fix made counts toward 'caught'", () => {
    const key = [gp("k1", 10, { winner: "p2" })];
    const copy = [gp("c1", 10, { winner: "p2", status: "edited" })];
    const grade = gradePractice(key, copy);
    expect(grade.fixesMade).toBe(1);
    expect(grade.fixesNeeded).toBe(1);
    expect(grade.accuracy).toBe(100);
  });

  test("boundaries: a missed point, a kept non-point, an added extra, a real point deleted", () => {
    const key = [gp("k1", 10), gp("k2", 30), gp("k3", 50)];
    const copy = [
      gp("c1", 10),
      // k2: the AI had no point here and the applicant never added one.
      // AI's let, which the key removed and the applicant kept.
      gp("c-let", 20),
      // The applicant added a point that is not one.
      gp("c-add", 40, { status: "added", seed: null }),
      // k3: the AI had it and the applicant deleted it.
      gp("c3", 50, { status: "deleted" }),
    ];
    const grade = gradePractice(key, copy);
    expect(grade.byField.boundary).toEqual({
      checked: 5,
      correct: 1,
      missedFixes: 2,
      newErrors: 2,
    });
    const kinds = grade.misses
      .filter((m) => m.field === "boundary")
      .map((m) => [m.at, m.kind, m.got]);
    expect(kinds).toEqual([
      [20, "missed_fix", "kept"],
      [30, "missed_fix", "missing"],
      [40, "new_error", "added"],
      [50, "new_error", "removed"],
    ]);
  });

  test("lets and non-points on either side are not points", () => {
    const key = [gp("k1", 10), gp("k-let", 20, { ending: "let_replayed" })];
    const copy = [
      gp("c1", 10),
      gp("c-let", 20, { ending: "not_a_point", status: "edited" }),
    ];
    const grade = gradePractice(key, copy);
    expect(grade.keyPoints).toBe(1);
    expect(
      grade.byField.boundary.newErrors + grade.byField.boundary.missedFixes,
    ).toBe(0);
    // The applicant removed a rally the AI had as a point: a fix made.
    expect(grade.fixesMade).toBeGreaterThanOrEqual(1);
  });

  test("error kind and last stroke: empty is missed, wrong is new", () => {
    const key = [
      gp("k1", 10, { ending: "error", errorKind: "forced" }),
      gp("k2", 30, {
        ending: "error",
        errorKind: "unforced",
        shots: [
          { videoTime: 30, stroke: "first_serve" },
          { videoTime: 31, stroke: "backhand_volley" },
        ],
      }),
    ];
    const copy = [
      gp("c1", 10, { ending: "error" }),
      gp("c2", 30, { ending: "error", errorKind: "forced" }),
    ];
    const grade = gradePractice(key, copy);
    expect(grade.byField.errorKind).toMatchObject({
      checked: 2,
      missedFixes: 1,
      newErrors: 1,
    });
    // k2's last stroke is a volley; the copy still has the AI's forehand.
    expect(grade.byField.lastStroke).toMatchObject({
      checked: 2,
      correct: 1,
      missedFixes: 1,
    });
  });

  test("points pair by nearest first stroke within tolerance, each once", () => {
    const { pairs, keyOnly, copyOnly } = pairPoints(
      [gp("k1", 10), gp("k2", 12)],
      [gp("c1", 11.9), gp("c2", 20)],
    );
    expect(pairs.map(([k, c]) => [k.id, c.id])).toEqual([["k2", "c1"]]);
    expect(keyOnly.map((p) => p.id)).toEqual(["k1"]);
    expect(copyOnly.map((p) => p.id)).toEqual(["c2"]);
  });

  test("stroke families and CSV quoting", () => {
    expect(strokeFamily("second_serve")).toBe("serve");
    expect(strokeFamily("forehand_volley")).toBe("volley");
    expect(strokeFamily("overhead")).toBe("overhead");
    expect(toCsv([["a,b", 'say "hi"', null, 3]])).toBe('"a,b","say ""hi""",,3');
  });
});

// ── Pay report helpers ───────────────────────────────────────────────────────

test.describe("pay report", () => {
  test("hours come from the trimmed span, else what was billed", () => {
    expect(
      jobVideoSeconds({
        start_time_seconds: "26",
        end_time_seconds: "3626",
        billable_seconds: 1,
      }),
    ).toBe(3600);
    expect(
      jobVideoSeconds({
        start_time_seconds: 0,
        end_time_seconds: null,
        billable_seconds: 1800,
      }),
    ).toBe(1800);
  });

  test("days parse strictly", () => {
    expect(parseDay("2026-11-06")).toBe("2026-11-06");
    expect(parseDay("2026-13-01")).toBeNull();
    expect(parseDay("yesterday")).toBeNull();
    expect(parseDay(undefined)).toBeNull();
  });
});
