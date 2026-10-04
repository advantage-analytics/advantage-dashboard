import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import {
  analyzeResults,
  buildTranscript,
  DERIVATION_VERSION,
  type MatchScore,
  type RawSplitStepStroke,
} from "@/lib/services/splitstep/derivation";
import {
  buildLabelSeed,
  endedBy,
  labelEnding,
  labelShotResult,
  labelSpin,
  labelStroke,
} from "@/lib/services/labels/seed";
import { LABEL_SPINS } from "@/lib/services/labels/session";
import {
  seedLabelSession,
  seedLabelSessionForJob,
} from "@/lib/services/labels/seed-session";
import type { AdminClient } from "@/lib/supabase/admin";

/**
 * The hand-labelling seed: one label row per derived point and shot, each shot
 * carrying the raw vendor stroke it came from, joined on `event_id`.
 */

const clean = JSON.parse(
  readFileSync(
    path.join(__dirname, "fixtures", "splitstep", "clean-match.json"),
    "utf8",
  ),
) as RawSplitStepStroke[];

const analysis = analyzeResults(clean, { startTimeSeconds: 0 });

/** The fixture's own folded score, so the transcript reconciles. */
const SCORE: MatchScore = (() => {
  const probe = buildTranscript({
    rallies: analysis.rallies,
    labels: analysis.players,
    score: { player1: [], player2: [] },
    initialTopIsPlayer1: null,
  });
  const [p1, p2] = analysis.players;
  const sets = probe.reconciliation.foldedSets;
  return {
    player1: sets.map((s) => s[p1] ?? 0),
    player2: sets.map((s) => s[p2] ?? 0),
  };
})();

const transcript = buildTranscript({
  rallies: analysis.rallies,
  labels: analysis.players,
  score: SCORE,
  initialTopIsPlayer1: null,
});

const seed = buildLabelSeed(transcript, clean);
const rawById = new Map(clean.map((r) => [r.event_id, r]));
const side = (isPlayer1: boolean) => (isPlayer1 ? "p1" : "p2");

