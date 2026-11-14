import { expect, test } from "@playwright/test";

import {
  boardFlags,
  buildLabelQueue,
  loadAdminLabelBoard,
  loadLabellerBoard,
  newestCompletedJobPerMatch,
  toAdminLabelBoard,
  toLabellerBoard,
  type LabelQueueSource,
  type QueueJobRow,
  type QueueMatchRow,
  type QueueSessionRow,
} from "@/lib/data/label-queue-server";
import type { AdminClient } from "@/lib/supabase/admin";

/**
 * The label queue's loader: the flags mapper, the newest-job-per-match pick,
 * the lanes, and the boundary that keeps whose match it is off a labeller's
 * board. Offline — the queue is built from rows in memory, and the two
 * loaders run on injected reads.
 */

const VIEWER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OWNER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const TEST_OWNER = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const PLAYER_ONE = "Zephyrine Quillfeather";
const PLAYER_TWO = "Oswaldo Brackenridge";
const PROGRAM = "Ravenmoor Institute";

function job(over: Partial<QueueJobRow> & { id: string }): QueueJobRow {
  return {
    match_id: `match-${over.id}`,
    completed_at: "2026-11-10T10:00:00Z",
    priority: null,
    start_time_seconds: 0,
    end_time_seconds: 3600,
    billable_seconds: 3600,
    ...over,
  };
}

function match(over: Partial<QueueMatchRow> & { id: string }): QueueMatchRow {
  return {
    player1_name: PLAYER_ONE,
    player2_name: PLAYER_TWO,
    created_by: OWNER,
    programs: { school_name: PROGRAM, team: null },
    ...over,
  };
}

function session(
  over: Partial<QueueSessionRow> & { id: string; job_id: string },
): QueueSessionRow {
  return {
    status: "labelling",
    started_at: "2026-11-10T12:00:00Z",
    open_counts: null,
    assigned_to: null,
    assigned_at: null,
    submitted_at: null,
    labeller: null,
    assignee: null,
    ...over,
  };
}

const assignee = (id: string, first: string, last: string) => ({
  id,
  email: `${first.toLowerCase()}@labellers.test`,
  first_name: first,
  last_name: last,
  avatar_path: `${id}/face.png`,
});

function source(over: Partial<LabelQueueSource>): LabelQueueSource {
  const jobs = over.jobs ?? [];
  return {
    jobs,
    matches: jobs.map((row) => match({ id: row.match_id })),
    sessions: [],
    ownerEmails: new Map([
      [OWNER, "coach@ravenmoor.edu"],
      [TEST_OWNER, "suite@example.com"],
    ]),
    photoUrl: (path) => (path ? `https://cdn.test/${path}` : null),
    ...over,
  };
}

// ── Flags ────────────────────────────────────────────────────────────────────

test.describe("boardFlags", () => {
  test("resolved of total once a starting count is recorded", () => {
    expect(boardFlags({ amber: 6, grey: 4 }, { amber: 2, grey: 1 })).toEqual({
      resolved: 7,
      total: 10,
    });
  });

  test("resolved is floored at zero when work raised more flags", () => {
    expect(boardFlags({ amber: 1, grey: 1 }, { amber: 3, grey: 2 })).toEqual({
      resolved: 0,
      total: 2,
    });
  });

  test("only what is left when no starting count was recorded", () => {
    expect(boardFlags(null, { amber: 2, grey: 3 })).toEqual({ left: 5 });
    expect(boardFlags(undefined, { amber: 0, grey: 0 })).toEqual({ left: 0 });
  });

  test("null before the console has counted", () => {
    expect(boardFlags(null, null)).toBeNull();
    expect(boardFlags(undefined, undefined)).toBeNull();
    expect(boardFlags("nonsense", { amber: "2" })).toBeNull();
  });
});

// ── Newest job per match ─────────────────────────────────────────────────────

