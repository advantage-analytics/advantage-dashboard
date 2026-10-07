import { expect, test } from "@playwright/test";

import {
  LABEL_POINT_EDIT_FIELDS,
  LABEL_POINT_SEED_FIELDS,
  LABEL_SHOT_EDIT_FIELDS,
  LABEL_SPINS,
  applyLabelShotPatch,
  labelPointStatusAfterPatch,
  labelShotStatusAfterPatch,
  parseLabelPointPatch,
  parseLabelShotPatch,
  sameShotValue,
  labelPointStatusAfterChange,
  parseLabelPointSeed,
  parseLabelShotSeed,
  type LabelPointFields,
  type LabelShotValues,
} from "@/lib/services/labels/edit";
import {
  editLabelPoint,
  editLabelShot,
  writeLabelPointEdit,
  writeLabelShotEdit,
} from "@/lib/services/labels/edit-session";
import type { AdminClient } from "@/lib/supabase/admin";
import { POINT_1_SHOTS } from "./fixtures/label-session";

const SHOT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const POINT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SESSION_ID = "11111111-1111-4111-8111-111111111111";

const SEEDED: LabelShotValues = {
  hitter: "p2",
  stroke: "backhand",
  result: "in",
  spin: "topspin",
  contact_x: 1.8,
  contact_y: 24.49,
  landing_x: -2.1,
  landing_y: 3.49,
  video_time: 2473.1,
};
const kept = { ...SEEDED, status: "kept" as const, seed: SEEDED };

test.describe("the allowlists", () => {
  test("are exactly the task's fields", () => {
    expect([...LABEL_SHOT_EDIT_FIELDS].sort()).toEqual(
      [
        "contact_x",
        "contact_y",
        "hitter",
        "landing_x",
        "landing_y",
        "result",
        "spin",
        "stroke",
        "unclear",
        "video_time",
      ].sort(),
    );
    expect([...LABEL_POINT_EDIT_FIELDS].sort()).toEqual(
      ["ended_by", "ending", "note", "serve_side", "winner"].sort(),
    );
  });

  for (const key of [
    "status",
    "id",
    // The site's removal and its restore are written by the seed, the
    // backfill and the Restore action — never by an edit.
    "site_removal",
    "site_removal_restored_at",
  ]) {
    test(`a shot patch reaching "${key}" is rejected whole`, () => {
      const result = parseLabelShotPatch({ result: "out", [key]: "x" });
      expect(result).toHaveProperty("error");
      expect((result as { error: string }).error).toContain(key);
    });
  }

  for (const key of ["status", "server"]) {
    test(`a point patch reaching "${key}" is rejected whole`, () => {
      expect(parseLabelPointPatch({ winner: "p1", [key]: 1 })).toHaveProperty(
        "error",
      );
    });
  }

  test("game_type is a game-level annotation, not a point edit or a seed field", () => {
    // Alone, and with a value the column would accept: still not a point edit.
    const alone = parseLabelPointPatch({ game_type: "tiebreak" });
    expect(alone).toHaveProperty("error");
    expect((alone as { error: string }).error).toContain("game_type");
    // The status rule never measures it, so marking a tiebreak cannot make a
    // point `edited`, and Reset cannot put it back.
    expect(LABEL_POINT_SEED_FIELDS).not.toContain("game_type");
    expect(LABEL_POINT_EDIT_FIELDS).not.toContain("game_type");
  });

  test("a patch must be a non-empty plain object", () => {
    for (const bad of [null, undefined, "x", 3, [], {}]) {
      expect(parseLabelShotPatch(bad), String(bad)).toHaveProperty("error");
      expect(parseLabelPointPatch(bad), String(bad)).toHaveProperty("error");
    }
  });
});

