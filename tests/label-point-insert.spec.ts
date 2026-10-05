import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { AdminClient } from "@/lib/supabase/admin";
import {
  LABEL_MARK_META,
  type LabelMark,
  type LabelMarks,
  type LabelSuggestion,
} from "@/lib/services/labels/marks";
import {
  applyInsertedPoint,
  draftInsertedPoint,
  planInsertedPoint,
  withdrawInsertedPoint,
} from "@/lib/services/labels/point-insert";
import {
  insertLabelPoint,
  writeLabelPointInsert,
} from "@/lib/services/labels/point-insert-session";
import type { LabelPoint, LabelSession } from "@/lib/services/labels/session";
import {
  addedPointBetween,
  suggestionState,
} from "@/lib/services/labels/suggestions";
import {
  FIXTURE_POINT_IDS,
  labelSessionFixture,
} from "./fixtures/label-session";
import { createLoader } from "./fixtures/vm-modules";

/**
 * A suggested point (T40, board 08m §5): two points of a game served from the
 * same side, so the black rail opens a dashed slot between them with three
 * answers — "Add point" (a new `label_points` row at the second point's
 * index, every later point moved up one), "{b} was a let" (the existing
 * point autosave) and "Dismiss" (T39's key). Nothing changes until a click.
 *
 * The pure plan; the service over a fake client, for the ORDER of its writes
 * and what it refuses; and the rail rendered offline through
 * `fixtures/vm-modules`.
 */

const ROW = "src/components/admin/labels/label-black-point-row.tsx";
const CONSOLE = "src/components/admin/labels/label-console.tsx";

const { P1, P2, P3, P4 } = FIXTURE_POINT_IDS;
const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const BEFORE_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const NEW_ID = "p-new";

/**
 * The fixture's first two points — both of game 1 — read as served from the
 * ad side twice: the second is the flagged point, the slot opens before it.
 */
const SUGGESTION: Extract<LabelSuggestion, { kind: "missing_point" }> = {
  kind: "missing_point",
  key: "missing_point",
  pointId: P2,
  beforePointId: P1,
  side: "ad",
  pointNumbers: [1, 2],
};

/** The mark that opened the suggestion, on the flagged point. */
function sameSideMark(): LabelMark {
  const meta = LABEL_MARK_META.service_court_repeat;
  return {
    code: "service_court_repeat",
    kind: meta.kind,
    scope: meta.scope,
    params: { side: "ad" },
  } as LabelMark;
}

function marksOf(): LabelMarks {
  return {
    points: { [P2]: [sameSideMark()] },
    shots: {},
    suggestions: [SUGGESTION],
  };
}

const points = () => labelSessionFixture().points;

/**
 * The fixture with its second point not yet checked: the fixture checks it,
 * which would read the question as "checked as is" — the life-cycle's answer,
 * not the suggestion's. Here the question is still open.
 */
function unchecked(): LabelSession {
  const session = labelSessionFixture();
  return {
    ...session,
    points: session.points.map((p) =>
      p.id === P2 ? { ...p, checkedAt: null } : p,
    ),
  };
}

/** The session after "Add point": the plan's row, in memory, as the console does it. */
function withAdded(session: LabelSession): LabelSession {
  const plan = planInsertedPoint(session.points, P2);
  if ("error" in plan) throw new Error(plan.error);
  return {
    ...session,
    points: applyInsertedPoint(
      session.points,
      draftInsertedPoint(plan.write.insert, NEW_ID),
    ),
  };
}

// ── The plan ───────────────────────────────────────────────────────────────

