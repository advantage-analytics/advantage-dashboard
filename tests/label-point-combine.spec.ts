import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  COMBINED_POINT_RESTORE_REFUSED,
  applyPointRestore,
  planPointRestore,
} from "@/lib/services/labels/operations";
import { writeLabelPointRestore } from "@/lib/services/labels/operations-session";
import {
  applyPointCombine,
  combineNeighbour,
  combineRetypeError,
  combineServeRetypes,
  isCombinedTombstone,
  planPointCombine,
  settlePointCombine,
  withdrawPointCombine,
} from "@/lib/services/labels/point-combine";
import {
  combineLabelPoints,
  writeLabelPointCombine,
} from "@/lib/services/labels/point-combine-session";
import { applyLabelShotPatch } from "@/lib/services/labels/edit";
import { serveAfterServeIn } from "@/lib/services/labels/marks-state";
import type { LabelPoint } from "@/lib/services/labels/session";
import {
  FIXTURE_POINT_IDS,
  fakeLabelClient,
  labelSessionFixture,
  labelShot,
  labelShotRow,
  noop,
  ROW_OPERATIONS,
} from "./fixtures/label-session";
import { createLoader } from "./fixtures/vm-modules";

// Combine two neighbouring points of a game into one: the pure plan and the
// console's rows, the services over a fake client, the ⋯ menu and the rail.

const MENU = "src/components/admin/labels/label-point-menu.tsx";
const CONSOLE = "src/components/admin/labels/label-console.tsx";

const { P1, P2, P3, P4 } = FIXTURE_POINT_IDS;
const NAMES = { p1: "Lee", p2: "Vargas" };

const points = () => labelSessionFixture().points;
const pointOf = (id: string) => points().find((p) => p.id === id)!;

/** The plan to combine point 2 into point 1. */
function planned() {
  const plan = planPointCombine(points(), P2, "above");
  if ("error" in plan) throw new Error(plan.error);
  return plan.write;
}