test.describe("shot values", () => {
  test("hold to the migration's vocabularies", () => {
    expect(parseLabelShotPatch({ hitter: "p1" })).toEqual({
      ok: true,
      patch: { hitter: "p1" },
    });
    expect(parseLabelShotPatch({ hitter: "p3" })).toHaveProperty("error");
    expect(parseLabelShotPatch({ stroke: "forehand_volley" })).toHaveProperty(
      "ok",
    );
    expect(parseLabelShotPatch({ stroke: "Forehand" })).toHaveProperty("error");
    expect(parseLabelShotPatch({ stroke: "volley" })).toHaveProperty("error");
    expect(parseLabelShotPatch({ result: "net" })).toHaveProperty("ok");
    expect(parseLabelShotPatch({ result: "In" })).toHaveProperty("error");
    expect(parseLabelShotPatch({ result: null })).toEqual({
      ok: true,
      patch: { result: null },
    });
  });

  test("spin is one of the four, lower-case, or null", () => {
    expect(LABEL_SPINS).toEqual(["topspin", "flat", "backspin", "sidespin"]);
    for (const spin of LABEL_SPINS) {
      expect(parseLabelShotPatch({ spin })).toEqual({
        ok: true,
        patch: { spin },
      });
    }
    expect(parseLabelShotPatch({ spin: null })).toEqual({
      ok: true,
      patch: { spin: null },
    });
    for (const bad of ["Topspin", "None", "slice", "kick", "", 1, true, {}]) {
      const result = parseLabelShotPatch({ spin: bad });
      expect(result, JSON.stringify(bad)).toHaveProperty("error");
      expect((result as { error: string }).error).toContain("Spin");
    }
    // Rejected whole: nothing else in the patch gets through.
    expect(parseLabelShotPatch({ result: "in", spin: "slice" })).toHaveProperty(
      "error",
    );
  });

  test("positions travel as finite pairs", () => {
    expect(parseLabelShotPatch({ contact_x: 1, contact_y: 2 })).toEqual({
      ok: true,
      patch: { contact_x: 1, contact_y: 2 },
    });
    expect(
      parseLabelShotPatch({ landing_x: null, landing_y: null }),
    ).toHaveProperty("ok");
    expect(parseLabelShotPatch({ contact_x: 1 })).toHaveProperty("error");
    expect(parseLabelShotPatch({ landing_y: 1 })).toHaveProperty("error");
    expect(
      parseLabelShotPatch({ contact_x: 1, contact_y: null }),
    ).toHaveProperty("error");
    expect(
      parseLabelShotPatch({ contact_x: Number.NaN, contact_y: 1 }),
    ).toHaveProperty("error");
    expect(
      parseLabelShotPatch({ contact_x: Infinity, contact_y: 1 }),
    ).toHaveProperty("error");
    expect(
      parseLabelShotPatch({ contact_x: "1", contact_y: 1 }),
    ).toHaveProperty("error");
  });

  test("time is a finite, non-negative number of seconds", () => {
    expect(parseLabelShotPatch({ video_time: 2473.1 })).toHaveProperty("ok");
    expect(parseLabelShotPatch({ video_time: null })).toHaveProperty("ok");
    expect(parseLabelShotPatch({ video_time: -1 })).toHaveProperty("error");
    expect(parseLabelShotPatch({ video_time: "41:13" })).toHaveProperty(
      "error",
    );
  });

  test("unclear lists known value fields, deduplicated", () => {
    expect(
      parseLabelShotPatch({ unclear: ["result", "landing_x", "result"] }),
    ).toEqual({ ok: true, patch: { unclear: ["result", "landing_x"] } });
    expect(parseLabelShotPatch({ unclear: [] })).toEqual({
      ok: true,
      patch: { unclear: [] },
    });
    expect(parseLabelShotPatch({ unclear: ["status"] })).toHaveProperty(
      "error",
    );
    expect(parseLabelShotPatch({ unclear: ["unclear"] })).toHaveProperty(
      "error",
    );
    expect(parseLabelShotPatch({ unclear: "result" })).toHaveProperty("error");
    expect(parseLabelShotPatch({ unclear: [1] })).toHaveProperty("error");
  });
});

test.describe("point values", () => {
  test("hold to the migration's vocabularies", () => {
    expect(
      parseLabelPointPatch({
        winner: "p2",
        ending: "not_a_point",
        ended_by: null,
        serve_side: "ad",
      }),
    ).toEqual({
      ok: true,
      patch: {
        winner: "p2",
        ending: "not_a_point",
        ended_by: null,
        serve_side: "ad",
      },
    });
    expect(parseLabelPointPatch({ winner: "both" })).toHaveProperty("error");
    expect(parseLabelPointPatch({ ending: "forced_error" })).toHaveProperty(
      "error",
    );
    expect(parseLabelPointPatch({ ended_by: "p0" })).toHaveProperty("error");
    expect(parseLabelPointPatch({ serve_side: "left" })).toHaveProperty(
      "error",
    );
  });

  test("a note is trimmed, and blank clears it", () => {
    expect(parseLabelPointPatch({ note: "  net cord  " })).toEqual({
      ok: true,
      patch: { note: "net cord" },
    });
    expect(parseLabelPointPatch({ note: "   " })).toEqual({
      ok: true,
      patch: { note: null },
    });
    expect(parseLabelPointPatch({ note: 3 })).toHaveProperty("error");
    expect(parseLabelPointPatch({ note: "x".repeat(2001) })).toHaveProperty(
      "error",
    );
  });
});

