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
const UNIQUE_VIOLATION = "23505";

const { mark: MARK, password: PASSWORD } = runMarker("viz-bands-rls");
const PROGRAM_NAME = `ZZ RLS viz_band_settings ${MARK}`;

/**
 * The EXACT write shape `viz-bands-actions.ts`'s `saveBandSettings` uses
 * (fix round 1, blocking #1): UPDATE first; if RLS/a missing row leaves zero
 * rows, fall back to INSERT; if that INSERT loses a race to a concurrent
 * first save, retry the UPDATE once. Replicated here (not imported — this
 * spec runs against raw `supabase-js` sessions, never the Next.js action
 * itself) so the RLS proof is of the shape the action actually issues, not
 * a stand-in `.upsert()` that would hide the exact bug that was found
 * (`.upsert()`'s `ON CONFLICT DO UPDATE SET account_id = EXCLUDED.account_id`
 * failing column-privilege on every save after the first).
 */
async function updateThenInsert(
  client: SupabaseClient,
  accountId: string,
  depthScheme: string,
) {
  const cols = { depth_scheme: depthScheme };
  const update = await client
    .from("viz_band_settings")
    .update(cols)
    .eq("account_id", accountId)
    .select("depth_scheme")
    .maybeSingle();
  if (update.error || update.data) return update;

  const insert = await client
    .from("viz_band_settings")
    .insert({ account_id: accountId, ...cols })
    .select("depth_scheme")
    .single();
  if (!insert.error || insert.error.code !== UNIQUE_VIOLATION) return insert;

  return client
    .from("viz_band_settings")
    .update(cols)
    .eq("account_id", accountId)
    .select("depth_scheme")
    .maybeSingle();
}

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
  /** The throwaway solo program the player-insert-probe test creates, if it
   *  gets that far — cleaned up in `afterAll` regardless of pass/fail. */
  let otherProgramId: string | null = null;

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
        ...(otherProgramId ? [otherProgramId] : []),
      ]);
    if (otherProgramId) {
      await admin
        .from("program_members")
        .delete()
        .eq("program_id", otherProgramId);
      await admin.from("programs").delete().eq("id", otherProgramId);
    }
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

  // Fix round 2 (#8): the migration's column grant is `update (depth_scheme,
  // depth_dividers_ft, contact_dividers_ft)` — every other write test above
  // and below only ever sets `depth_scheme` alone, so none of them actually
  // exercises whether the other two granted columns are truly writable by
  // `authenticated` (a narrower grant, e.g. `depth_scheme` only, would still
  // pass every one of those). One write setting all three at once, read back
  // whole, proves the full grant list rather than one column of it.
  test("a single authenticated write sets ALL THREE granted columns (depth_scheme, depth_dividers_ft, contact_dividers_ft)", async () => {
    const update = await personalOwner.client
      .from("viz_band_settings")
      .update({
        depth_scheme: "custom",
        depth_dividers_ft: [6, 20],
        contact_dividers_ft: [3, 10],
      })
      .eq("account_id", personalOwner.userId)
      .select("depth_scheme, depth_dividers_ft, contact_dividers_ft")
      .single();
    expect(update.error).toBeNull();
    expect(update.data?.depth_scheme).toBe("custom");
    expect(update.data?.depth_dividers_ft).toEqual([6, 20]);
    expect(update.data?.contact_dividers_ft).toEqual([3, 10]);

    // Read back through the service role too, independent of what the
    // authenticated client's own `.select()` echoed back.
    const stored = await admin
      .from("viz_band_settings")
      .select("depth_scheme, depth_dividers_ft, contact_dividers_ft")
      .eq("account_id", personalOwner.userId)
      .single();
    expect(stored.data?.depth_scheme).toBe("custom");
    expect(stored.data?.depth_dividers_ft).toEqual([6, 20]);
    expect(stored.data?.contact_dividers_ft).toEqual([3, 10]);
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
    // has no existing row for RLS to filter down to zero. Cleanup for this
    // throwaway program happens in `afterAll` (`otherProgramId`), not here,
    // so a failure inside this test still leaves it findable/cleanable.
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
    otherProgramId = otherProgram.data!.id as string;
    await admin.from("program_members").insert({
      program_id: otherProgramId,
      user_id: teamPlayer.userId,
      role: "player",
    });

    const insert = await teamPlayer.client
      .from("viz_band_settings")
      .insert({ account_id: otherProgramId, depth_scheme: "thirds" });
    expect(insert.error?.code).toBe(INSUFFICIENT_PRIVILEGE);
  });

  // ── fix round 1, #1: the action's exact write shape, proven live ───────

  test("saveBandSettings' write shape lands on the second save too (personal owner)", async () => {
    // A fresh personal account, never before written — the first call takes
    // the plain-INSERT branch (no existing row), the second takes the
    // UPDATE branch. `.upsert()` failed exactly the second call with 42501
    // (`account_id = EXCLUDED.account_id` has no column grant); this proves
    // the replacement doesn't.
    accountIdsToClean.push(stranger.userId);

    const first = await updateThenInsert(
      stranger.client,
      stranger.userId,
      "thirds",
    );
    expect(first.error).toBeNull();
    expect((first.data as { depth_scheme: string } | null)?.depth_scheme).toBe(
      "thirds",
    );

    const second = await updateThenInsert(
      stranger.client,
      stranger.userId,
      "deepMidShort",
    );
    expect(second.error).toBeNull();
    expect((second.data as { depth_scheme: string } | null)?.depth_scheme).toBe(
      "deepMidShort",
    );

    const stillThere = await admin
      .from("viz_band_settings")
      .select("depth_scheme")
      .eq("account_id", stranger.userId)
      .single();
    expect(stillThere.data?.depth_scheme).toBe("deepMidShort");
  });

  test("saveBandSettings' write shape lands on the second save too (team coach)", async () => {
    // The main team's row already exists (created earlier in this file) —
    // both calls here take the UPDATE branch, proving repeat saves by a
    // second authorized role work too, not just the create-then-update
    // sequence the personal-owner case above covers.
    const first = await updateThenInsert(teamCoach.client, programId!, "none");
    expect(first.error).toBeNull();
    expect((first.data as { depth_scheme: string } | null)?.depth_scheme).toBe(
      "none",
    );

    const second = await updateThenInsert(
      teamCoach.client,
      programId!,
      "inside",
    );
    expect(second.error).toBeNull();
    expect((second.data as { depth_scheme: string } | null)?.depth_scheme).toBe(
      "inside",
    );
  });

  test("saveBandSettings' write shape is refused end-to-end for a team player (0 rows updated, insert refused)", async () => {
    const result = await updateThenInsert(
      teamPlayer.client,
      programId!,
      "none",
    );
    // The UPDATE branch runs first and touches 0 rows (no error, no data);
    // `updateThenInsert` then falls through to INSERT, which RLS refuses
    // outright — the shape's final outcome for an unauthorized writer.
    expect(result.error?.code).toBe(INSUFFICIENT_PRIVILEGE);

    const unchanged = await admin
      .from("viz_band_settings")
      .select("depth_scheme")
      .eq("account_id", programId!)
      .single();
    expect(unchanged.data?.depth_scheme).toBe("inside"); // set by the coach test above
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
