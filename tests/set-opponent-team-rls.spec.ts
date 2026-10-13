import { expect, test } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  ANON_KEY,
  HAVE_ENV,
  INSUFFICIENT_PRIVILEGE,
  SKIP_REASON,
  SUPABASE_URL,
  type Session,
  createAdminClient,
  runMarker,
} from "./fixtures/live-db";
import { clearPoolLeftovers, poolLogins } from "./fixtures/live-db-pool";

/**
 * `20261012071550_set_opponent_team.sql`, proven against the live database:
 *
 *  1. Program staff set an opponent program on a match a player recorded —
 *     the row the staff member does not own, which the creator-only UPDATE
 *     policy on `matches` would have silently skipped — and the row shows it.
 *  2. A member with role `player` and a stranger both get
 *     `INSUFFICIENT_PRIVILEGE`.
 *  3. Mixing in a match from a second program refuses the whole call, and the
 *     first program's match is unchanged.
 *  4. Passing both a program and a school is `22023`.
 *  5. The anon client cannot call it at all — the function has no `anon` grant.
 *
 * A crashed run's programs are findable by hand:
 * `select * from programs where school_name like 'ZZ RLS set_opponent_team%'`.
 *
 * Run on demand:  npx playwright test set-opponent-team-rls
 */

const INVALID_PARAMETER_VALUE = "22023";
const RPC = "set_opponent_team";

const { mark: MARK } = runMarker("set-opponent-team-rls");
const PROGRAM_NAME = `ZZ RLS set_opponent_team ${MARK}`;
const OTHER_PROGRAM_NAME = `ZZ RLS set_opponent_team other ${MARK}`;
const OPPONENT_PROGRAM_NAME = `ZZ RLS set_opponent_team opp ${MARK}`;

const SLOTS = [
  "set-opponent-team-rls-creator",
  "set-opponent-team-rls-staff",
  "set-opponent-team-rls-member",
  "set-opponent-team-rls-stranger",
];