test.describe("newest completed job per match", () => {
  test("the later completion wins, whatever order the rows arrive in", () => {
    const older = job({
      id: "job-old",
      match_id: "m1",
      completed_at: "2026-11-01T10:00:00Z",
    });
    const newer = job({
      id: "job-new",
      match_id: "m1",
      completed_at: "2026-11-05T10:00:00Z",
    });
    const lone = job({ id: "job-lone", match_id: "m2" });
    for (const rows of [
      [older, newer, lone],
      [lone, newer, older],
    ]) {
      expect(
        newestCompletedJobPerMatch(rows)
          .map((row) => row.id)
          .sort(),
      ).toEqual(["job-lone", "job-new"]);
    }
  });

  test("the queue is built from the newest job, not the one with a session", () => {
    const entries = buildLabelQueue(
      source({
        jobs: [
          job({
            id: "job-old",
            match_id: "m1",
            completed_at: "2026-11-01T10:00:00Z",
          }),
          job({
            id: "job-new",
            match_id: "m1",
            completed_at: "2026-11-05T10:00:00Z",
          }),
        ],
        // The superseded run was published; the re-run has not been.
        sessions: [
          session({ id: "s-old", job_id: "job-old", status: "complete" }),
        ],
      }),
    );
    expect(entries.map((entry) => entry.id)).toEqual(["job-new"]);
    expect(entries[0].session).toBeNull();
  });

  test("a complete non-practice session on the newest job takes the match out", () => {
    const entries = buildLabelQueue(
      source({
        jobs: [
          job({
            id: "job-old",
            match_id: "m1",
            completed_at: "2026-11-01T10:00:00Z",
          }),
          job({
            id: "job-new",
            match_id: "m1",
            completed_at: "2026-11-05T10:00:00Z",
          }),
        ],
        sessions: [
          session({ id: "s-done", job_id: "job-new", status: "complete" }),
          // A later open session beside it does not bring the match back.
          session({
            id: "s-open",
            job_id: "job-new",
            started_at: "2026-11-12T12:00:00Z",
          }),
        ],
      }),
    );
    expect(entries).toEqual([]);
  });

  test("queue.ts decides entry and order: no test owners, earliest due first", () => {
    const entries = buildLabelQueue(
      source({
        jobs: [
          job({ id: "job-late", completed_at: "2026-11-11T10:00:00Z" }),
          job({ id: "job-early", completed_at: "2026-11-09T10:00:00Z" }),
          job({ id: "job-test", match_id: "m-test" }),
          job({ id: "job-before", completed_at: "2026-10-20T10:00:00Z" }),
          job({
            id: "job-empty",
            end_time_seconds: null,
            billable_seconds: 0,
          }),
        ],
        matches: [
          match({ id: "match-job-late" }),
          match({ id: "match-job-early", programs: null }),
          match({ id: "m-test", created_by: TEST_OWNER }),
        ],
      }),
    );
    expect(entries.map((entry) => entry.id)).toEqual(["job-early", "job-late"]);
    expect(entries[0].dueAt).toBe("2026-11-10T22:00:00.000Z");
    expect(entries[0].programName).toBe("Personal");
    expect(entries[1].programName).toBe(PROGRAM);
  });
});

// ── The two boards ───────────────────────────────────────────────────────────

/** Five matches: two waiting, the viewer's, another labeller's, one handed in. */
function fixture() {
  const jobs = ["a", "b", "c", "d", "e"].map((letter, index) =>
    job({
      id: `job-${letter}`,
      completed_at: `2026-11-0${index + 2}T10:00:00Z`,
      priority: letter === "a" ? "express" : "standard",
    }),
  );
  const entries = buildLabelQueue(
    source({
      jobs,
      sessions: [
        // An open session nobody holds is still to do.
        session({
          id: "s-b",
          job_id: "job-b",
          open_counts: { amber: 4, grey: 1 },
        }),
        session({
          id: "s-c",
          job_id: "job-c",
          assigned_to: VIEWER,
          assigned_at: "2026-11-05T09:00:00Z",
          claimed_at: "2026-11-05T09:00:00Z",
          open_counts: { amber: 3, grey: 0 },
          start_open_counts: { amber: 8, grey: 2 },
          assignee: assignee(VIEWER, "Ines", "Okafor"),
        }),
        session({
          id: "s-d",
          job_id: "job-d",
          assigned_to: OTHER,
          assigned_at: "2026-11-06T09:00:00Z",
          assignee: assignee(OTHER, "Tariq", "Lindqvist"),
        }),
        session({
          id: "s-e",
          job_id: "job-e",
          status: "submitted",
          assigned_to: OTHER,
          submitted_at: "2026-11-07T09:00:00Z",
          open_counts: { amber: 0, grey: 0 },
          assignee: assignee(OTHER, "Tariq", "Lindqvist"),
        }),
      ],
    }),
  );
  entries.find((entry) => entry.id === "job-d")!.session!.lastBeatAt =
    "2026-11-06T11:30:00Z";
  return entries;
}

