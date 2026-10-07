import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { AdminClient } from "@/lib/supabase/admin";
import {
  applyPointSplit,
  canSplitAtShot,
  draftSplitPoint,
  planPointSplit,
  settlePointSplit,
  sharesVendorRally,
  withdrawPointSplit,
  type SplittablePoint,
} from "@/lib/services/labels/point-split";
import {
  splitLabelPoint,
  writeLabelPointSplit,
} from "@/lib/services/labels/point-split-session";
import type { LabelPoint, LabelSession } from "@/lib/services/labels/session";
import { tag } from "./fixtures/html-probe";
import {
  FIXTURE_POINT_IDS,
  labelSessionFixture,
  editContext as sharedEditContext,
  noop,
  ROW_OPERATIONS,
} from "./fixtures/label-session";
import { findByProp } from "./fixtures/react-tree";
import { createLoader } from "./fixtures/vm-modules";

/**
 * Split a point at one of its shots: the vendor ran two real points into one
 * rally, so "Split point here" on a shot moves it and every shot after it
 * (tombstones included) into a new point right below the anchor
 * (`point-split.ts`).
 *
 * The pure plan and the console's optimistic rows; the service over a fake
 * client, for the ORDER of its writes, their tables and what it refuses; the
 * black well's Split action, rendered offline through
 * `fixtures/vm-modules`; and the console's wiring, read off its source.
 */

const WELL = "src/components/admin/labels/label-black-shot-row.tsx";
const MENU = "src/components/admin/labels/label-point-menu.tsx";
const CONSOLE = "src/components/admin/labels/label-console.tsx";

const { P1, P2, P3, P4 } = FIXTURE_POINT_IDS;
const NAMES = { p1: "Lee", p2: "Vargas" };
const NEW_ID = "p-split";

const points = () => labelSessionFixture().points;
const pointOf = (id: string) => points().find((p) => p.id === id)!;

/** Point 1's shots in video order: the serve, the return, a tombstone, an added stroke. */
const ORDER = ["s-serve", "s-return", "s-phantom", "s-added"];

// ── The plan ───────────────────────────────────────────────────────────────

