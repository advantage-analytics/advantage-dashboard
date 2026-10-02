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
import { updateThenInsert } from "@/lib/data/viz-bands-write";

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

const { mark: MARK } = runMarker("viz-bands-rls");
const PROGRAM_NAME = `ZZ RLS viz_band_settings ${MARK}`;

/** Pool slots, prefixed with this spec's name so no other spec draws them. */
const SLOTS = [
  "viz-bands-rls-personal-owner",
  "viz-bands-rls-stranger",
  "viz-bands-rls-team-owner",
  "viz-bands-rls-team-coach",
  "viz-bands-rls-team-staff",
  "viz-bands-rls-team-player",
  "viz-bands-rls-non-member",
];

/**
 * The action's EXACT write path (`@/lib/data/viz-bands-write`, imported —
 * never a copy that could drift from what the action issues), run as each
 * raw `supabase-js` session. Only the depth scheme varies between calls; the
 * other two columns are written as their defaults.
 */
function writeScheme(
  client: SupabaseClient,
  accountId: string,
  depthScheme: "none" | "thirds" | "deepMidShort",
) {
  return updateThenInsert(client, accountId, {
    depth_scheme: depthScheme,
    depth_dividers_ft: null,
    contact_dividers_ft: [0, 5],
  });
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

  /** The pool users' ids — each is also a personal `account_id` the tests may write. */
  let poolUserIds: string[] = [];
  let programId: string | null = null;
  /** The throwaway solo program the player-insert-probe test creates, if it
   *  gets that far — cleaned up in `afterAll` regardless of pass/fail. */
  let otherProgramId: string | null = null;

  test.beforeAll(async () => {
    test.setTimeout(180_000);
    admin = createAdminClient();

    // Pool users outlive the run, and so would a crashed run's personal rows:
    // the owner's first write below must be a plain INSERT, and the
    // stranger's "fresh personal account" must be fresh.
    const leftoverIds = await clearPoolLeftovers(admin, SLOTS);
    if (leftoverIds.length > 0) {
      const swept = await admin
        .from("viz_band_settings")
        .delete()
        .in("account_id", leftoverIds);
      if (swept.error) {
        throw new Error(`viz_band_settings sweep: ${swept.error.message}`);
      }
    }

    const sessions = await poolLogins(admin, SLOTS);
    [
      personalOwner,
      stranger,
      teamOwner,
      teamCoach,
      teamStaff,
      teamPlayer,
      nonMember,
    ] = sessions;
    poolUserIds = sessions.map((s) => s.userId);

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
        ...poolUserIds,
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
  });

  // ── personal workspace ─────────────────────────────────────────────────

  test("a personal owner can insert and update their own band settings", async () => {
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
      .update({ depth_scheme: "none" })
      .eq("account_id", programId)
      .select("depth_scheme")
      .single();
    expect(byCoach.error).toBeNull();
    expect(byCoach.data?.depth_scheme).toBe("none");

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
    const first = await writeScheme(stranger.client, stranger.userId, "thirds");
    expect(first.error).toBeNull();
    expect((first.data as { depth_scheme: string } | null)?.depth_scheme).toBe(
      "thirds",
    );

    const second = await writeScheme(
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
    const first = await writeScheme(teamCoach.client, programId!, "none");
    expect(first.error).toBeNull();
    expect((first.data as { depth_scheme: string } | null)?.depth_scheme).toBe(
      "none",
    );

    const second = await writeScheme(teamCoach.client, programId!, "thirds");
    expect(second.error).toBeNull();
    expect((second.data as { depth_scheme: string } | null)?.depth_scheme).toBe(
      "thirds",
    );
  });

  test("saveBandSettings' write shape is refused end-to-end for a team player (0 rows updated, insert refused)", async () => {
    const result = await writeScheme(teamPlayer.client, programId!, "none");
    // The UPDATE branch runs first and touches 0 rows (no error, no data);
    // `updateThenInsert` then falls through to INSERT, which RLS refuses
    // outright — the shape's final outcome for an unauthorized writer.
    expect(result.error?.code).toBe(INSUFFICIENT_PRIVILEGE);

    const unchanged = await admin
      .from("viz_band_settings")
      .select("depth_scheme")
      .eq("account_id", programId!)
      .single();
    expect(unchanged.data?.depth_scheme).toBe("thirds"); // set by the coach test above
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