test.describe("labelShotStatusAfterPatch — the edited rule", () => {
  test("a kept shot becomes edited when a patched value leaves the seed", () => {
    expect(labelShotStatusAfterPatch(kept, { result: "out" })).toBe("edited");
    expect(labelShotStatusAfterPatch(kept, { hitter: "p1" })).toBe("edited");
    expect(labelShotStatusAfterPatch(kept, { stroke: "forehand" })).toBe(
      "edited",
    );
    expect(labelShotStatusAfterPatch(kept, { video_time: 2474 })).toBe(
      "edited",
    );
    expect(
      labelShotStatusAfterPatch(kept, { landing_x: -2.1, landing_y: 3.6 }),
    ).toBe("edited");
    expect(labelShotStatusAfterPatch(kept, { result: null })).toBe("edited");
    expect(labelShotStatusAfterPatch(kept, { spin: "flat" })).toBe("edited");
    expect(labelShotStatusAfterPatch(kept, { spin: null })).toBe("edited");
  });

  test("a kept shot stays kept when the patch says what the seed said", () => {
    expect(labelShotStatusAfterPatch(kept, { result: "in" })).toBe("kept");
    expect(labelShotStatusAfterPatch(kept, { hitter: "p2" })).toBe("kept");
    expect(labelShotStatusAfterPatch(kept, { spin: "topspin" })).toBe("kept");
    // Within 1 cm and half a tenth of a second.
    expect(
      labelShotStatusAfterPatch(kept, { contact_x: 1.8049, contact_y: 24.485 }),
    ).toBe("kept");
    expect(labelShotStatusAfterPatch(kept, { video_time: 2473.14 })).toBe(
      "kept",
    );
  });

  test("the tolerances are 1 cm and 0.05 s, and no wider", () => {
    expect(sameShotValue("contact_x", 1.8, 1.809)).toBe(true);
    expect(sameShotValue("contact_x", 1.8, 1.811)).toBe(false);
    expect(sameShotValue("video_time", 10, 10.049)).toBe(true);
    expect(sameShotValue("video_time", 10, 10.051)).toBe(false);
    expect(sameShotValue("contact_y", 0, null)).toBe(false);
    expect(sameShotValue("result", "in", "in")).toBe(true);
    expect(labelShotStatusAfterPatch(kept, { video_time: 2473.16 })).toBe(
      "edited",
    );
  });

  test("marking a field unclear does not change a value", () => {
    expect(labelShotStatusAfterPatch(kept, { unclear: ["result"] })).toBe(
      "kept",
    );
  });

  test("added stays added and deleted is untouched, seed or not", () => {
    for (const seed of [SEEDED, null]) {
      expect(
        labelShotStatusAfterPatch(
          { ...SEEDED, status: "added", seed },
          { result: "out" },
        ),
      ).toBe("added");
      expect(
        labelShotStatusAfterPatch(
          { ...SEEDED, status: "deleted", seed },
          { result: "in" },
        ),
      ).toBe("deleted");
    }
  });

  test("an edited shot set back to its seed is kept again", () => {
    // Edited: the result was changed to out.
    const edited = {
      ...SEEDED,
      result: "out" as const,
      status: "edited" as const,
      seed: SEEDED,
    };
    expect(labelShotStatusAfterPatch(edited, { result: "in" })).toBe("kept");
    // Still off the seed on another field: stays edited.
    expect(labelShotStatusAfterPatch(edited, { hitter: "p1" })).toBe("edited");
    // Spin follows the same rule, both ways.
    const respun = {
      ...SEEDED,
      spin: "backspin" as const,
      status: "edited" as const,
      seed: SEEDED,
    };
    expect(labelShotStatusAfterPatch(respun, { spin: "topspin" })).toBe("kept");
    expect(labelShotStatusAfterPatch(respun, { spin: "flat" })).toBe("edited");
    expect(labelShotStatusAfterPatch(respun, { result: "in" })).toBe("edited");
    // A seed with no spin key (seeded before the column) reads spin as null,
    // so clearing the spin on such a row is a revert, not an edit.
    const { spin: _unseeded, ...seedWithoutSpin } = SEEDED;
    const legacy = {
      ...SEEDED,
      spin: "flat" as const,
      status: "edited" as const,
      seed: parseLabelShotSeed(seedWithoutSpin),
    };
    expect(legacy.seed).not.toBeNull();
    expect(labelShotStatusAfterPatch(legacy, { spin: null })).toBe("kept");
    expect(labelShotStatusAfterPatch(legacy, { spin: "topspin" })).toBe(
      "edited",
    );
  });

  test("without a seed, kept goes edited and edited never comes back", () => {
    const noSeed = { ...SEEDED, status: "kept" as const, seed: null };
    expect(labelShotStatusAfterPatch(noSeed, { result: "out" })).toBe("edited");
    expect(labelShotStatusAfterPatch(noSeed, { result: "in" })).toBe("kept");
    expect(
      labelShotStatusAfterPatch(
        { ...noSeed, status: "edited" },
        { result: "in" },
      ),
    ).toBe("edited");
  });

  test("the console's optimistic apply uses the same rule", () => {
    const serve = POINT_1_SHOTS.find((s) => s.id === "s-serve")!;
    const added = POINT_1_SHOTS.find((s) => s.id === "s-added")!;
    expect(serve.status).toBe("kept");

    const moved = applyLabelShotPatch(serve, { landing_x: 0.9, landing_y: 18 });
    expect(moved).toMatchObject({
      status: "edited",
      landingX: 0.9,
      landingY: 18,
    });
    expect(applyLabelShotPatch(serve, { result: "in" }).status).toBe("kept");
    // Spin: the fixture's serve is seeded flat.
    const kicked = applyLabelShotPatch(serve, { spin: "topspin" });
    expect(kicked).toMatchObject({ status: "edited", spin: "topspin" });
    expect(applyLabelShotPatch(kicked, { spin: "flat" })).toMatchObject({
      status: "kept",
      spin: "flat",
    });
    expect(applyLabelShotPatch(added, { result: "in" })).toMatchObject({
      status: "added",
      result: "in",
    });
  });
});

