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
 * Settings › Teams' rules, proven against the live database.
 *
 * Three things `20260907031610_teams_management.sql` promises, asserted from
 * real RLS-scoped sessions rather than the service role:
 *
 *  1. `update_program_settings` lets any staff change venue, surface and
 *     season, and only the owner change name, squad or conference — decided
 *     after the RPC's own normalisation, so a coach re-sending the current
 *     row unchanged (what the roster's upload switch does) is not refused.
 *  2. `transfer_program_ownership` is the owner's alone, refuses a player as
 *     recipient, and moves BOTH the member rows and `programs.owner_user_id`
 *     under one lock, writing an `ownership.transferred` audit row.
 *  3. `programs_one_owner` makes a second owner row impossible.
 *
 * Plus `set_program_member_role` (20260907034749): an owner sets anyone but
 * themselves, a coach moves people between staff and player only, `owner`
 * is never assignable, no-ops write no audit row — and the gate on
 * `program_usage_pending`: a stranger gets zero, not an error.
 *
 * Run on demand:  npx playwright test tests/teams-management.spec.ts
 */

const INVALID_PARAMETER = "22023";
const UNIQUE_VIOLATION = "23505";

/** A crashed run is findable by hand:
 *  `select * from programs where program_key like 'teams-mgmt-%'`. */
const { mark: MARK, password: PASSWORD } = runMarker("teams-mgmt");

test.describe("Settings › Teams — owner gate, transfer, one owner (live)", () => {
  test.describe.configure({ mode: "serial", timeout: 60_000 });
  test.skip(!HAVE_ENV, SKIP_REASON);

  let admin: SupabaseClient;
  let owner: Session;
  let coach: Session;
  let player: Session;
  let stranger: Session; // no membership anywhere

  const authUserIds: string[] = [];
  let programId: string;
  const schoolName = `Teams Mgmt School ${MARK}`;

  /** The current row, in the shape the RPC takes — what an unchanged re-send is. */
  async function currentSettings() {
    const { data, error } = await admin
      .from("programs")
      .select(
        "school_name, team, conference, home_venue, default_surface, season, players_can_upload",
      )
      .eq("id", programId)
      .single();
    if (error) throw new Error(`programs read: ${error.message}`);
    return {
      p_program_id: programId,
      p_school_name: data.school_name as string,
      p_team: data.team as string,
      p_conference: (data.conference as string | null) ?? "",
      p_home_venue: (data.home_venue as string | null) ?? "",
      p_default_surface: data.default_surface as string | null,
      p_season: (data.season as string | null) ?? "",
      p_players_can_upload: data.players_can_upload as boolean,
    };
  }

  test.beforeAll(async () => {
    test.setTimeout(180_000);
    admin = createAdminClient();

    [owner, coach, player, stranger] = await createLogins(
      admin,
      ["owner", "coach", "player", "stranger"],
      { mark: MARK, password: PASSWORD, authUserIds },
    );

    // `owner_user_id` is set here on purpose: the transfer test proves the
    // RPC rewrites it, which it cannot do if the fixture left it null.
    const program = await admin
      .from("programs")
      .insert({
        program_key: `${MARK}`,
        school_group: `${MARK}`,
        school_name: schoolName,
        team: "mens",
        status: "active",
        owner_user_id: owner.userId,
        conference: null,
        home_venue: "Fixture Courts",
      })
      .select("id")
      .single();
    if (program.error) throw new Error(`program: ${program.error.message}`);
    programId = program.data.id;

    const members = await admin.from("program_members").insert([
      { program_id: programId, user_id: owner.userId, role: "owner" },
      { program_id: programId, user_id: coach.userId, role: "coach" },
      { program_id: programId, user_id: player.userId, role: "player" },
    ]);
    if (members.error) throw new Error(`members: ${members.error.message}`);
  });

  test.afterAll(async () => {
    if (!admin) return;
    if (programId) {
      await admin
        .from("program_audit_log")
        .delete()
        .eq("program_id", programId);
      await admin.from("program_members").delete().eq("program_id", programId);
      await admin.from("programs").delete().eq("id", programId);
    }
    await deleteAuthUsers(admin, authUserIds);
  });

  // ── is_program_owner ──────────────────────────────────────────────────────

  test("is_program_owner is true for the owner and false for a coach", async () => {
    const asOwner = await owner.client.rpc("is_program_owner", {
      p_program_id: programId,
    });
    expect(asOwner.error).toBeNull();
    expect(asOwner.data).toBe(true);

    const asCoach = await coach.client.rpc("is_program_owner", {
      p_program_id: programId,
    });
    expect(asCoach.error).toBeNull();
    expect(asCoach.data).toBe(false);
  });

  // ── update_program_settings ───────────────────────────────────────────────

  test("a coach may change the venue, and an unchanged re-send is not a rename", async () => {
    // The roster's upload switch sends the current row back with the flag
    // flipped, and the fixture's conference is NULL — the case where a naive
    // `<>` comparison against '' would have refused a coach.
    const unchanged = await currentSettings();
    const flip = await coach.client.rpc("update_program_settings", {
      ...unchanged,
      p_players_can_upload: !unchanged.p_players_can_upload,
    });
    expect(flip.error).toBeNull();

    const venue = await coach.client.rpc("update_program_settings", {
      ...(await currentSettings()),
      p_home_venue: "Coach Moved Us",
    });
    expect(venue.error).toBeNull();

    const row = await admin
      .from("programs")
      .select("home_venue, school_name")
      .eq("id", programId)
      .single();
    expect(row.data?.home_venue).toBe("Coach Moved Us");
    expect(row.data?.school_name).toBe(schoolName);
  });

  test("a coach may not rename the program, change its squad or its conference", async () => {
    const base = await currentSettings();

    const rename = await coach.client.rpc("update_program_settings", {
      ...base,
      p_school_name: "Renamed By Coach",
    });
    expect(rename.error?.code).toBe(INSUFFICIENT_PRIVILEGE);

    const squad = await coach.client.rpc("update_program_settings", {
      ...base,
      p_team: "womens",
    });
    expect(squad.error?.code).toBe(INSUFFICIENT_PRIVILEGE);

    const conference = await coach.client.rpc("update_program_settings", {
      ...base,
      p_conference: "Coach Conference",
    });
    expect(conference.error?.code).toBe(INSUFFICIENT_PRIVILEGE);

    const row = await admin
      .from("programs")
      .select("school_name, team, conference")
      .eq("id", programId)
      .single();
    expect(row.data).toMatchObject({
      school_name: schoolName,
      team: "mens",
      conference: null,
    });
  });

  test("a player may not save anything", async () => {
    const result = await player.client.rpc("update_program_settings", {
      ...(await currentSettings()),
      p_home_venue: "Player Courts",
    });
    expect(result.error?.code).toBe(INSUFFICIENT_PRIVILEGE);
  });

  test("the owner may rename the program", async () => {
    const result = await owner.client.rpc("update_program_settings", {
      ...(await currentSettings()),
      p_conference: "Owner Conference",
    });
    expect(result.error).toBeNull();

    const row = await admin
      .from("programs")
      .select("conference")
      .eq("id", programId)
      .single();
    expect(row.data?.conference).toBe("Owner Conference");
  });

  // ── upload_policy ─────────────────────────────────────────────────────────

  test("the upload policy is a ladder, and the boolean stays derived from it", async () => {
    // Nine arguments: the settings page sends the whole policy.
    const tighten = await owner.client.rpc("update_program_settings", {
      ...(await currentSettings()),
      p_players_can_upload: false,
      p_upload_policy: "owner_coaches",
    });
    expect(tighten.error).toBeNull();
    let row = await admin
      .from("programs")
      .select("upload_policy, players_can_upload")
      .eq("id", programId)
      .single();
    expect(row.data).toMatchObject({
      upload_policy: "owner_coaches",
      players_can_upload: false,
    });

    // Eight arguments: the roster's switch sends only the boolean. Off leaves
    // a tighter policy alone; on opens it all the way.
    const switchOff = await coach.client.rpc("update_program_settings", {
      ...(await currentSettings()),
      p_players_can_upload: false,
    });
    expect(switchOff.error).toBeNull();
    row = await admin
      .from("programs")
      .select("upload_policy")
      .eq("id", programId)
      .single();
    expect(row.data?.upload_policy).toBe("owner_coaches");

    const switchOn = await coach.client.rpc("update_program_settings", {
      ...(await currentSettings()),
      p_players_can_upload: true,
    });
    expect(switchOn.error).toBeNull();
    row = await admin
      .from("programs")
      .select("upload_policy, players_can_upload")
      .eq("id", programId)
      .single();
    expect(row.data).toMatchObject({
      upload_policy: "everyone",
      players_can_upload: true,
    });

    // And off again from `everyone` narrows to staff, not to nothing.
    const narrow = await coach.client.rpc("update_program_settings", {
      ...(await currentSettings()),
      p_players_can_upload: false,
    });
    expect(narrow.error).toBeNull();
    row = await admin
      .from("programs")
      .select("upload_policy")
      .eq("id", programId)
      .single();
    expect(row.data?.upload_policy).toBe("staff");

    const bogus = await owner.client.rpc("update_program_settings", {
      ...(await currentSettings()),
      p_upload_policy: "anyone",
    });
    expect(bogus.error?.code).toBe(INVALID_PARAMETER);
  });

  // ── program_usage_pending ─────────────────────────────────────────────────

  test("program_usage_pending answers zero to a stranger, without an error", async () => {
    const month = "2026-09-01";
    const asMember = await player.client.rpc("program_usage_pending", {
      p_program_id: programId,
      p_billing_month: month,
    });
    expect(asMember.error).toBeNull();
    expect(Number(asMember.data)).toBe(0);

    const asStranger = await stranger.client.rpc("program_usage_pending", {
      p_program_id: programId,
      p_billing_month: month,
    });
    expect(asStranger.error).toBeNull();
    expect(Number(asStranger.data)).toBe(0);
  });

  // ── set_program_member_role ───────────────────────────────────────────────

  test("a coach may move a player to staff and back, and it is audited", async () => {
    const promote = await coach.client.rpc("set_program_member_role", {
      p_program_id: programId,
      p_user_id: player.userId,
      p_role: "staff",
    });
    expect(promote.error).toBeNull();

    const row = await admin
      .from("program_members")
      .select("role")
      .eq("program_id", programId)
      .eq("user_id", player.userId)
      .single();
    expect(row.data?.role).toBe("staff");

    const audit = await admin
      .from("program_audit_log")
      .select("actor_user_id, subject_id, details")
      .eq("program_id", programId)
      .eq("action", "member.role_changed");
    expect(audit.data).toHaveLength(1);
    expect(audit.data![0]).toMatchObject({
      actor_user_id: coach.userId,
      subject_id: player.userId,
      details: { from: "player", to: "staff" },
    });

    // Same role again is a no-op: nothing written, no second audit row.
    const again = await coach.client.rpc("set_program_member_role", {
      p_program_id: programId,
      p_user_id: player.userId,
      p_role: "staff",
    });
    expect(again.error).toBeNull();
    const auditAgain = await admin
      .from("program_audit_log")
      .select("id")
      .eq("program_id", programId)
      .eq("action", "member.role_changed");
    expect(auditAgain.data).toHaveLength(1);

    const demote = await coach.client.rpc("set_program_member_role", {
      p_program_id: programId,
      p_user_id: player.userId,
      p_role: "player",
    });
    expect(demote.error).toBeNull();
  });

  test("a coach may not make a coach, touch a coach or the owner, or change themselves", async () => {
    const makeCoach = await coach.client.rpc("set_program_member_role", {
      p_program_id: programId,
      p_user_id: player.userId,
      p_role: "coach",
    });
    expect(makeCoach.error?.code).toBe(INSUFFICIENT_PRIVILEGE);

    const demoteOwner = await coach.client.rpc("set_program_member_role", {
      p_program_id: programId,
      p_user_id: owner.userId,
      p_role: "player",
    });
    expect(demoteOwner.error?.code).toBe(INSUFFICIENT_PRIVILEGE);

    const self = await coach.client.rpc("set_program_member_role", {
      p_program_id: programId,
      p_user_id: coach.userId,
      p_role: "staff",
    });
    expect(self.error?.code).toBe(INVALID_PARAMETER);
  });

  test("nobody may assign owner from the menu, and a player may assign nothing", async () => {
    const asOwner = await owner.client.rpc("set_program_member_role", {
      p_program_id: programId,
      p_user_id: coach.userId,
      p_role: "owner",
    });
    expect(asOwner.error?.code).toBe(INVALID_PARAMETER);

    const asPlayer = await player.client.rpc("set_program_member_role", {
      p_program_id: programId,
      p_user_id: coach.userId,
      p_role: "staff",
    });
    expect(asPlayer.error?.code).toBe(INSUFFICIENT_PRIVILEGE);
  });

  test("the owner may make anyone a coach, staff or player — and leaves the fixture as it was", async () => {
    const toStaff = await owner.client.rpc("set_program_member_role", {
      p_program_id: programId,
      p_user_id: coach.userId,
      p_role: "staff",
    });
    expect(toStaff.error).toBeNull();

    const backToCoach = await owner.client.rpc("set_program_member_role", {
      p_program_id: programId,
      p_user_id: coach.userId,
      p_role: "coach",
    });
    expect(backToCoach.error).toBeNull();

    const row = await admin
      .from("program_members")
      .select("role")
      .eq("program_id", programId)
      .eq("user_id", coach.userId)
      .single();
    expect(row.data?.role).toBe("coach");
  });

  // ── transfer_program_ownership ────────────────────────────────────────────

  test("a coach may not transfer ownership", async () => {
    const result = await coach.client.rpc("transfer_program_ownership", {
      p_program_id: programId,
      p_new_owner: coach.userId,
    });
    expect(result.error?.code).toBe(INSUFFICIENT_PRIVILEGE);
  });

  test("the owner may not hand the program to a player, or to themselves", async () => {
    const toPlayer = await owner.client.rpc("transfer_program_ownership", {
      p_program_id: programId,
      p_new_owner: player.userId,
    });
    expect(toPlayer.error?.code).toBe(INVALID_PARAMETER);

    const toSelf = await owner.client.rpc("transfer_program_ownership", {
      p_program_id: programId,
      p_new_owner: owner.userId,
    });
    expect(toSelf.error?.code).toBe(INVALID_PARAMETER);

    const toStranger = await owner.client.rpc("transfer_program_ownership", {
      p_program_id: programId,
      p_new_owner: stranger.userId,
    });
    expect(toStranger.error?.code).toBe(INVALID_PARAMETER);
  });

  test("the owner hands the program to a coach: both rows, owner_user_id, and an audit row", async () => {
    const result = await owner.client.rpc("transfer_program_ownership", {
      p_program_id: programId,
      p_new_owner: coach.userId,
    });
    expect(result.error).toBeNull();

    const members = await admin
      .from("program_members")
      .select("user_id, role")
      .eq("program_id", programId);
    const roleOf = (userId: string) =>
      members.data?.find((row) => row.user_id === userId)?.role;
    expect(roleOf(coach.userId)).toBe("owner");
    expect(roleOf(owner.userId)).toBe("coach");
    expect(roleOf(player.userId)).toBe("player");

    const program = await admin
      .from("programs")
      .select("owner_user_id")
      .eq("id", programId)
      .single();
    expect(program.data?.owner_user_id).toBe(coach.userId);

    const audit = await admin
      .from("program_audit_log")
      .select("actor_user_id, subject_id, details")
      .eq("program_id", programId)
      .eq("action", "ownership.transferred");
    expect(audit.error).toBeNull();
    expect(audit.data).toHaveLength(1);
    expect(audit.data![0]).toMatchObject({
      actor_user_id: owner.userId,
      subject_id: coach.userId,
      details: { from: owner.userId, to: coach.userId },
    });

    // The former owner is a coach now: the identity gate applies to them.
    const rename = await owner.client.rpc("update_program_settings", {
      ...(await currentSettings()),
      p_school_name: "Former Owner Rename",
    });
    expect(rename.error?.code).toBe(INSUFFICIENT_PRIVILEGE);
  });

  // ── programs_one_owner ────────────────────────────────────────────────────

  test("a second owner row is refused by the unique index", async () => {
    const second = await admin
      .from("program_members")
      .update({ role: "owner" })
      .eq("program_id", programId)
      .eq("user_id", player.userId);
    expect(second.error?.code).toBe(UNIQUE_VIOLATION);

    const owners = await admin
      .from("program_members")
      .select("user_id")
      .eq("program_id", programId)
      .eq("role", "owner");
    expect(owners.data).toHaveLength(1);
    expect(owners.data![0].user_id).toBe(coach.userId);
  });
});