test.describe("the labeller's board", () => {
  test("never names whose match a row is", () => {
    const entries = fixture();
    // The names are in the queue the board is built from.
    expect(JSON.stringify(entries)).toContain(PLAYER_ONE);
    expect(JSON.stringify(entries)).toContain(PLAYER_TWO);

    const text = JSON.stringify(toLabellerBoard(entries, VIEWER, true));
    expect(text).not.toContain(PLAYER_ONE);
    expect(text).not.toContain(PLAYER_TWO);
    expect(text).not.toContain(PROGRAM);
    expect(text).not.toContain("match-job-");
    expect(text).not.toContain(OWNER);
    expect(text).not.toContain("ravenmoor");
  });

  test("a to-do row carries the claim key, the video, the due time and nothing else", () => {
    const board = toLabellerBoard(fixture(), VIEWER, false);
    expect(board.todo).toEqual([
      {
        jobId: "job-a",
        videoSeconds: 3600,
        urgency: "express",
        dueAt: "2026-11-03T22:00:00.000Z",
        claimable: true,
        flags: null,
      },
      {
        jobId: "job-b",
        videoSeconds: 3600,
        urgency: "standard",
        dueAt: "2026-11-04T22:00:00.000Z",
        claimable: true,
        flags: { left: 5 },
      },
    ]);
    expect(board.holding).toBe(false);
  });

  test("a session id is given only for the viewer's own session", () => {
    const board = toLabellerBoard(fixture(), VIEWER, true);
    expect(board.inProgress).toEqual([
      {
        sessionId: "s-c",
        mine: true,
        labellerFirstName: "Ines",
        labellerPhotoUrl: `https://cdn.test/${VIEWER}/face.png`,
        flags: { resolved: 7, total: 10 },
        videoSeconds: 3600,
        urgency: "standard",
        dueAt: "2026-11-05T22:00:00.000Z",
        submittedAt: null,
      },
      {
        mine: false,
        labellerFirstName: "Tariq",
        labellerPhotoUrl: `https://cdn.test/${OTHER}/face.png`,
        flags: null,
        videoSeconds: 3600,
        urgency: "standard",
        dueAt: "2026-11-06T22:00:00.000Z",
        submittedAt: null,
      },
    ]);
    expect(board.submitted).toHaveLength(1);
    expect(board.submitted[0]).toMatchObject({
      mine: false,
      labellerFirstName: "Tariq",
      flags: { left: 0 },
      submittedAt: "2026-11-07T09:00:00Z",
    });
    expect("sessionId" in board.submitted[0]).toBe(false);
    expect(JSON.stringify(board)).not.toContain("Lindqvist");
    expect(board.holding).toBe(true);
  });

  test("loadLabellerBoard runs the gate before any read", async () => {
    const calls: string[] = [];
    const db = {} as AdminClient;
    const board = await loadLabellerBoard({
      requireViewer: async () => {
        calls.push("gate");
        return { id: VIEWER, kind: "labeller" };
      },
      createAdminClient: () => {
        calls.push("client");
        return db;
      },
      readQueue: async () => {
        calls.push("queue");
        return fixture();
      },
      readHolding: async (_db, userId) => {
        calls.push(`holding:${userId}`);
        return true;
      },
    });
    expect(calls[0]).toBe("gate");
    expect(calls).toContain("queue");
    expect(calls).toContain(`holding:${VIEWER}`);
    expect(Object.keys(board).sort()).toEqual([
      "holding",
      "inProgress",
      "submitted",
      "todo",
    ]);
    expect(board.holding).toBe(true);
    expect(JSON.stringify(board)).not.toContain(PLAYER_ONE);
    expect(JSON.stringify(board)).not.toContain(PLAYER_TWO);
  });

  test("a refused viewer reads nothing", async () => {
    const calls: string[] = [];
    await expect(
      loadLabellerBoard({
        requireViewer: async () => {
          throw new Error("NEXT_NOT_FOUND");
        },
        createAdminClient: () => {
          calls.push("client");
          return {} as AdminClient;
        },
        readQueue: async () => {
          calls.push("queue");
          return [];
        },
        readHolding: async () => {
          calls.push("holding");
          return false;
        },
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(calls).toEqual([]);
  });
});

test.describe("the admin's board", () => {
  test("the same three lanes, every row named", () => {
    const board = toAdminLabelBoard(fixture());
    expect(Object.keys(board).sort()).toEqual([
      "inProgress",
      "submitted",
      "todo",
    ]);
    expect(board.todo.map((row) => row.jobId)).toEqual(["job-a", "job-b"]);
    expect(board.inProgress.map((row) => row.jobId)).toEqual([
      "job-c",
      "job-d",
    ]);
    expect(board.submitted.map((row) => row.jobId)).toEqual(["job-e"]);

    expect(board.inProgress[0]).toMatchObject({
      jobId: "job-c",
      matchId: "match-job-c",
      player1Name: PLAYER_ONE,
      player2Name: PLAYER_TWO,
      programName: PROGRAM,
      sessionId: "s-c",
      labellerName: "Ines Okafor",
      claimedAt: "2026-11-05T09:00:00Z",
      lastBeatAt: null,
      flags: { resolved: 7, total: 10 },
    });
    // Admin-assigned, not claimed; the assignee's last beat rides along.
    expect(board.inProgress[1]).toMatchObject({
      labellerName: "Tariq Lindqvist",
      claimedAt: null,
      lastBeatAt: "2026-11-06T11:30:00Z",
    });
    expect(board.todo[0]).toMatchObject({
      sessionId: null,
      labellerName: null,
      claimable: true,
    });
  });

  test("loadAdminLabelBoard runs the gate before any read", async () => {
    const calls: string[] = [];
    const board = await loadAdminLabelBoard({
      requireAdmin: async () => {
        calls.push("gate");
        return { id: VIEWER };
      },
      createAdminClient: () => {
        calls.push("client");
        return {} as AdminClient;
      },
      readQueue: async () => {
        calls.push("queue");
        return fixture();
      },
    });
    expect(calls).toEqual(["gate", "client", "queue"]);
    expect(board.submitted[0].player1Name).toBe(PLAYER_ONE);
  });
});