test.describe("labelPointStatusAfterPatch", () => {
  const point: LabelPointFields = {
    set_number: 1,
    game_number: 3,
    server: "p1",
    serve_side: "deuce",
    winner: "p1",
    ending: "winner",
    ended_by: "p1",
  };

  test("unchanged becomes edited when a value changes", () => {
    for (const seed of [point, null]) {
      const unchanged = { ...point, status: "unchanged" as const, seed };
      expect(labelPointStatusAfterPatch(unchanged, { winner: "p2" })).toBe(
        "edited",
      );
      expect(labelPointStatusAfterPatch(unchanged, { note: "let" })).toBe(
        "unchanged",
      );
    }
  });

  test("an edited point set back to its seed is unchanged again", () => {
    const edited = {
      ...point,
      winner: "p2" as const,
      ending: "error" as const,
      status: "edited" as const,
      seed: point,
    };
    expect(labelPointStatusAfterPatch(edited, { winner: "p1" })).toBe("edited");
    expect(
      labelPointStatusAfterPatch(
        { ...edited, winner: "p1" },
        { ending: "winner" },
      ),
    ).toBe("unchanged");
    // The note never moves it, either way.
    expect(labelPointStatusAfterPatch(edited, { note: "x" })).toBe("edited");
    // Without a seed, edited stays edited.
    expect(
      labelPointStatusAfterPatch(
        { ...edited, winner: "p1", seed: null },
        { ending: "winner" },
      ),
    ).toBe("edited");
  });

  test("a set or game still away from the seed keeps it edited", () => {
    const moved = {
      ...point,
      game_number: 4,
      winner: "p2" as const,
      status: "edited" as const,
      seed: point,
    };
    expect(labelPointStatusAfterPatch(moved, { winner: "p1" })).toBe("edited");
    expect(
      labelPointStatusAfterChange(moved, { game_number: 3, winner: "p1" }),
    ).toBe("unchanged");
  });

  test("added, edited and deleted are left alone", () => {
    for (const status of ["added", "edited", "deleted"] as const) {
      expect(
        labelPointStatusAfterPatch(
          { ...point, status, seed: null },
          { winner: "p2" },
        ),
      ).toBe(status);
    }
  });
});

test.describe("the stored seed", () => {
  test("a whole, valid seed parses; anything else is no seed", () => {
    expect(parseLabelShotSeed(SEEDED)).toEqual(SEEDED);
    expect(parseLabelShotSeed({ ...SEEDED, stroke: null })).toEqual({
      ...SEEDED,
      stroke: null,
    });
    const { video_time: _dropped, ...partial } = SEEDED;
    expect(parseLabelShotSeed(partial)).toBeNull();
    expect(parseLabelShotSeed({ ...SEEDED, hitter: "p3" })).toBeNull();
    expect(parseLabelShotSeed({ ...SEEDED, contact_x: "1.8" })).toBeNull();
    expect(parseLabelShotSeed(null)).toBeNull();
    expect(parseLabelShotSeed([SEEDED])).toBeNull();
    // A spin the column would refuse is no seed; a null spin is fine.
    expect(parseLabelShotSeed({ ...SEEDED, spin: "Topspin" })).toBeNull();
    expect(parseLabelShotSeed({ ...SEEDED, spin: null })).toEqual({
      ...SEEDED,
      spin: null,
    });
  });

  test("a shot seed with no spin key parses with spin null, not as no seed", () => {
    // Every seed written before ..._label_shots_spin.sql lacks the key; the
    // migration adds it only where the vendor spin was one of the four.
    const { spin: _dropped, ...legacy } = SEEDED;
    expect(parseLabelShotSeed(legacy)).toEqual({ ...SEEDED, spin: null });

    const pointSeed = {
      set_number: 1,
      game_number: 2,
      server: "p2",
      serve_side: null,
      winner: null,
      ending: "error",
      ended_by: "p1",
    };
    expect(parseLabelPointSeed(pointSeed)).toEqual(pointSeed);
    expect(parseLabelPointSeed({ ...pointSeed, game_number: 2.5 })).toBeNull();
    expect(parseLabelPointSeed({ ...pointSeed, ending: "lucky" })).toBeNull();
    const { serve_side: _side, ...noSide } = pointSeed;
    expect(parseLabelPointSeed(noSide)).toBeNull();
  });

  test("a point seed carrying game_type has it dropped, not trusted", () => {
    const pointSeed = {
      set_number: 1,
      game_number: 13,
      server: "p1",
      serve_side: null,
      winner: "p2",
      ending: "winner",
      ended_by: "p2",
    };
    const parsed = parseLabelPointSeed({ ...pointSeed, game_type: "tiebreak" });
    expect(parsed).toEqual(pointSeed);
    expect(parsed).not.toHaveProperty("game_type");
  });
});

