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
 * `20260919180000_saved_views.sql`'s RLS policies (Task 7), proven against
 * the live database rather than the migration's own claims:
 *
 *  1. Personal workspace (`account_id = auth.uid()`): the owner can insert
 *     and read their own view; a stranger sees none of it, cannot insert
 *     under someone else's `account_id`, cannot spoof `created_by`, and
 *     cannot set `shared = true` on a personal view. A duplicate name
 *     differing only by case is a unique violation.
 *  2. Team workspace (`account_id = programs.id`): a player's private view is
 *     invisible to a teammate and to staff, and staff cannot write it while
 *     it stays private. Once its creator flips it `shared = true`, every
 *     member can see it, but only its creator or staff (moderation) can
 *     rename or delete it. A non-member cannot insert against that
 *     `account_id`. Two players may each own a private view with the same
 *     name; two shared views with the same name collide.
 *  3. Column privileges (fix round 1): the UPDATE policy's staff-moderation
 *     branch has no column restriction of its own, so `id`, `account_id`,
 *     `created_by` and `created_at` are locked down at the grant level
 *     instead — neither staff nor the row's own creator can rewrite them.
 *     Staff CAN still flip `shared` back to `false` (the column the grant
 *     does allow), and the creator keeps seeing their own row either way.
 *     An unauthenticated (anon) client gets no rows and/or a permission
 *     error — `anon` was revoked along with everyone else.
 *
 * **This spec is written ahead of the migration being applied** — Task 7
 * Step 2 (`apply_migration`) is a separate, human-approved step. Before
 * creating any fixture, `beforeAll` probes for `public.saved_views` and, if
 * it is missing (PostgREST's `PGRST205`, "Could not find the table ... in
 * the schema cache"), skips every test with a clear reason and creates no
 * users or programs — a run before the migration lands leaves no residue on
 * the live project.
 *
 * A crashed run after the migration is applied is findable by hand:
 * `select * from programs where school_name like 'ZZ RLS saved_views%'`.
 *
 * Run on demand:  npx playwright test saved-views-rls
 */

const UNIQUE_VIOLATION = "23505";
/** PostgREST's code when a table isn't in its schema cache — including when
 *  it does not exist yet, which is how this spec detects the migration has
 *  not been applied. */
const UNDEFINED_TABLE = "PGRST205";

const { mark: MARK, password: PASSWORD } = runMarker("saved-views-rls");
const PROGRAM_NAME = `ZZ RLS saved_views ${MARK}`;

test.describe("saved_views RLS (live)", () => {
  test.describe.configure({ mode: "serial", timeout: 60_000 });
  test.skip(!HAVE_ENV, SKIP_REASON);

  let admin: SupabaseClient; // service role
  /** Set by the table probe; every test and the cleanup consult it. */
  let tableMissing: string | null = null;

  let userA: Session; // personal workspace owner
  let userB: Session; // personal workspace owner, stranger to A
  let player1: Session; // team member, role player
  let player2: Session; // team member, role player
  let staff: Session; // team member, role staff
  let nonMember: Session; // signed in, no membership on the team

  const authUserIds: string[] = [];
  let programId: string | null = null;

  /** The private view Player1 creates, then shares, across several tests. */
  let sharedFlowRowId: string;

  test.beforeAll(async () => {
    test.setTimeout(180_000);
    admin = createAdminClient();

    // Never create a user or a program before knowing the table exists.
    const probe = await admin.from("saved_views").select("id").limit(1);
    if (probe.error?.code === UNDEFINED_TABLE) {
      tableMissing =
        "public.saved_views does not exist yet — migration " +
        "20260919180000_saved_views.sql has not been applied (Task 7 Step 2 " +
        "is a separate, human-approved step). Re-run this spec after it lands.";
      return;
    }
    if (probe.error) {
      throw new Error(`saved_views probe: ${probe.error.message}`);
    }

    [userA, userB, player1, player2, staff, nonMember] = await createLogins(
      admin,
      ["userA", "userB", "player1", "player2", "staff", "nonMember"],
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
      { program_id: programId, user_id: player1.userId, role: "player" },
      { program_id: programId, user_id: player2.userId, role: "player" },
      { program_id: programId, user_id: staff.userId, role: "staff" },
    ]);
    if (members.error) {
      throw new Error(`members: ${members.error.message}`);
    }
  });

  test.beforeEach(() => {
    test.skip(tableMissing !== null, tableMissing ?? "");
  });

  test.afterAll(async () => {
    if (!admin || tableMissing !== null) return;
    await admin.from("saved_views").delete().in("created_by", authUserIds);
    if (programId) {
      await admin.from("program_members").delete().eq("program_id", programId);
      await admin.from("programs").delete().eq("id", programId);
    }
    await deleteAuthUsers(admin, authUserIds);
  });

  // ── personal workspace ─────────────────────────────────────────────────

  test("a user can insert and read their own personal view", async () => {
    const insert = await userA.client
      .from("saved_views")
      .insert({
        account_id: userA.userId,
        name: "My Serve Chart",
        cut: "serve",
        chart: "scatter",
      })
      .select("id")
      .single();
    expect(insert.error).toBeNull();

    const select = await userA.client
      .from("saved_views")
      .select("id")
      .eq("id", insert.data!.id as string);
    expect(select.error).toBeNull();
    expect(select.data).toHaveLength(1);
  });

  test("a stranger selecting another user's personal views gets zero rows", async () => {
    const select = await userB.client
      .from("saved_views")
      .select("id")
      .eq("account_id", userA.userId);
    expect(select.error).toBeNull();
    expect(select.data).toHaveLength(0);
  });

  test("a stranger cannot insert a personal view under someone else's account_id", async () => {
    const insert = await userB.client.from("saved_views").insert({
      account_id: userA.userId,
      name: "Hijacked",
      cut: "serve",
      chart: "scatter",
    });
    expect(insert.error?.code).toBe(INSUFFICIENT_PRIVILEGE);
  });

  test("created_by cannot be spoofed to another user", async () => {
    const insert = await userB.client.from("saved_views").insert({
      account_id: userB.userId,
      created_by: userA.userId,
      name: "Spoofed",
      cut: "serve",
      chart: "scatter",
    });
    expect(insert.error?.code).toBe(INSUFFICIENT_PRIVILEGE);
  });

  test("a personal view with shared=true is rejected", async () => {
    const insert = await userA.client.from("saved_views").insert({
      account_id: userA.userId,
      name: "Should Not Share",
      cut: "serve",
      chart: "scatter",
      shared: true,
    });
    expect(insert.error?.code).toBe(INSUFFICIENT_PRIVILEGE);
  });

  test("a duplicate personal view name differing only by case is a unique violation", async () => {
    const first = await userA.client.from("saved_views").insert({
      account_id: userA.userId,
      name: "Return Zones",
      cut: "returnPlacement",
      chart: "zones",
    });
    expect(first.error).toBeNull();

    const dup = await userA.client.from("saved_views").insert({
      account_id: userA.userId,
      name: "  return zones  ",
      cut: "returnPlacement",
      chart: "zones",
    });
    expect(dup.error?.code).toBe(UNIQUE_VIOLATION);
  });

  // ── team workspace ─────────────────────────────────────────────────────

  test("a player can insert a private team view, invisible to a teammate and to staff", async () => {
    const insert = await player1.client
      .from("saved_views")
      .insert({
        account_id: programId,
        name: "Player1 Draft",
        cut: "serve",
        chart: "scatter",
      })
      .select("id")
      .single();
    expect(insert.error).toBeNull();
    sharedFlowRowId = insert.data!.id as string;

    const byPlayer2 = await player2.client
      .from("saved_views")
      .select("id")
      .eq("id", sharedFlowRowId);
    expect(byPlayer2.data).toHaveLength(0);

    const byStaff = await staff.client
      .from("saved_views")
      .select("id")
      .eq("id", sharedFlowRowId);
    expect(byStaff.data).toHaveLength(0);
  });

  test("a private row is never visible to or writable by staff", async () => {
    const update = await staff.client
      .from("saved_views")
      .update({ name: "Renamed By Staff" })
      .eq("id", sharedFlowRowId)
      .select("id");
    expect(update.error).toBeNull();
    expect(update.data).toHaveLength(0);

    const del = await staff.client
      .from("saved_views")
      .delete()
      .eq("id", sharedFlowRowId)
      .select("id");
    expect(del.error).toBeNull();
    expect(del.data).toHaveLength(0);

    const stillThere = await admin
      .from("saved_views")
      .select("name")
      .eq("id", sharedFlowRowId)
      .single();
    expect(stillThere.data?.name).toBe("Player1 Draft");
  });

  test("a non-member cannot insert a team view", async () => {
    const insert = await nonMember.client.from("saved_views").insert({
      account_id: programId,
      name: "Outsider",
      cut: "serve",
      chart: "scatter",
    });
    expect(insert.error?.code).toBe(INSUFFICIENT_PRIVILEGE);
  });

  test("the owner shares the view; it becomes visible to the teammate and staff", async () => {
    const update = await player1.client
      .from("saved_views")
      .update({ shared: true })
      .eq("id", sharedFlowRowId)
      .select("id");
    expect(update.error).toBeNull();
    expect(update.data).toHaveLength(1);

    const byPlayer2 = await player2.client
      .from("saved_views")
      .select("id")
      .eq("id", sharedFlowRowId);
    expect(byPlayer2.data).toHaveLength(1);

    const byStaff = await staff.client
      .from("saved_views")
      .select("id")
      .eq("id", sharedFlowRowId);
    expect(byStaff.data).toHaveLength(1);
  });

  test("a teammate who did not create the now-shared view cannot update or delete it", async () => {
    const update = await player2.client
      .from("saved_views")
      .update({ name: "Renamed By Player2" })
      .eq("id", sharedFlowRowId)
      .select("id");
    expect(update.error).toBeNull();
    expect(update.data).toHaveLength(0);

    const del = await player2.client
      .from("saved_views")
      .delete()
      .eq("id", sharedFlowRowId)
      .select("id");
    expect(del.error).toBeNull();
    expect(del.data).toHaveLength(0);
  });

  test("staff can delete the now-shared view (moderation)", async () => {
    const del = await staff.client
      .from("saved_views")
      .delete()
      .eq("id", sharedFlowRowId)
      .select("id");
    expect(del.error).toBeNull();
    expect(del.data).toHaveLength(1);

    const gone = await admin
      .from("saved_views")
      .select("id")
      .eq("id", sharedFlowRowId);
    expect(gone.data).toHaveLength(0);
  });

  test("two players may each own a private view with the same name", async () => {
    const one = await player1.client.from("saved_views").insert({
      account_id: programId,
      name: "My Notes",
      cut: "serve",
      chart: "scatter",
    });
    expect(one.error).toBeNull();

    const two = await player2.client.from("saved_views").insert({
      account_id: programId,
      name: "My Notes",
      cut: "serve",
      chart: "scatter",
    });
    expect(two.error).toBeNull();
  });

  test("two shared views with the same name collide", async () => {
    const one = await player1.client.from("saved_views").insert({
      account_id: programId,
      name: "Team Favorite",
      cut: "serve",
      chart: "scatter",
      shared: true,
    });
    expect(one.error).toBeNull();

    const two = await player2.client.from("saved_views").insert({
      account_id: programId,
      name: "Team Favorite",
      cut: "returnPlacement",
      chart: "zones",
      shared: true,
    });
    expect(two.error?.code).toBe(UNIQUE_VIOLATION);
  });

  // ── column privileges (fix round 1) ───────────────────────────────────
  // The UPDATE policy's staff-moderation branch (`or public.is_program_staff(account_id)`)
  // has no column restriction of its own — without the grant, a moderator
  // could reassign authorship or move a view to another program through it.
  // Column privileges are checked before RLS, so these are permission
  // errors (42501), not RLS 0-row no-ops.

  test("staff cannot rewrite created_by on a shared view (column privilege)", async () => {
    const insert = await player1.client
      .from("saved_views")
      .insert({
        account_id: programId,
        name: "Guard Created_by",
        cut: "serve",
        chart: "scatter",
        shared: true,
      })
      .select("id")
      .single();
    expect(insert.error).toBeNull();
    const rowId = insert.data!.id as string;

    const update = await staff.client
      .from("saved_views")
      .update({ created_by: staff.userId })
      .eq("id", rowId);
    expect(update.error?.code).toBe(INSUFFICIENT_PRIVILEGE);

    const unchanged = await admin
      .from("saved_views")
      .select("created_by")
      .eq("id", rowId)
      .single();
    expect(unchanged.data?.created_by).toBe(player1.userId);
  });

  test("staff cannot rewrite account_id on a shared view (column privilege)", async () => {
    const insert = await player1.client
      .from("saved_views")
      .insert({
        account_id: programId,
        name: "Guard Account_id Staff",
        cut: "serve",
        chart: "scatter",
        shared: true,
      })
      .select("id")
      .single();
    expect(insert.error).toBeNull();
    const rowId = insert.data!.id as string;

    const update = await staff.client
      .from("saved_views")
      .update({ account_id: userA.userId })
      .eq("id", rowId);
    expect(update.error?.code).toBe(INSUFFICIENT_PRIVILEGE);

    const unchanged = await admin
      .from("saved_views")
      .select("account_id")
      .eq("id", rowId)
      .single();
    expect(unchanged.data?.account_id).toBe(programId);
  });

  test("the creator cannot rewrite account_id on their own row (column privilege)", async () => {
    const insert = await player1.client
      .from("saved_views")
      .insert({
        account_id: programId,
        name: "Guard Account_id Owner",
        cut: "serve",
        chart: "scatter",
      })
      .select("id")
      .single();
    expect(insert.error).toBeNull();
    const rowId = insert.data!.id as string;

    const update = await player1.client
      .from("saved_views")
      .update({ account_id: userA.userId })
      .eq("id", rowId);
    expect(update.error?.code).toBe(INSUFFICIENT_PRIVILEGE);

    const unchanged = await admin
      .from("saved_views")
      .select("account_id")
      .eq("id", rowId)
      .single();
    expect(unchanged.data?.account_id).toBe(programId);
  });

  test("staff can unshare a view; the creator still sees it", async () => {
    const insert = await player1.client
      .from("saved_views")
      .insert({
        account_id: programId,
        name: "Staff Unshares This",
        cut: "serve",
        chart: "scatter",
        shared: true,
      })
      .select("id")
      .single();
    expect(insert.error).toBeNull();
    const rowId = insert.data!.id as string;

    const update = await staff.client
      .from("saved_views")
      .update({ shared: false })
      .eq("id", rowId)
      .select("id");
    expect(update.error).toBeNull();
    expect(update.data).toHaveLength(1);

    const byCreator = await player1.client
      .from("saved_views")
      .select("id")
      .eq("id", rowId);
    expect(byCreator.data).toHaveLength(1);

    // No longer shared, and player2 never owned it — invisible again.
    const byPlayer2 = await player2.client
      .from("saved_views")
      .select("id")
      .eq("id", rowId);
    expect(byPlayer2.data).toHaveLength(0);
  });

  test("an anonymous client cannot read saved_views", async () => {
    const anon = createClient(SUPABASE_URL!, ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const select = await anon.from("saved_views").select("id").limit(1);
    if (select.error) {
      expect(select.error.code).toBeTruthy();
    } else {
      expect(select.data).toHaveLength(0);
    }
  });
});