test.describe("buildLabelSeed", () => {
  test("the fixture builds a transcript to seed from", () => {
    expect(transcript.ok).toBe(true);
    expect(transcript.points.length).toBeGreaterThan(50);
  });

  test("one label point per transcript point, carrying its rally id", () => {
    expect(seed.points).toHaveLength(transcript.points.length);
    seed.points.forEach((point, i) => {
      const derived = transcript.points[i];
      expect(point.point_index).toBe(i);
      expect(point.vendor_rally_ids).toEqual([derived.rally_id]);
      expect(point.set_number).toBe(derived.set_number);
      expect(point.game_number).toBe(derived.game_number);
      expect(point.server).toBe(side(derived.server_is_player1));
      expect(point.status).toBe("unchanged");
    });
  });

  test("one label shot per vendor stroke in a seeded rally, keyed by unique event ids", () => {
    const labelIds = seed.points.flatMap((p) => p.shots.map((s) => s.event_id));
    expect(new Set(labelIds).size).toBe(labelIds.length);
    // Every stroke of every rally the transcript turned into a point — the
    // ones the derivation kept and the phantoms it removed alike.
    const rallyIds = new Set(transcript.points.map((p) => p.rally_id));
    const vendorIds = analysis.rallies
      .filter((r) => rallyIds.has(r.rallyId))
      .flatMap((r) => r.strokes.map((s) => s.eventId));
    expect([...labelIds].sort((a, b) => a - b)).toEqual(
      [...vendorIds].sort((a, b) => a - b),
    );
    // Per point, too: a stroke never moves to another point.
    const rallyById = new Map(analysis.rallies.map((r) => [r.rallyId, r]));
    seed.points.forEach((point, i) => {
      const rally = rallyById.get(transcript.points[i].rally_id)!;
      expect(point.shots.map((s) => s.event_id).sort()).toEqual(
        rally.strokes.map((s) => s.eventId).sort(),
      );
    });
  });

  test("strokes the derivation removed are seeded as plain rows with no result", () => {
    const derivedIds = new Set(
      transcript.points.flatMap((p) => p.shots.map((s) => s.event_id)),
    );
    const strokeById = new Map(
      analysis.rallies.flatMap((r) => r.strokes.map((s) => [s.eventId, s])),
    );
    const [p1] = analysis.players;
    const added = seed.points.flatMap((p) =>
      p.shots.filter((s) => !derivedIds.has(s.event_id)),
    );
    expect(added.length).toBeGreaterThan(0);
    for (const shot of added) {
      const stroke = strokeById.get(shot.event_id)!;
      expect(stroke.strokeType).not.toBe("serve");
      expect(shot.status).toBe("kept");
      expect(shot.result).toBeNull();
      expect(shot.landing_x).toBeNull();
      expect(shot.landing_y).toBeNull();
      expect(shot.video_time).toBe(stroke.videoTime);
      // A dropped stroke still has a vendor spin, and it is seeded.
      expect(shot.spin).toBe(labelSpin(stroke.spinType));
      expect(shot.vendor).toEqual(rawById.get(shot.event_id));
      const p1Hit = stroke.playerLabel === p1;
      const p1IsPlayer1 = transcript.points
        .flatMap((p) => p.shots)
        .some(
          (s) => s.is_player1 && strokeById.get(s.event_id)?.playerLabel === p1,
        );
      expect(shot.hitter).toBe(side(p1Hit === p1IsPlayer1));
    }
  });

  test("each shot freezes its raw vendor stroke verbatim and copies the derived geometry", () => {
    const derivedById = new Map(
      transcript.points.flatMap((p) => p.shots.map((s) => [s.event_id, s])),
    );
    for (const point of seed.points) {
      for (const shot of point.shots) {
        const derived = derivedById.get(shot.event_id);
        expect(shot.vendor).toEqual(rawById.get(shot.event_id));
        // A stroke the derivation removed has no derived shot to copy from.
        if (!derived) continue;
        expect(shot.vendor.event_id).toBe(shot.event_id);
        expect(shot.hitter).toBe(side(derived.is_player1));
        expect(shot.contact_x).toBe(derived.contact_x);
        expect(shot.contact_y).toBe(derived.contact_y);
        expect(shot.landing_x).toBe(derived.landing_x);
        expect(shot.landing_y).toBe(derived.landing_y);
        expect(shot.video_time).toBe(derived.video_time);
        expect(shot.result).toBe(labelShotResult(derived.result));
        expect(shot.spin).toBe(labelSpin(derived.spin_type));
        expect(shot.status).toBe("kept");
        expect(shot.unclear).toEqual([]);
      }
    }
  });

  test("spin is the vendor's spin_type, lower-cased, and only the four", () => {
    const spins = seed.points.flatMap((p) => p.shots.map((s) => s.spin));
    for (const point of seed.points) {
      for (const shot of point.shots) {
        const vendor = rawById.get(shot.event_id)!;
        expect(shot.spin).toBe(labelSpin(vendor.spin_type));
        expect(shot.spin).toBe(vendor.spin_type.toLowerCase());
        if (shot.spin !== null) expect(LABEL_SPINS).toContain(shot.spin);
      }
    }
    // Not vacuous: the fixture carries every spin the column accepts.
    expect(new Set(spins)).toEqual(new Set(LABEL_SPINS));
  });

  test("every row freezes its own values as its seed", () => {
    for (const point of seed.points) {
      expect(point.seed).toEqual({
        set_number: point.set_number,
        game_number: point.game_number,
        server: point.server,
        serve_side: null,
        winner: point.winner,
        ending: point.ending,
        ended_by: point.ended_by,
      });
      // serve_side is a seed key only, never a seeded column.
      expect("serve_side" in point).toBe(false);
      // game_type is the opposite: a seeded column that is never a seed key.
      expect(point.game_type).toBe("game");
      for (const shot of point.shots) {
        expect(shot.seed).toEqual({
          hitter: shot.hitter,
          stroke: shot.stroke,
          result: shot.result,
          spin: shot.spin,
          contact_x: shot.contact_x,
          contact_y: shot.contact_y,
          landing_x: shot.landing_x,
          landing_y: shot.landing_y,
          video_time: shot.video_time,
        });
        // A copy, not the row: nothing that edits one reaches the other.
        expect(shot.seed).not.toBe(shot);
      }
    }
  });

  test("shots are in video order within a point", () => {
    for (const point of seed.points) {
      const times = point.shots.map((s) => s.video_time ?? Infinity);
      expect(times).toEqual([...times].sort((a, b) => a - b));
    }
  });

  test("every shot type the fixture produces maps to a stroke", () => {
    const strokes = seed.points.flatMap((p) => p.shots.map((s) => s.stroke));
    expect(strokes).not.toContain(null);
    expect(new Set(strokes)).toEqual(
      new Set([
        "first_serve",
        "second_serve",
        "forehand",
        "backhand",
        "forehand_volley",
        "backhand_volley",
        "overhead",
      ]),
    );
  });

  test("winner, ending and ended_by are prefilled from the derivation", () => {
    const settled = new Map(
      transcript.reconciliation.settledWinners.map((w) => [
        w.rallyId,
        w.winner,
      ]),
    );
    seed.points.forEach((point, i) => {
      const derived = transcript.points[i];
      expect(point.winner).toBe(
        settled.get(derived.rally_id) ? side(derived.won_by_player1) : null,
      );
      expect(point.ending).toBe(labelEnding(derived.result_type));
      expect(point.ended_by).toBe(endedBy(point.shots.map(toDerivedLike)));
    });
    // Not vacuous: the fixture resolves winners and endings for most points.
    const filled = seed.points.filter(
      (p) => p.winner && p.ending && p.ended_by,
    );
    expect(filled.length).toBeGreaterThan(seed.points.length * 0.8);
  });

  test("a point ended by a rally stroke names the last hitter", () => {
    for (const point of seed.points) {
      if (point.ending !== "winner" && point.ending !== "error") continue;
      const last = point.shots[point.shots.length - 1];
      expect(point.ended_by).toBe(last.hitter);
      // A winner is struck by the point winner; an error by the loser.
      if (point.ending === "winner") expect(point.ended_by).toBe(point.winner);
      else expect(point.ended_by).not.toBe(point.winner);
    }
  });

  test("a transcript shot with no raw stroke is refused", () => {
    const missing = transcript.points[0].shots[0].event_id;
    expect(() =>
      buildLabelSeed(
        transcript,
        clean.filter((r) => r.event_id !== missing),
      ),
    ).toThrow(String(missing));
  });
});

