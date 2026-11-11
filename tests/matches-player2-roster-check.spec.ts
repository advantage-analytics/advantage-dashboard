import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";
import { type SupabaseClient } from "@supabase/supabase-js";

import {
  HAVE_ENV,
  INSUFFICIENT_PRIVILEGE,
  SKIP_REASON,
  type Session,
  createAdminClient,
  runMarker,
} from "./fixtures/live-db";
import { clearPoolLeftovers, poolLogins } from "./fixtures/live-db-pool";

/**
 * `matches.player2_id` is checked against the program roster, proven against
 * the live database (T19).
 *
 * Why it matters: the `matches` read policy lets anyone whose id is in
 * `player2_id` read the match, while the insert and update policies only test
 * `created_by = auth.uid()`. Without a check, a member could seat any id in a
 * program match's second seat and hand that person the match. The check is
 * not a policy: it is the `player2_id` arm of trigger function
 * `matches_block_client_regraft()`, the twin of its `player1_id` arm, and its
 * 42501 refusal is asserted on here as the expected outcome.
 *
 * A teammate opponent is seated by the id their own matches carry: a
 * `program_players.id` for an ordinary roster row, or the member's login id
 * (a `program_members.user_id`) for a member with no profile yet. Both must
 * pass; anything else filed under the program must not.
 *
 * Every write under test goes through a signed-in client, since the trigger
 * returns early for the service role. Fixture rows are created by the
 * service-role client under a per-run marker and deleted by id in `afterAll`.
 * Like every write spec this skips against the production project unless
 * `LIVE_DB_ALLOW_PROD=1`; the offline half of the task lives in
 * `matches-player2-roster-migration.spec.ts`. Against a target the migration
 * (`*_matches_player2_roster_check.sql`) has not been applied to, the
 * refusals below fail — that is the spec doing its job.
 *
 * Run on demand:  npx playwright test tests/matches-player2-roster-check.spec.ts
 */

/** A crashed run is findable by hand:
 *  `select * from programs where program_key like 'p2-roster-%'`. */
const { mark: MARK } = runMarker("p2-roster");

/** Pool slots, prefixed with this spec's name so no other spec draws them. */
const SLOTS = [
  "matches-player2-roster-check-owner",
  "matches-player2-roster-check-teammate",
  "matches-player2-roster-check-outsider",
];

