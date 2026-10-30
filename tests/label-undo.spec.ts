import { expect, test } from "@playwright/test";
import { readLabelPointsByIds } from "@/lib/data/labels-server";
import {
  pointsToRead,
  redoLabelOp,
  undoLabelOp,
} from "@/lib/services/labels/undo-session";
import type { AdminClient } from "@/lib/supabase/admin";
import { opHeaders, withLabelOp } from "@/lib/supabase/op-context";
import { writeLabelPointEdit } from "@/lib/services/labels/edit-session";
import { applyLabelPointPatch } from "@/lib/services/labels/edit";
import {
  LABEL_POINT_COLUMNS,
  toLabelPoint,
  type LabelPointRow,
} from "@/lib/services/labels/rows";
import type { LabelPoint } from "@/lib/services/labels/session";
import { applyUndoDiff } from "@/lib/services/labels/undo-diff";
import {
  fakeLabelClient,
  labelPoint,
  labelShotRow,
} from "./fixtures/label-session";

/**
 * The console's Undo, server side (undo-session.ts): the admin gate, the one
 * RPC, and the touched rows read back. The rewind itself is `undo_label_op`,
 * in the migrations `label_row_history_undo` and `undo_label_op_returns_rows`.
 */
const SESSION = "aa7b743e-c1cc-4784-b920-8e5b27c620fa";

function fakeDb(answer: {
  data?: unknown;
  error?: { code: string; message: string };
}) {
  const calls: unknown[][] = [];
  const db = {
    rpc: async (...args: unknown[]) => {
      calls.push(args);
      return { data: answer.data ?? null, error: answer.error ?? null };
    },
  } as unknown as AdminClient;
  return { calls, db };
}

test("refused without an admin, before a client is built; a bad id reads nothing", async () => {
  let built = 0;
  const deps = {
    requireAdmin: async () => null,
    createAdminClient: () => {
      built += 1;
      return {} as AdminClient;
    },
    readPoints: async () => [],
  };
  expect(await undoLabelOp(SESSION, deps)).toEqual({
    error: "Admin access required.",
  });
  expect(
    await undoLabelOp("nope", {
      ...deps,
      requireAdmin: async () => ({ id: "a" }),
    }),
  ).toEqual({ error: "No such session." });
  expect(built).toBe(0);
});

test("one RPC, then only the touched points read back, as a diff", async () => {
  const { calls, db } = fakeDb({
    data: {
      undone: "Split point",
      remaining: 3,
      points: ["p1"],
      shots: ["s1", "s2"],
      deleted_points: ["p9"],
      deleted_shots: [],
      shot_points: ["p1", "p2"],
    },
  });
  const changed = [{ id: "p1" }, { id: "p2" }] as never;
  const asked: unknown[] = [];
  const result = await undoLabelOp(SESSION, {
    requireAdmin: async () => ({ id: "admin" }),
    createAdminClient: () => db,
    readPoints: async (_db, sessionId, pointIds) => {
      asked.push([sessionId, pointIds]);
      return changed;
    },
  });
  expect(calls).toEqual([["undo_label_op", { p_session_id: SESSION }]]);
  // The touched points and the touched shots' owners, folded, less the
  // deleted — which the console drops rather than reads.
  expect(asked).toEqual([[SESSION, ["p1", "p2"]]]);
  expect(result).toEqual({
    ok: true,
    undone: "Split point",
    remaining: 3,
    // The old function says nothing of redo: none.
    redoable: 0,
    changed,
    removedPointIds: ["p9"],
  });
});

test("redo: one RPC to redo_label_op, the touched points read back the same way", async () => {
  const { calls, db } = fakeDb({
    data: {
      redone: "Combine points",
      remaining: 1,
      points: ["p1"],
      shots: ["s1"],
      deleted_points: [],
      deleted_shots: [],
      shot_points: ["p1", "p2"],
    },
  });
  const changed = [{ id: "p1" }, { id: "p2" }] as never;
  const result = await redoLabelOp(SESSION, {
    requireAdmin: async () => ({ id: "admin" }),
    createAdminClient: () => db,
    readPoints: async () => changed,
  });
  expect(calls).toEqual([["redo_label_op", { p_session_id: SESSION }]]);
  expect(result).toEqual({
    ok: true,
    redone: "Combine points",
    remaining: 1,
    changed,
    removedPointIds: [],
  });
  // The undo's count of what is left to redo comes through.
  const undone = await undoLabelOp(SESSION, {
    requireAdmin: async () => ({ id: "admin" }),
    createAdminClient: () =>
      fakeDb({ data: { undone: "Edit", remaining: 0, redoable: 2 } }).db,
    readPoints: async () => [],
  });
  expect(undone).toMatchObject({ ok: true, redoable: 2 });
});

