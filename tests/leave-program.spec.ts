import { expect, test } from "@playwright/test";
import { type SupabaseClient } from "@supabase/supabase-js";

import {
  HAVE_ENV,
  INSUFFICIENT_PRIVILEGE,
  SKIP_REASON,
  type Session,
  createAdminClient,
  createLogins,
  deleteAuthUsers,
  runMarker,
} from "./fixtures/live-db";

/**
 * A player leaves one program — proven against the live database.
 *
 * The scenario: a player with a claimed roster profile on two programs has
 * filed a team match under the first (their login id as player 1) and keeps a
 * personal match. `leave_program(first)` must re-point that match to the
 * profile and clear its uploader, un-claim the profile without archiving it,
 * drop the membership, write one `member.left` audit row, and take away the
 * player's read access to the team match — while the second program, the
 * personal match and the login itself are untouched. The owner is refused.
 * A second call is a no-op.
 *
 * Run on demand:  npx playwright test tests/leave-program.spec.ts
 */

/** A crashed run is findable by hand:
 *  `select * from programs where program_key like 'leave-prog-%'`. */
const { mark: MARK, password: PASSWORD } = runMarker("leave-prog");

const RPC = "leave_program";

test.describe("leave_program (live DB)", () => {
  test.describe.configure({ mode: "serial", timeout: 60_000 });
  test.skip(!HAVE_ENV, SKIP_REASON);

  let admin: SupabaseClient;
  let owner: Session;
  let player: Session;

  const authUserIds: string[] = [];
  const matchIds: string[] = [];
  const programIds: string[] = [];
  let leftProgram: string;
  let stayedProgram: string;
  let profileId: string;
  let otherProfileId: string;
  let teamMatch: string;
  let personalMatch: string;

  test.beforeAll(async () => {
    test.setTimeout(180_000);
    admin = createAdminClient();

    [owner, player] = await createLogins(admin, ["owner", "player"], {
      mark: MARK,
      password: PASSWORD,
      authUserIds,
    });

    const programs = await admin
      .from("programs")
      .insert([
        {
          program_key: `${MARK}-a`,
          school_group: `${MARK}-a`,
          school_name: `Leave Test A ${MARK}`,
          team: "mens",
        },
        {
          program_key: `${MARK}-b`,
          school_group: `${MARK}-b`,
          school_name: `Leave Test B ${MARK}`,
          team: "mens",
        },
      ])
      .select("id, program_key");
    if (programs.error) throw new Error(`programs: ${programs.error.message}`);
    leftProgram = programs.data.find((p) => p.program_key === `${MARK}-a`)!.id;
    stayedProgram = programs.data.find(
      (p) => p.program_key === `${MARK}-b`,
    )!.id;
    programIds.push(leftProgram, stayedProgram);

    const members = await admin.from("program_members").insert([
      { program_id: leftProgram, user_id: owner.userId, role: "owner" },
      { program_id: leftProgram, user_id: player.userId, role: "player" },
      { program_id: stayedProgram, user_id: owner.userId, role: "owner" },
      { program_id: stayedProgram, user_id: player.userId, role: "player" },
    ]);
    if (members.error) throw new Error(`members: ${members.error.message}`);

    const profiles = await admin
      .from("program_players")
      .insert([
        {
          program_id: leftProgram,
          first_name: "Leaving",
          last_name: "Player",
          claimed_by_user_id: player.userId,
          claimed_at: new Date().toISOString(),
        },
        {
          program_id: stayedProgram,
          first_name: "Staying",
          last_name: "Player",
          claimed_by_user_id: player.userId,
          claimed_at: new Date().toISOString(),
        },
      ])
      .select("id, program_id");
    if (profiles.error) throw new Error(`profiles: ${profiles.error.message}`);
    profileId = profiles.data.find((p) => p.program_id === leftProgram)!.id;
    otherProfileId = profiles.data.find(
      (p) => p.program_id === stayedProgram,
    )!.id;

    const matches = await admin
      .from("matches")
      .insert([
        {
          created_by: player.userId,
          program_id: leftProgram,
          player1_id: player.userId,
          player1_name: "Leaving Player",
          player2_name: "Opponent",
          date: new Date().toISOString(),
          tournament_name: `${MARK}-team`,
        },
        {
          created_by: player.userId,
          player1_name: "Leaving Player",
          player2_name: "Opponent",
          date: new Date().toISOString(),
          tournament_name: `${MARK}-personal`,
        },
      ])
      .select("id, tournament_name");
    if (matches.error) throw new Error(`matches: ${matches.error.message}`);
    teamMatch = matches.data.find(
      (m) => m.tournament_name === `${MARK}-team`,
    )!.id;
    personalMatch = matches.data.find(
      (m) => m.tournament_name === `${MARK}-personal`,
    )!.id;
    matchIds.push(teamMatch, personalMatch);
  });

  test.afterAll(async () => {
    test.setTimeout(180_000);
    if (!admin) return;
    if (matchIds.length > 0) {
      await admin.from("matches").delete().in("id", matchIds);
    }
    if (programIds.length > 0) {
      await admin.from("programs").delete().in("id", programIds);
    }
    await deleteAuthUsers(admin, authUserIds);
  });

  test("the owner is refused until ownership is transferred", async () => {
    const { data, error } = await owner.client.rpc(RPC, {
      p_program_id: leftProgram,
    });
    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(error!.code).toBe(INSUFFICIENT_PRIVILEGE);
    expect(error!.message).toContain("transfer ownership");
  });

  test("before leaving, the player can read the team match", async () => {
    const seen = await player.client
      .from("matches")
      .select("id")
      .eq("id", teamMatch);
    expect(seen.data).toHaveLength(1);
  });

  test("the player leaves: the RPC reports the profile and the re-point", async () => {
    const { data, error } = await player.client.rpc(RPC, {
      p_program_id: leftProgram,
    });
    expect(error).toBeNull();
    expect(data).toEqual([
      { left_program: true, profile_id: profileId, matches_repointed: 1 },
    ]);
  });

  test("the team match stays with the program, on the profile, uploader cleared", async () => {
    const row = await admin
      .from("matches")
      .select("program_id, created_by, player1_id")
      .eq("id", teamMatch)
      .single();
    expect(row.data).toEqual({
      program_id: leftProgram,
      created_by: null,
      player1_id: profileId,
    });

    const mine = await player.client
      .from("matches")
      .select("id")
      .eq("id", teamMatch);
    expect(mine.error).toBeNull();
    expect(mine.data).toEqual([]);

    const theirs = await owner.client
      .from("matches")
      .select("id")
      .eq("id", teamMatch);
    expect(theirs.data).toHaveLength(1);
  });

  test("the profile is un-claimed but not archived; the membership is gone", async () => {
    const profile = await admin
      .from("program_players")
      .select("claimed_by_user_id, claimed_at, archived_at")
      .eq("id", profileId)
      .single();
    expect(profile.data).toEqual({
      claimed_by_user_id: null,
      claimed_at: null,
      archived_at: null,
    });

    const member = await admin
      .from("program_members")
      .select("id")
      .eq("program_id", leftProgram)
      .eq("user_id", player.userId);
    expect(member.data).toEqual([]);

    const audit = await admin
      .from("program_audit_log")
      .select("actor_user_id, subject_id, details")
      .eq("program_id", leftProgram)
      .eq("action", "member.left");
    expect(audit.data).toHaveLength(1);
    expect(audit.data![0]).toMatchObject({
      actor_user_id: player.userId,
      subject_id: profileId,
      details: { role: "player", matches_repointed: 1 },
    });
  });

  test("the other program and the personal match are untouched", async () => {
    const [member, profile, personal] = await Promise.all([
      admin
        .from("program_members")
        .select("role")
        .eq("program_id", stayedProgram)
        .eq("user_id", player.userId)
        .single(),
      admin
        .from("program_players")
        .select("claimed_by_user_id")
        .eq("id", otherProfileId)
        .single(),
      player.client
        .from("matches")
        .select("created_by")
        .eq("id", personalMatch)
        .single(),
    ]);
    expect(member.data!.role).toBe("player");
    expect(profile.data!.claimed_by_user_id).toBe(player.userId);
    expect(personal.data!.created_by).toBe(player.userId);
  });

  test("a second leave is a no-op", async () => {
    const { data, error } = await player.client.rpc(RPC, {
      p_program_id: leftProgram,
    });
    expect(error).toBeNull();
    expect(data).toEqual([
      { left_program: false, profile_id: null, matches_repointed: 0 },
    ]);

    const audit = await admin
      .from("program_audit_log")
      .select("id")
      .eq("program_id", leftProgram)
      .eq("action", "member.left");
    expect(audit.data).toHaveLength(1);
  });
});