test.describe("planInsertedPoint", () => {
  test("the new point takes the flagged point's index, set, game, server and game type; every point at or after moves up one, highest first", () => {
    const plan = planInsertedPoint(points(), P2);
    expect(plan).toEqual({
      ok: true,
      write: {
        insert: {
          point_index: 1,
          set_number: 1,
          game_number: 1,
          server: "p1",
          game_type: "game",
          status: "added",
          vendor_rally_ids: [],
        },
        // The tombstone (P3) is in the way and moves with the rest; P1 stays.
        shifts: [
          { id: P4, point_index: 4 },
          { id: P3, point_index: 3 },
          { id: P2, point_index: 2 },
        ],
      },
    });
  });

  test("before the last point, only that point moves", () => {
    const plan = planInsertedPoint(points(), P4);
    expect(plan).toMatchObject({
      ok: true,
      write: {
        insert: { point_index: 3, game_number: 2, server: "p2" },
        shifts: [{ id: P4, point_index: 4 }],
      },
    });
  });

  test("a deleted flagged point, and one not in the session, are refused", () => {
    expect(planInsertedPoint(points(), P3)).toEqual({
      error: "Restore the point after the slot before adding one.",
    });
    expect(planInsertedPoint(points(), "p-nope")).toEqual({
      error: "The point to add before is not a point of this session.",
    });
  });

  test("applyInsertedPoint renumbers in memory and withdrawInsertedPoint undoes it", () => {
    const before = points();
    const after = withAdded(labelSessionFixture()).points;
    expect(after.map((p) => [p.id, p.pointIndex])).toEqual([
      [P1, 0],
      [NEW_ID, 1],
      [P2, 2],
      [P3, 3],
      [P4, 4],
    ]);
    const draft = after[1];
    expect(draft).toMatchObject({
      status: "added",
      winner: null,
      ending: null,
      endedBy: null,
      serveSide: null,
      checkedAt: null,
      dismissed: [],
      seed: null,
      shots: [],
      vendorRallyIds: [],
    });
    // The fixture's rows were not touched.
    expect(before.map((p) => p.pointIndex)).toEqual([0, 1, 2, 3]);
    expect(withdrawInsertedPoint(after, NEW_ID)).toEqual(before);
    expect(withdrawInsertedPoint(before, NEW_ID)).toEqual(before);
  });
});

// ── The suggestion's life ──────────────────────────────────────────────────

test.describe("a missing point's state", () => {
  test("open until a live added point sits between the two, the second is a let, or it is dismissed", () => {
    const flagged = points().find((p) => p.id === P2)!;
    expect(suggestionState(SUGGESTION, flagged, points())).toBe("open");
    // Without the rows the add cannot be seen: still open, never wrong.
    expect(suggestionState(SUGGESTION, flagged)).toBe("open");

    const added = withAdded(labelSessionFixture()).points;
    expect(addedPointBetween(added, P1, P2)).toBe(true);
    expect(suggestionState(SUGGESTION, flagged, added)).toBe("done");

    // The labeller deletes the point they added: the question is open again.
    const undone = added.map((p) =>
      p.id === NEW_ID
        ? {
            ...p,
            status: "deleted" as const,
            statusBeforeDelete: "added" as const,
          }
        : p,
    );
    expect(suggestionState(SUGGESTION, flagged, undone)).toBe("open");

    const let_: LabelPoint = {
      ...flagged,
      ending: "let_replayed",
      status: "edited",
    };
    expect(suggestionState(SUGGESTION, let_, points())).toBe("done");

    expect(
      suggestionState(
        SUGGESTION,
        { ...flagged, dismissed: ["missing_point"] },
        points(),
      ),
    ).toBe("dismissed");
    // Done outranks dismissed: the point is there either way.
    expect(
      suggestionState(
        SUGGESTION,
        { ...flagged, dismissed: ["missing_point"] },
        added,
      ),
    ).toBe("done");
  });

  test("addedPointBetween wants both rows, in that order, with an added one strictly between", () => {
    const rows = withAdded(labelSessionFixture()).points;
    expect(addedPointBetween(rows, P2, P1)).toBe(false);
    expect(addedPointBetween(rows, P1, "p-nope")).toBe(false);
    expect(addedPointBetween(rows, P1, NEW_ID)).toBe(false);
    expect(addedPointBetween(rows, P2, P4)).toBe(false);
    // An unchanged or edited point between answers nothing.
    expect(addedPointBetween(points(), P1, P4)).toBe(false);
  });
});