// ── The service, over a fake client ────────────────────────────────────────

interface Call {
  table: string;
  op: "select" | "update";
  values?: Record<string, unknown>;
  filters: Record<string, unknown>;
  /** `.not(column, "is", null)` — the column must be set. */
  notNull?: string[];
  /** `.is(column, null)` — the column must be unset. */
  isNull?: string[];
}

/**
 * A shot's row, its point's row and the point's shot rows. The point row
 * takes each successful `label_points` update, so a read after a write sees
 * what was written — the winner pick's re-read depends on it.
 */
function fakeClient(rows: {
  shot?: Record<string, unknown> | null;
  point?: Record<string, unknown> | null;
  /** Every shot row of the point; none unless given. */
  shots?: Record<string, unknown>[];
  sessionStatus?: string;
  marksEnabled?: boolean;
  failWrite?: boolean;
  /** Every write finds the row changed since it was read. */
  gone?: boolean;
}) {
  const calls: Call[] = [];
  let point = rows.point === undefined ? pointRow() : rows.point;
  const client = {
    from(table: string) {
      const call: Call = { table, op: "select", filters: {} };
      calls.push(call);
      const answer = () => {
        if (call.op === "update") {
          if (rows.failWrite) {
            return { data: null, error: { message: "write refused" } };
          }
          if (rows.gone) return { data: [], error: null };
          if (table === "label_points" && point) {
            point = { ...point, ...call.values };
          }
          return { data: [{ id: "written" }], error: null };
        }
        if (table === "label_shots") {
          return "label_point_id" in call.filters
            ? { data: rows.shots ?? [], error: null }
            : { data: rows.shot, error: null };
        }
        if (table === "label_points") return { data: point, error: null };
        if (table === "label_sessions") {
          return {
            data: {
              status: rows.sessionStatus ?? "labelling",
              marks_enabled: rows.marksEnabled ?? false,
            },
            error: null,
          };
        }
        return { data: null, error: { message: `unexpected ${table}` } };
      };
      const builder = {
        select: () => builder,
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
        not: (column: string) => {
          call.notNull = [...(call.notNull ?? []), column];
          return builder;
        },
        is: (column: string) => {
          call.isNull = [...(call.isNull ?? []), column];
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

const UPDATED_AT = "2026-10-01T10:00:00.123456+00:00";
const shotRow = (fields: Record<string, unknown> = {}) => ({
  id: SHOT_ID,
  session_id: SESSION_ID,
  label_point_id: POINT_ID,
  updated_at: UPDATED_AT,
  ...kept,
  ...fields,
});
const pointRow = (fields: Record<string, unknown> = {}) => ({
  id: POINT_ID,
  session_id: SESSION_ID,
  updated_at: UPDATED_AT,
  winner: "p1",
  ending: "winner",
  ended_by: "p1",
  serve_side: "deuce",
  status: "unchanged",
  ...fields,
});

/** The updates a fake saw, in order: table, values and the row they hit. */
const updates = (fake: ReturnType<typeof fakeClient>) =>
  fake.calls.filter((c) => c.op === "update");

test.describe("updateLabelShot (editLabelShot)", () => {
  test("returns an error and touches nothing when requireAdmin() is null", async () => {
    let built = false;
    const result = await editLabelShot(
      SHOT_ID,
      { result: "out" },
      {
        requireAdmin: async () => null,
        createAdminClient: () => {
          built = true;
          return fakeClient({}).supabase;
        },
      },
    );
    expect(result).toEqual({ error: "Administrator access is required." });
    expect(built).toBe(false);
  });

  test("rejects any other key before reading or writing", async () => {
    const fake = fakeClient({ shot: shotRow() });
    const result = await editLabelShot(
      SHOT_ID,
      { result: "out", status: "kept" },
      {
        requireAdmin: async () => ({ id: "admin" }),
        createAdminClient: () => fake.supabase,
      },
    );
    expect(result).toHaveProperty("error");
    expect(fake.calls).toEqual([]);
  });

  test("writes the patch and the edited status to label_shots only", async () => {
    const fake = fakeClient({ shot: shotRow() });
    const result = await writeLabelShotEdit({
      supabase: fake.supabase,
      shotId: SHOT_ID,
      patch: { contact_x: 2.5, contact_y: 25 },
    });
    expect(result).toEqual({ ok: true, status: "edited" });
    const writes = fake.calls.filter((c) => c.op === "update");
    expect(writes).toEqual([
      {
        table: "label_shots",
        op: "update",
        values: { contact_x: 2.5, contact_y: 25, status: "edited" },
        // Guarded on the `updated_at` the edit read.
        filters: { id: SHOT_ID, updated_at: UPDATED_AT },
      },
    ]);
    expect(fake.calls.every((c) => c.table.startsWith("label_"))).toBe(true);
  });

  test("refuses a tombstone and a complete session without writing", async () => {
    const deleted = fakeClient({ shot: shotRow({ status: "deleted" }) });
    expect(
      await writeLabelShotEdit({
        supabase: deleted.supabase,
        shotId: SHOT_ID,
        patch: { result: "out" },
      }),
    ).toHaveProperty("error");
    expect(deleted.calls.some((c) => c.op === "update")).toBe(false);

    const frozen = fakeClient({ shot: shotRow(), sessionStatus: "complete" });
    expect(
      await writeLabelShotEdit({
        supabase: frozen.supabase,
        shotId: SHOT_ID,
        patch: { result: "out" },
      }),
    ).toHaveProperty("error");
    expect(frozen.calls.some((c) => c.op === "update")).toBe(false);
  });

  test("a row that changed since it was read is re-read and retried, then reported", async () => {
    const busy = fakeClient({ shot: shotRow(), gone: true });
    expect(
      await writeLabelShotEdit({
        supabase: busy.supabase,
        shotId: SHOT_ID,
        patch: { result: "out" },
      }),
    ).toEqual({ error: "This row changed while it was saving. Try again." });
    // Three attempts, each a fresh read and a guarded write; the session and
    // the point's rows are read once.
    const shots = busy.calls.filter((c) => c.table === "label_shots");
    expect(
      shots.filter((c) => c.op === "select" && "id" in c.filters),
    ).toHaveLength(3);
    expect(
      shots.filter((c) => c.op === "select" && "label_point_id" in c.filters),
    ).toHaveLength(1);
    expect(shots.filter((c) => c.op === "update")).toHaveLength(3);
    expect(busy.calls.filter((c) => c.table === "label_sessions")).toHaveLength(
      1,
    );
  });

  test("a bad id, a missing row and a refused write are errors", async () => {
    const fake = fakeClient({ shot: null });
    expect(
      await writeLabelShotEdit({
        supabase: fake.supabase,
        shotId: "not-a-uuid",
        patch: { result: "out" },
      }),
    ).toEqual({ error: "Invalid shot id." });
    expect(
      await writeLabelShotEdit({
        supabase: fake.supabase,
        shotId: SHOT_ID,
        patch: { result: "out" },
      }),
    ).toEqual({ error: "Shot not found." });
    const refused = fakeClient({ shot: shotRow(), failWrite: true });
    const result = await writeLabelShotEdit({
      supabase: refused.supabase,
      shotId: SHOT_ID,
      patch: { result: "out" },
    });
    expect((result as { error: string }).error).toContain("write refused");
  });
});

test.describe("status against the stored seed, on the server", () => {
  test("reads the seed, and an edited shot set back writes kept", async () => {
    const fake = fakeClient({
      shot: shotRow({ status: "edited", result: "out" }),
    });
    const result = await writeLabelShotEdit({
      supabase: fake.supabase,
      shotId: SHOT_ID,
      patch: { result: "in" },
    });
    expect(result).toEqual({ ok: true, status: "kept" });
    expect(fake.calls.find((c) => c.op === "update")?.values).toEqual({
      result: "in",
      status: "kept",
    });
  });

  test("a malformed stored seed falls back to the seedless rule", async () => {
    const fake = fakeClient({
      shot: shotRow({ status: "edited", result: "out", seed: { hitter: 1 } }),
    });
    expect(
      await writeLabelShotEdit({
        supabase: fake.supabase,
        shotId: SHOT_ID,
        patch: { result: "in" },
      }),
    ).toEqual({ ok: true, status: "edited" });
  });

  test("an edited point set back to its seed writes unchanged", async () => {
    const seed = {
      set_number: 1,
      game_number: 3,
      server: "p1",
      serve_side: null,
      winner: "p1",
      ending: "winner",
      ended_by: "p1",
    };
    const fake = fakeClient({
      point: pointRow({
        ...seed,
        winner: "p2",
        status: "edited",
        seed,
      }),
    });
    expect(
      await writeLabelPointEdit({
        supabase: fake.supabase,
        pointId: POINT_ID,
        patch: { winner: "p1" },
      }),
    ).toEqual({ ok: true, status: "unchanged" });
  });
});

test.describe("updateLabelPoint (editLabelPoint)", () => {
  test("returns an error when requireAdmin() is null", async () => {
    const result = await editLabelPoint(
      POINT_ID,
      { winner: "p2" },
      {
        requireAdmin: async () => null,
        createAdminClient: () => fakeClient({}).supabase,
      },
    );
    expect(result).toEqual({ error: "Administrator access is required." });
  });

  test("rejects any other key before reading or writing", async () => {
    const fake = fakeClient({ point: pointRow() });
    const result = await editLabelPoint(
      POINT_ID,
      { winner: "p2", checked_at: "2026-09-28T00:00:00Z" },
      {
        requireAdmin: async () => ({ id: "admin" }),
        createAdminClient: () => fake.supabase,
      },
    );
    expect(result).toHaveProperty("error");
    expect(fake.calls).toEqual([]);
  });

  test("an unchanged point becomes edited; the note alone leaves it", async () => {
    const fake = fakeClient({ point: pointRow() });
    expect(
      await writeLabelPointEdit({
        supabase: fake.supabase,
        pointId: POINT_ID,
        patch: { ending: "error" },
      }),
    ).toEqual({ ok: true, status: "edited" });
    expect(fake.calls.find((c) => c.op === "update")).toEqual({
      table: "label_points",
      op: "update",
      values: { ending: "error", status: "edited" },
      filters: { id: POINT_ID, updated_at: UPDATED_AT },
    });

    const noted = fakeClient({ point: pointRow() });
    expect(
      await writeLabelPointEdit({
        supabase: noted.supabase,
        pointId: POINT_ID,
        patch: { note: "net cord on the return" },
      }),
    ).toEqual({ ok: true, status: "unchanged" });
  });
});

// ── The ending follows the shot rows, on the server ────────────────────────

const GHOST_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

/** A shot row of the point, as `readPointShots` reads it. */
const pointShot = (id: string, fields: Record<string, unknown> = {}) => ({
  id,
  label_point_id: POINT_ID,
  event_id: null,
  after_event_id: null,
  status: "kept",
  status_before_delete: null,
  delete_reason: null,
  hitter: "p1",
  stroke: "forehand",
  result: "in",
  spin: null,
  contact_x: null,
  contact_y: null,
  landing_x: null,
  landing_y: null,
  video_time: null,
  site_removal: null,
  site_removal_restored_at: null,
  seed: null,
  ...fields,
});

test.describe("a shot write settles its point's ending in the same call", () => {
  test("the last ball marked out: the point's ending and ended-by follow, compare-and-set, and come back", async () => {
    // Vargas's (p2) backhand, the point's one stroke, labelled in; the point
    // was seeded as Lee's (p1) winner. Marking the ball out makes it an error
    // by Vargas; the rows now say Lee won, which the point already holds.
    const fake = fakeClient({
      shot: shotRow(),
      shots: [pointShot(SHOT_ID, { hitter: "p2", stroke: "backhand" })],
    });
    const result = await writeLabelShotEdit({
      supabase: fake.supabase,
      shotId: SHOT_ID,
      patch: { result: "out" },
    });
    expect(result).toEqual({
      ok: true,
      status: "edited",
      point: { ending: "error", endedBy: "p2", winner: "p1", status: "edited" },
    });
    expect(updates(fake)).toEqual([
      {
        table: "label_shots",
        op: "update",
        values: { result: "out", status: "edited" },
        filters: { id: SHOT_ID, updated_at: UPDATED_AT },
      },
      {
        table: "label_points",
        op: "update",
        values: { ending: "error", ended_by: "p2", status: "edited" },
        filters: { id: POINT_ID, updated_at: UPDATED_AT },
      },
    ]);
    // The point's rows were read before the shot was written.
    const order = fake.calls.map((c) => [
      c.table,
      c.op,
      "label_point_id" in c.filters,
    ]);
    expect(
      order.findIndex(
        ([t, op, byPoint]) => t === "label_shots" && op === "select" && byPoint,
      ),
    ).toBeLessThan(
      order.findIndex(([t, op]) => t === "label_shots" && op === "update"),
    );
  });

  test("a change that leaves the rows saying the same thing writes the shot alone", async () => {
    const fake = fakeClient({
      shot: shotRow(),
      shots: [pointShot(SHOT_ID, { hitter: "p2", stroke: "backhand" })],
    });
    expect(
      await writeLabelShotEdit({
        supabase: fake.supabase,
        shotId: SHOT_ID,
        patch: { spin: "flat" },
      }),
    ).toEqual({ ok: true, status: "edited" });
    expect(updates(fake).map((w) => w.table)).toEqual(["label_shots"]);
  });

  test("the point's write is retried on a changed row, then the shot reports it saved but its point not", async () => {
    // The shot's write lands; every point write finds the row moved on.
    let pointWrites = 0;
    const fake = fakeClient({
      shot: shotRow(),
      shots: [pointShot(SHOT_ID, { hitter: "p2", stroke: "backhand" })],
    });
    const raced = {
      from(table: string) {
        const builder = fake.supabase.from(table as never) as unknown as {
          update: (values: Record<string, unknown>) => unknown;
        };
        if (table !== "label_points") return builder;
        const update = builder.update.bind(builder);
        builder.update = (values) => {
          pointWrites += 1;
          const chain = update(values) as Record<string, unknown>;
          chain.then = (resolve: (v: unknown) => unknown) =>
            Promise.resolve({ data: [], error: null }).then(resolve);
          return chain;
        };
        return builder;
      },
    } as unknown as AdminClient;
    const result = await writeLabelShotEdit({
      supabase: raced,
      shotId: SHOT_ID,
      patch: { result: "out" },
    });
    expect(pointWrites).toBe(3);
    expect(result).toEqual({
      error:
        "The point changed while its ending was saving. Try again. The shot was saved; reload to see the point as it stands.",
    });
  });

  test("a serve relabelled in puts back the swing the site removed after it, and the ending reads it", async () => {
    // Lee's first serve was called out and Vargas's swing at it removed as
    // a hit after the fault. The serve placed in: the swing was a return.
    const serve = shotRow({
      hitter: "p1",
      stroke: "first_serve",
      result: "out",
    });
    const rows = [
      pointShot(SHOT_ID, {
        hitter: "p1",
        stroke: "first_serve",
        result: "out",
        video_time: 10,
      }),
      pointShot(GHOST_ID, {
        hitter: "p2",
        stroke: "backhand",
        result: null,
        video_time: 11,
        site_removal: "hit_after_fault",
      }),
    ];
    const fake = fakeClient({ shot: serve, shots: rows, marksEnabled: true });
    const result = await writeLabelShotEdit({
      supabase: fake.supabase,
      shotId: SHOT_ID,
      patch: { landing_x: 0.5, landing_y: 17, result: "in" },
    });
    expect(result).toMatchObject({
      ok: true,
      status: "edited",
      restoredGhostId: GHOST_ID,
      // The return, with no result yet, is the last stroke: by the labelled
      // loser, so an error by Vargas.
      point: { ending: "error", endedBy: "p2", winner: "p1" },
    });
    const [shot, ghost, point] = updates(fake);
    expect(shot.table).toBe("label_shots");
    expect(ghost).toMatchObject({
      table: "label_shots",
      filters: { id: GHOST_ID },
      notNull: ["site_removal"],
      isNull: ["site_removal_restored_at"],
    });
    expect(typeof ghost.values?.site_removal_restored_at).toBe("string");
    expect(point).toMatchObject({
      table: "label_points",
      values: { ending: "error", ended_by: "p2" },
    });

    // Not on a session labelled without marks: there the swing is a stroke
    // already, and the point's rows said so before the edit.
    const blind = fakeClient({ shot: serve, shots: rows });
    const plain = await writeLabelShotEdit({
      supabase: blind.supabase,
      shotId: SHOT_ID,
      patch: { landing_x: 0.5, landing_y: 17, result: "in" },
    });
    expect(plain).not.toHaveProperty("restoredGhostId");
    expect(updates(blind).map((w) => w.table)).toEqual(["label_shots"]);

    // Nor when the serve was already in, or the next stroke is no ghost.
    const wasIn = fakeClient({
      shot: shotRow({ hitter: "p1", stroke: "first_serve", result: "in" }),
      shots: rows,
      marksEnabled: true,
    });
    await writeLabelShotEdit({
      supabase: wasIn.supabase,
      shotId: SHOT_ID,
      patch: { landing_x: 0.5, landing_y: 17, result: "in" },
    });
    expect(updates(wasIn).some((w) => w.filters.id === GHOST_ID)).toBe(false);
  });
});

test.describe("a winner pick lets the ending follow the rows", () => {
  // Lee's serve, then Vargas's backhand with no result yet: the last stroke
  // settles nothing, so the ending reads the winner.
  const rows = [
    pointShot(SHOT_ID, { stroke: "first_serve", video_time: 1 }),
    pointShot(GHOST_ID, {
      hitter: "p2",
      stroke: "backhand",
      result: null,
      video_time: 2,
    }),
  ];

  test("picked = the hitter: a winner by them; the other side: an error by the hitter", async () => {
    const vargas = fakeClient({
      point: pointRow({ winner: "p1", ending: "error", ended_by: "p2" }),
      shots: rows,
    });
    expect(
      await writeLabelPointEdit({
        supabase: vargas.supabase,
        pointId: POINT_ID,
        patch: { winner: "p2" },
      }),
    ).toEqual({
      ok: true,
      status: "edited",
      point: {
        ending: "winner",
        endedBy: "p2",
        winner: "p2",
        status: "edited",
      },
    });
    expect(updates(vargas).map((w) => w.values)).toEqual([
      { winner: "p2", status: "edited" },
      { ending: "winner", ended_by: "p2", status: "edited" },
    ]);

    const lee = fakeClient({
      point: pointRow({ winner: "p2", ending: "winner", ended_by: "p2" }),
      shots: rows,
    });
    expect(
      await writeLabelPointEdit({
        supabase: lee.supabase,
        pointId: POINT_ID,
        patch: { winner: "p1" },
      }),
    ).toMatchObject({
      ok: true,
      point: { ending: "error", endedBy: "p2", winner: "p1" },
    });
  });

  test("a pick the stored ending already agrees with writes the winner alone; any other field never re-reads the rows", async () => {
    const agreed = fakeClient({
      point: pointRow({ winner: "p1", ending: "winner", ended_by: "p2" }),
      shots: rows,
    });
    expect(
      await writeLabelPointEdit({
        supabase: agreed.supabase,
        pointId: POINT_ID,
        patch: { winner: "p2" },
      }),
    ).toEqual({ ok: true, status: "edited" });
    expect(updates(agreed)).toHaveLength(1);

    const ending = fakeClient({ point: pointRow(), shots: rows });
    await writeLabelPointEdit({
      supabase: ending.supabase,
      pointId: POINT_ID,
      patch: { ending: "error" },
    });
    expect(ending.calls.some((c) => c.table === "label_shots")).toBe(false);
  });
});