test("redo refuses and reports like undo", async () => {
  expect(
    await redoLabelOp(SESSION, {
      requireAdmin: async () => null,
      createAdminClient: () => ({}) as AdminClient,
      readPoints: async () => [],
    }),
  ).toEqual({ error: "Admin access required." });
  const log = console.error;
  console.error = () => {};
  try {
    expect(
      await redoLabelOp(SESSION, {
        requireAdmin: async () => ({ id: "admin" }),
        createAdminClient: () =>
          fakeDb({ error: { code: "42883", message: "nope" } }).db,
        readPoints: async () => [],
      }),
    ).toEqual({ error: "Could not redo. Nothing was changed." });
  } finally {
    console.error = log;
  }
});

test("the ids to read: touched points and shot owners, never a deleted point", () => {
  expect(
    pointsToRead({
      points: ["a", "b", "a"],
      shot_points: ["b", "c", "gone"],
      deleted_points: ["gone", "gone"],
    }),
  ).toEqual({ pointIds: ["a", "b", "c"], removedPointIds: ["gone"] });
  // The old function's answer, and an empty journal: nothing to read.
  expect(pointsToRead({ undone: null, remaining: 0 })).toEqual({
    pointIds: [],
    removedPointIds: [],
  });
});

test("the fake client is asked for exactly the listed ids, each point whole with its shots", async () => {
  const { calls, supabase } = fakeLabelClient((call) => {
    if (call.op === "rpc") {
      return {
        data: {
          undone: "Combine points",
          remaining: 1,
          points: ["p-b"],
          shots: ["s-2"],
          deleted_points: [],
          deleted_shots: [],
          shot_points: ["p-a", "p-b"],
        },
        error: null,
      };
    }
    if (call.table === "label_points") {
      return {
        data: [
          {
            id: "p-b",
            point_index: 1,
            vendor_rally_ids: null,
            set_number: 1,
            game_number: 1,
            server: "p1",
            serve_side: "deuce",
            winner: null,
            ending: null,
            ended_by: null,
            game_type: "game",
            status: "edited",
            status_before_delete: null,
            checked_at: null,
            note: null,
            dismissed: null,
            game_start_locked: false,
            seed: null,
          },
          {
            id: "p-a",
            point_index: 0,
            vendor_rally_ids: [1001],
            set_number: 1,
            game_number: 1,
            server: "p1",
            serve_side: "deuce",
            winner: null,
            ending: null,
            ended_by: null,
            game_type: "game",
            status: "unchanged",
            status_before_delete: null,
            checked_at: null,
            note: null,
            dismissed: null,
            game_start_locked: false,
            seed: null,
          },
        ],
        error: null,
      };
    }
    if (call.table === "label_shots") {
      return {
        data: [
          labelShotRow("s-2", "p-b", { event_id: 2 }),
          labelShotRow("s-1", "p-a", { event_id: 1 }),
        ],
        error: null,
      };
    }
    return undefined;
  });
  const result = await undoLabelOp(SESSION, {
    requireAdmin: async () => ({ id: "admin" }),
    createAdminClient: () => supabase,
    readPoints: readLabelPointsByIds,
  });
  const reads = calls.filter((call) => call.op === "select");
  expect(reads.map((call) => [call.table, call.filters, call.in])).toEqual([
    ["label_points", { session_id: SESSION }, { id: ["p-b", "p-a"] }],
    [
      "label_shots",
      { session_id: SESSION },
      { label_point_id: ["p-b", "p-a"] },
    ],
  ]);
  expect("ok" in result && result.ok).toBe(true);
  if (!("ok" in result)) return;
  // Both owners of the moved stroke, in rail order, each with its own shots.
  expect(
    result.changed.map((p) => [p.id, p.pointIndex, p.shots.map((s) => s.id)]),
  ).toEqual([
    ["p-a", 0, ["s-1"]],
    ["p-b", 1, ["s-2"]],
  ]);
  expect(result.removedPointIds).toEqual([]);
});

