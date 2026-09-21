import { randomBytes } from "node:crypto";

import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  HAVE_ENV,
  SKIP_REASON,
  type Session,
  createAdminClient,
  createLogins,
  deleteAuthUsers,
  runMarker,
} from "./fixtures/live-db";
import { hashToken, generateToken } from "@/lib/services/programs/tokens";

/**
 * A seat is a player on the roster — proven against the live database. Locks
 * migration `20260921050000_seats_count_roster_players.sql`.
 *
 * Before it, `program_seat_usage` counted `program_members`: logins, staff
 * included, coach-managed players not. A coach read "2 of 25" beside nine
 * players, the cap never bound a program whose staff upload everything, and a
 * coach-managed player could be refused `no_seats` while claiming a profile
 * that already held their matches. Each test below is one of those, reversed.
 *
 * The program is created with TWO seats so the cap is reachable in three
 * writes. Everything is named with a per-run marker and deleted in `afterAll`.
 *
 * Run on demand:  npx playwright test tests/seats-count-players.spec.ts
 */

const { mark: MARK, password: PASSWORD } = runMarker("seat-rule");
const DAY = 86_400_000;
const PROGRAM_LIMIT = "54000";
const junkHash = () => randomBytes(32).toString("hex");

type Usage = { seats: number; used: number; pending: number };

test.describe("seats count roster players (live DB)", () => {
  test.describe.configure({ mode: "serial", timeout: 60_000 });
  test.skip(!HAVE_ENV, SKIP_REASON);

  let admin: SupabaseClient;
  let owner: Session;
  let claimant: Session;
  let claimantEmail: string;
  let programId: string;
  let firstPlayer: string;

  const authUserIds: string[] = [];

  async function usage(): Promise<Usage> {
    const { data, error } = await owner.client.rpc("program_seat_usage", {
      p_program_id: programId,
    });
    expect(error).toBeNull();
    return (Array.isArray(data) ? data[0] : data) as Usage;
  }

  const invite = (email: string, role: string, playerId: string | null) =>
    owner.client.rpc("create_program_invite", {
      p_program_id: programId,
      p_email: email,
      p_role: role,
      p_token_hash: junkHash(),
      p_expires_at: new Date(Date.now() + DAY).toISOString(),
      p_player_id: playerId,
    });

  test.beforeAll(async () => {
    test.setTimeout(180_000);
    admin = createAdminClient();

    [owner, claimant] = await createLogins(admin, ["owner", "claimant"], {
      mark: MARK,
      password: PASSWORD,
      authUserIds,
    });

    const who = await claimant.client.auth.getUser();
    if (!who.data.user?.email) throw new Error("claimant has no address");
    claimantEmail = who.data.user.email;

    const program = await admin
      .from("programs")
      .insert({
        program_key: MARK,
        school_group: MARK,
        school_name: `Seat Rule ${MARK}`,
        team: "mens",
        seats: 2,
      })
      .select("id")
      .single();
    if (program.error) throw new Error(`program: ${program.error.message}`);
    programId = program.data.id;

    const member = await admin.from("program_members").insert({
      program_id: programId,
      user_id: owner.userId,
      role: "owner",
      upload_enabled: true,
    });
    if (member.error) throw new Error(`member: ${member.error.message}`);
  });

  test.afterAll(async () => {
    test.setTimeout(180_000);
    if (!admin) return;
    if (programId) {
      await admin
        .from("program_audit_log")
        .delete()
        .eq("program_id", programId);
      await admin.from("program_invites").delete().eq("program_id", programId);
      await admin.from("program_players").delete().eq("program_id", programId);
      await admin.from("program_members").delete().eq("program_id", programId);
      await admin.from("programs").delete().eq("id", programId);
    }
    await deleteAuthUsers(admin, authUserIds);
  });

  test("staff hold no seat: an owner alone is 0 of 2", async () => {
    expect(await usage()).toEqual({ seats: 2, used: 0, pending: 0 });
  });

  test("a coach-managed player takes a seat the moment they are added", async () => {
    const added = await owner.client.rpc("add_program_player", {
      p_program_id: programId,
      p_first_name: "Seat",
      p_last_name: "One",
    });
    expect(added.error).toBeNull();
    firstPlayer = added.data as string;

    expect(await usage()).toEqual({ seats: 2, used: 1, pending: 0 });
  });

  test("an invitation to someone new reserves one; a resend does not take a second", async () => {
    const address = `${MARK}-new@example.com`;
    expect((await invite(address, "player", null)).error).toBeNull();
    expect((await invite(address, "player", null)).error).toBeNull();

    expect(await usage()).toEqual({ seats: 2, used: 1, pending: 1 });
  });

  test("at the cap, adding a player and inviting a new one are both refused", async () => {
    const added = await owner.client.rpc("add_program_player", {
      p_program_id: programId,
      p_first_name: "Seat",
      p_last_name: "Three",
    });
    expect(added.error?.code).toBe(PROGRAM_LIMIT);

    const invited = await invite(`${MARK}-other@example.com`, "player", null);
    expect(invited.error?.code).toBe(PROGRAM_LIMIT);
  });

  test("at the cap, a staff invitation still goes out and takes nothing", async () => {
    const invited = await invite(`${MARK}-staff@example.com`, "staff", null);
    expect(invited.error).toBeNull();

    expect(await usage()).toEqual({ seats: 2, used: 1, pending: 1 });
  });

  test("at the cap, a player claims their own profile and the count does not move", async () => {
    // A real token this time: the claimant has to present it.
    const token = generateToken();
    const created = await owner.client.rpc("create_program_invite", {
      p_program_id: programId,
      p_email: claimantEmail,
      p_role: "player",
      p_token_hash: hashToken(token),
      p_expires_at: new Date(Date.now() + DAY).toISOString(),
      p_player_id: firstPlayer,
    });
    expect(created.error).toBeNull();
    // A claim invitation targets a row already counted.
    expect(await usage()).toEqual({ seats: 2, used: 1, pending: 1 });

    const accepted = await claimant.client.rpc("accept_program_invite", {
      p_token_hash: hashToken(token),
    });
    expect(accepted.error).toBeNull();
    expect(accepted.data).toEqual([{ status: "ok", program_id: programId }]);

    const profile = await admin
      .from("program_players")
      .select("claimed_by_user_id")
      .eq("id", firstPlayer)
      .single();
    expect(profile.data?.claimed_by_user_id).toBe(claimant.userId);

    expect(await usage()).toEqual({ seats: 2, used: 1, pending: 1 });
  });

  test("archiving frees the seat, and a restore into a full program is refused", async () => {
    const archived = await owner.client.rpc("archive_program_player", {
      p_player_id: firstPlayer,
    });
    expect(archived.error).toBeNull();
    expect(await usage()).toEqual({ seats: 2, used: 0, pending: 1 });

    const added = await owner.client.rpc("add_program_player", {
      p_program_id: programId,
      p_first_name: "Seat",
      p_last_name: "Two",
    });
    expect(added.error).toBeNull();

    const restored = await owner.client.rpc("restore_program_player", {
      p_player_id: firstPlayer,
    });
    expect(restored.error?.code).toBe(PROGRAM_LIMIT);
  });

  test("the counting helper is not callable through the API", async () => {
    const { error } = await owner.client.rpc("program_seat_counts", {
      p_program_id: programId,
    });
    expect(error).not.toBeNull();
  });
});