test.describe("matches.player2_id is on the program's roster (live trigger)", () => {
  test.describe.configure({ mode: "serial", timeout: 60_000 });
  test.skip(!HAVE_ENV, SKIP_REASON);

  let admin: SupabaseClient;

  let owner: Session; // owner of program A; files every match here
  let teammate: Session; // player in A with no roster profile: seated by login id
  let outsider: Session; // signed up, in no program

  let poolUserIds: string[] = [];
  const programIds: string[] = [];

  let programA: string;
  let programB: string;
  /** A `program_players.id` of program A — the ordinary teammate seat. */
  let rosterA: string;
  let rosterA2: string;
  /** A `program_players.id` of program B — a real roster id, the wrong roster. */
  let rosterB: string;

  /** A match filed under program A by its owner, seat two as given. */
  const insertUnderA = (player2Id: string | null) =>
    owner.client
      .from("matches")
      .insert({
        created_by: owner.userId, // passes the RLS with_check on purpose —
        program_id: programA, //     a refusal must come from the trigger
        player1_id: owner.userId,
        player1_name: "P2 Roster Owner",
        player2_id: player2Id,
        player2_name: "P2 Roster Opponent",
        date: new Date().toISOString(),
      })
      .select("id, player2_id");

  const seatTwo = async (matchId: string) => {
    const row = await admin
      .from("matches")
      .select("player2_id")
      .eq("id", matchId)
      .single();
    if (row.error) throw new Error(`seatTwo: ${row.error.message}`);
    return row.data.player2_id as string | null;
  };

  test.beforeAll(async () => {
    test.setTimeout(180_000);

    admin = createAdminClient();

    // A crashed run leaves its matches behind on the reused users; sweep them
    // before signing in.
    const leftoverIds = await clearPoolLeftovers(admin, SLOTS);
    if (leftoverIds.length > 0) {
      const swept = await admin
        .from("matches")
        .delete()
        .in("created_by", leftoverIds);
      if (swept.error) throw new Error(`matches sweep: ${swept.error.message}`);
    }

    const sessions = await poolLogins(admin, SLOTS);
    [owner, teammate, outsider] = sessions;
    poolUserIds = sessions.map((s) => s.userId);

    const programs = await admin
      .from("programs")
      .insert([
        // school_group must differ: programs_group_team_key is unique on
        // (school_group, team).
        {
          program_key: `${MARK}-a`,
          school_group: `${MARK}-a`,
          school_name: `P2 Roster School A ${MARK}`,
          team: "mens",
        },
        {
          program_key: `${MARK}-b`,
          school_group: `${MARK}-b`,
          school_name: `P2 Roster School B ${MARK}`,
          team: "mens",
        },
      ])
      .select("id, program_key");
    if (programs.error) throw new Error(`programs: ${programs.error.message}`);
    programA = programs.data.find((p) => p.program_key === `${MARK}-a`)!.id;
    programB = programs.data.find((p) => p.program_key === `${MARK}-b`)!.id;
    programIds.push(programA, programB);

    const members = await admin.from("program_members").insert([
      { program_id: programA, user_id: owner.userId, role: "owner" },
      { program_id: programA, user_id: teammate.userId, role: "player" },
    ]);
    if (members.error) throw new Error(`members: ${members.error.message}`);

    const players = await admin
      .from("program_players")
      .insert([
        {
          program_id: programA,
          first_name: "Roster",
          last_name: `One ${MARK}`,
        },
        {
          program_id: programA,
          first_name: "Roster",
          last_name: `Two ${MARK}`,
        },
        {
          program_id: programB,
          first_name: "Other",
          last_name: `Team ${MARK}`,
        },
      ])
      .select("id, program_id, last_name");
    if (players.error) throw new Error(`players: ${players.error.message}`);
    const pick = (lastName: string) =>
      players.data.find((p) => p.last_name === lastName)!.id as string;
    rosterA = pick(`One ${MARK}`);
    rosterA2 = pick(`Two ${MARK}`);
    rosterB = pick(`Team ${MARK}`);
  });

  test.afterAll(async () => {
    test.setTimeout(180_000);
    if (!admin) return;

    // Matches first: created_by has no ON DELETE.
    if (poolUserIds.length > 0) {
      await admin.from("matches").delete().in("created_by", poolUserIds);
    }
    if (programIds.length > 0) {
      await admin.from("program_players").delete().in("program_id", programIds);
      await admin.from("program_members").delete().in("program_id", programIds);
      await admin.from("programs").delete().in("id", programIds);
    }
  });

  // -------------------------------------------------------------------------
  // INSERT
  // -------------------------------------------------------------------------

  test("an insert with an off-roster player2_id is refused with 42501", async () => {
    const offRoster: [string, string][] = [
      ["a user in no program", outsider.userId],
      ["another program's roster row", rosterB],
      ["an id that belongs to nobody", randomUUID()],
    ];
    for (const [what, id] of offRoster) {
      const { data, error } = await insertUnderA(id);
      expect(data, what).toBeNull();
      expect(error, what).not.toBeNull();
      expect(error!.code, what).toBe(INSUFFICIENT_PRIVILEGE);
      expect(error!.message, what).toContain(
        "that opponent is not on this program's roster",
      );
    }

    // Nothing was written, on the service role's authority.
    const written = await admin
      .from("matches")
      .select("id")
      .eq("program_id", programA);
    expect(written.error).toBeNull();
    expect(written.data).toEqual([]);
  });

  test("an insert with a roster teammate's id succeeds", async () => {
    // The ordinary seat: a program_players.id of the same program.
    const byProfile = await insertUnderA(rosterA);
    expect(byProfile.error).toBeNull();
    expect(byProfile.data).toHaveLength(1);
    expect(byProfile.data![0].player2_id).toBe(rosterA);

    // The safety arm: a member with no profile, seated by login id.
    const byLogin = await insertUnderA(teammate.userId);
    expect(byLogin.error).toBeNull();
    expect(byLogin.data).toHaveLength(1);
    expect(byLogin.data![0].player2_id).toBe(teammate.userId);

    // And the seat does what it is for: the teammate reads the match.
    const read = await teammate.client
      .from("matches")
      .select("id")
      .eq("id", byLogin.data![0].id);
    expect(read.error).toBeNull();
    expect(read.data).toHaveLength(1);
  });

  test("an insert with no player2_id is not checked", async () => {
    const { data, error } = await insertUnderA(null);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // UPDATE — player2_id alone, which only reaches the function because the
  // trigger's UPDATE OF list names the column.
  // -------------------------------------------------------------------------

  test("updating player2_id to an off-roster id is refused with 42501", async () => {
    const seeded = await insertUnderA(rosterA);
    expect(seeded.error).toBeNull();
    const matchId = seeded.data![0].id as string;

    for (const [what, id] of [
      ["a user in no program", outsider.userId],
      ["another program's roster row", rosterB],
    ] as const) {
      const { error } = await owner.client
        .from("matches")
        .update({ player2_id: id })
        .eq("id", matchId)
        .select("id");
      expect(error, what).not.toBeNull();
      expect(error!.code, what).toBe(INSUFFICIENT_PRIVILEGE);
      expect(error!.message, what).toContain(
        "can only be given to someone on the same program's roster",
      );
    }
    expect(await seatTwo(matchId)).toBe(rosterA);

    // The outsider, never seated, still reads nothing.
    const read = await outsider.client
      .from("matches")
      .select("id")
      .eq("id", matchId);
    expect(read.error).toBeNull();
    expect(read.data).toEqual([]);
  });

  test("updating player2_id to another teammate, or clearing it, succeeds", async () => {
    const seeded = await insertUnderA(rosterA);
    expect(seeded.error).toBeNull();
    const matchId = seeded.data![0].id as string;

    for (const next of [rosterA2, teammate.userId, null]) {
      const { error } = await owner.client
        .from("matches")
        .update({ player2_id: next })
        .eq("id", matchId)
        .select("id");
      expect(error).toBeNull();
      expect(await seatTwo(matchId)).toBe(next);
    }
  });

  test("an update that leaves an old off-roster player2_id alone is not refused", async () => {
    // A row written before the check (here: by the service role, which the
    // trigger lets through) must stay editable — only a CHANGE is tested.
    const legacy = await admin
      .from("matches")
      .insert({
        created_by: owner.userId,
        program_id: programA,
        player1_id: owner.userId,
        player1_name: "P2 Roster Owner",
        player2_id: outsider.userId,
        player2_name: "P2 Roster Legacy",
        date: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (legacy.error) throw new Error(`legacy: ${legacy.error.message}`);

    const { error } = await owner.client
      .from("matches")
      .update({ player2_name: "P2 Roster Renamed" })
      .eq("id", legacy.data.id)
      .select("id");
    expect(error).toBeNull();
  });

  // -------------------------------------------------------------------------
  // No program, no check.
  // -------------------------------------------------------------------------

  test("a match with no program is not checked, on insert or update", async () => {
    const personal = await outsider.client
      .from("matches")
      .insert({
        created_by: outsider.userId,
        player1_id: outsider.userId,
        player1_name: "P2 Roster Outsider",
        player2_id: rosterB, // any id at all
        player2_name: "P2 Roster Opponent",
        date: new Date().toISOString(),
      })
      .select("id")
      .single();
    expect(personal.error).toBeNull();

    const moved = await outsider.client
      .from("matches")
      .update({ player2_id: randomUUID() })
      .eq("id", personal.data!.id)
      .select("id");
    expect(moved.error).toBeNull();
    expect(moved.data).toHaveLength(1);
  });
});