test.describe("planPointSplit", () => {
  test("the shot and every shot after it — the tombstone included — move to a new point right below; the later points move up one, highest first", () => {
    const plan = planPointSplit(points(), P1, "s-return");
    if ("error" in plan) throw new Error(plan.error);
    expect(plan.write.movedShotIds).toEqual([
      "s-return",
      "s-phantom",
      "s-added",
    ]);
    expect(plan.write.insert).toEqual({
      point_index: 1,
      set_number: 1,
      game_number: 1,
      server: "p1",
      game_type: "game",
      status: "added",
      // The console's rows carry no rally per shot: nothing is known.
      vendor_rally_ids: [],
    });
    expect(plan.write.shifts).toEqual([
      { id: P4, point_index: 4 },
      { id: P3, point_index: 3 },
      { id: P2, point_index: 2 },
    ]);
    // Point 1 is already edited; it stays so, and keeps its rally.
    expect(plan.write.anchor).toEqual({
      status: "edited",
      vendor_rally_ids: [1001],
    });
    expect(ORDER.indexOf("s-return")).toBe(1);
  });

  test("an unchanged anchor becomes edited; an added one stays added", () => {
    const unchanged = points().map((p) =>
      p.id === P1 ? { ...p, status: "unchanged" as const } : p,
    );
    const a = planPointSplit(unchanged, P1, "s-return");
    expect(a).toMatchObject({
      ok: true,
      write: { anchor: { status: "edited" } },
    });
    const added = points().map((p) =>
      p.id === P1 ? { ...p, status: "added" as const } : p,
    );
    const b = planPointSplit(added, P1, "s-return");
    expect(b).toMatchObject({
      ok: true,
      write: { anchor: { status: "added" } },
    });
  });

  test("rally ids follow the moved vendor shots, and leave the anchor only when no shot of that rally stays", () => {
    const withRallies = (serve: number, rest: number): SplittablePoint[] =>
      points().map((p) =>
        p.id === P1
          ? {
              ...p,
              vendorRallyIds: [serve, rest],
              shots: p.shots.map((s) => ({
                ...s,
                vendorRallyId:
                  s.id === "s-added" ? null : s.id === "s-serve" ? serve : rest,
              })),
            }
          : p,
      );
    // Two rallies: the serve's stays, the rest's goes with the moved shots.
    const two = planPointSplit(withRallies(7, 8), P1, "s-return");
    if ("error" in two) throw new Error(two.error);
    expect(two.write.insert.vendor_rally_ids).toEqual([8]);
    expect(two.write.anchor.vendor_rally_ids).toEqual([7]);
    // One rally over the whole point — the merged-points case: both halves
    // keep it, since the serve stays behind.
    const one = planPointSplit(withRallies(9, 9), P1, "s-return");
    if ("error" in one) throw new Error(one.error);
    expect(one.write.insert.vendor_rally_ids).toEqual([9]);
    expect(one.write.anchor.vendor_rally_ids).toEqual([9, 9]);
    // Splitting at the tombstone: the deleted shot is refused as the cut,
    // but the added stroke after it is a live cut whose rally is unknown.
    const atAdded = planPointSplit(withRallies(7, 8), P1, "s-added");
    if ("error" in atAdded) throw new Error(atAdded.error);
    expect(atAdded.write.movedShotIds).toEqual(["s-added"]);
    expect(atAdded.write.insert.vendor_rally_ids).toEqual([]);
    expect(atAdded.write.anchor.vendor_rally_ids).toEqual([7, 8]);
  });

  test("refused: a missing or deleted anchor, a shot of another point, a deleted shot, and the point's first live shot", () => {
    expect(planPointSplit(points(), "nope", "s-return")).toEqual({
      error: "The point to split is not a point of this session.",
    });
    expect(planPointSplit(points(), P3, "s-let")).toEqual({
      error: "Restore this point before splitting it.",
    });
    expect(planPointSplit(points(), P1, "s-ace")).toEqual({
      error: "The shot to split at is not a shot of this point.",
    });
    expect(planPointSplit(points(), P1, "s-phantom")).toEqual({
      error: "Restore this shot before splitting the point at it.",
    });
    expect(planPointSplit(points(), P1, "s-serve")).toEqual({
      error:
        "This is the point's first shot: splitting here would leave nothing behind.",
    });
    // A lone shot cannot be split at.
    expect(planPointSplit(points(), P2, "s-ace")).toMatchObject({
      error: expect.stringContaining("first shot"),
    });
  });

  test("canSplitAtShot mirrors the plan, and sharesVendorRally reads the trace a split leaves", () => {
    const p1 = pointOf(P1);
    expect(canSplitAtShot(p1, "s-serve")).toBe(false);
    expect(canSplitAtShot(p1, "s-return")).toBe(true);
    expect(canSplitAtShot(p1, "s-phantom")).toBe(false);
    expect(canSplitAtShot(p1, "s-added")).toBe(true);
    expect(canSplitAtShot(p1, "s-ace")).toBe(false);
    expect(canSplitAtShot(pointOf(P3), "s-let")).toBe(false);
    // The fixture's points each have a rally of their own.
    expect(sharesVendorRally(p1, points())).toBe(false);
    // After a split both halves carry the rally: a tombstone does not count.
    const shared = [
      ...points(),
      { id: "half", status: "added" as const, vendorRallyIds: [1001] },
    ];
    expect(sharesVendorRally(p1, shared)).toBe(true);
    expect(
      sharesVendorRally(p1, [
        ...points(),
        { id: "gone", status: "deleted" as const, vendorRallyIds: [1001] },
      ]),
    ).toBe(false);
    expect(sharesVendorRally({ id: "x", vendorRallyIds: [] }, shared)).toBe(
      false,
    );
  });
});

// ── The console's rows ─────────────────────────────────────────────────────

