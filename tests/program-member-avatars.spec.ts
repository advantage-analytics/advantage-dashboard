import { expect, test } from "@playwright/test";
import { type SupabaseClient } from "@supabase/supabase-js";

import {
  HAVE_ENV,
  SKIP_REASON,
  type Session,
  createAdminClient,
  runMarker,
} from "./fixtures/live-db";
import { clearPoolLeftovers, poolLogins } from "./fixtures/live-db-pool";

/**
 * Teammates' photos — who may read an avatar key, proven against the live DB.
 *
 * `users` RLS is own-row only, so `program_member_avatars` is the one way a
 * page learns another person's avatar key. It must answer a member of the
 * program with every photo on it — members and claimed roster profiles — and
 * answer a stranger with nothing, even though the stranger has a photo of
 * their own and the program exists.
 *
 * Run on demand:  npx playwright test tests/program-member-avatars.spec.ts
 */

/** A crashed run is findable by hand:
 *  `select * from programs where program_key like 'avatars-%'`. */
const { mark: MARK } = runMarker("avatars");

/** Pool slots, prefixed with this spec's name so no other spec draws them. */
const SLOTS = [
  "program-member-avatars-owner",
  "program-member-avatars-player",
  "program-member-avatars-no-photo",
  "program-member-avatars-stranger",
];

test.describe("program_member_avatars (live DB)", () => {
  test.describe.configure({ mode: "serial", timeout: 60_000 });
  test.skip(!HAVE_ENV, SKIP_REASON);

  let admin: SupabaseClient;
  let owner: Session;
  let player: Session;
  let noPhoto: Session;
  let stranger: Session;

  let programId: string;

  test.beforeAll(async () => {
    test.setTimeout(180_000);
    admin = createAdminClient();

    // An interrupted run's memberships would make the pool refuse the slots.
    // `avatar_path` needs no sweep: `poolLogins` resets it on every hand-out,
    // which is what keeps "no photo" true for `noPhoto`.
    await clearPoolLeftovers(admin, SLOTS);
    [owner, player, noPhoto, stranger] = await poolLogins(admin, SLOTS);

    // Keys only — the RPC never touches storage, so no object is uploaded.
    for (const session of [owner, player, stranger]) {
      const { error } = await admin
        .from("users")
        .update({ avatar_path: `${session.userId}/avatar-test.png` })
        .eq("id", session.userId);
      if (error) throw new Error(`avatar_path: ${error.message}`);
    }

    const program = await admin
      .from("programs")
      .insert({
        program_key: `${MARK}-p`,
        school_group: `${MARK}-p`,
        school_name: `Avatar Test School ${MARK}`,
        team: "mens",
      })
      .select("id")
      .single();
    if (program.error) throw new Error(`program: ${program.error.message}`);
    programId = program.data.id;

    const members = await admin.from("program_members").insert([
      { program_id: programId, user_id: owner.userId, role: "owner" },
      { program_id: programId, user_id: player.userId, role: "player" },
      { program_id: programId, user_id: noPhoto.userId, role: "player" },
    ]);
    if (members.error) throw new Error(`members: ${members.error.message}`);
  });

  test.afterAll(async () => {
    test.setTimeout(180_000);
    if (!admin) return;
    // Memberships, then the program. The pool users stay; the avatar keys
    // written above are put back by the pool's reset on the next hand-out.
    if (programId) {
      await admin.from("program_members").delete().eq("program_id", programId);
      await admin.from("programs").delete().eq("id", programId);
    }
  });

  test("a player reads every photo on their program, their own included", async () => {
    const { data, error } = await player.client.rpc("program_member_avatars", {
      p_program_id: programId,
    });
    expect(error).toBeNull();
    const byUser = new Map(
      (data as { user_id: string; avatar_path: string }[]).map((row) => [
        row.user_id,
        row.avatar_path,
      ]),
    );
    expect(byUser.size).toBe(2);
    expect(byUser.get(owner.userId)).toBe(`${owner.userId}/avatar-test.png`);
    expect(byUser.get(player.userId)).toBe(`${player.userId}/avatar-test.png`);
    // No photo, no row — the caller draws initials.
    expect(byUser.has(noPhoto.userId)).toBe(false);
    // A photo outside the program never leaks in.
    expect(byUser.has(stranger.userId)).toBe(false);
  });

  test("a stranger reads nothing from a program they are not on", async () => {
    const { data, error } = await stranger.client.rpc(
      "program_member_avatars",
      { p_program_id: programId },
    );
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});
