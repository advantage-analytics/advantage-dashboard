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
  createLogins,
  deleteAuthUsers,
  runMarker,
} from "./fixtures/live-db";

/**
 * `20260921090000_viz_band_settings.sql`'s RLS policies (Phase 2B Task 1),
 * proven against the live database — the table is already applied, so
 * (unlike `saved-views-rls.spec.ts`) there is no "not applied yet" skip path
 * here; a missing table is a real failure, not an expected pre-migration
 * state.
 *
 * Personal workspace (`account_id = auth.uid()`): the owner can insert and
 * update their own record; a stranger sees none of it and cannot write it.
 *
 * Team workspace (`account_id = programs.id`): owner/coach/staff can insert
 * and update; a player can SELECT but neither INSERT nor UPDATE (bands are
 * read-only for players — the plan's user decision). A non-member sees
 * nothing and cannot write.
 *
 * `account_id` is immutable for every non-service-role writer, and a CHECK
 * violation (descending divider pair, `custom` with no dividers) is refused
 * for everyone, staff included.
 *
 * Run on demand:  npx playwright test viz-bands-rls
 */

const CHECK_VIOLATION = "23514";

const { mark: MARK, password: PASSWORD } = runMarker("viz-bands-rls");
const PROGRAM_NAME = `ZZ RLS viz_band_settings ${MARK}`;

