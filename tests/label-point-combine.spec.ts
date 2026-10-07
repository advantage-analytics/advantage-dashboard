import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { AdminClient } from "@/lib/supabase/admin";
import {
  COMBINED_POINT_RESTORE_REFUSED,
  applyPointRestore,
  planPointRestore,
} from "@/lib/services/labels/operations";
import { writeLabelPointRestore } from "@/lib/services/labels/operations-session";
import {
  applyPointCombine,
  combineNeighbour,
  isCombinedTombstone,
  planPointCombine,
  settlePointCombine,
  withdrawPointCombine,
} from "@/lib/services/labels/point-combine";
import {
  combineLabelPoints,
  writeLabelPointCombine,
} from "@/lib/services/labels/point-combine-session";
import type { LabelPoint, LabelSession } from "@/lib/services/labels/session";
import { text } from "./fixtures/html-probe";
import {
  FIXTURE_POINT_IDS,
  labelSessionFixture,
  editContext as sharedEditContext,
  noop,
  ROW_OPERATIONS,
} from "./fixtures/label-session";
import { createLoader } from "./fixtures/vm-modules";

/**
 * Combine two neighbouring points of a game into one (`point-combine.ts`):
 * the earlier point keeps every shot and takes the later one's winner and
 * ending; the later becomes a tombstone with no shots, which reads
 * "Combined into the point above" and offers no Undo.
 *
 * The pure plan and the console's optimistic rows; the service over a fake
 * client, for the ORDER of its writes, their tables and what it refuses;
 * the restore service's refusal of the emptied tombstone; the ⋯ menu's two
 * rows; and both tombstone drawings, rendered offline through
 * `fixtures/vm-modules`.
 */

const MENU = "src/components/admin/labels/label-point-menu.tsx";
const BLACK_ROW = "src/components/admin/labels/label-black-point-row.tsx";
const CONSOLE = "src/components/admin/labels/label-console.tsx";

const { P1, P2, P3, P4 } = FIXTURE_POINT_IDS;
const NAMES = { p1: "Lee", p2: "Vargas" };

const points = () => labelSessionFixture().points;
const pointOf = (id: string) => points().find((p) => p.id === id)!;

/** The fixture after point 2 is combined into point 1, as the console does it. */
function combined(): LabelPoint[] {
  const plan = planPointCombine(points(), P2, "above");
  if ("error" in plan) throw new Error(plan.error);
  return applyPointCombine(points(), plan.write);
}

// ── The plan ───────────────────────────────────────────────────────────────

test.describe("combineNeighbour", () => {
  test("the nearest live point that way, in the same game — a tombstone is skipped, another game is not a neighbour", () => {
    expect(combineNeighbour(points(), P2, "above")?.id).toBe(P1);
    expect(combineNeighbour(points(), P1, "below")?.id).toBe(P2);
    expect(combineNeighbour(points(), P1, "above")).toBeNull();
    // Below point 2: the tombstone is skipped, and point 4 is game 2.
    expect(combineNeighbour(points(), P2, "below")).toBeNull();
    expect(combineNeighbour(points(), P4, "above")).toBeNull();
    expect(combineNeighbour(points(), P4, "below")).toBeNull();
    expect(combineNeighbour(points(), P3, "above")).toBeNull();
    expect(combineNeighbour(points(), "nope", "above")).toBeNull();
  });
});