test.describe("set_opponent_team RPC (live)", () => {
  test.describe.configure({ mode: "serial", timeout: 60_000 });
  test.skip(!HAVE_ENV, SKIP_REASON);

  let admin: SupabaseClient;
  let creator: Session; // recorded the match; program member, role player
  let staff: Session; // program member, role staff — owns no match
  let member: Session; // program member, role player, recorded nothing
  let stranger: Session; // signed in, no membership

  let programId: string | null = null;
  let otherProgramId: string | null = null; // a second program the staff member is not in
  let opponentProgramId: string | null = null; // the team being assigned
  let matchId: string | null = null; // creator's match in `programId`
  let otherMatchId: string | null = null; // creator's match in `otherProgramId`

  async function opponentOf(id: string): Promise<{
    opponent_program_id: string | null;
    opponent_school: string | null;
  }> {
    const { data, error } = await admin
      .from("matches")
      .select("opponent_program_id, opponent_school")
      .eq("id", id)
      .single();
    expect(error).toBeNull();
    return data as {
      opponent_program_id: string | null;
      opponent_school: string | null;
    };
  }

  async function insertProgram(name: string, key: string): Promise<string> {
    const program = await admin
      .from("programs")
      .insert({
        program_key: key,
        school_group: key,
        school_name: name,
        team: "mens",
        status: "active",
      })
      .select("id")
      .single();
    if (program.error) throw new Error(`program: ${program.error.message}`);
    return program.data.id as string;
  }

  async function insertMatch(program: string, label: string): Promise<string> {
    const match = await admin
      .from("matches")
      .insert({
        created_by: creator.userId,
        program_id: program,
        player1_id: creator.userId,
        player1_name: "Opp Creator",
        player2_name: "Opp Rival",
        date: new Date().toISOString(),
        tournament_name: `${MARK}-${label}`,
        source_provider: "swing-vision",
      })
      .select("id")
      .single();
    if (match.error) throw new Error(`match ${label}: ${match.error.message}`);
    return match.data.id as string;
  }

  test.beforeAll(async () => {
    test.setTimeout(180_000);
    admin = createAdminClient();

    const leftoverIds = await clearPoolLeftovers(admin, SLOTS);
    if (leftoverIds.length > 0) {
      const swept = await admin
        .from("matches")
        .delete()
        .in("created_by", leftoverIds);
      if (swept.error) throw new Error(`matches sweep: ${swept.error.message}`);
    }

    [creator, staff, member, stranger] = await poolLogins(admin, SLOTS);

    programId = await insertProgram(PROGRAM_NAME, MARK);
    otherProgramId = await insertProgram(OTHER_PROGRAM_NAME, `${MARK}-other`);
    opponentProgramId = await insertProgram(
      OPPONENT_PROGRAM_NAME,
      `${MARK}-opp`,
    );

    const members = await admin.from("program_members").insert([
      { program_id: programId, user_id: creator.userId, role: "player" },
      { program_id: programId, user_id: staff.userId, role: "staff" },
      { program_id: programId, user_id: member.userId, role: "player" },
      // The creator is in both programs so one login can record both matches;
      // the staff member is deliberately NOT in the second program.
      { program_id: otherProgramId, user_id: creator.userId, role: "player" },
    ]);
    if (members.error) throw new Error(`members: ${members.error.message}`);

    matchId = await insertMatch(programId, "match");
    otherMatchId = await insertMatch(otherProgramId, "other");
  });

  test.afterAll(async () => {
    if (!admin) return;
    const matchIds = [matchId, otherMatchId].filter(
      (id): id is string => id !== null,
    );
    if (matchIds.length > 0) {
      await admin.from("matches").delete().in("id", matchIds);
    }
    const programIds = [programId, otherProgramId, opponentProgramId].filter(
      (id): id is string => id !== null,
    );
    if (programIds.length > 0) {
      await admin.from("program_members").delete().in("program_id", programIds);
      await admin.from("programs").delete().in("id", programIds);
    }
  });

  test("fixture: the match starts with no opponent team", async () => {
    const row = await opponentOf(matchId!);
    expect(row.opponent_program_id).toBeNull();
    expect(row.opponent_school).toBeNull();
  });

  test("staff set an opponent program on a match the creator recorded", async () => {
    const { data, error } = await staff.client.rpc(RPC, {
      p_program_id: programId,
      p_match_ids: [matchId],
      p_opponent_program_id: opponentProgramId,
      p_opponent_school: null,
    });
    expect(error).toBeNull();
    // `setof uuid` arrives as `string[]`.
    expect(data).toEqual([matchId]);

    const row = await opponentOf(matchId!);
    expect(row.opponent_program_id).toBe(opponentProgramId);
    expect(row.opponent_school).toBeNull();
  });

  test("staff switch the same match to a school name, clearing the program", async () => {
    const { data, error } = await staff.client.rpc(RPC, {
      p_program_id: programId,
      p_match_ids: [matchId],
      p_opponent_program_id: null,
      p_opponent_school: "  Rival State  ",
    });
    expect(error).toBeNull();
    expect(data).toEqual([matchId]);

    const row = await opponentOf(matchId!);
    expect(row.opponent_program_id).toBeNull();
    expect(row.opponent_school).toBe("Rival State");
  });

  test("a member with role player and a stranger are refused", async () => {
    for (const s of [member, stranger]) {
      const { error } = await s.client.rpc(RPC, {
        p_program_id: programId,
        p_match_ids: [matchId],
        p_opponent_program_id: opponentProgramId,
        p_opponent_school: null,
      });
      expect(error?.code).toBe(INSUFFICIENT_PRIVILEGE);
    }
    // Nothing moved: the school from the previous test is still on the row.
    const row = await opponentOf(matchId!);
    expect(row.opponent_program_id).toBeNull();
    expect(row.opponent_school).toBe("Rival State");
  });

  test("mixing in another program's match refuses the whole call", async () => {
    const { error } = await staff.client.rpc(RPC, {
      p_program_id: programId,
      p_match_ids: [matchId, otherMatchId],
      p_opponent_program_id: opponentProgramId,
      p_opponent_school: null,
    });
    expect(error?.code).toBe(INSUFFICIENT_PRIVILEGE);

    // No partial update: the first program's match kept its school, and the
    // other program's match was never touched.
    const ours = await opponentOf(matchId!);
    expect(ours.opponent_program_id).toBeNull();
    expect(ours.opponent_school).toBe("Rival State");
    const theirs = await opponentOf(otherMatchId!);
    expect(theirs.opponent_program_id).toBeNull();
    expect(theirs.opponent_school).toBeNull();
  });

  test("both a program and a school is an invalid parameter", async () => {
    const { error } = await staff.client.rpc(RPC, {
      p_program_id: programId,
      p_match_ids: [matchId],
      p_opponent_program_id: opponentProgramId,
      p_opponent_school: "Rival State",
    });
    expect(error?.code).toBe(INVALID_PARAMETER_VALUE);
  });

  test("the anon client cannot call it", async () => {
    const anon = createClient(SUPABASE_URL!, ANON_KEY!);
    const { error } = await anon.rpc(RPC, {
      p_program_id: programId,
      p_match_ids: [matchId],
      p_opponent_program_id: opponentProgramId,
      p_opponent_school: null,
    });
    expect(error).not.toBeNull();
    // No `anon` grant: PostgREST answers with the privilege error before the
    // function body (and its own 28000 "not authenticated") can run.
    expect(error?.code).toBe(INSUFFICIENT_PRIVILEGE);
  });
});
