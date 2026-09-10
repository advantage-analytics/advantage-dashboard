import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  ANON_KEY,
  HAVE_ENV,
  SUPABASE_URL,
  createAdminClient,
  createLogins,
  runMarker,
  type Session,
} from "./fixtures/live-db";

/**
 * Apply 20260910120000 only to an isolated local Supabase development stack,
 * then run with SCHEDULE_OUTCOMES_DEV_URL set to that stack's exact URL.
 * This explicit opt-in must be supplied by the operator, never inferred from
 * .env.local or the mere presence of a service-role key. All remote hosts are
 * refused before constructing any client, including an explicitly opted-in host.
 * The optional local bootstrap is a reduced schema contract, not a production
 * clone: see fixtures/schedule-outcomes-local.sql for its policy assumptions.
 *
 * npx playwright test tests/schedule-outcomes-db.spec.ts --workers=1
 * A skip is NOT proof of the live database acceptance criterion.
 */
const DEV_URL = process.env.SCHEDULE_OUTCOMES_DEV_URL;
const OPTED_IN = Boolean(DEV_URL);
if (OPTED_IN) {
  const target = new URL(DEV_URL!);
  if (
    target.protocol !== "http:" ||
    !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) ||
    target.username ||
    target.password ||
    target.search ||
    target.hash ||
    target.pathname !== "/" ||
    SUPABASE_URL !== DEV_URL
  ) {
    throw new Error(
      "Schedule outcome tests require matching, HTTP localhost URLs; remote database writes are forbidden",
    );
  }
}
const { mark, password } = runMarker("schedule-outcomes");
const TABLE = "program_event_outcomes";

type Outcome = {
  entry_id: string;
  event_id: string;
  program_id: string;
  event_kind: string;
  round: string | null;
  kind: string;
  side: string;
};