test.describe("the console's rows", () => {
  test("applyPointSplit moves the shots into a draft right below, renumbers, and withdrawPointSplit puts it all back", () => {
    const before = points();
    const plan = planPointSplit(before, P1, "s-return");
    if ("error" in plan) throw new Error(plan.error);
    const draft = draftSplitPoint(plan.write.insert, NEW_ID);
    expect(draft).toMatchObject({
      id: NEW_ID,
      pointIndex: 1,
      status: "added",
      winner: null,
      ending: null,
      endedBy: null,
      seed: null,
      shots: [],
    });
    const after = applyPointSplit(before, P1, draft, plan.write);
    expect(after.map((p) => [p.id, p.pointIndex])).toEqual([
      [P1, 0],
      [NEW_ID, 1],
      [P2, 2],
      [P3, 3],
      [P4, 4],
    ]);
    const anchor = after[0];
    expect(anchor.shots.map((s) => s.id)).toEqual(["s-serve"]);
    expect(anchor.status).toBe("edited");
    const split = after[1];
    expect(split.shots.map((s) => s.id)).toEqual([
      "s-return",
      "s-phantom",
      "s-added",
    ]);
    expect(split.shots.every((s) => s.labelPointId === NEW_ID)).toBe(true);
    // Statuses travel untouched.
    expect(split.shots.map((s) => s.status)).toEqual([
      "edited",
      "deleted",
      "added",
    ]);
    // The anchor alone, as `syncEnding` hands it: still at index 0.
    expect(applyPointSplit([before[0]], P1, draft, plan.write)[0].id).toBe(P1);

    expect(withdrawPointSplit(after, before[0], NEW_ID)).toEqual(before);
    expect(withdrawPointSplit(before, before[0], NEW_ID)).toEqual(before);
  });

  test("settlePointSplit swaps the draft for the saved row — on every moved shot too — and confirms the anchor", () => {
    const before = points();
    const plan = planPointSplit(before, P1, "s-return");
    if ("error" in plan) throw new Error(plan.error);
    const draft = draftSplitPoint(plan.write.insert, NEW_ID);
    const pending = applyPointSplit(before, P1, draft, plan.write);
    const saved = {
      ...draftSplitPoint(
        { ...plan.write.insert, vendor_rally_ids: [1001] },
        "real",
      ),
    };
    const settled = settlePointSplit(pending, NEW_ID, {
      point: saved,
      anchor: { id: P1, status: "edited", vendor_rally_ids: [1001] },
    });
    const row = settled.find((p) => p.id === "real")!;
    expect(row.pointIndex).toBe(1);
    expect(row.vendorRallyIds).toEqual([1001]);
    expect(row.shots.map((s) => s.id)).toEqual([
      "s-return",
      "s-phantom",
      "s-added",
    ]);
    expect(row.shots.every((s) => s.labelPointId === "real")).toBe(true);
    expect(settled.some((p) => p.id === NEW_ID)).toBe(false);
  });
});

// ── The service ────────────────────────────────────────────────────────────

const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const UUID = (n: number) => `aaaaaaaa-aaaa-4aaa-8aaa-00000000000${n}`;
const SHOT = (n: number) => `bbbbbbbb-bbbb-4bbb-8bbb-00000000000${n}`;
const NEW_ROW_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

interface Call {
  table: string;
  op: "select" | "update" | "insert";
  columns?: string;
  values?: Record<string, unknown>;
  filters: Record<string, unknown>;
  in?: Record<string, unknown[]>;
}

const POINT_ROWS = points().map((p, i) => ({
  id: UUID(i + 1),
  session_id: SESSION_ID,
  point_index: p.pointIndex,
  status: p.status,
  set_number: p.setNumber,
  game_number: p.gameNumber,
  server: p.server,
  game_type: p.gameType,
  vendor_rally_ids: p.vendorRallyIds,
}));

/** Point 1's shots as the writer reads them: `rally` is the JSON text path. */
const SHOT_ROWS = [
  {
    id: SHOT(1),
    video_time: 2472.0,
    event_id: 101,
    status: "kept",
    rally: "1001",
  },
  {
    id: SHOT(2),
    video_time: 2473.1,
    event_id: 102,
    status: "edited",
    rally: "1001",
  },
  {
    id: SHOT(3),
    video_time: 2473.6,
    event_id: 103,
    status: "deleted",
    rally: "1001",
  },
  {
    id: SHOT(4),
    video_time: 2474.4,
    event_id: null,
    status: "added",
    rally: null,
  },
];