test.describe("planPointCombine", () => {
  test("the earlier point is kept and takes the later's winner, ending, ended by and rallies; the later's shots move; the later is a tombstone", () => {
    const expected = {
      keptId: P1,
      removedId: P2,
      movedShotIds: ["s-ace"],
      kept: {
        winner: "p1",
        ending: "ace",
        ended_by: "p1",
        vendor_rally_ids: [1001, 1002],
        status: "edited",
      },
      removed: { status: "deleted", status_before_delete: "unchanged" },
    };
    // From either side, the same plan.
    expect(planPointCombine(points(), P2, "above")).toEqual({
      ok: true,
      write: expected,
    });
    expect(planPointCombine(points(), P1, "below")).toEqual({
      ok: true,
      write: expected,
    });
  });

  test("an unchanged earlier point becomes edited; an added one stays added; shared rallies are not doubled", () => {
    const unchanged = points().map((p) =>
      p.id === P1 ? { ...p, status: "unchanged" as const } : p,
    );
    expect(planPointCombine(unchanged, P2, "above")).toMatchObject({
      ok: true,
      write: { kept: { status: "edited" } },
    });
    const added = points().map((p) =>
      p.id === P1
        ? { ...p, status: "added" as const, vendorRallyIds: [1002] }
        : p,
    );
    expect(planPointCombine(added, P2, "above")).toMatchObject({
      ok: true,
      write: { kept: { status: "added", vendor_rally_ids: [1002] } },
    });
  });

  test("refused: a missing or deleted point, and no live neighbour of the same game that way", () => {
    expect(planPointCombine(points(), "nope", "above")).toEqual({
      error: "The point to combine is not a point of this session.",
    });
    expect(planPointCombine(points(), P3, "above")).toEqual({
      error: "Restore this point before combining it.",
    });
    expect(planPointCombine(points(), P1, "above")).toEqual({
      error: "There is no point of this game above it to combine with.",
    });
    expect(planPointCombine(points(), P2, "below")).toEqual({
      error: "There is no point of this game below it to combine with.",
    });
    expect(planPointCombine(points(), P4, "above")).toMatchObject({
      error: expect.stringContaining("above"),
    });
  });
});

// ── The console's rows ─────────────────────────────────────────────────────

test.describe("the console's rows", () => {
  test("applyPointCombine merges the shots in video order, moves the fields, empties the later row; withdrawPointCombine puts both back", () => {
    const before = points();
    const after = combined();
    expect(after.map((p) => [p.id, p.pointIndex, p.status])).toEqual([
      [P1, 0, "edited"],
      [P2, 1, "deleted"],
      [P3, 2, "deleted"],
      [P4, 3, "unchanged"],
    ]);
    const kept = after[0];
    expect(kept.shots.map((s) => s.id)).toEqual([
      "s-serve",
      "s-return",
      "s-phantom",
      "s-added",
      "s-ace",
    ]);
    expect(kept.shots.every((s) => s.labelPointId === P1)).toBe(true);
    // Statuses travel untouched; the moved ace is still kept.
    expect(kept.shots.at(-1)?.status).toBe("kept");
    expect(kept).toMatchObject({
      winner: "p1",
      ending: "ace",
      endedBy: "p1",
      vendorRallyIds: [1001, 1002],
    });
    const gone = after[1];
    expect(gone).toMatchObject({
      status: "deleted",
      statusBeforeDelete: "unchanged",
      shots: [],
      // Its own fields stay on the row.
      winner: "p1",
      ending: "ace",
      vendorRallyIds: [1002],
    });
    expect(isCombinedTombstone(gone)).toBe(true);
    // The fixture's ordinary tombstone owns a shot row: not a combine's.
    expect(isCombinedTombstone(pointOf(P3))).toBe(false);
    expect(isCombinedTombstone(kept)).toBe(false);

    expect(withdrawPointCombine(after, before[0], before[1])).toEqual(before);
  });

  test("settlePointCombine confirms both rows as written", () => {
    const after = combined();
    const settled = settlePointCombine(after, {
      kept: {
        id: P1,
        winner: "p1",
        ending: "ace",
        ended_by: "p1",
        vendor_rally_ids: [1001, 1002],
        status: "edited",
      },
      removed: { id: P2, status: "deleted", status_before_delete: "unchanged" },
    });
    expect(settled).toEqual(after);
  });

  test("the emptied tombstone cannot be restored: the plan refuses, the row is left alone", () => {
    const gone = combined()[1];
    expect(
      planPointRestore({
        status: "deleted",
        status_before_delete: "unchanged",
        shot_count: 0,
      }),
    ).toEqual({ error: COMBINED_POINT_RESTORE_REFUSED });
    expect(COMBINED_POINT_RESTORE_REFUSED).toContain(
      "combined into the point above",
    );
    expect(COMBINED_POINT_RESTORE_REFUSED).toContain("Split that point");
    // Without a count the plan cannot tell, and restores as before.
    expect(
      planPointRestore({
        status: "deleted",
        status_before_delete: "unchanged",
      }),
    ).toEqual({
      ok: true,
      write: { status: "unchanged", status_before_delete: null },
    });
    expect(
      planPointRestore({
        status: "deleted",
        status_before_delete: "edited",
        shot_count: 3,
      }),
    ).toMatchObject({ ok: true });
    expect(applyPointRestore(gone)).toBe(gone);
    expect(applyPointRestore(pointOf(P3)).status).toBe("unchanged");
  });
});