test.describe("schedule outcomes (verified development database only)", () => {
  test.describe.configure({ mode: "serial", timeout: 60_000 });
  test.skip(
    !OPTED_IN,
    "Development target not explicitly verified; no DB writes",
  );

  let admin: SupabaseClient;
  let owner: Session;
  let coach: Session;
  let staff: Session;
  let player: Session;
  let outsider: Session;
  const authUserIds: string[] = [];
  const programIds = [randomUUID(), randomUUID()];
  const eventIds = [randomUUID(), randomUUID(), randomUUID()];
  const entryIds = [randomUUID(), randomUUID(), randomUUID()];
  const historyTables = [
    "programs",
    "program_events",
    "program_event_entries",
    "matches",
    "match_stats",
    "points",
    "shots",
  ];
  const history: unknown[] = [];

  const dual = (changes: Partial<Outcome> = {}): Outcome => ({
    entry_id: entryIds[0],
    event_id: eventIds[0],
    program_id: programIds[0],
    event_kind: "dual",
    round: null,
    kind: "forfeit",
    side: "ours",
    ...changes,
  });
  const tournament = (changes: Partial<Outcome> = {}): Outcome =>
    dual({
      entry_id: entryIds[1],
      event_id: eventIds[1],
      event_kind: "tournament",
      round: "QF",
      ...changes,
    });

  test.beforeAll(async () => {
    test.setTimeout(180_000);
    // Fail (not skip) a requested live run with missing/mismatched credentials.
    expect(HAVE_ENV, "Development credentials are required").toBe(true);
    expect(
      SUPABASE_URL,
      "Credentials must target the approved development URL",
    ).toBe(DEV_URL);
    admin = createAdminClient();
    // Fail before creating fixtures if the additive migration is absent.
    const schema = await admin
      .from(TABLE)
      .select("id,actor_user_id,recorded_at")
      .limit(0);
    expect(schema.error).toBeNull();
    // Bootstrap sentinels predate migration application. Read every column;
    // afterAll compares them again after outcome mutations and fixture cleanup.
    for (const [i, table] of historyTables.entries()) {
      const row = await admin
        .from(table)
        .select("*")
        .eq("id", `00000000-0000-4000-8000-00000000000${i + 1}`)
        .single();
      expect(
        row.error,
        `Missing pre-migration ${table} sentinel; apply the local fixture first`,
      ).toBeNull();
      history.push(row.data);
    }
    expect(history[2]).toMatchObject({ forfeit: "theirs" });
    expect(history[3]).toMatchObject({
      score: {
        sets: [
          [6, 4],
          [6, 2],
        ],
      },
      insights: { sentinel: "historical analysis" },
    });

    [owner, coach, staff, player, outsider] = await createLogins(
      admin,
      ["owner", "coach", "staff", "player", "outsider"],
      { mark, password, authUserIds },
    );
    const programs = await admin.from("programs").insert(
      programIds.map((id, i) => ({
        id,
        org_type: "club",
        program_key: `${mark}-${i}`,
        school_name: `Schedule outcomes ${mark} ${i}`,
        school_group: `${mark}-${i}`,
      })),
    );
    expect(programs.error).toBeNull();
    const members = await admin.from("program_members").insert([
      ...[owner, coach, staff, player].map((session, i) => ({
        program_id: programIds[0],
        user_id: session.userId,
        role: ["owner", "coach", "staff", "player"][i],
      })),
      { program_id: programIds[1], user_id: outsider.userId, role: "owner" },
    ]);
    expect(members.error).toBeNull();
    const events = await admin.from("program_events").insert(
      eventIds.map((id, i) => ({
        id,
        program_id: programIds[i === 2 ? 1 : 0],
        kind: i === 1 ? "tournament" : "dual",
        name: `${mark}-${i}`,
        starts_on: "2026-09-10",
        ends_on: "2026-09-10",
        site: "home",
      })),
    );
    expect(events.error).toBeNull();
    const entries = await admin.from("program_event_entries").insert(
      entryIds.map((id, i) => ({
        id,
        event_id: eventIds[i],
        program_id: programIds[i === 2 ? 1 : 0],
        discipline: "singles",
        slot: i === 1 ? null : "S1",
        // Sentinel: the rollout must not rewrite the old forfeits.
        forfeit: i === 2 ? "theirs" : null,
      })),
    );
    expect(entries.error).toBeNull();
  });

  test.afterEach(async () => {
    if (!admin) return;
    const result = await admin.from(TABLE).delete().in("entry_id", entryIds);
    expect(result.error).toBeNull();
  });

  test.afterAll(async () => {
    if (!admin) return;
    // Only this run's generated UUIDs are ever deleted. Attempt every cleanup
    // even after a setup failure; unlike the shared helper, surface failures.
    const errors: string[] = [];
    for (const [table, column, ids] of [
      [TABLE, "entry_id", entryIds],
      ["program_event_entries", "id", entryIds],
      ["program_events", "id", eventIds],
      ["program_members", "program_id", programIds],
      ["programs", "id", programIds],
    ] as const) {
      const result = await admin
        .from(table)
        .delete()
        .in(column, [...ids]);
      if (result.error) errors.push(`${table}: ${result.error.message}`);
    }
    for (const id of authUserIds) {
      const result = await admin.auth.admin.deleteUser(id);
      if (result.error) errors.push(`auth fixture: ${result.error.message}`);
    }
    for (const [i, original] of history.entries()) {
      const row = await admin
        .from(historyTables[i])
        .select("*")
        .eq("id", `00000000-0000-4000-8000-00000000000${i + 1}`)
        .single();
      expect(row.error).toBeNull();
      expect(row.data, `Historical ${historyTables[i]} changed`).toEqual(
        original,
      );
    }
    expect(errors, "Fixture cleanup failed").toEqual([]);
  });

  test("every kind and side records the actual actor and database time", async () => {
    for (const session of [owner, coach, staff]) {
      for (const kind of ["forfeit", "default", "withdrawal"]) {
        for (const side of ["ours", "theirs"]) {
          const saved = await session.client
            .from(TABLE)
            .insert(dual({ kind, side }))
            .select("id,kind,side,actor_user_id,recorded_at")
            .single();
          expect(saved.error).toBeNull();
          expect(saved.data).toMatchObject({
            kind,
            side,
            actor_user_id: session.userId,
          });
          expect(Number.isFinite(Date.parse(saved.data!.recorded_at))).toBe(
            true,
          );
          const cleared = await session.client
            .from(TABLE)
            .delete()
            .eq("id", saved.data!.id)
            .select("id");
          expect(cleared.error).toBeNull();
          expect(cleared.data).toHaveLength(1);
        }
      }
    }
  });

  test("dual NULL grain is unique; tournament rounds are individually unique", async () => {
    expect((await owner.client.from(TABLE).insert(dual())).error).toBeNull();
    expect(
      (await owner.client.from(TABLE).insert(dual({ kind: "default" }))).error
        ?.code,
    ).toBe("23505");
    expect(
      (
        await owner.client
          .from(TABLE)
          .insert([
            tournament({ round: "QF" }),
            tournament({ round: "SF", side: "theirs" }),
          ])
      ).error,
    ).toBeNull();
    expect(
      (await owner.client.from(TABLE).insert(tournament())).error?.code,
    ).toBe("23505");
  });

  test("invalid kinds, sides, rounds and forged event scope fail in Postgres", async () => {
    for (const row of [
      dual({ kind: "retirement" }),
      dual({ side: "both" }),
      dual({ round: "QF" }),
      dual({ event_kind: "other" }),
      tournament({ round: null }),
      tournament({ round: "S1" }),
      tournament({ round: "" }),
      tournament({ round: "qf" }),
    ]) {
      expect((await owner.client.from(TABLE).insert(row)).error?.code).toBe(
        "23514",
      );
    }
    for (const row of [
      dual({ event_id: eventIds[1] }),
      dual({ event_kind: "tournament", round: "QF" }),
      dual({ entry_id: entryIds[2] }),
    ]) {
      expect((await owner.client.from(TABLE).insert(row)).error?.code).toBe(
        "23503",
      );
    }
  });

  test("member reads; outsiders and anonymous clients cannot read or mutate", async () => {
    const saved = await owner.client
      .from(TABLE)
      .insert(dual())
      .select("id")
      .single();
    expect(saved.error).toBeNull();
    const id = saved.data!.id;
    const visible = await player.client.from(TABLE).select("id").eq("id", id);
    expect(visible.error).toBeNull();
    expect(visible.data).toHaveLength(1);
    const hidden = await outsider.client.from(TABLE).select("id").eq("id", id);
    expect(hidden.error).toBeNull();
    expect(hidden.data).toEqual([]);
    for (const session of [player, outsider]) {
      expect(
        (await session.client.from(TABLE).insert(tournament())).error?.code,
      ).toBe("42501");
      const denied = await session.client
        .from(TABLE)
        .delete()
        .eq("id", id)
        .select("id");
      expect(denied.error).toBeNull();
      expect(denied.data).toEqual([]);
      expect(
        (
          await session.client
            .from(TABLE)
            .update({ side: "theirs" })
            .eq("id", id)
        ).error?.code,
      ).toBe("42501");
    }
    const anon = createClient(SUPABASE_URL!, ANON_KEY!, {
      auth: { persistSession: false },
    });
    expect((await anon.from(TABLE).select("id").eq("id", id)).error?.code).toBe(
      "42501",
    );
    expect((await anon.from(TABLE).insert(tournament())).error?.code).toBe(
      "42501",
    );
    expect((await anon.from(TABLE).delete().eq("id", id)).error?.code).toBe(
      "42501",
    );
    expect(
      (
        await owner.client.from(TABLE).insert(
          dual({
            entry_id: entryIds[2],
            event_id: eventIds[2],
            program_id: programIds[1],
          }),
        )
      ).error?.code,
    ).toBe("42501");
  });

  test("staff cannot forge provenance or overwrite; parent edits cannot invalidate scope", async () => {
    for (const extra of [
      { actor_user_id: outsider.userId },
      { recorded_at: "2000-01-01T00:00:00Z" },
    ]) {
      expect(
        (await owner.client.from(TABLE).insert({ ...dual(), ...extra })).error
          ?.code,
      ).toBe("42501");
    }
    const saved = await owner.client
      .from(TABLE)
      .insert(dual())
      .select("id")
      .single();
    expect(saved.error).toBeNull();
    expect(
      (
        await owner.client
          .from(TABLE)
          .update({ kind: "default" })
          .eq("id", saved.data!.id)
      ).error?.code,
    ).toBe("42501");
    expect(
      (
        await admin
          .from("program_events")
          .update({ kind: "tournament" })
          .eq("id", eventIds[0])
      ).error?.code,
    ).toBe("23503");
    expect(
      (
        await admin
          .from("program_event_entries")
          .update({ event_id: eventIds[1] })
          .eq("id", entryIds[0])
      ).error?.code,
    ).toBe("23503");
    expect(
      (
        await admin
          .from("program_event_entries")
          .update({ program_id: programIds[1] })
          .eq("id", entryIds[0])
      ).error?.code,
    ).toBe("23503");
    expect(
      (await admin.from("program_event_entries").delete().eq("id", entryIds[0]))
        .error?.code,
    ).toBe("23503");
  });

  test("outcomes create no matches and leave the legacy forfeit intact", async () => {
    expect(
      (await owner.client.from(TABLE).insert([dual(), tournament()])).error,
    ).toBeNull();
    const matches = await admin
      .from("matches")
      .select("id")
      .in("event_entry_id", entryIds);
    expect(matches.error).toBeNull();
    expect(matches.data).toEqual([]);
    const legacy = await admin
      .from("program_event_entries")
      .select("forfeit")
      .eq("id", entryIds[2])
      .single();
    expect(legacy.error).toBeNull();
    expect(legacy.data?.forfeit).toBe("theirs");
  });
});