test("a read-back that fails is reported, not thrown: the rewind is committed", async () => {
  const log = console.error;
  console.error = () => {};
  try {
    const result = await undoLabelOp(SESSION, {
      requireAdmin: async () => ({ id: "admin" }),
      createAdminClient: () =>
        fakeDb({ data: { undone: "Edit", remaining: 0, points: ["p1"] } }).db,
      readPoints: async () => {
        throw new Error("Could not read label points");
      },
    });
    expect(result).toEqual({
      error: "Undone, but the rows could not be read. Reload.",
    });
  } finally {
    console.error = log;
  }
});

test("the function's own refusal is shown; any other failure is not", async () => {
  const run = (error: { code: string; message: string }) =>
    undoLabelOp(SESSION, {
      requireAdmin: async () => ({ id: "admin" }),
      createAdminClient: () => fakeDb({ error }).db,
      readPoints: async () => [],
    });
  const log = console.error;
  console.error = () => {};
  try {
    expect(
      await run({
        code: "P0001",
        message: "This session is not open for labelling.",
      }),
    ).toEqual({ error: "This session is not open for labelling." });
    expect(
      await run({ code: "42883", message: "function does not exist" }),
    ).toEqual({
      error: "Could not undo. Nothing was changed.",
    });
  } finally {
    console.error = log;
  }
});

test("an action's requests carry one op id and its name; outside one, nothing", async () => {
  expect(opHeaders()).toBeUndefined();
  const seen: (Record<string, string> | undefined)[] = [];
  await withLabelOp("Split point", async () => {
    seen.push(opHeaders());
    await Promise.resolve();
    seen.push(opHeaders());
  });
  expect(seen[0]).toEqual(seen[1]);
  expect(seen[0]?.["x-label-action"]).toBe("Split point");
  expect(seen[0]?.["x-label-op"]).toMatch(/^[0-9a-f-]{36}$/);
  // A second action is a second step.
  let other: string | undefined;
  await withLabelOp("Edit shot", async () => {
    other = opHeaders()?.["x-label-op"];
  });
  expect(other).not.toBe(seen[0]?.["x-label-op"]);
  expect(opHeaders()).toBeUndefined();
});

// ── error_kind round trip: patch, undo, redo ───────────────────────────────

const ERROR_POINT = "e0000000-0000-4000-8000-000000000001";

/**
 * One `label_points` row behind the three calls the console makes: the point
 * write (`writeLabelPointEdit`), `undo_label_op` and `redo_label_op`. The
 * journal is modelled on `label_row_history_capture`: every UPDATE keeps the
 * WHOLE old row (`to_jsonb(old)`), and the undo writes every column of it
 * back — so a column joins undo and redo without a migration, as long as the
 * row the console reads back carries it.
 */