/** The fixture after point 2 is combined into point 1, as the console does it. */
function combined(): LabelPoint[] {
  return applyPointCombine(points(), planned());
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
      // The fixture's two points each open on a first serve: joined, the
      // later one is the second.
      retyped: [{ shotId: "s-ace", patch: { stroke: "second_serve" } }],
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

test.describe("combineServeRetypes", () => {
  const serve = (
    id: string,
    stroke: "first_serve" | "second_serve" | "forehand",
    videoTime: number,
    status: "kept" | "deleted" = "kept",
  ) => ({ id, stroke, videoTime, eventId: null, status });

  test("exactly two live serves: the first in video order is the first serve, the second the second", () => {
    // Listed out of order: video order decides, not the list.
    expect(
      combineServeRetypes([
        serve("b", "first_serve", 12),
        serve("r", "forehand", 13),
        serve("a", "first_serve", 4),
      ]),
    ).toEqual([{ shotId: "b", patch: { stroke: "second_serve" } }]);
    // Both wrong way round: both named.
    expect(
      combineServeRetypes([
        serve("a", "second_serve", 4),
        serve("b", "first_serve", 12),
      ]),
    ).toEqual([
      { shotId: "a", patch: { stroke: "first_serve" } },
      { shotId: "b", patch: { stroke: "second_serve" } },
    ]);
  });

  test("nothing when the pair is already right, or there are not exactly two live serves", () => {
    expect(
      combineServeRetypes([
        serve("a", "first_serve", 4),
        serve("b", "second_serve", 12),
      ]),
    ).toEqual([]);
    // Three, none of them called in before a replay: no let to read, so
    // nothing is relabelled.
    expect(
      combineServeRetypes([
        serve("a", "first_serve", 4),
        serve("b", "first_serve", 8),
        serve("c", "first_serve", 12),
      ]),
    ).toEqual([]);
    expect(combineServeRetypes([serve("a", "first_serve", 4)])).toEqual([]);
    // A tombstoned serve is not one of the two.
    expect(
      combineServeRetypes([
        serve("a", "first_serve", 4),
        serve("x", "first_serve", 6, "deleted"),
        serve("b", "first_serve", 12),
      ]),
    ).toEqual([{ shotId: "b", patch: { stroke: "second_serve" } }]);
    expect(
      combineServeRetypes([
        serve("a", "first_serve", 4),
        serve("x", "first_serve", 6, "deleted"),
      ]),
    ).toEqual([]);
  });
});

test.describe("combineServeRetypes: a replayed serve is a let", () => {
  const stroke = (
    id: string,
    fields: {
      stroke: "first_serve" | "second_serve" | "forehand" | "backhand";
      hitter: "p1" | "p2";
      result?: "in" | "out" | "net" | "let" | null;
      videoTime: number;
      status?: "kept" | "deleted";
    },
  ) => ({
    id,
    eventId: null,
    status: "kept" as const,
    result: null,
    ...fields,
  });

  test("a serve called in with the same server's serve right after it becomes a let; the replay keeps its stroke", () => {
    expect(
      combineServeRetypes([
        stroke("let", {
          stroke: "first_serve",
          hitter: "p1",
          result: "in",
          videoTime: 1,
        }),
        stroke("replay", {
          stroke: "first_serve",
          hitter: "p1",
          result: "in",
          videoTime: 9,
        }),
        stroke("ret", {
          stroke: "forehand",
          hitter: "p2",
          result: "in",
          videoTime: 10,
        }),
      ]),
    ).toEqual([{ shotId: "let", patch: { result: "let" } }]);
  });

  test("a let, then a fault and its second serve: the let, then first and second", () => {
    expect(
      combineServeRetypes([
        stroke("let", {
          stroke: "first_serve",
          hitter: "p1",
          result: "in",
          videoTime: 1,
        }),
        stroke("fault", {
          stroke: "first_serve",
          hitter: "p1",
          result: "out",
          videoTime: 9,
        }),
        stroke("second", {
          stroke: "first_serve",
          hitter: "p1",
          result: "in",
          videoTime: 14,
        }),
      ]),
    ).toEqual([
      { shotId: "let", patch: { result: "let" } },
      { shotId: "second", patch: { stroke: "second_serve" } },
    ]);
  });

  test("not a let: a fault before the replay, the other player's serve, a stroke between, or one already a let", () => {
    // A fault and its second serve: the two-serve rule, no let.
    expect(
      combineServeRetypes([
        stroke("a", {
          stroke: "first_serve",
          hitter: "p1",
          result: "out",
          videoTime: 1,
        }),
        stroke("b", {
          stroke: "first_serve",
          hitter: "p1",
          result: "in",
          videoTime: 9,
        }),
      ]),
    ).toEqual([{ shotId: "b", patch: { stroke: "second_serve" } }]);
    // The other player serving next is another point, not a replay.
    expect(
      combineServeRetypes([
        stroke("a", {
          stroke: "first_serve",
          hitter: "p1",
          result: "in",
          videoTime: 1,
        }),
        stroke("b", {
          stroke: "first_serve",
          hitter: "p2",
          result: "in",
          videoTime: 9,
        }),
      ]),
    ).toEqual([{ shotId: "b", patch: { stroke: "second_serve" } }]);
    // A return between them: the serve was played on.
    expect(
      combineServeRetypes([
        stroke("a", {
          stroke: "first_serve",
          hitter: "p1",
          result: "in",
          videoTime: 1,
        }),
        stroke("r", {
          stroke: "backhand",
          hitter: "p2",
          result: "in",
          videoTime: 2,
        }),
        stroke("b", {
          stroke: "first_serve",
          hitter: "p1",
          result: "in",
          videoTime: 9,
        }),
      ]),
    ).toEqual([{ shotId: "b", patch: { stroke: "second_serve" } }]);
    // Already a let: left alone, and not one of the two.
    expect(
      combineServeRetypes([
        stroke("a", {
          stroke: "first_serve",
          hitter: "p1",
          result: "let",
          videoTime: 1,
        }),
        stroke("b", {
          stroke: "first_serve",
          hitter: "p1",
          result: "in",
          videoTime: 9,
        }),
      ]),
    ).toEqual([]);
    // A deleted serve between is not a stroke of the rally.
    expect(
      combineServeRetypes([
        stroke("a", {
          stroke: "first_serve",
          hitter: "p1",
          result: "in",
          videoTime: 1,
        }),
        stroke("x", {
          stroke: "backhand",
          hitter: "p2",
          videoTime: 2,
          status: "deleted",
        }),
        stroke("b", {
          stroke: "first_serve",
          hitter: "p1",
          result: "in",
          videoTime: 9,
        }),
      ]),
    ).toEqual([{ shotId: "a", patch: { result: "let" } }]);
  });

  test("the combined rows no longer raise Serve after a serve in play", () => {
    const P = "p-0001";
    const rows = [
      labelShot("let", P, {
        stroke: "first_serve",
        hitter: "p1",
        result: "in",
        videoTime: 1,
      }),
      labelShot("replay", P, {
        stroke: "first_serve",
        hitter: "p1",
        result: "in",
        videoTime: 9,
      }),
    ];
    expect(serveAfterServeIn({ shots: rows }, true)).not.toBeNull();
    const [retype] = combineServeRetypes(rows);
    const after = rows.map((s) =>
      s.id === retype.shotId ? applyLabelShotPatch(s, retype.patch) : s,
    );
    expect(after[0]).toMatchObject({ result: "let", status: "edited" });
    expect(serveAfterServeIn({ shots: after }, true)).toBeNull();
  });
});

// ── The console's rows ─────────────────────────────────────────────────────

test.describe("combineRetypeError: a let only on a serve", () => {
  const LET = "Only a serve can be a let.";

  test("refuses a crafted retype that would leave a let on a stroke that is not a serve", () => {
    // A let set on a forehand.
    expect(
      combineRetypeError(
        [{ shotId: "f", patch: { result: "let" } }],
        [{ id: "f", stroke: "forehand", result: "in" }],
      ),
    ).toBe(LET);
    // A let on a row with no stroke.
    expect(
      combineRetypeError(
        [{ shotId: "n", patch: { result: "let" } }],
        [{ id: "n", stroke: null, result: "in" }],
      ),
    ).toBe(LET);
    // A stroke-only retype leaves the stored let judged by the new stroke:
    // a serve, so it stands.
    expect(
      combineRetypeError(
        [{ shotId: "s", patch: { stroke: "second_serve" } }],
        [{ id: "s", stroke: "first_serve", result: "let" }],
      ),
    ).toBeNull();
  });

  test("passes every retype combineServeRetypes plans: the let, then first and second", () => {
    const shots = [
      {
        id: "let",
        stroke: "first_serve" as const,
        hitter: "p1" as const,
        result: "in" as const,
        videoTime: 1,
        eventId: null,
        status: "kept" as const,
      },
      {
        id: "fault",
        stroke: "first_serve" as const,
        hitter: "p1" as const,
        result: "out" as const,
        videoTime: 9,
        eventId: null,
        status: "kept" as const,
      },
      {
        id: "second",
        stroke: "first_serve" as const,
        hitter: "p1" as const,
        result: "in" as const,
        videoTime: 14,
        eventId: null,
        status: "kept" as const,
      },
    ];
    const retyped = combineServeRetypes(shots);
    expect(retyped).toEqual([
      { shotId: "let", patch: { result: "let" } },
      { shotId: "second", patch: { stroke: "second_serve" } },
    ]);
    expect(combineRetypeError(retyped, shots)).toBeNull();
  });
});

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
    // Statuses travel untouched, but for a retyped serve: the moved ace is
    // the second serve now, an edit off its seed.
    expect(kept.shots.map((s) => [s.stroke, s.status])).toEqual([
      ["first_serve", "kept"],
      ["backhand", "edited"],
      ["forehand", "deleted"],
      ["forehand", "added"],
      ["second_serve", "edited"],
    ]);
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
      retyped: [
        {
          id: "s-ace",
          stroke: "second_serve",
          result: "in",
          status: "edited",
        },
      ],
    });
    expect(settled).toEqual(after);
    // The server's word on a retype wins over the optimistic one.
    const kept = settlePointCombine(after, {
      kept: { id: P1, ...planned().kept },
      removed: { id: P2, ...planned().removed },
      retyped: [
        { id: "s-ace", stroke: "second_serve", result: "in", status: "kept" },
      ],
    })[0];
    expect(kept.shots.find((s) => s.id === "s-ace")?.status).toBe("kept");
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