// ── The service ────────────────────────────────────────────────────────────

interface Call {
  table: string;
  op: "select" | "update" | "insert";
  values?: Record<string, unknown>;
  filters: Record<string, unknown>;
}

const POINT_ROWS = points().map((p) => ({
  id: p.id,
  point_index: p.pointIndex,
  status: p.status,
  set_number: p.setNumber,
  game_number: p.gameNumber,
  server: p.server,
  game_type: p.gameType,
}));

function fakeClient(rows: {
  session?: Record<string, unknown> | null;
  points?: Record<string, unknown>[];
  /** The shift of this row fails. */
  failShift?: string;
}) {
  const calls: Call[] = [];
  const client = {
    from(table: string) {
      const call: Call = { table, op: "select", filters: {} };
      calls.push(call);
      const answer = () => {
        if (call.op === "update") {
          if (rows.failShift && call.filters.id === rows.failShift) {
            return { data: null, error: { message: "boom" } };
          }
          return { data: [{ id: call.filters.id }], error: null };
        }
        if (call.op === "insert") {
          return {
            data: {
              id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
              point_index: call.values?.point_index,
              status: call.values?.status,
              set_number: call.values?.set_number,
              game_number: call.values?.game_number,
              server: call.values?.server,
              game_type: call.values?.game_type,
              vendor_rally_ids: call.values?.vendor_rally_ids,
              serve_side: null,
              winner: null,
              ending: null,
              ended_by: null,
              status_before_delete: null,
              checked_at: null,
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
          return { data: rows.points ?? POINT_ROWS, error: null };
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
        insert: (values: Record<string, unknown>) => {
          call.op = "insert";
          call.values = values;
          return builder;
        },
        eq: (column: string, value: unknown) => {
          call.filters[column] = value;
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

/** The point ids the fake knows, as uuids the service accepts. */
const UUID = (n: number) => `aaaaaaaa-aaaa-4aaa-8aaa-00000000000${n}`;
const UUID_ROWS = POINT_ROWS.map((row, i) => ({ ...row, id: UUID(i + 1) }));

const writes = (fake: ReturnType<typeof fakeClient>) =>
  fake.calls.filter((c) => c.op !== "select");

test.describe("writeLabelPointInsert", () => {
  test("the gate, the read, then the shifts highest first and ONE insert — label_points only", async () => {
    const fake = fakeClient({ points: UUID_ROWS });
    const result = await writeLabelPointInsert({
      supabase: fake.supabase,
      sessionId: SESSION_ID,
      beforePointId: UUID(2),
    });
    expect(result).toMatchObject({
      ok: true,
      point: {
        pointIndex: 1,
        setNumber: 1,
        gameNumber: 1,
        server: "p1",
        gameType: "game",
        status: "added",
        vendorRallyIds: [],
        winner: null,
        ending: null,
        endedBy: null,
        serveSide: null,
        checkedAt: null,
        seed: null,
        shots: [],
      },
    });
    expect(fake.calls.map((c) => [c.table, c.op])).toEqual([
      ["label_sessions", "select"],
      ["label_points", "select"],
      ["label_points", "update"],
      ["label_points", "update"],
      ["label_points", "update"],
      ["label_points", "insert"],
    ]);
    expect(fake.calls[1].filters).toEqual({ session_id: SESSION_ID });
    expect(writes(fake)).toEqual([
      {
        table: "label_points",
        op: "update",
        values: { point_index: 4 },
        filters: { id: UUID(4) },
      },
      {
        table: "label_points",
        op: "update",
        values: { point_index: 3 },
        filters: { id: UUID(3) },
      },
      {
        table: "label_points",
        op: "update",
        values: { point_index: 2 },
        filters: { id: UUID(2) },
      },
      {
        table: "label_points",
        op: "insert",
        values: {
          session_id: SESSION_ID,
          point_index: 1,
          set_number: 1,
          game_number: 1,
          server: "p1",
          game_type: "game",
          status: "added",
          vendor_rally_ids: [],
          serve_side: null,
          winner: null,
          ending: null,
          ended_by: null,
          seed: null,
          checked_at: null,
        },
        filters: {},
      },
    ]);
  });

  test("a session labelled without marks, and a complete one, are refused before anything is read or written", async () => {
    const blind = fakeClient({
      points: UUID_ROWS,
      session: { status: "labelling", marks_enabled: false },
    });
    expect(
      await writeLabelPointInsert({
        supabase: blind.supabase,
        sessionId: SESSION_ID,
        beforePointId: UUID(2),
      }),
    ).toEqual({
      error:
        "This session is labelled without the site's marks, so there is no point to add.",
    });
    expect(blind.calls.map((c) => c.table)).toEqual(["label_sessions"]);

    const frozen = fakeClient({
      points: UUID_ROWS,
      session: { status: "complete", marks_enabled: true },
    });
    expect(
      await writeLabelPointInsert({
        supabase: frozen.supabase,
        sessionId: SESSION_ID,
        beforePointId: UUID(2),
      }),
    ).toEqual({
      error: "This session is complete, so its labels can no longer change.",
    });
    expect(writes(frozen)).toEqual([]);

    const gone = fakeClient({ points: UUID_ROWS, session: null });
    expect(
      await writeLabelPointInsert({
        supabase: gone.supabase,
        sessionId: SESSION_ID,
        beforePointId: UUID(2),
      }),
    ).toEqual({ error: "Session not found." });
  });

  test("bad ids, a deleted flagged point and a failed shift write nothing more", async () => {
    expect(
      await writeLabelPointInsert({
        supabase: fakeClient({}).supabase,
        sessionId: "not-a-uuid",
        beforePointId: UUID(2),
      }),
    ).toEqual({ error: "Invalid session id." });
    expect(
      await writeLabelPointInsert({
        supabase: fakeClient({}).supabase,
        sessionId: SESSION_ID,
        beforePointId: BEFORE_ID.slice(1),
      }),
    ).toEqual({ error: "Invalid point id." });

    const deleted = fakeClient({ points: UUID_ROWS });
    expect(
      await writeLabelPointInsert({
        supabase: deleted.supabase,
        sessionId: SESSION_ID,
        beforePointId: UUID(3),
      }),
    ).toEqual({ error: "Restore the point after the slot before adding one." });
    expect(writes(deleted)).toEqual([]);

    const stranger = fakeClient({ points: UUID_ROWS });
    expect(
      await writeLabelPointInsert({
        supabase: stranger.supabase,
        sessionId: SESSION_ID,
        beforePointId: BEFORE_ID,
      }),
    ).toEqual({
      error: "The point to add before is not a point of this session.",
    });
    expect(writes(stranger)).toEqual([]);

    // The first shift (the highest) fails: nothing else is written, no insert.
    const failed = fakeClient({ points: UUID_ROWS, failShift: UUID(4) });
    expect(
      await writeLabelPointInsert({
        supabase: failed.supabase,
        sessionId: SESSION_ID,
        beforePointId: UUID(2),
      }),
    ).toEqual({ error: "Could not make room for the point: boom" });
    expect(writes(failed).map((c) => c.op)).toEqual(["update"]);
  });

  test("the entry point refuses without an admin, before a client is built", async () => {
    let built = 0;
    const result = await insertLabelPoint(SESSION_ID, UUID(2), {
      requireAdmin: async () => null,
      createAdminClient: () => {
        built += 1;
        return fakeClient({}).supabase;
      },
    });
    expect(result).toEqual({ error: "Administrator access is required." });
    expect(built).toBe(0);

    const fake = fakeClient({ points: UUID_ROWS });
    expect(
      await insertLabelPoint(SESSION_ID.toUpperCase(), UUID(2), {
        requireAdmin: async () => ({ id: "admin" }),
        createAdminClient: () => fake.supabase,
      }),
    ).toMatchObject({ ok: true });
    expect(fake.calls[1].filters).toEqual({ session_id: SESSION_ID });
  });
});

// ── The console ────────────────────────────────────────────────────────────

type ConsoleProps = {
  session: LabelSession;
  video: null;
  marks?: LabelMarks | null;
  initialLayoutMode?: "black";
  initialExpandedPointId?: string | null;
  operations?: Record<string, unknown>;
  onSaveShot?: () => Promise<unknown>;
  onSavePoint?: () => Promise<unknown>;
};

function renderConsole(props: ConsoleProps): string {
  const { LabelConsole } = createLoader().load(CONSOLE) as {
    LabelConsole: React.ComponentType<ConsoleProps>;
  };
  return renderToStaticMarkup(React.createElement(LabelConsole, props));
}

/** Every console operation, counting the calls a render makes of it. */
function countingOperations() {
  const called: string[] = [];
  const operations = Object.fromEntries(
    [
      "deleteShot",
      "restoreShot",
      "deletePoint",
      "restorePoint",
      "addShot",
      "movePoint",
      "setChecked",
      "resetShot",
      "resetPoint",
      "setGameServer",
      "setGameType",
      "restoreSiteRemoval",
      "dismissSuggestion",
      "insertPoint",
    ].map((name) => [
      name,
      async () => {
        called.push(name);
        return { error: "not in a render" };
      },
    ]),
  );
  return { called, operations };
}

const SAVES = {
  onSaveShot: async () => ({ ok: true, status: "edited" }),
  onSavePoint: async () => ({ ok: true, status: "edited" }),
};

function black(
  session: LabelSession,
  marks: LabelMarks | null,
  operations: Record<string, unknown> = countingOperations().operations,
): string {
  return renderConsole({
    session,
    video: null,
    marks,
    initialLayoutMode: "black",
    initialExpandedPointId: null,
    operations,
    ...SAVES,
  });
}

/** The opening tag carrying `attr`. */
function tag(html: string, attr: string): string {
  const at = html.indexOf(attr);
  expect(at, attr).toBeGreaterThan(-1);
  return html.slice(html.lastIndexOf("<", at), html.indexOf(">", at) + 1);
}

/** The inner text of the element carrying `attr`. */
function inner(html: string, attr: string): string {
  const at = html.indexOf(attr);
  expect(at, attr).toBeGreaterThan(-1);
  const start = html.indexOf(">", at) + 1;
  return html.slice(start, html.indexOf("<", start));
}

/** A point row's markup, from its opening tag to the next row of any kind. */
function pointRow(html: string, pointId: string): string {
  const at = html.indexOf(`data-point-id="${pointId}"`);
  expect(at, pointId).toBeGreaterThan(-1);
  const start = html.lastIndexOf("<div", at);
  const next = html.indexOf("data-row=", html.indexOf(">", at));
  return html.slice(start, next === -1 ? undefined : next);
}

/** The number drawn in a point row's first track. */
function numberOf(html: string, pointId: string): string {
  const row = pointRow(html, pointId);
  const first = row.indexOf("<span");
  const second = row.indexOf("<span", first + 1);
  const start = row.indexOf(">", second) + 1;
  return row.slice(start, row.indexOf("<", start));
}

/** The slot's markup. */
function slot(html: string): string {
  const at = html.indexOf("data-point-suggestion=");
  expect(at).toBeGreaterThan(-1);
  const start = html.lastIndexOf("<div", at);
  const next = html.indexOf("data-row=", html.indexOf(">", at));
  return html.slice(start, next);
}

test.describe("a suggested point on the black rail", () => {
  test("a dashed slot between the pair's rows: plus, the two lines, three answers — and a render writes nothing", () => {
    const { called, operations } = countingOperations();
    const html = black(unchecked(), marksOf(), operations);
    expect(called).toEqual([]);

    const open = tag(html, "data-point-suggestion=");
    expect(open).toContain(`data-point-suggestion="${P2}"`);
    for (const cls of [
      "min-h-[44px]",
      "mx-2",
      "my-0.5",
      "rounded-lg",
      "border",
      "border-dashed",
      "border-[rgba(252,211,77,0.45)]",
      "bg-[rgba(253,230,138,0.06)]",
      "grid-cols-[22px_minmax(0,1fr)_auto]",
    ]) {
      expect(open, cls).toContain(cls);
    }
    const row = slot(html);
    expect(row).toContain("lucide-plus");
    expect(row).toMatch(/color:rgba\(252,\s?211,\s?77,\s?0\.8\)/);
    expect(inner(row, "data-point-suggestion-title")).toBe(
      "A point is probably missing here",
    );
    expect(tag(row, "data-point-suggestion-title")).toContain("text-[12px]");
    expect(tag(row, "data-point-suggestion-title")).toContain("font-medium");
    expect(tag(row, "data-point-suggestion-title")).toContain("text-white");
    expect(inner(row, "data-point-suggestion-detail")).toBe(
      "Points 1 and 2 were both served from the ad side",
    );
    expect(tag(row, "data-point-suggestion-detail")).toContain("text-[11px]");
    expect(tag(row, "data-point-suggestion-detail")).toContain("text-white/50");

    expect(inner(row, "data-point-suggestion-add")).toBe("Add point");
    expect(tag(row, "data-point-suggestion-add")).toContain(
      "text-[rgba(252,211,77,1)]",
    );
    expect(inner(row, "data-point-suggestion-let")).toBe("2 was a let");
    expect(tag(row, "data-point-suggestion-let")).toContain("text-white/50");
    expect(inner(row, "data-point-suggestion-dismiss")).toBe("Dismiss");
    expect(tag(row, "data-point-suggestion-dismiss")).toContain(
      "text-white/50",
    );
    // The two lines give way; the answers never shrink or wrap.
    for (const attr of [
      "data-point-suggestion-title",
      "data-point-suggestion-detail",
    ]) {
      expect(tag(row, attr)).toContain("truncate");
    }
    for (const attr of [
      "data-point-suggestion-add",
      "data-point-suggestion-let",
      "data-point-suggestion-dismiss",
    ]) {
      expect(tag(row, attr)).toContain("shrink-0");
      expect(tag(row, attr)).toContain("whitespace-nowrap");
    }

    // Between the two rows, and nowhere else.
    const at = html.indexOf("data-point-suggestion=");
    expect(html.indexOf(`data-point-id="${P1}"`)).toBeLessThan(at);
    expect(at).toBeLessThan(html.indexOf(`data-point-id="${P2}"`));
    expect(html.match(/data-point-suggestion=/g)).toHaveLength(1);
    // The flagged point still carries its open question.
    expect(tag(pointRow(html, P2), 'data-mark-kind="flag"')).toContain(
      'data-mark-state="open"',
    );
    expect(numberOf(html, P2)).toBe("2");
  });

  test("the three answers are the console's requests, each made on a click alone", () => {
    const { BlackSuggestedPoint } = createLoader().load(ROW) as {
      BlackSuggestedPoint: (props: Record<string, unknown>) => React.ReactNode;
    };
    const calls: Array<[string, ...unknown[]]> = [];
    const record =
      (name: string) =>
      (...args: unknown[]) => {
        calls.push([name, ...args]);
      };
    const session = labelSessionFixture();
    const edit = {
      editable: true,
      names: { p1: "Lee", p2: "Vargas" },
      selectedShotId: null,
      onPatchPoint: record("onPatchPoint"),
      operations: {
        onInsertPoint: record("onInsertPoint"),
        onDismissSuggestion: record("onDismissSuggestion"),
      },
      openTombstoneIds: new Set<string>(),
      marksEnabled: true,
      points: session.points,
      scores: new Map(),
      playingShotId: null,
    };
    const flagged = session.points.find((p) => p.id === P2)!;
    const tree = BlackSuggestedPoint({
      suggestion: SUGGESTION,
      point: flagged,
      edit,
    });
    expect(calls).toEqual([]);
    const click = (attr: string) => {
      const button = find(tree, attr);
      expect(button, attr).not.toBeNull();
      let stopped = 0;
      (button!.props.onClick as (e: unknown) => void)({
        stopPropagation: () => (stopped += 1),
      });
      expect(stopped).toBe(1);
    };
    click("data-point-suggestion-add");
    // Before the flagged point: the new point takes its index.
    expect(calls).toEqual([["onInsertPoint", P2]]);
    click("data-point-suggestion-let");
    // The EXISTING point autosave, one patch.
    expect(calls[1]).toEqual(["onPatchPoint", P2, { ending: "let_replayed" }]);
    click("data-point-suggestion-dismiss");
    expect(calls[2]).toEqual(["onDismissSuggestion", P2, "missing_point"]);
    expect(calls).toHaveLength(3);
  });

  test("after Add point: the slot is gone, the New point row stands in its place and the next point is one higher", () => {
    const session = withAdded(unchecked());
    const html = black(session, marksOf());
    expect(html).not.toContain("data-point-suggestion=");

    const row = pointRow(html, NEW_ID);
    expect(tag(row, "data-point-id")).toContain("data-point-new");
    expect(numberOf(html, NEW_ID)).toBe("2");
    expect(numberOf(html, P2)).toBe("3");
    expect(numberOf(html, P4)).toBe("5");
    expect(html.indexOf(`data-point-id="${P1}"`)).toBeLessThan(
      html.indexOf(`data-point-id="${NEW_ID}"`),
    );
    expect(html.indexOf(`data-point-id="${NEW_ID}"`)).toBeLessThan(
      html.indexOf(`data-point-id="${P2}"`),
    );

    // The frame's "New point": a "?" in a blue ring, the title in blue, the
    // detail between the neighbours' strokes, a dash for the score, the pencil.
    expect(tag(row, 'data-winner-mark="new"')).toContain(
      "shadow-[inset_0_0_0_1px_var(--blue)]",
    );
    expect(tag(row, 'data-winner-mark="new"')).toContain("bg-transparent");
    expect(inner(row, 'data-winner-mark="new"')).toBe("?");
    expect(inner(row, "data-point-sentence")).toBe("New point");
    expect(tag(row, "data-point-sentence")).toContain("text-[var(--blue)]");
    // Lee's last stroke of point 1 is at 2474.4; Vargas's ace opens point 3 at 2490.2.
    expect(inner(row, "data-point-detail")).toBe(
      "Set who won, then add its shots · between 41:14 and 41:30",
    );
    expect(tag(row, "data-point-score")).toBeTruthy();
    expect(row.slice(row.indexOf("data-point-score"))).toContain("No score");
    expect(row).toContain("Changed by you");

    // The flagged point's question goes grey, never away: settled by the
    // point now between the two, and the hover says that — not "changed the
    // ending", which it did not.
    const chip = tag(pointRow(html, P2), 'data-mark-kind="flag"');
    expect(chip).toContain('data-mark-state="settled"');
    expect(chip).toContain(
      'aria-label="Same side twice · settled. You added the missing point."',
    );
    // The flagged point itself is untouched: no pencil of its own.
    expect(pointRow(html, P2)).not.toContain("Changed by you");
  });

  test("after “was a let”: the slot is gone and the chip reads settled; after Dismiss, dismissed", () => {
    const session = unchecked();
    const let_ = {
      ...session,
      points: session.points.map((p) =>
        p.id === P2
          ? { ...p, ending: "let_replayed" as const, status: "edited" as const }
          : p,
      ),
    };
    const html = black(let_, marksOf());
    expect(html).not.toContain("data-point-suggestion=");
    expect(tag(pointRow(html, P2), 'data-mark-kind="flag"')).toContain(
      'data-mark-state="settled"',
    );
    expect(inner(pointRow(html, P2), "data-point-sentence")).toBe(
      "Let, replayed",
    );

    const dismissed = {
      ...session,
      points: session.points.map((p) =>
        p.id === P2 ? { ...p, dismissed: ["missing_point"] } : p,
      ),
    };
    const after = black(dismissed, marksOf());
    expect(after).not.toContain("data-point-suggestion=");
    expect(tag(pointRow(after, P2), 'data-mark-kind="flag"')).toContain(
      'data-mark-state="dismissed"',
    );
    expect(pointRow(after, P2)).not.toContain("Changed by you");
  });

  test("with marks off, none built, a pair that is not two live rows, or no way to write — no slot, or no answers", () => {
    const session = labelSessionFixture();
    expect(black({ ...session, marksEnabled: false }, marksOf())).not.toContain(
      "data-point-suggestion=",
    );
    expect(black(session, null)).not.toContain("data-point-suggestion=");
    // The point before the slot is a tombstone: nothing to open a slot after.
    expect(
      black(session, {
        ...marksOf(),
        suggestions: [{ ...SUGGESTION, beforePointId: P3 }],
      }),
    ).not.toContain("data-point-suggestion=");
    expect(
      black(session, {
        ...marksOf(),
        suggestions: [{ ...SUGGESTION, pointId: "p-nope" }],
      }),
    ).not.toContain("data-point-suggestion=");

    const readOnly = renderConsole({
      session: { ...session, status: "complete" },
      video: null,
      marks: marksOf(),
      initialLayoutMode: "black",
      initialExpandedPointId: null,
    });
    expect(readOnly).toContain(`data-point-suggestion="${P2}"`);
    expect(readOnly).not.toContain("data-point-suggestion-add");
    expect(readOnly).not.toContain("data-point-suggestion-let");
    expect(readOnly).not.toContain("data-point-suggestion-dismiss");

    // Never in the light layouts.
    expect(
      renderConsole({
        session,
        video: null,
        marks: marksOf(),
        initialExpandedPointId: null,
        operations: countingOperations().operations,
        ...SAVES,
      }),
    ).not.toContain("data-point-suggestion=");
  });
});

test("the light table files know nothing of an inserted point", () => {
  for (const file of [
    "src/components/admin/labels/label-point-row.tsx",
    "src/components/admin/labels/label-shot-row.tsx",
    "src/components/admin/labels/label-points-table.tsx",
    "src/components/admin/labels/label-game-band.tsx",
  ]) {
    const source = readFileSync(file, "utf8");
    expect(source, file).not.toMatch(/onInsertPoint|missing_point|New point/);
  }
});

/**
 * The first element in a React tree whose props carry `attr`. Only the slot's
 * own component is entered.
 */
function find(
  node: React.ReactNode,
  attr: string,
): React.ReactElement<Record<string, unknown>> | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = find(child, attr);
      if (found) return found;
    }
    return null;
  }
  if (!React.isValidElement(node)) return null;
  const element = node as React.ReactElement<Record<string, unknown>>;
  if (attr in element.props) return element;
  if (typeof element.type === "function") return null;
  for (const child of React.Children.toArray(
    element.props.children as React.ReactNode,
  )) {
    const found = find(child, attr);
    if (found) return found;
  }
  return null;
}