// ── The service ────────────────────────────────────────────────────────────

const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const UUID = (n: number) => `aaaaaaaa-aaaa-4aaa-8aaa-00000000000${n}`;
const SHOT = (n: number) => `bbbbbbbb-bbbb-4bbb-8bbb-00000000000${n}`;

interface Call {
  table: string;
  op: "select" | "update" | "insert";
  values?: Record<string, unknown>;
  filters: Record<string, unknown>;
  in?: Record<string, unknown[]>;
}

const POINT_ROWS = points().map((p, i) => ({
  id: UUID(i + 1),
  point_index: p.pointIndex,
  status: p.status,
  set_number: p.setNumber,
  game_number: p.gameNumber,
  winner: p.winner,
  ending: p.ending,
  ended_by: p.endedBy,
  vendor_rally_ids: p.vendorRallyIds,
}));

function fakeClient(rows: {
  session?: Record<string, unknown> | null;
  point?: Record<string, unknown> | null;
  points?: Record<string, unknown>[];
  shots?: Record<string, unknown>[];
  /** The compare-and-set matched nothing — another tab got there first. */
  raced?: boolean;
}) {
  const calls: Call[] = [];
  const client = {
    from(table: string) {
      const call: Call = { table, op: "select", filters: {} };
      calls.push(call);
      const answer = () => {
        if (call.op === "update") {
          return {
            data: rows.raced && "status" in call.filters ? [] : [{ id: 1 }],
            error: null,
          };
        }
        if (table === "label_sessions") {
          return {
            data:
              rows.session === undefined
                ? { status: "labelling", marks_enabled: true }
                : rows.session,
            error: null,
          };
        }
        if (table === "label_points") {
          return "session_id" in call.filters
            ? { data: rows.points ?? POINT_ROWS, error: null }
            : {
                data:
                  rows.point === undefined
                    ? {
                        id: call.filters.id,
                        session_id: SESSION_ID,
                        status: "deleted",
                        status_before_delete: "unchanged",
                        server: "p1",
                        set_number: 1,
                        game_number: 1,
                        serve_side: null,
                        winner: null,
                        ending: null,
                        ended_by: null,
                        seed: null,
                      }
                    : rows.point,
                error: null,
              };
        }
        if (table === "label_shots") {
          return {
            data: rows.shots ?? [{ id: SHOT(1) }],
            error: null,
          };
        }
        return { data: null, error: { message: `unexpected ${table}` } };
      };
      const builder = {
        select: () => builder,
        order: () => builder,
        returns: () => builder,
        update: (values: Record<string, unknown>) => {
          call.op = "update";
          call.values = values;
          return builder;
        },
        eq: (column: string, value: unknown) => {
          call.filters[column] = value;
          return builder;
        },
        in: (column: string, values: unknown[]) => {
          (call.in ??= {})[column] = values;
          return builder;
        },
        maybeSingle: async () => answer(),
        single: async () => answer(),
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

const writes = (fake: ReturnType<typeof fakeClient>) =>
  fake.calls.filter((c) => c.op !== "select");

test.describe("writeLabelPointCombine", () => {
  test("the gate, the reads, then ONE move of the shots, ONE write of the kept point and ONE compare-and-set tombstone — label_points and label_shots only", async () => {
    const fake = fakeClient({});
    const result = await writeLabelPointCombine({
      supabase: fake.supabase,
      pointId: UUID(2),
      direction: "above",
    });
    expect(result).toEqual({
      ok: true,
      kept: {
        id: UUID(1),
        winner: "p1",
        ending: "ace",
        ended_by: "p1",
        vendor_rally_ids: [1001, 1002],
        status: "edited",
      },
      removed: {
        id: UUID(2),
        status: "deleted",
        status_before_delete: "unchanged",
      },
    });
    expect(fake.calls.map((c) => [c.table, c.op])).toEqual([
      ["label_points", "select"],
      ["label_sessions", "select"],
      ["label_points", "select"],
      ["label_shots", "select"],
      ["label_shots", "update"],
      ["label_points", "update"],
      ["label_points", "update"],
    ]);
    // The later point's shots are the ones read.
    expect(fake.calls[3].filters).toEqual({ label_point_id: UUID(2) });
    const [move, kept, removed] = writes(fake);
    expect(move).toEqual({
      table: "label_shots",
      op: "update",
      values: { label_point_id: UUID(1) },
      filters: {},
      in: { id: [SHOT(1)] },
    });
    expect(kept).toEqual({
      table: "label_points",
      op: "update",
      values: {
        winner: "p1",
        ending: "ace",
        ended_by: "p1",
        vendor_rally_ids: [1001, 1002],
        status: "edited",
      },
      filters: { id: UUID(1) },
    });
    // The ordinary delete rule, compare-and-set on the status read.
    expect(removed).toEqual({
      table: "label_points",
      op: "update",
      values: { status: "deleted", status_before_delete: "unchanged" },
      filters: { id: UUID(2), status: "unchanged" },
    });
    for (const call of fake.calls) {
      expect(call.table).toMatch(/^label_(points|shots|sessions)$/);
      expect(["select", "update"]).toContain(call.op);
    }
  });

  test("with no shot row on the later point there is no shots update; a race on the tombstone is reported", async () => {
    const none = fakeClient({ shots: [] });
    expect(
      await writeLabelPointCombine({
        supabase: none.supabase,
        pointId: UUID(1),
        direction: "below",
      }),
    ).toMatchObject({ ok: true });
    expect(writes(none).map((w) => w.table)).toEqual([
      "label_points",
      "label_points",
    ]);
    const raced = fakeClient({ raced: true });
    expect(
      await writeLabelPointCombine({
        supabase: raced.supabase,
        pointId: UUID(2),
        direction: "above",
      }),
    ).toEqual({ error: "This row changed in another tab. Reload to see it." });
  });

  test("refused before anything is written: a bad id or direction, a missing point, a complete session, no neighbour", async () => {
    const bad = fakeClient({});
    expect(
      await writeLabelPointCombine({
        supabase: bad.supabase,
        pointId: "nope",
        direction: "above",
      }),
    ).toEqual({ error: "Invalid point id." });
    expect(
      await writeLabelPointCombine({
        supabase: bad.supabase,
        pointId: UUID(2),
        direction: "sideways",
      }),
    ).toEqual({
      error: "Say whether to combine with the point above or below.",
    });
    expect(bad.calls).toEqual([]);

    const missing = fakeClient({ point: null });
    expect(
      await writeLabelPointCombine({
        supabase: missing.supabase,
        pointId: UUID(2),
        direction: "above",
      }),
    ).toEqual({ error: "Point not found." });

    const complete = fakeClient({ session: { status: "complete" } });
    const frozen = await writeLabelPointCombine({
      supabase: complete.supabase,
      pointId: UUID(2),
      direction: "above",
    });
    expect("error" in frozen).toBe(true);
    expect(writes(complete)).toEqual([]);

    const lonely = fakeClient({});
    expect(
      await writeLabelPointCombine({
        supabase: lonely.supabase,
        pointId: UUID(2),
        direction: "below",
      }),
    ).toEqual({
      error: "There is no point of this game below it to combine with.",
    });
    expect(writes(lonely)).toEqual([]);
  });

  test("the entry point refuses without an admin, before a client is built", async () => {
    let built = 0;
    const result = await combineLabelPoints(UUID(2), "above", {
      requireAdmin: async () => null,
      createAdminClient: () => {
        built += 1;
        return fakeClient({}).supabase;
      },
    });
    expect("error" in result).toBe(true);
    expect(built).toBe(0);
  });
});

test.describe("writeLabelPointRestore on the emptied tombstone", () => {
  test("reads the point's shot rows and refuses when there are none, writing nothing", async () => {
    const empty = fakeClient({ shots: [] });
    expect(
      await writeLabelPointRestore({
        supabase: empty.supabase,
        pointId: UUID(2),
      }),
    ).toEqual({ error: COMBINED_POINT_RESTORE_REFUSED });
    expect(writes(empty)).toEqual([]);
    expect(empty.calls.map((c) => [c.table, c.op])).toEqual([
      ["label_points", "select"],
      ["label_sessions", "select"],
      ["label_shots", "select"],
    ]);
    expect(empty.calls[2].filters).toEqual({ label_point_id: UUID(2) });
    // With a shot row of its own, an ordinary tombstone restores.
    const ordinary = fakeClient({});
    expect(
      await writeLabelPointRestore({
        supabase: ordinary.supabase,
        pointId: UUID(3),
      }),
    ).toEqual({ ok: true, status: "unchanged" });
    expect(writes(ordinary)).toHaveLength(1);
  });
});

// ── The menu ───────────────────────────────────────────────────────────────

const OPERATIONS = {
  ...ROW_OPERATIONS,
  onInsertPoint: noop,
  onShiftGameOverflow: noop,
  onSplitPoint: noop,
  onCombinePoints: noop,
};

const editContext = (
  session: LabelSession,
  rows: readonly LabelPoint[],
  overrides: Record<string, unknown> = {},
  editable = true,
) =>
  sharedEditContext(
    { editable, operations: editable ? OPERATIONS : undefined, ...overrides },
    { points: rows, adScoring: session.adScoring },
  );

type MenuActions = {
  combineAbove: { description: string; run: () => void } | null;
  combineBelow: { description: string; run: () => void } | null;
};

function menuActions(
  point: LabelPoint,
  rows: readonly LabelPoint[],
  operations: Record<string, unknown> = OPERATIONS,
): MenuActions {
  const { pointMenuActions } = createLoader().load(MENU) as {
    pointMenuActions: (
      point: LabelPoint,
      context: Record<string, unknown>,
      operations: Record<string, unknown>,
    ) => MenuActions;
  };
  return pointMenuActions(
    point,
    { points: rows, names: NAMES, adScoring: true },
    operations,
  );
}

test.describe("the ⋯ menu", () => {
  test("Combine with point above / below: only towards a live neighbour of the same game, each naming the two numbers", () => {
    const two = menuActions(pointOf(P2), points());
    expect(two.combineAbove?.description).toBe("Point 2's shots join point 1");
    expect(two.combineBelow).toBeNull();
    const one = menuActions(pointOf(P1), points());
    expect(one.combineAbove).toBeNull();
    expect(one.combineBelow?.description).toBe("Point 2's shots join point 1");
    const four = menuActions(pointOf(P4), points());
    expect(four.combineAbove).toBeNull();
    expect(four.combineBelow).toBeNull();
  });

  test("each row is the console's request, made on a pick alone", () => {
    const asked: unknown[][] = [];
    const operations = {
      ...OPERATIONS,
      onCombinePoints: (...args: unknown[]) => asked.push(args),
    };
    menuActions(pointOf(P2), points(), operations).combineAbove?.run();
    menuActions(pointOf(P1), points(), operations).combineBelow?.run();
    expect(asked).toEqual([
      [P2, "above"],
      [P1, "below"],
    ]);
    // Building the rows asks nothing.
    const quiet: unknown[][] = [];
    menuActions(pointOf(P2), points(), {
      ...OPERATIONS,
      onCombinePoints: (...args: unknown[]) => quiet.push(args),
    });
    expect(quiet).toEqual([]);
  });
});

// ── The tombstone ──────────────────────────────────────────────────────────

test.describe("the combined tombstone", () => {
  test("black rail: 'Combined into the point above' on the dark line, no Undo; the ordinary tombstone keeps its Undo", () => {
    const { BlackDeletedPoint } = createLoader().load(BLACK_ROW) as {
      BlackDeletedPoint: React.ComponentType<Record<string, unknown>>;
    };
    const session = labelSessionFixture();
    const rows = combined();
    const gone = renderToStaticMarkup(
      React.createElement(BlackDeletedPoint, {
        point: rows[1],
        edit: editContext(session, rows),
      }),
    );
    expect(gone).toContain('data-row="deleted-point"');
    expect(gone).toContain('data-combined=""');
    expect(text(gone)).toBe("– Combined into the point above");
    expect(gone).not.toContain("data-undo-delete");
    expect(gone).not.toContain("Undo");
    const ordinary = renderToStaticMarkup(
      React.createElement(BlackDeletedPoint, {
        point: rows[2],
        edit: editContext(session, rows),
      }),
    );
    expect(ordinary).not.toContain("data-combined");
    expect(text(ordinary)).toBe("– Deleted point Undo");
    expect(ordinary).toContain('aria-label="Undo delete point 3"');
  });

  test("the marks' join reads every rally id a point carries, so a combined point takes both rallies' marks", () => {
    const marks = readFileSync("src/lib/services/labels/marks.ts", "utf8");
    expect(marks).toMatch(/for \(const rallyId of point\.vendorRallyIds\)/);
    // The first point in index order wins a rally: the kept (earlier) point.
    expect(marks).toMatch(
      /if \(!pointIdByRally\.has\(rallyId\)\) pointIdByRally\.set\(rallyId, point\.id\)/,
    );
  });
});

// ── The console's wiring ───────────────────────────────────────────────────

test("a render of the console with a combined point writes nothing and draws the line in both views", () => {
  const called: string[] = [];
  const operations = Object.fromEntries(
    ["combinePoints", "splitPoint", "restorePoint", "deletePoint"].map(
      (name) => [
        name,
        async () => {
          called.push(name);
          return { error: "not in a render" };
        },
      ],
    ),
  );
  const { LabelConsole } = createLoader().load(CONSOLE) as {
    LabelConsole: React.ComponentType<Record<string, unknown>>;
  };
  const session = { ...labelSessionFixture(), points: combined() };
  const saves = {
    onSaveShot: async () => ({ ok: true, status: "edited" }),
    onSavePoint: async () => ({ ok: true, status: "edited" }),
  };
  const black = renderToStaticMarkup(
    React.createElement(LabelConsole, {
      session,
      video: null,
      marks: null,
      initialLayoutMode: "black",
      initialExpandedPointId: P1,
      operations,
      ...saves,
    }),
  );
  expect(called).toEqual([]);
  expect(black.match(/data-combined=""/g)).toHaveLength(1);
  expect(black).toContain("Combined into the point above");
  expect(black).toContain('aria-label="Undo delete point 3"');
  expect(black).not.toContain('aria-label="Undo delete point 2"');
  // The kept point's well holds the moved ace as its fifth stroke.
  expect(black).toContain('aria-label="Shot 4 stroke: First serve"');
  const light = renderToStaticMarkup(
    React.createElement(LabelConsole, {
      session,
      video: null,
      marks: null,
      initialExpandedPointId: P1,
      operations,
      ...saves,
    }),
  );
  expect(light).toContain("Combined into the point above");
  expect(light).not.toContain('aria-label="Undo delete point 2"');
});