function fakeClient(rows: {
  session?: Record<string, unknown> | null;
  anchor?: Record<string, unknown> | null;
  points?: Record<string, unknown>[];
  shots?: Record<string, unknown>[];
}) {
  const calls: Call[] = [];
  const client = {
    from(table: string) {
      const call: Call = { table, op: "select", filters: {} };
      calls.push(call);
      const answer = () => {
        if (call.op === "update") {
          return { data: [{ id: call.filters.id }], error: null };
        }
        if (call.op === "insert") {
          return {
            data: {
              id: NEW_ROW_ID,
              ...call.values,
              status_before_delete: null,
              note: null,
              dismissed: [],
            },
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
                  rows.anchor === undefined
                    ? { id: call.filters.id, session_id: SESSION_ID }
                    : rows.anchor,
                error: null,
              };
        }
        if (table === "label_shots") {
          return { data: rows.shots ?? SHOT_ROWS, error: null };
        }
        return { data: null, error: { message: `unexpected ${table}` } };
      };
      const builder = {
        select: (columns?: string) => {
          call.columns = columns;
          return builder;
        },
        order: () => builder,
        returns: () => builder,
        update: (values: Record<string, unknown>) => {
          call.op = "update";
          call.values = values;
          return builder;
        },
        insert: (values: Record<string, unknown>) => {
          call.op = "insert";
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

test.describe("writeLabelPointSplit", () => {
  test("the gate, the reads, then the shifts highest first, ONE insert, ONE move of the shots and ONE anchor update — label_points and label_shots only", async () => {
    const fake = fakeClient({});
    const result = await writeLabelPointSplit({
      supabase: fake.supabase,
      pointId: UUID(1),
      shotId: SHOT(2),
    });
    expect(result).toMatchObject({
      ok: true,
      point: {
        id: NEW_ROW_ID,
        pointIndex: 1,
        setNumber: 1,
        gameNumber: 1,
        server: "p1",
        gameType: "game",
        status: "added",
        // The frozen vendor strokes' rally, read off `vendor->>pred_rally_id`.
        vendorRallyIds: [1001],
        winner: null,
        ending: null,
        endedBy: null,
        seed: null,
        shots: [],
      },
      // The serve stays, so the anchor keeps the rally too.
      anchor: { id: UUID(1), status: "edited", vendor_rally_ids: [1001] },
    });
    expect(fake.calls.map((c) => [c.table, c.op])).toEqual([
      ["label_points", "select"],
      ["label_sessions", "select"],
      ["label_points", "select"],
      ["label_shots", "select"],
      ["label_points", "update"],
      ["label_points", "update"],
      ["label_points", "update"],
      ["label_points", "insert"],
      ["label_shots", "update"],
      ["label_points", "update"],
    ]);
    expect(fake.calls[3].columns).toContain("rally:vendor->>pred_rally_id");
    expect(fake.calls[3].filters).toEqual({ label_point_id: UUID(1) });
    const [s4, s3, s2, insert, move, anchor] = writes(fake);
    expect([s4, s3, s2].map((w) => [w.filters.id, w.values])).toEqual([
      [UUID(4), { point_index: 4 }],
      [UUID(3), { point_index: 3 }],
      [UUID(2), { point_index: 2 }],
    ]);
    expect(insert.values).toEqual({
      session_id: SESSION_ID,
      point_index: 1,
      set_number: 1,
      game_number: 1,
      server: "p1",
      game_type: "game",
      status: "added",
      vendor_rally_ids: [1001],
      serve_side: null,
      winner: null,
      ending: null,
      ended_by: null,
      seed: null,
      checked_at: null,
    });
    // The shots: one update, by id list, the new point's id — nothing else.
    expect(move).toEqual({
      table: "label_shots",
      op: "update",
      values: { label_point_id: NEW_ROW_ID },
      filters: {},
      in: { id: [SHOT(2), SHOT(3), SHOT(4)] },
    });
    expect(anchor).toEqual({
      table: "label_points",
      op: "update",
      values: { status: "edited", vendor_rally_ids: [1001] },
      filters: { id: UUID(1) },
    });
    for (const call of fake.calls) {
      expect(call.table).toMatch(/^label_(points|shots|sessions)$/);
      expect(["select", "update", "insert"]).toContain(call.op);
    }
  });

  test("a session labelled without marks takes a split — a manual edit", async () => {
    const fake = fakeClient({
      session: { status: "labelling", marks_enabled: false },
    });
    expect(
      await writeLabelPointSplit({
        supabase: fake.supabase,
        pointId: UUID(1),
        shotId: SHOT(2),
      }),
    ).toMatchObject({ ok: true });
  });

  test("refused before anything is written: bad ids, a missing point, a complete session, the first shot", async () => {
    const bad = fakeClient({});
    expect(
      await writeLabelPointSplit({
        supabase: bad.supabase,
        pointId: "nope",
        shotId: SHOT(2),
      }),
    ).toEqual({ error: "Invalid point id." });
    expect(
      await writeLabelPointSplit({
        supabase: bad.supabase,
        pointId: UUID(1),
        shotId: "nope",
      }),
    ).toEqual({ error: "Invalid shot id." });
    expect(bad.calls).toEqual([]);

    const missing = fakeClient({ anchor: null });
    expect(
      await writeLabelPointSplit({
        supabase: missing.supabase,
        pointId: UUID(1),
        shotId: SHOT(2),
      }),
    ).toEqual({ error: "Point not found." });
    expect(writes(missing)).toEqual([]);

    const complete = fakeClient({ session: { status: "complete" } });
    const frozen = await writeLabelPointSplit({
      supabase: complete.supabase,
      pointId: UUID(1),
      shotId: SHOT(2),
    });
    expect("error" in frozen).toBe(true);
    expect(writes(complete)).toEqual([]);

    const first = fakeClient({});
    expect(
      await writeLabelPointSplit({
        supabase: first.supabase,
        pointId: UUID(1),
        shotId: SHOT(1),
      }),
    ).toEqual({
      error:
        "This is the point's first shot: splitting here would leave nothing behind.",
    });
    expect(writes(first)).toEqual([]);
  });

  test("the entry point refuses without an admin, before a client is built", async () => {
    let built = 0;
    const result = await splitLabelPoint(UUID(1), SHOT(2), {
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

// ── The rows' Split action ─────────────────────────────────────────────────

const OPERATIONS = {
  ...ROW_OPERATIONS,
  onSplitPoint: noop,
  onCombinePoints: noop,
};

const editContext = (
  session: LabelSession,
  overrides: Record<string, unknown> = {},
  editable = true,
) =>
  sharedEditContext(
    { editable, operations: editable ? OPERATIONS : undefined, ...overrides },
    session,
  );

/** The markup of the stroke row for `shotId`, up to the next row. */
function shotRow(html: string, shotId: string): string {
  const at = html.indexOf(`data-shot-id="${shotId}"`);
  expect(at, shotId).toBeGreaterThan(-1);
  const start = html.lastIndexOf("<div", at);
  const next = html.indexOf("data-row=", html.indexOf(">", at));
  return html.slice(start, next === -1 ? undefined : next);
}

test.describe("Split point here", () => {
  test("in the black well: on every live shot but the first, in the actions overlay before Reset and Delete, with its name", () => {
    const session = labelSessionFixture();
    const { BlackShotsWell } = createLoader().load(WELL) as {
      BlackShotsWell: React.ComponentType<Record<string, unknown>>;
    };
    const html = renderToStaticMarkup(
      React.createElement(BlackShotsWell, {
        point: pointOf(P1),
        edit: editContext(session, { selectedShotId: "s-return" }),
      }),
    );
    // Shot 1 — the serve: no split.
    const serve = shotRow(html, "s-serve");
    expect(serve).toContain("data-shot-actions");
    expect(serve).not.toContain("data-split-row");
    // Shot 2 — the return: Split, then Reset (edited, seeded), then Delete.
    const ret = shotRow(html, "s-return");
    const split = tag(ret, "data-split-row");
    expect(split).toContain('aria-label="Split point at shot 2"');
    expect(split).toMatch(/^<button/);
    expect(ret.indexOf("data-split-row")).toBeLessThan(
      ret.indexOf("data-reset-row"),
    );
    expect(ret.indexOf("data-reset-row")).toBeLessThan(
      ret.indexOf("data-delete-row"),
    );
    // Inside the overlay, not in the grid.
    expect(ret.indexOf("data-shot-actions")).toBeLessThan(
      ret.indexOf("data-split-row"),
    );
    // Shot 3 — the added stroke: Split and Delete.
    const added = shotRow(html, "s-added");
    expect(tag(added, "data-split-row")).toContain(
      'aria-label="Split point at shot 3"',
    );
    expect(added).not.toContain("data-reset-row");
    // The tombstone line carries none: its block ends before the next row.
    const tombAt = html.indexOf('data-tombstone-id="s-phantom"');
    const tomb = html.slice(tombAt, html.indexOf("data-row=", tombAt + 1));
    expect(tomb).not.toContain("data-split-row");
    // Lucide's split glyph, not a native title.
    expect(split).not.toContain(" title=");
    expect(ret).toContain("lucide-split");

    // Read-only, or with nothing to ask: none.
    for (const frozen of [
      renderToStaticMarkup(
        React.createElement(BlackShotsWell, {
          point: pointOf(P1),
          edit: editContext(session, {}, false),
        }),
      ),
      renderToStaticMarkup(
        React.createElement(BlackShotsWell, {
          point: pointOf(P1),
          edit: editContext(session, { operations: undefined }),
        }),
      ),
    ]) {
      expect(frozen).not.toContain("data-split-row");
    }
  });

  test("a click asks the console for the point and the shot, and does not select the row", () => {
    const asked: unknown[][] = [];
    const selected: string[] = [];
    const { BlackShotRow } = createLoader().load(WELL) as {
      BlackShotRow: (props: Record<string, unknown>) => React.ReactElement;
    };
    const p1 = pointOf(P1);
    const tree = BlackShotRow({
      shot: p1.shots.find((s) => s.id === "s-return"),
      number: 2,
      point: p1,
      pointNumber: 1,
      edit: editContext(labelSessionFixture(), {
        onSelectShot: (id: string) => selected.push(id),
        operations: {
          ...OPERATIONS,
          onSplitPoint: (...args: unknown[]) => asked.push(args),
        },
      }),
    });
    const button = findByProp(tree, "data-split-row", ["RowAction"]);
    expect(button).not.toBeNull();
    let stopped = 0;
    (button!.props.onClick as (e: unknown) => void)({
      stopPropagation: () => {
        stopped += 1;
      },
    });
    expect(asked).toEqual([[P1, "s-return"]]);
    expect(stopped).toBe(1);
    expect(selected).toEqual([]);
    // Without the point, no split is offered.
    const bare = BlackShotRow({
      shot: p1.shots.find((s) => s.id === "s-return"),
      number: 2,
      pointNumber: 1,
      edit: editContext(labelSessionFixture()),
    });
    expect(findByProp(bare, "data-split-row", ["RowAction"])).toBeNull();
  });

  test("the menu holds Reset back on a point whose rally another live point shares", () => {
    const { pointMenuActions } = createLoader().load(MENU) as {
      pointMenuActions: (
        point: LabelPoint,
        context: Record<string, unknown>,
        operations: Record<string, unknown>,
      ) => { reset: (() => void) | null };
    };
    const p1 = pointOf(P1);
    const own = pointMenuActions(
      p1,
      { points: points(), names: NAMES },
      OPERATIONS,
    );
    expect(own.reset).not.toBeNull();
    const plan = planPointSplit(points(), P1, "s-return");
    if ("error" in plan) throw new Error(plan.error);
    const draft = draftSplitPoint(
      { ...plan.write.insert, vendor_rally_ids: [1001] },
      NEW_ID,
    );
    const after = applyPointSplit(points(), P1, draft, plan.write);
    const halved = pointMenuActions(
      after[0],
      { points: after, names: NAMES },
      OPERATIONS,
    );
    expect(halved.reset).toBeNull();
  });
});

// ── The console's wiring ───────────────────────────────────────────────────

test("a render of the black console draws Split on the open point's later shots and writes nothing", () => {
  const called: string[] = [];
  const operations = Object.fromEntries(
    ["splitPoint", "combinePoints", "insertPoint", "addShot"].map((name) => [
      name,
      async () => {
        called.push(name);
        return { error: "not in a render" };
      },
    ]),
  );
  const { LabelConsole } = createLoader().load(CONSOLE) as {
    LabelConsole: React.ComponentType<Record<string, unknown>>;
  };
  const html = renderToStaticMarkup(
    React.createElement(LabelConsole, {
      session: labelSessionFixture(),
      video: null,
      marks: null,
      initialLayoutMode: "black",
      initialExpandedPointId: P1,
      operations,
      onSaveShot: async () => ({ ok: true, status: "edited" }),
      onSavePoint: async () => ({ ok: true, status: "edited" }),
    }),
  );
  expect(called).toEqual([]);
  expect(html).toContain('aria-label="Split point at shot 2"');
  expect(html).toContain('aria-label="Split point at shot 3"');
  expect(html).not.toContain('aria-label="Split point at shot 1"');
  // The well sets the tail variable every row reads.
  expect(tag(html, "data-shots-well")).toContain("--shot-tail:33px");
});
