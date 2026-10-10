import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

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
  fakeLabelClient,
  labelSessionFixture,
  labelShotRow,
  editContext as sharedEditContext,
  noop,
  ROW_OPERATIONS,
} from "./fixtures/label-session";
import { findByProp, trayButtons } from "./fixtures/react-tree";
import { createLoader } from "./fixtures/vm-modules";

// Split a point at one of its shots: the pure plan and the console's rows, the
// service over a fake client, and the black well's Split action.

const WELL = "src/components/admin/labels/label-black-shot-row.tsx";
const MENU = "src/components/admin/labels/label-point-menu.tsx";
const CONSOLE = "src/components/admin/labels/label-console.tsx";

const { P1, P2, P3, P4 } = FIXTURE_POINT_IDS;
const NAMES = { p1: "Lee", p2: "Vargas" };
const NEW_ID = "p-split";

const points = () => labelSessionFixture().points;
const pointOf = (id: string) => points().find((p) => p.id === id)!;

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

/**
 * The split's own reads, plus what the ending each half then derives is
 * read from: `endingShots` by point id (the console's full shot rows; none
 * unless given) and the point row the reconcile reads back, which takes each
 * `label_points` update it is sent.
 */
function fakeClient(rows: {
  session?: Record<string, unknown> | null;
  anchor?: Record<string, unknown> | null;
  points?: Record<string, unknown>[];
  shots?: Record<string, unknown>[];
  endingShots?: Record<string, Record<string, unknown>[]>;
  /** The anchor's compare-and-set matched nothing — another tab got there first. */
  racedAnchor?: boolean;
}) {
  const endingPoints: Record<string, Record<string, unknown>> = {};
  return fakeLabelClient((call) => {
    if (call.op === "update") {
      if (call.table === "label_points" && "updated_at" in call.filters) {
        const id = String(call.filters.id);
        endingPoints[id] = { ...endingPoints[id], ...call.values };
      }
      if (rows.racedAnchor && "status" in call.filters) {
        return { data: [], error: null };
      }
      return undefined;
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
    if (call.table === "label_sessions") {
      return {
        data:
          rows.session === undefined
            ? { status: "labelling", marks_enabled: true }
            : rows.session,
        error: null,
      };
    }
    if (call.table === "label_points") {
      if ("session_id" in call.filters) {
        return { data: rows.points ?? POINT_ROWS, error: null };
      }
      if (call.columns?.includes("updated_at")) {
        const id = String(call.filters.id);
        endingPoints[id] ??= {
          id,
          updated_at: "2026-10-01T10:00:00+00:00",
          status: id === NEW_ROW_ID ? "added" : "edited",
          seed: null,
          set_number: 1,
          game_number: 1,
          server: "p1",
          serve_side: null,
          winner: null,
          ending: null,
          ended_by: null,
        };
        return { data: endingPoints[id], error: null };
      }
      return {
        data:
          rows.anchor === undefined
            ? { id: call.filters.id, session_id: SESSION_ID }
            : rows.anchor,
        error: null,
      };
    }
    if (call.table === "label_shots") {
      return call.columns?.includes("rally:")
        ? { data: rows.shots ?? SHOT_ROWS, error: null }
        : {
            data: rows.endingShots?.[String(call.filters.label_point_id)] ?? [],
            error: null,
          };
    }
    return undefined;
  });
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
      // Each half's rows and row, read for the ending it now derives: with
      // no rows to read here, nothing is written.
      ["label_shots", "select"],
      ["label_points", "select"],
      ["label_shots", "select"],
      ["label_points", "select"],
    ]);
    expect(fake.calls[3].columns).toContain("rally:vendor->>pred_rally_id");
    expect(fake.calls[3].filters).toEqual({ label_point_id: UUID(1) });
    expect(fake.calls[10].filters).toEqual({ label_point_id: NEW_ROW_ID });
    expect(fake.calls[12].filters).toEqual({ label_point_id: UUID(1) });
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
    // Compare-and-set on the status the anchor was read with.
    expect(anchor).toEqual({
      table: "label_points",
      op: "update",
      values: { status: "edited", vendor_rally_ids: [1001] },
      filters: { id: UUID(1), status: "edited" },
    });
    for (const call of fake.calls) {
      expect(call.table).toMatch(/^label_(points|shots|sessions)$/);
      expect(["select", "update", "insert"]).toContain(call.op);
    }
  });

  test("an anchor changed in another tab since the read is reported: the shifted rows, the new point and its moved shots stand, and no ending is read", async () => {
    const raced = fakeClient({ racedAnchor: true });
    expect(
      await writeLabelPointSplit({
        supabase: raced.supabase,
        pointId: UUID(1),
        shotId: SHOT(2),
      }),
    ).toEqual({ error: "This row changed in another tab. Reload to see it." });
    expect(raced.calls.map((c) => [c.table, c.op]).slice(4)).toEqual([
      ["label_points", "update"],
      ["label_points", "update"],
      ["label_points", "update"],
      ["label_points", "insert"],
      ["label_shots", "update"],
      ["label_points", "update"],
    ]);
    expect(writes(raced).at(-1)?.filters).toEqual({
      id: UUID(1),
      status: "edited",
    });
  });

  test("both halves take the ending their rows now derive, statuses as the split wrote them", async () => {
    // Split at the return: the anchor keeps Lee's serve alone — an ace,
    // where it said Lee's error — and the new point gets the return and
    // Lee's forehand out, Vargas's point on his error.
    const serve = labelShotRow(SHOT(1), UUID(1), {
      stroke: "first_serve",
      video_time: 2472.0,
    });
    const back = labelShotRow(SHOT(2), NEW_ROW_ID, {
      hitter: "p2",
      stroke: "backhand",
      video_time: 2473.1,
    });
    const out = labelShotRow(SHOT(4), NEW_ROW_ID, {
      result: "out",
      status: "added",
      video_time: 2474.4,
    });
    const fake = fakeClient({
      endingShots: { [UUID(1)]: [serve], [NEW_ROW_ID]: [back, out] },
    });
    const result = await writeLabelPointSplit({
      supabase: fake.supabase,
      pointId: UUID(1),
      shotId: SHOT(2),
    });
    expect(result).toMatchObject({
      ok: true,
      point: {
        id: NEW_ROW_ID,
        status: "added",
        ending: "error",
        endedBy: "p1",
        winner: "p2",
      },
      anchor: {
        id: UUID(1),
        status: "edited",
        vendor_rally_ids: [1001],
        ending: "ace",
        ended_by: "p1",
        winner: "p1",
      },
    });
    const endings = writes(fake).filter((w) => "updated_at" in w.filters);
    expect(endings.map((w) => [w.filters.id, w.values])).toEqual([
      [
        NEW_ROW_ID,
        { ending: "error", ended_by: "p1", winner: "p2", status: "added" },
      ],
      [
        UUID(1),
        { ending: "ace", ended_by: "p1", winner: "p1", status: "edited" },
      ],
    ]);
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

test.describe("Split point here", () => {
  test("in the black well: offered, but never on a tombstone, and never on a session that cannot be written", () => {
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
    // The selected stroke's tray holds Split first.
    const tray = html.slice(html.indexOf('aria-label="Shot 2 actions"'));
    expect(tag(html, 'aria-label="Shot 2 actions"')).toContain(
      "data-shot-tray",
    );
    expect(tray.match(/data-shot-action="(\w+)"/)?.[1]).toBe("split");
    expect(tag(tray, 'data-shot-action="split"')).toContain(
      'aria-label="Split point at shot 2"',
    );
    // The tombstone line carries none: its block ends before the next row.
    const tombAt = html.indexOf('data-tombstone-id="s-phantom"');
    const tomb = html.slice(tombAt, html.indexOf("data-row=", tombAt + 1));
    expect(tomb).not.toContain("data-shot-tray");
    expect(tomb).not.toContain("data-shot-action");
    // A tombstone selected: still no tray.
    const tombSelected = renderToStaticMarkup(
      React.createElement(BlackShotsWell, {
        point: pointOf(P1),
        edit: editContext(session, { selectedShotId: "s-phantom" }),
      }),
    );
    expect(tombSelected).not.toContain("data-shot-tray");
    // Read-only, or with nothing to ask: none.
    for (const frozen of [
      renderToStaticMarkup(
        React.createElement(BlackShotsWell, {
          point: pointOf(P1),
          edit: editContext(session, { selectedShotId: "s-return" }, false),
        }),
      ),
      renderToStaticMarkup(
        React.createElement(BlackShotsWell, {
          point: pointOf(P1),
          edit: editContext(session, {
            selectedShotId: "s-return",
            operations: undefined,
          }),
        }),
      ),
    ]) {
      expect(frozen).not.toContain("data-shot-tray");
      expect(frozen).not.toContain('data-shot-action="split"');
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
        selectedShotId: "s-return",
        onSelectShot: (id: string) => selected.push(id),
        operations: {
          ...OPERATIONS,
          onSplitPoint: (...args: unknown[]) => asked.push(args),
        },
      }),
    });
    // A click in the tray stops there.
    const tray = findByProp(tree, "data-shot-tray", ["ShotTray"]);
    expect(tray).not.toBeNull();
    let stopped = 0;
    const event = {
      stopPropagation: () => {
        stopped += 1;
      },
    };
    (tray!.props.onClick as (e: unknown) => void)(event);
    const split = trayButtons(tree).find((button) => button.key === "split");
    expect(split).toBeDefined();
    expect(split!.label).toBe("Split point here");
    expect(split!.ariaLabel).toBe("Split point at shot 2");
    split!.click(event);
    expect(asked).toEqual([[P1, "s-return"]]);
    expect(stopped).toBe(2);
    expect(selected).toEqual([]);
    // Without the point, no split is offered.
    const bare = BlackShotRow({
      shot: p1.shots.find((s) => s.id === "s-return"),
      number: 2,
      pointNumber: 1,
      edit: editContext(labelSessionFixture(), { selectedShotId: "s-return" }),
    });
    expect(trayButtons(bare).map((button) => button.key)).not.toContain(
      "split",
    );
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
  const render = (initialSelectedShotId: string | null) =>
    renderToStaticMarkup(
      React.createElement(LabelConsole, {
        session: labelSessionFixture(),
        video: null,
        marks: null,
        initialLayoutMode: "black",
        initialExpandedPointId: P1,
        initialSelectedShotId,
        operations,
        onSaveShot: async () => ({ ok: true, status: "edited" }),
        onSavePoint: async () => ({ ok: true, status: "edited" }),
      }),
    );
  // The open point's live strokes, numbered as the well numbers them.
  const live = pointOf(P1).shots.filter((shot) => shot.status !== "deleted");
  const offered = (n: number) => {
    const html = render(live[n - 1].id);
    expect(tag(html, "data-shot-tray")).toContain(
      `aria-label="Shot ${n} actions"`,
    );
    return html.includes('data-shot-action="split"');
  };
  expect(offered(2)).toBe(true);
  expect(offered(3)).toBe(true);
  expect(offered(1)).toBe(false);
  expect(called).toEqual([]);
  // Nothing selected: no tray at all.
  const html = render(null);
  expect(html).not.toContain("data-shot-tray");
  // The well sets the tail variable every row reads.
  expect(tag(html, "data-shots-well")).toContain("--shot-tail:33px");
});
