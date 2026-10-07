import { randomBytes } from "node:crypto";

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
 * `20261007214009_program_join_links.sql`, proven against the live database:
 *
 *  1. `program_join_links` is readable by program staff only — a coach sees
 *     the program's live row (token included), a plain `player` member sees
 *     nothing.
 *  2. `accept_program_join_link` is not executable signed out: `anon` holds
 *     no grant, so the call is refused before the function body runs.
 *  3. `program_join_link_preview` IS anon-executable on purpose, and names the
 *     program for the signed-out landing.
 *  4. `set_program_join_link_mode` is owner/coach only: `staff` gets 42501,
 *     a coach's change lands and reads back.
 *
 * A crashed run's program is findable by hand:
 * `select * from programs where school_name like 'ZZ RLS join_link%'`.
 *
 * Run on demand:  npx playwright test join-link-rls
 */

/** PostgREST's "no such function for these arguments / this role". */
const FUNCTION_NOT_FOUND = "PGRST202";

const { mark: MARK } = runMarker("join-link-rls");
const PROGRAM_NAME = `ZZ RLS join_link ${MARK}`;

const SLOTS = [
  "join-link-rls-coach",
  "join-link-rls-staff",
  "join-link-rls-player",
];

test.describe("program_join_links RLS (live)", () => {
  test.describe.configure({ mode: "serial", timeout: 60_000 });
  test.skip(!HAVE_ENV, SKIP_REASON);

  let admin: SupabaseClient;
  let coach: Session; // program member, role coach
  let staff: Session; // program member, role staff
  let player: Session; // program member, role player

  let programId: string | null = null;
  // Same shape `generateToken()` mints: 32 CSPRNG bytes, base64url (43 chars).
  const token = randomBytes(32).toString("base64url");

  function anonClient(): SupabaseClient {
    return createClient(SUPABASE_URL!, ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  test.beforeAll(async () => {
    test.setTimeout(180_000);
    admin = createAdminClient();

    await clearPoolLeftovers(admin, SLOTS);

    [coach, staff, player] = await poolLogins(admin, SLOTS);

    const program = await admin
      .from("programs")
      .insert({
        program_key: MARK,
        school_group: MARK,
        school_name: PROGRAM_NAME,
        team: "mens",
        status: "active",
        seats: 5,
      })
      .select("id")
      .single();
    if (program.error) throw new Error(`program: ${program.error.message}`);
    programId = program.data.id as string;

    const members = await admin.from("program_members").insert([
      { program_id: programId, user_id: coach.userId, role: "coach" },
      { program_id: programId, user_id: staff.userId, role: "staff" },
      { program_id: programId, user_id: player.userId, role: "player" },
    ]);
    if (members.error) throw new Error(`members: ${members.error.message}`);

    const link = await admin.from("program_join_links").insert({
      program_id: programId,
      token,
      mode: "open",
      created_by: coach.userId,
    });
    if (link.error) throw new Error(`link: ${link.error.message}`);
  });

  test.afterAll(async () => {
    if (!admin) return;
    if (programId) {
      await admin
        .from("program_join_links")
        .delete()
        .eq("program_id", programId);
      await admin.from("program_members").delete().eq("program_id", programId);
      await admin.from("programs").delete().eq("id", programId);
    }
    await clearPoolLeftovers(admin, SLOTS);
  });

  test("a coach sees the program's link; a player member sees nothing", async () => {
    const seen = await coach.client
      .from("program_join_links")
      .select("token, mode")
      .eq("program_id", programId!);
    expect(seen.error).toBeNull();
    expect(seen.data).toEqual([{ token, mode: "open" }]);

    const hidden = await player.client
      .from("program_join_links")
      .select("token")
      .eq("program_id", programId!);
    expect(hidden.error).toBeNull();
    expect(hidden.data).toHaveLength(0);
  });

  test("an anonymous client cannot call accept_program_join_link", async () => {
    const { data, error } = await anonClient().rpc("accept_program_join_link", {
      p_token: token,
    });
    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect([INSUFFICIENT_PRIVILEGE, FUNCTION_NOT_FOUND]).toContain(error!.code);

    // Refused, not half-run: nobody joined.
    const members = await admin
      .from("program_members")
      .select("user_id")
      .eq("program_id", programId!);
    expect(members.error).toBeNull();
    expect(members.data).toHaveLength(3);
  });

  test("an anonymous client can preview the link, and it names the program", async () => {
    const { data, error } = await anonClient()
      .rpc("program_join_link_preview", { p_token: token })
      .maybeSingle();
    expect(error).toBeNull();
    expect(data).toMatchObject({
      program_name: PROGRAM_NAME,
      program_team: "mens",
      mode: "open",
      seats_free: true,
      roster_match_name: null,
    });
    // Never the token or the program id.
    expect(Object.keys(data as object).sort()).toEqual(
      [
        "created_by_name",
        "mode",
        "org_type",
        "program_name",
        "program_team",
        "roster_match_name",
        "seats_free",
      ].sort(),
    );
  });

  test("an unknown token previews as no row", async () => {
    const { data, error } = await anonClient()
      .rpc("program_join_link_preview", {
        p_token: randomBytes(32).toString("base64url"),
      })
      .maybeSingle();
    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  test("staff cannot change the link's mode; a coach can", async () => {
    const refused = await staff.client.rpc("set_program_join_link_mode", {
      p_program_id: programId,
      p_mode: "approve",
    });
    expect(refused.error?.code).toBe(INSUFFICIENT_PRIVILEGE);

    const unchanged = await coach.client
      .from("program_join_links")
      .select("mode")
      .eq("program_id", programId!)
      .is("revoked_at", null)
      .single();
    expect(unchanged.error).toBeNull();
    expect(unchanged.data?.mode).toBe("open");

    const changed = await coach.client.rpc("set_program_join_link_mode", {
      p_program_id: programId,
      p_mode: "approve",
    });
    expect(changed.error).toBeNull();

    const reread = await coach.client
      .from("program_join_links")
      .select("mode")
      .eq("program_id", programId!)
      .is("revoked_at", null)
      .single();
    expect(reread.error).toBeNull();
    expect(reread.data?.mode).toBe("approve");
  });
});