test.describe("viz_band_settings RLS (live)", () => {
  test.describe.configure({ mode: "serial", timeout: 60_000 });
  test.skip(!HAVE_ENV, SKIP_REASON);

  let admin: SupabaseClient; // service role

  let personalOwner: Session; // personal workspace owner
  let stranger: Session; // signed in, no relation to personalOwner
  let teamOwner: Session; // team role: owner
  let teamCoach: Session; // team role: coach
  let teamStaff: Session; // team role: staff
  let teamPlayer: Session; // team role: player
  let nonMember: Session; // signed in, no membership on the team

  const authUserIds: string[] = [];
  const accountIdsToClean: string[] = []; // personal (auth uid) rows
  let programId: string | null = null;

  test.beforeAll(async () => {
    test.setTimeout(180_000);
    admin = createAdminClient();

    [
      personalOwner,
      stranger,
      teamOwner,
      teamCoach,
      teamStaff,
      teamPlayer,
      nonMember,
    ] = await createLogins(
      admin,
      [
        "personalOwner",
        "stranger",
        "teamOwner",
        "teamCoach",
        "teamStaff",
        "teamPlayer",
        "nonMember",
      ],
      { mark: MARK, password: PASSWORD, authUserIds },
    );

    const program = await admin
      .from("programs")
      .insert({
        program_key: MARK,
        school_group: MARK,
        school_name: PROGRAM_NAME,
        team: "mens",
        status: "active",
      })
      .select("id")
      .single();
    if (program.error) {
      throw new Error(`program: ${program.error.message}`);
    }
    programId = program.data.id as string;

    const members = await admin.from("program_members").insert([
      { program_id: programId, user_id: teamOwner.userId, role: "owner" },
      { program_id: programId, user_id: teamCoach.userId, role: "coach" },
      { program_id: programId, user_id: teamStaff.userId, role: "staff" },
      { program_id: programId, user_id: teamPlayer.userId, role: "player" },
    ]);
    if (members.error) {
      throw new Error(`members: ${members.error.message}`);
    }
  });

  test.afterAll(async () => {
    if (!admin) return;
    await admin
      .from("viz_band_settings")
      .delete()
      .in("account_id", [
        ...accountIdsToClean,
        ...(programId ? [programId] : []),
      ]);
    if (programId) {
      await admin.from("program_members").delete().eq("program_id", programId);
      await admin.from("programs").delete().eq("id", programId);
    }
    await deleteAuthUsers(admin, authUserIds);
  });

  // ── personal workspace ─────────────────────────────────────────────────

  test("a personal owner can insert and update their own band settings", async () => {
    accountIdsToClean.push(personalOwner.userId);

    const insert = await personalOwner.client
      .from("viz_band_settings")
      .insert({ account_id: personalOwner.userId, depth_scheme: "thirds" })
      .select("account_id")
      .single();
    expect(insert.error).toBeNull();

    const update = await personalOwner.client
      .from("viz_band_settings")
      .update({ depth_scheme: "deepMidShort" })
      .eq("account_id", personalOwner.userId)
      .select("depth_scheme")
      .single();
    expect(update.error).toBeNull();
    expect(update.data?.depth_scheme).toBe("deepMidShort");
  });

  test("a stranger sees no rows for another personal account and cannot write it", async () => {
    const select = await stranger.client
      .from("viz_band_settings")
      .select("account_id")
      .eq("account_id", personalOwner.userId);
    expect(select.error).toBeNull();
    expect(select.data).toHaveLength(0);

    const insert = await stranger.client.from("viz_band_settings").insert({
      account_id: personalOwner.userId,
      depth_scheme: "none",
    });
    expect(insert.error?.code).toBe(INSUFFICIENT_PRIVILEGE);

    const update = await stranger.client
      .from("viz_band_settings")
      .update({ depth_scheme: "none" })
      .eq("account_id", personalOwner.userId)
      .select("account_id");
    // Denied outright, or a safe no-op (0 rows) — either is correct; a
    // stranger must never see or move the row either way.
    if (update.error) {
      expect(update.error.code).toBe(INSUFFICIENT_PRIVILEGE);
    } else {
      expect(update.data).toHaveLength(0);
    }
  });

  // ── team workspace ─────────────────────────────────────────────────────

  test("team owner, coach and staff can each insert/update the team's bands", async () => {
    // owner creates the row first (insert), then coach and staff each update
    // it in turn — proving all three write roles, not just the creator.
    const insert = await teamOwner.client
      .from("viz_band_settings")
      .insert({ account_id: programId, depth_scheme: "thirds" })
      .select("account_id")
      .single();
    expect(insert.error).toBeNull();

    const byCoach = await teamCoach.client
      .from("viz_band_settings")
      .update({ depth_scheme: "inside" })
      .eq("account_id", programId)
      .select("depth_scheme")
      .single();
    expect(byCoach.error).toBeNull();
    expect(byCoach.data?.depth_scheme).toBe("inside");

    const byStaff = await teamStaff.client
      .from("viz_band_settings")
      .update({ depth_scheme: "deepMidShort" })
      .eq("account_id", programId)
      .select("depth_scheme")
      .single();
    expect(byStaff.error).toBeNull();
    expect(byStaff.data?.depth_scheme).toBe("deepMidShort");
  });

  test("a team player can select the team's bands but cannot insert or update them", async () => {
    const select = await teamPlayer.client
      .from("viz_band_settings")
      .select("depth_scheme")
      .eq("account_id", programId)
      .single();
    expect(select.error).toBeNull();
    expect(select.data?.depth_scheme).toBe("deepMidShort");

    const update = await teamPlayer.client
      .from("viz_band_settings")
      .update({ depth_scheme: "none" })
      .eq("account_id", programId)
      .select("account_id");
    expect(update.error).toBeNull();
    expect(update.data).toHaveLength(0); // USING clause filters it: 0 rows, no throw

    // A player attempting the row for the first time (a program with none
    // yet) is refused outright rather than silently no-op'd, since INSERT
    // has no existing row for RLS to filter down to zero.
    const otherProgram = await admin
      .from("programs")
      .insert({
        program_key: `${MARK}-solo`,
        school_group: `${MARK}-solo`,
        school_name: `${PROGRAM_NAME} (player insert probe)`,
        team: "mens",
        status: "active",
      })
      .select("id")
      .single();
    expect(otherProgram.error).toBeNull();
    const otherProgramId = otherProgram.data!.id as string;
    await admin.from("program_members").insert({
      program_id: otherProgramId,
      user_id: teamPlayer.userId,
      role: "player",
    });

    const insert = await teamPlayer.client
      .from("viz_band_settings")
      .insert({ account_id: otherProgramId, depth_scheme: "thirds" });
    expect(insert.error?.code).toBe(INSUFFICIENT_PRIVILEGE);

    await admin
      .from("program_members")
      .delete()
      .eq("program_id", otherProgramId);
    await admin.from("programs").delete().eq("id", otherProgramId);
  });

  test("a stranger to the team sees nothing and cannot write it", async () => {
    const select = await nonMember.client
      .from("viz_band_settings")
      .select("account_id")
      .eq("account_id", programId);
    expect(select.error).toBeNull();
    expect(select.data).toHaveLength(0);

    const insert = await nonMember.client.from("viz_band_settings").insert({
      account_id: programId,
      depth_scheme: "none",
    });
    expect(insert.error?.code).toBe(INSUFFICIENT_PRIVILEGE);
  });

  // ── account_id is immutable ────────────────────────────────────────────

  test("account_id cannot be updated — by the owner or by staff (column privilege)", async () => {
    const byOwner = await personalOwner.client
      .from("viz_band_settings")
      .update({ account_id: stranger.userId })
      .eq("account_id", personalOwner.userId);
    expect(byOwner.error?.code).toBe(INSUFFICIENT_PRIVILEGE);

    const byStaff = await teamStaff.client
      .from("viz_band_settings")
      .update({ account_id: personalOwner.userId })
      .eq("account_id", programId);
    expect(byStaff.error?.code).toBe(INSUFFICIENT_PRIVILEGE);

    const unchanged = await admin
      .from("viz_band_settings")
      .select("account_id")
      .eq("account_id", programId)
      .single();
    expect(unchanged.data?.account_id).toBe(programId);
  });

  // ── CHECK constraints ───────────────────────────────────────────────────

  test("a descending depth divider pair is refused even for an otherwise-authorized writer", async () => {
    const update = await teamOwner.client
      .from("viz_band_settings")
      .update({ depth_scheme: "custom", depth_dividers_ft: [24, 10] })
      .eq("account_id", programId);
    expect(update.error?.code).toBe(CHECK_VIOLATION);
  });

  test("depth_scheme='custom' with no dividers is refused", async () => {
    const update = await teamOwner.client
      .from("viz_band_settings")
      .update({ depth_scheme: "custom", depth_dividers_ft: null })
      .eq("account_id", programId);
    expect(update.error?.code).toBe(CHECK_VIOLATION);
  });

  test("an anonymous client cannot read viz_band_settings", async () => {
    const anon = createClient(SUPABASE_URL!, ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const select = await anon
      .from("viz_band_settings")
      .select("account_id")
      .limit(1);
    if (select.error) {
      expect(select.error.code).toBeTruthy();
    } else {
      expect(select.data).toHaveLength(0);
    }
  });
});