function journaledPoint(initial: LabelPointRow) {
  let row: LabelPointRow & { updated_at: string; session_id: string } = {
    ...initial,
    session_id: SESSION,
    updated_at: "t0",
  };
  let tick = 0;
  const undo: (typeof row)[] = [];
  const redo: (typeof row)[] = [];
  const client = {
    rpc: async (fn: string) => {
      const [from, to] = fn === "undo_label_op" ? [undo, redo] : [redo, undo];
      const image = from.pop();
      if (!image) return { data: { points: [] }, error: null };
      to.push(row);
      row = image;
      return {
        data: { undone: "Edit", redone: "Edit", points: [row.id] },
        error: null,
      };
    },
    from(table: string) {
      let values: Record<string, unknown> | null = null;
      const filters: Record<string, unknown> = {};
      const answer = () => {
        if (table === "label_sessions") {
          return {
            data: { status: "labelling", marks_enabled: false },
            error: null,
          };
        }
        if (!values) return { data: row, error: null };
        if (filters.updated_at !== row.updated_at) {
          return { data: [], error: null };
        }
        undo.push(row);
        redo.length = 0;
        tick += 1;
        row = { ...row, ...values, updated_at: `t${tick}` };
        return { data: [{ id: row.id }], error: null };
      };
      const builder = {
        select: () => builder,
        update: (v: Record<string, unknown>) => {
          values = v;
          return builder;
        },
        eq: (column: string, value: unknown) => {
          filters[column] = value;
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
  } as unknown as AdminClient;
  const deps = {
    requireAdmin: async () => ({ id: "admin" }),
    createAdminClient: () => client,
    // The read-back maps through rows.ts, as `readLabelPointsByIds` does.
    readPoints: async () => [toLabelPoint(row)],
  };
  return { client, deps, current: () => row };
}

test("error_kind: forced, then unforced, then undo restores forced and redo re-applies unforced", async () => {
  const seeded = labelPoint(ERROR_POINT, 0, { ending: "error", endedBy: "p2" });
  const db = journaledPoint({
    id: ERROR_POINT,
    point_index: 0,
    vendor_rally_ids: [1001],
    set_number: 1,
    game_number: 1,
    server: "p1",
    serve_side: "deuce",
    winner: "p1",
    ending: "error",
    ended_by: "p2",
    error_kind: null,
    game_type: "game",
    status: "unchanged",
    status_before_delete: null,
    checked_at: null,
    note: null,
    dismissed: null,
    game_start_locked: false,
    seed: null,
  });
  let rows: LabelPoint[] = [{ ...seeded, winner: "p1" }];
  expect(rows[0].errorKind).toBeNull();

  // Each edit as the console makes it: the server write, then the patch on
  // the console's own row.
  for (const kind of ["forced", "unforced"] as const) {
    expect(
      await writeLabelPointEdit({
        supabase: db.client,
        pointId: ERROR_POINT,
        patch: { error_kind: kind },
      }),
    ).toEqual({ ok: true, status: "unchanged" });
    expect(db.current().error_kind).toBe(kind);
    rows = rows.map((p) => applyLabelPointPatch(p, { error_kind: kind }));
    expect(rows[0].errorKind).toBe(kind);
  }

  const undone = await undoLabelOp(SESSION, db.deps);
  if (!("ok" in undone)) throw new Error(undone.error);
  rows = applyUndoDiff(rows, undone.changed, undone.removedPointIds);
  expect(db.current().error_kind).toBe("forced");
  expect(rows[0].errorKind).toBe("forced");
  // Marking the kind never made the point edited, on either side.
  expect(rows[0].status).toBe("unchanged");

  const redone = await redoLabelOp(SESSION, db.deps);
  if (!("ok" in redone)) throw new Error(redone.error);
  rows = applyUndoDiff(rows, redone.changed, redone.removedPointIds);
  expect(db.current().error_kind).toBe("unforced");
  expect(rows[0].errorKind).toBe("unforced");

  // Two undos go back to unmarked: null is the baseline.
  for (const expected of ["forced", null]) {
    const back = await undoLabelOp(SESSION, db.deps);
    if (!("ok" in back)) throw new Error(back.error);
    rows = applyUndoDiff(rows, back.changed, back.removedPointIds);
    expect(rows[0].errorKind).toBe(expected);
  }
});

test("the point read-back carries error_kind, null when the column is unset", () => {
  const base = {
    id: ERROR_POINT,
    point_index: 0,
    vendor_rally_ids: null,
    set_number: 1,
    game_number: 1,
    server: "p1",
    serve_side: "deuce",
    winner: null,
    ending: "error",
    ended_by: "p2",
    game_type: "game",
    status: "unchanged",
    status_before_delete: null,
    checked_at: null,
    note: null,
    dismissed: null,
    game_start_locked: false,
  } satisfies Omit<LabelPointRow, "error_kind">;
  // The loader and the undo read-back both select it.
  expect(LABEL_POINT_COLUMNS.split(", ")).toContain("error_kind");
  expect(toLabelPoint(base).errorKind).toBeNull();
  expect(toLabelPoint({ ...base, error_kind: null }).errorKind).toBeNull();
  expect(toLabelPoint({ ...base, error_kind: "forced" }).errorKind).toBe(
    "forced",
  );
});
