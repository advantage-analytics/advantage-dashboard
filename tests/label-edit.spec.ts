import { expect, test } from "@playwright/test";

import {
  LABEL_POINT_EDIT_FIELDS,
  LABEL_SHOT_EDIT_FIELDS,
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

/**
 * T6's autosave writes: the allowlist and vocabularies every patch is held
 * to, the `edited` rule, and the admin-gated service behind the
 * `updateLabelShot` / `updateLabelPoint` server actions.
 */

const SHOT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const POINT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SESSION_ID = "11111111-1111-4111-8111-111111111111";

const SEEDED: LabelShotValues = {
  hitter: "p2",
  stroke: "backhand",
  result: "in",
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
    "event_id",
    "vendor",
    "session_id",
    "label_point_id",
    "delete_reason",
    "id",
  ]) {
    test(`a shot patch reaching "${key}" is rejected whole`, () => {
      const result = parseLabelShotPatch({ result: "out", [key]: "x" });
      expect(result).toHaveProperty("error");
      expect((result as { error: string }).error).toContain(key);
    });
  }

  for (const key of [
    "status",
    "server",
    "checked_at",
    "point_index",
    "vendor_rally_ids",
  ]) {
    test(`a point patch reaching "${key}" is rejected whole`, () => {
      expect(parseLabelPointPatch({ winner: "p1", [key]: 1 })).toHaveProperty(
        "error",
      );
    });
  }

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
  });

  test("a kept shot stays kept when the patch says what the seed said", () => {
    expect(labelShotStatusAfterPatch(kept, { result: "in" })).toBe("kept");
    expect(labelShotStatusAfterPatch(kept, { hitter: "p2" })).toBe("kept");
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
    // Set back within tolerance counts as set back.
    const moved = {
      ...SEEDED,
      contact_x: 3,
      contact_y: 20,
      status: "edited" as const,
      seed: SEEDED,
    };
    expect(
      labelShotStatusAfterPatch(moved, { contact_x: 1.805, contact_y: 24.495 }),
    ).toBe("kept");
    // A kept shot whose unrelated field changes goes edited, then back.
    const once = applyLabelShotPatch(
      POINT_1_SHOTS.find((s) => s.id === "s-serve")!,
      { video_time: 2480 },
    );
    expect(once.status).toBe("edited");
    expect(applyLabelShotPatch(once, { video_time: 2472.0 }).status).toBe(
      "kept",
    );
  });

  test("the fixture's edited return goes kept only when every field is back", () => {
    const edited = POINT_1_SHOTS.find((s) => s.id === "s-return")!;
    expect(edited.status).toBe("edited");
    // The seed has a forehand at x 2.1; one field back is not enough.
    const half = applyLabelShotPatch(edited, { stroke: "forehand" });
    expect(half.status).toBe("edited");
    const whole = applyLabelShotPatch(half, {
      contact_x: 2.1,
      contact_y: 24.49,
    });
    expect(whole).toMatchObject({ status: "kept", stroke: "forehand" });
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

  test("without a seed, unchanged moves only on a changed value", () => {
    const unchanged = { ...point, status: "unchanged" as const, seed: null };
    expect(labelPointStatusAfterPatch(unchanged, { winner: "p2" })).toBe(
      "edited",
    );
    expect(labelPointStatusAfterPatch(unchanged, { serve_side: "ad" })).toBe(
      "edited",
    );
    expect(labelPointStatusAfterPatch(unchanged, { winner: "p1" })).toBe(
      "unchanged",
    );
    expect(labelPointStatusAfterPatch(unchanged, { note: "let" })).toBe(
      "unchanged",
    );
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
});

// ── The service, over a fake client ────────────────────────────────────────

interface Call {
  table: string;
  op: "select" | "update";
  values?: Record<string, unknown>;
  filters: Record<string, unknown>;
}

function fakeClient(rows: {
  shot?: Record<string, unknown> | null;
  point?: Record<string, unknown> | null;
  sessionStatus?: string;
  failWrite?: boolean;
}) {
  const calls: Call[] = [];
  const client = {
    from(table: string) {
      const call: Call = { table, op: "select", filters: {} };
      calls.push(call);
      const answer = () => {
        if (call.op === "update") {
          return rows.failWrite
            ? { data: null, error: { message: "write refused" } }
            : { data: null, error: null };
        }
        if (table === "label_shots") return { data: rows.shot, error: null };
        if (table === "label_points") return { data: rows.point, error: null };
        if (table === "label_sessions") {
          return {
            data: { status: rows.sessionStatus ?? "labelling" },
            error: null,
          };
        }
        return { data: null, error: { message: `unexpected ${table}` } };
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

const shotRow = (fields: Record<string, unknown> = {}) => ({
  id: SHOT_ID,
  session_id: SESSION_ID,
  ...kept,
  ...fields,
});
const pointRow = (fields: Record<string, unknown> = {}) => ({
  id: POINT_ID,
  session_id: SESSION_ID,
  winner: "p1",
  ending: "winner",
  ended_by: "p1",
  serve_side: "deuce",
  status: "unchanged",
  ...fields,
});

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
        filters: { id: SHOT_ID },
      },
    ]);
    expect(fake.calls.every((c) => c.table.startsWith("label_"))).toBe(true);
  });

  test("a no-op patch on a kept shot writes kept", async () => {
    const fake = fakeClient({ shot: shotRow() });
    const result = await writeLabelShotEdit({
      supabase: fake.supabase,
      shotId: SHOT_ID,
      patch: { result: "in" },
    });
    expect(result).toEqual({ ok: true, status: "kept" });
  });

  test("an added shot stays added", async () => {
    const fake = fakeClient({ shot: shotRow({ status: "added" }) });
    const result = await writeLabelShotEdit({
      supabase: fake.supabase,
      shotId: SHOT_ID,
      patch: { result: "out" },
    });
    expect(result).toEqual({ ok: true, status: "added" });
    expect(fake.calls.find((c) => c.op === "update")?.values).toMatchObject({
      status: "added",
    });
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
      filters: { id: POINT_ID },
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

  test("an added point stays added", async () => {
    const fake = fakeClient({ point: pointRow({ status: "added" }) });
    expect(
      await writeLabelPointEdit({
        supabase: fake.supabase,
        pointId: POINT_ID,
        patch: { winner: "p2" },
      }),
    ).toEqual({ ok: true, status: "added" });
  });
});