/**
 * The combine's own reads, plus what the kept point's ending is then derived
 * from: `endingShots` (the console's full shot rows; none unless given) and
 * the kept row as the reconcile reads it back — the kept write's values over
 * `endingPoint`, taking each later update too.
 */
function fakeClient(rows: {
  session?: Record<string, unknown> | null;
  point?: Record<string, unknown> | null;
  points?: Record<string, unknown>[];
  shots?: Record<string, unknown>[];
  endingShots?: Record<string, unknown>[];
  endingPoint?: Record<string, unknown>;
  /** The compare-and-set matched nothing — another tab got there first. */
  raced?: boolean;
  /** Only this point's compare-and-set matched nothing. */
  racedId?: string;
}) {
  let kept: Record<string, unknown> = {
    updated_at: "2026-10-01T10:00:00+00:00",
    status: "edited",
    seed: null,
    set_number: 1,
    game_number: 1,
    server: "p1",
    serve_side: null,
    winner: null,
    ending: null,
    ended_by: null,
    ...rows.endingPoint,
  };
  return fakeLabelClient((call) => {
    if (call.op === "update") {
      // The kept point's write (never the tombstone's, which carries
      // `status_before_delete`) is what the reconcile reads back.
      if (
        call.table === "label_points" &&
        !("status_before_delete" in (call.values ?? {}))
      ) {
        kept = { ...kept, ...call.values };
      }
      const raced =
        "status" in call.filters &&
        (rows.raced || call.filters.id === rows.racedId);
      return raced ? { data: [], error: null } : undefined;
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
        return { data: { id: call.filters.id, ...kept }, error: null };
      }
      return {
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
    if (call.table === "label_shots") {
      // Both points' rows, read for the move and the serve retype (or a
      // restore's ids); then the kept point's alone, for its ending.
      return call.in?.label_point_id || call.columns === "id"
        ? {
            data: rows.shots ?? [labelShotRow(SHOT(1), UUID(2))],
            error: null,
          }
        : { data: rows.endingShots ?? [], error: null };
    }
    return undefined;
  });
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
      retyped: [],
    });
    expect(fake.calls.map((c) => [c.table, c.op])).toEqual([
      ["label_points", "select"],
      ["label_sessions", "select"],
      ["label_points", "select"],
      ["label_shots", "select"],
      ["label_shots", "update"],
      ["label_points", "update"],
      ["label_points", "update"],
      // The kept point's joined rows and its row, read for the ending they
      // derive: with no rows to read here, nothing is written.
      ["label_shots", "select"],
      ["label_points", "select"],
    ]);
    // Both points' shots are read; then the kept point's.
    expect(fake.calls[3].in).toEqual({ label_point_id: [UUID(1), UUID(2)] });
    expect(fake.calls[7].filters).toEqual({ label_point_id: UUID(1) });
    const [move, kept, removed] = writes(fake);
    expect(move).toEqual({
      table: "label_shots",
      op: "update",
      values: { label_point_id: UUID(1) },
      filters: {},
      in: { id: [SHOT(1)] },
    });
    // Compare-and-set on the status the kept point was read with.
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
      filters: { id: UUID(1), status: "edited" },
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

  test("the kept point's ending follows its joined rows where the later point's did not say so; its status stays as combined", async () => {
    // The later point handed over "ace by Lee", but the rows joined now end
    // on Vargas's return out, right after the serve: Lee's service winner.
    const fake = fakeClient({
      endingShots: [
        labelShotRow(SHOT(1), UUID(1), {
          stroke: "first_serve",
          video_time: 1,
        }),
        labelShotRow(SHOT(2), UUID(1), {
          hitter: "p2",
          stroke: "backhand",
          result: "out",
          video_time: 2,
        }),
      ],
    });
    const result = await writeLabelPointCombine({
      supabase: fake.supabase,
      pointId: UUID(2),
      direction: "above",
    });
    expect(result).toMatchObject({
      ok: true,
      kept: {
        id: UUID(1),
        winner: "p1",
        ending: "service_winner",
        ended_by: "p2",
        status: "edited",
      },
    });
    const ending = writes(fake).at(-1);
    expect(ending).toEqual({
      table: "label_points",
      op: "update",
      values: { ending: "service_winner", ended_by: "p2", status: "edited" },
      filters: { id: UUID(1), updated_at: "2026-10-01T10:00:00+00:00" },
    });
  });

  test("two serves joined: each retyped serve is written compare-and-set with its status, before the ending is read", async () => {
    const fake = fakeClient({
      shots: [
        labelShotRow(SHOT(1), UUID(1), {
          stroke: "first_serve",
          result: "out",
          video_time: 1,
        }),
        // Seeded a first serve: relabelled, it is an edit off its seed.
        labelShotRow(SHOT(2), UUID(2), {
          stroke: "first_serve",
          video_time: 5,
        }),
        labelShotRow(SHOT(3), UUID(2), {
          hitter: "p2",
          stroke: "forehand",
          video_time: 6,
        }),
      ],
    });
    const result = await writeLabelPointCombine({
      supabase: fake.supabase,
      pointId: UUID(2),
      direction: "above",
    });
    expect(result).toMatchObject({
      ok: true,
      retyped: [
        {
          id: SHOT(2),
          stroke: "second_serve",
          result: "in",
          status: "edited",
        },
      ],
    });
    expect(fake.calls.map((c) => [c.table, c.op]).slice(4)).toEqual([
      ["label_shots", "update"],
      ["label_points", "update"],
      ["label_points", "update"],
      ["label_shots", "update"],
      ["label_shots", "select"],
      ["label_points", "select"],
    ]);
    const [move, , , retype] = writes(fake);
    expect(move.in).toEqual({ id: [SHOT(2), SHOT(3)] });
    expect(retype).toEqual({
      table: "label_shots",
      op: "update",
      values: { stroke: "second_serve", status: "edited" },
      filters: { id: SHOT(2), status: "kept" },
    });

    // The retype raced: reported, and the ending is not read.
    const raced = fakeClient({
      racedId: SHOT(2),
      shots: [
        labelShotRow(SHOT(1), UUID(1), {
          stroke: "first_serve",
          result: "net",
          video_time: 1,
        }),
        labelShotRow(SHOT(2), UUID(2), {
          stroke: "first_serve",
          video_time: 5,
        }),
      ],
    });
    expect(
      await writeLabelPointCombine({
        supabase: raced.supabase,
        pointId: UUID(2),
        direction: "above",
      }),
    ).toEqual({ error: "This row changed in another tab. Reload to see it." });
    expect(raced.calls.at(-1)).toMatchObject({
      table: "label_shots",
      op: "update",
    });
  });

  test("a replayed serve joined: the serve called in is written a let, compare-and-set, and answered with its result", async () => {
    const fake = fakeClient({
      shots: [
        labelShotRow(SHOT(1), UUID(1), {
          stroke: "first_serve",
          video_time: 1,
        }),
        labelShotRow(SHOT(2), UUID(2), {
          stroke: "first_serve",
          video_time: 5,
        }),
      ],
    });
    const result = await writeLabelPointCombine({
      supabase: fake.supabase,
      pointId: UUID(2),
      direction: "above",
    });
    expect(result).toMatchObject({
      ok: true,
      retyped: [
        { id: SHOT(1), stroke: "first_serve", result: "let", status: "edited" },
      ],
    });
    expect(writes(fake)[3]).toEqual({
      table: "label_shots",
      op: "update",
      values: { result: "let", status: "edited" },
      filters: { id: SHOT(1), status: "kept" },
    });
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
    const raced = fakeClient({ racedId: UUID(2) });
    expect(
      await writeLabelPointCombine({
        supabase: raced.supabase,
        pointId: UUID(2),
        direction: "above",
      }),
    ).toEqual({ error: "This row changed in another tab. Reload to see it." });
  });

  test("a race on the kept point is reported too: the shots already moved stand, the later point is not tombstoned and no ending is read", async () => {
    const raced = fakeClient({ racedId: UUID(1) });
    expect(
      await writeLabelPointCombine({
        supabase: raced.supabase,
        pointId: UUID(2),
        direction: "above",
      }),
    ).toEqual({ error: "This row changed in another tab. Reload to see it." });
    expect(raced.calls.map((c) => [c.table, c.op]).slice(4)).toEqual([
      ["label_shots", "update"],
      ["label_points", "update"],
    ]);
    expect(writes(raced).at(-1)?.filters).toEqual({
      id: UUID(1),
      status: "edited",
    });
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
  // The kept point's well holds the moved ace as its fifth stroke, the
  // second serve now.
  expect(black).toContain('aria-label="Shot 4 stroke: Second serve"');
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