function toDerivedLike(shot: { hitter: string; result: string | null }) {
  return { is_player1: shot.hitter === "p1", result: shot.result };
}

test.describe("label vocabulary", () => {
  test("result_type maps to an ending", () => {
    expect(labelEnding(null)).toBeNull();
    expect(labelEnding("Service Winner")).toBe("service_winner");
    expect(labelEnding("Ace")).toBe("ace");
    expect(labelEnding("Double Fault")).toBe("double_fault");
    for (const w of [
      "Winner",
      "Forehand Winner",
      "Backhand Winner",
      "Overhead Winner",
    ]) {
      expect(labelEnding(w)).toBe("winner");
    }
    for (const e of [
      "Unforced Error",
      "Forehand Unforced Error",
      "Backhand Unforced Error",
      "Overhead Unforced Error",
      "Forehand Forced Error",
    ]) {
      expect(labelEnding(e)).toBe("error");
    }
    expect(labelEnding("Something Else")).toBeNull();
  });

  test("shot_type maps to a stroke, volleys by the vendor's side", () => {
    expect(labelStroke("First Serve", "overhead")).toBe("first_serve");
    expect(labelStroke("Second Serve", "overhead")).toBe("second_serve");
    expect(labelStroke("Forehand", "forehand")).toBe("forehand");
    expect(labelStroke("Backhand", "backhand")).toBe("backhand");
    expect(labelStroke("Overhead", "overhead")).toBe("overhead");
    expect(labelStroke("Volley", "forehand")).toBe("forehand_volley");
    expect(labelStroke("Volley", " Backhand ")).toBe("backhand_volley");
    expect(labelStroke("Volley", "overhead")).toBe("overhead");
    expect(labelStroke("Volley", "None")).toBeNull();
    expect(labelStroke(null, "forehand")).toBeNull();
  });

  test("shot result maps to lower case", () => {
    expect(labelShotResult("In")).toBe("in");
    expect(labelShotResult("Out")).toBe("out");
    expect(labelShotResult("Net")).toBe("net");
    expect(labelShotResult(null)).toBeNull();
  });

  test("spin_type maps to the four spins, lower-cased, else null", () => {
    expect(labelSpin("topspin")).toBe("topspin");
    expect(labelSpin("Flat")).toBe("flat");
    expect(labelSpin(" BACKSPIN ")).toBe("backspin");
    expect(labelSpin("sidespin")).toBe("sidespin");
    // The vendor's "None", and anything it has not said yet, is no spin —
    // copied as is, never guessed.
    expect(labelSpin("None")).toBeNull();
    expect(labelSpin("slice")).toBeNull();
    expect(labelSpin("")).toBeNull();
    expect(labelSpin(null)).toBeNull();
    expect(labelSpin(undefined)).toBeNull();
    expect(labelSpin(3)).toBeNull();
  });

  test("ended_by skips result-less strokes and is null without any", () => {
    expect(
      endedBy([
        { is_player1: true, result: "In" },
        { is_player1: false, result: "Out" },
        { is_player1: true, result: null },
      ]),
    ).toBe("p2");
    expect(
      endedBy([
        { is_player1: true, result: null },
        { is_player1: false, result: null },
      ]),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Orchestration, against a recording stand-in for the service-role client.
// ---------------------------------------------------------------------------

const JOB_ID = "d3bff342-b33a-417a-a332-b5a3192f3f4d";
const ADMIN_ID = "00000000-0000-4000-8000-000000000009";
const JOB = {
  id: JOB_ID,
  match_id: "1415029e-0000-4000-8000-000000000000",
  results_object_key: "jobs/d3bff342/results.json",
  start_time_seconds: 0,
  initial_top_player_is_player1: null,
  ad_scoring: true,
};
const MATCH = {
  id: JOB.match_id,
  score: SCORE,
  initial_top_player_is_player1: null,
  format: { ad_scoring: true, best_of: 3 },
};

interface Write {
  table: string;
  op: "insert" | "update" | "delete" | "upsert";
  rows?: unknown;
  filters: Record<string, unknown>;
}

function fakeClient({
  openSessionId = null as string | null,
  raceSessionId = null as string | null,
  failShots = false,
} = {}) {
  const writes: Write[] = [];
  const reads: string[] = [];
  let downloads = 0;
  let sessionLookups = 0;

  const client = {
    from(table: string) {
      const state: Write & { select: boolean } = {
        table,
        op: "insert",
        filters: {},
        select: true,
      };
      let writing = false;
      const answer = () => {
        if (!writing) {
          reads.push(table);
          if (table === "processing_jobs") return { data: JOB, error: null };
          if (table === "matches") return { data: MATCH, error: null };
          if (table === "label_sessions") {
            sessionLookups += 1;
            const id = sessionLookups === 1 ? openSessionId : raceSessionId;
            return { data: id ? { id } : null, error: null };
          }
          return { data: null, error: { message: `unexpected read ${table}` } };
        }
        if (state.op !== "insert") return { data: null, error: null };
        if (table === "label_sessions") {
          if (raceSessionId) {
            return {
              data: null,
              error: { code: "23505", message: "duplicate key" },
            };
          }
          return { data: { id: "new-session" }, error: null };
        }
        if (table === "label_points") {
          const rows = state.rows as Array<{ point_index: number }>;
          // Reversed, to prove the shots map by point_index, not position.
          return {
            data: rows
              .map((r) => ({
                id: `point-${r.point_index}`,
                point_index: r.point_index,
              }))
              .reverse(),
            error: null,
          };
        }
        if (table === "label_shots" && failShots) {
          return { data: null, error: { message: "shots refused" } };
        }
        return { data: null, error: null };
      };
      const write = (op: Write["op"], rows?: unknown) => {
        writing = true;
        state.op = op;
        state.rows = rows;
        writes.push(state);
        return builder;
      };
      const builder = {
        select: () => builder,
        insert: (rows: unknown) => write("insert", rows),
        upsert: (rows: unknown) => write("upsert", rows),
        update: (rows: unknown) => write("update", rows),
        delete: () => write("delete"),
        eq: (column: string, value: unknown) => {
          state.filters[column] = value;
          return builder;
        },
        single: async () => answer(),
        maybeSingle: async () => answer(),
        then: (
          resolve: (v: unknown) => unknown,
          reject?: (e: unknown) => unknown,
        ) => Promise.resolve(answer()).then(resolve, reject),
      };
      return builder;
    },
    storage: {
      from: () => ({
        download: async () => {
          downloads += 1;
          return {
            data: { text: async () => JSON.stringify(clean) },
            error: null,
          };
        },
      }),
    },
  };

  return {
    writes,
    reads,
    downloads: () => downloads,
    supabase: client as unknown as AdminClient,
  };
}

const seedWith = (fake: ReturnType<typeof fakeClient>) =>
  seedLabelSessionForJob({
    supabase: fake.supabase,
    jobId: JOB_ID,
    labellerId: ADMIN_ID,
  });

test.describe("seedLabelSessionForJob", () => {
  test("writes a session, its points and its shots — and nothing outside label_*", async () => {
    const fake = fakeClient();
    const result = await seedWith(fake);
    expect(result).toEqual({ sessionId: "new-session", existing: false });

    expect(fake.writes.every((w) => w.table.startsWith("label_"))).toBe(true);
    expect(fake.writes.every((w) => w.op === "insert")).toBe(true);
    // Rebuilt from the stored file with current code, never from shots rows.
    expect(fake.downloads()).toBe(1);
    expect(fake.reads).not.toContain("points");
    expect(fake.reads).not.toContain("shots");

    const session = fake.writes.find((w) => w.table === "label_sessions")!
      .rows as Record<string, unknown>;
    expect(session).toMatchObject({
      job_id: JOB.id,
      match_id: JOB.match_id,
      results_object_key: JOB.results_object_key,
      derivation_version: DERIVATION_VERSION,
      labeller: ADMIN_ID,
      status: "labelling",
    });

    const points = fake.writes
      .filter((w) => w.table === "label_points")
      .flatMap((w) => w.rows as Array<Record<string, unknown>>);
    expect(points).toHaveLength(seed.points.length);
    expect(points.every((p) => p.session_id === "new-session")).toBe(true);
    expect(points.some((p) => "shots" in p)).toBe(false);

    const shots = fake.writes
      .filter((w) => w.table === "label_shots")
      .flatMap((w) => w.rows as Array<Record<string, unknown>>);
    const expected = seed.points.flatMap((p) =>
      p.shots.map((s) => [s.event_id, `point-${p.point_index}`]),
    );
    expect(shots.map((s) => [s.event_id, s.label_point_id])).toEqual(expected);
    expect(shots.every((s) => s.session_id === "new-session")).toBe(true);

    // Every inserted row carries its seed (the migration's `seed` jsonb).
    expect(points.map((p) => p.seed)).toEqual(seed.points.map((p) => p.seed));
    for (const shot of shots) {
      expect(shot.seed).toEqual({
        hitter: shot.hitter,
        stroke: shot.stroke,
        result: shot.result,
        spin: shot.spin,
        contact_x: shot.contact_x,
        contact_y: shot.contact_y,
        landing_x: shot.landing_x,
        landing_y: shot.landing_y,
        video_time: shot.video_time,
      });
      // The `spin` column is written alongside the other value columns.
      expect(shot).toHaveProperty("spin");
    }
  });

  test("an open session is returned without re-seeding", async () => {
    const fake = fakeClient({ openSessionId: "open-session" });
    const result = await seedWith(fake);
    expect(result).toEqual({ sessionId: "open-session", existing: true });
    expect(fake.writes).toEqual([]);
    expect(fake.downloads()).toBe(0);
  });

  test("losing the insert race returns the winner's session", async () => {
    const fake = fakeClient({ raceSessionId: "raced-session" });
    const result = await seedWith(fake);
    expect(result).toEqual({ sessionId: "raced-session", existing: true });
    expect(fake.writes.map((w) => w.table)).toEqual(["label_sessions"]);
  });

  test("a failed shot insert deletes the half-seeded session", async () => {
    const fake = fakeClient({ failShots: true });
    const result = await seedWith(fake);
    expect(result).toEqual({
      error: expect.stringContaining("shots refused"),
    });
    const last = fake.writes[fake.writes.length - 1];
    expect(last).toMatchObject({
      table: "label_sessions",
      op: "delete",
      filters: { id: "new-session" },
    });
    expect(fake.writes.every((w) => w.table.startsWith("label_"))).toBe(true);
  });
});

test.describe("seedLabelSession", () => {
  test("refuses without an admin session, before any client is built", async () => {
    let clients = 0;
    const result = await seedLabelSession(JOB_ID, {
      requireAdmin: async () => null,
      createAdminClient: () => {
        clients += 1;
        return fakeClient().supabase;
      },
    });
    expect(result).toEqual({ error: "Administrator access is required." });
    expect(clients).toBe(0);
  });

  test("refuses a malformed job id", async () => {
    const result = await seedLabelSession("not-a-uuid", {
      requireAdmin: async () => ({ id: ADMIN_ID }),
      createAdminClient: () => fakeClient().supabase,
    });
    expect(result).toEqual({ error: "Invalid job id." });
  });

  test("names the admin as labeller", async () => {
    const fake = fakeClient();
    const result = await seedLabelSession(JOB_ID, {
      requireAdmin: async () => ({ id: ADMIN_ID }),
      createAdminClient: () => fake.supabase,
    });
    expect(result).toEqual({ sessionId: "new-session", existing: false });
    const session = fake.writes.find((w) => w.table === "label_sessions")!
      .rows as Record<string, unknown>;
    expect(session.labeller).toBe(ADMIN_ID);
  });
});
