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
import {
  POOL_USER_DEFAULTS,
  clearPoolLeftovers,
  poolLogins,
} from "./fixtures/live-db-pool";

/**
 * `20260928004752_search_custom_programs.sql`, proven against the live
 * database.
 *
 * Custom orgs are private workspaces (20260830050000): the `programs` SELECT
 * policy hides them from non-members. `search_custom_programs` deliberately
 * publishes three facts about them — name, type, owner as "Elena V." — to
 * signed-in users, and nothing else. This file is the fence around that
 * boundary:
 *
 *  1. An anonymous client calling the RPC gets a permission error, not rows.
 *  2. A signed-in non-member searching the org's name gets exactly one row
 *     carrying exactly `program_id, school_name, org_type, owner_display`,
 *     with the owner's first name and surname initial — never
 *     `owner_user_id`, `status` or a contact column.
 *  3. The same non-member's plain `from("programs").select()` for that row
 *     still returns nothing: the member-only SELECT policy is untouched.
 *  4. Narrowing to another org type excludes the row.
 *
 * The org is created the way the product creates it, through
 * `create_custom_program` as user A, so the row carries whatever that RPC
 * writes. A crashed run's program is findable by hand:
 * `select * from programs where school_name like 'ZZ RLS custom_search%'`;
 * the pool sweep also takes it, since the pool user owns it.
 *
 * Run on demand:  npx playwright test custom-program-search-rls
 */

const { mark: MARK } = runMarker("custom-search-rls");
// The marker leads so the term below is a prefix hit unique to this run.
const ORG_NAME = `ZZ RLS custom_search ${MARK}`;
const ORG_TYPE = "club";

// Stored casing comes back verbatim: the SQL does not title-case, the
// TypeScript (`titleCaseName`) does, later.
const FIRST_NAME = "eLENA";
const LAST_NAME = "vasQUEZ";
const EXPECTED_OWNER = "eLENA v.";

const SLOTS = [
  "custom-program-search-rls-owner",
  "custom-program-search-rls-stranger",
];

type SearchRow = Record<string, unknown>;

test.describe("search_custom_programs (live)", () => {
  test.describe.configure({ mode: "serial", timeout: 60_000 });
  test.skip(!HAVE_ENV, SKIP_REASON);

  let admin: SupabaseClient;
  let owner: Session; // user A: made the org, owns it
  let stranger: Session; // user B: signed in, no membership anywhere

  let programId: string | null = null;

  test.beforeAll(async () => {
    test.setTimeout(180_000);
    admin = createAdminClient();

    await clearPoolLeftovers(admin, SLOTS);
    [owner, stranger] = await poolLogins(admin, SLOTS);

    const named = await admin
      .from("users")
      .update({ first_name: FIRST_NAME, last_name: LAST_NAME })
      .eq("id", owner.userId)
      .select("first_name, last_name")
      .single();
    if (named.error) throw new Error(`users: ${named.error.message}`);

    const created = await owner.client.rpc("create_custom_program", {
      p_name: ORG_NAME,
      p_org_type: ORG_TYPE,
    });
    if (created.error) {
      throw new Error(`create_custom_program: ${created.error.message}`);
    }
    programId = (created.data as { program_id: string }).program_id;
  });

  test.afterAll(async () => {
    test.setTimeout(180_000);
    if (!admin) return;
    if (programId) {
      await admin.from("program_members").delete().eq("program_id", programId);
      await admin.from("programs").delete().eq("id", programId);
    }
    if (owner) {
      await admin
        .from("users")
        .update({
          first_name: POOL_USER_DEFAULTS.first_name,
          last_name: POOL_USER_DEFAULTS.last_name,
        })
        .eq("id", owner.userId);
    }
  });

  test("an anonymous client cannot call the RPC", async () => {
    const anon = createClient(SUPABASE_URL!, ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await anon.rpc("search_custom_programs", {
      p_term: MARK,
      p_org_type: null,
    });
    expect(error).not.toBeNull();
    expect(error!.code).toBe(INSUFFICIENT_PRIVILEGE);
    expect(data).toBeNull();
  });

  test("a signed-in non-member gets the name, type and owner initial — and nothing else", async () => {
    const { data, error } = await stranger.client.rpc(
      "search_custom_programs",
      { p_term: MARK, p_org_type: null },
    );
    expect(error).toBeNull();

    const rows = (data ?? []) as SearchRow[];
    expect(rows).toHaveLength(1);

    const row = rows[0];
    expect(row.program_id).toBe(programId);
    expect(row.school_name).toBe(ORG_NAME);
    expect(row.org_type).toBe(ORG_TYPE);
    expect(row.owner_display).toBe(EXPECTED_OWNER);

    // The projection is closed. Spelled out rather than "not owner_user_id",
    // so a column added to the SQL later fails here by name.
    expect(Object.keys(row).sort()).toEqual([
      "org_type",
      "owner_display",
      "program_id",
      "school_name",
    ]);
    expect(row).not.toHaveProperty("owner_user_id");
    expect(row).not.toHaveProperty("status");
  });

  test("narrowing to another custom type excludes the row; its own type keeps it", async () => {
    const other = await stranger.client.rpc("search_custom_programs", {
      p_term: MARK,
      p_org_type: "academy",
    });
    expect(other.error).toBeNull();
    expect(other.data).toEqual([]);

    const same = await stranger.client.rpc("search_custom_programs", {
      p_term: MARK,
      p_org_type: ORG_TYPE,
    });
    expect(same.error).toBeNull();
    expect((same.data as SearchRow[]).map((r) => r.program_id)).toEqual([
      programId,
    ]);
  });

  test("the non-member still reads nothing from programs directly", async () => {
    const { data, error } = await stranger.client
      .from("programs")
      .select("id, school_name, owner_user_id")
      .eq("id", programId!);
    expect(error).toBeNull();
    expect(data).toEqual([]);

    // Control: the policy is member-only, not broken — the owner reads it.
    const own = await owner.client
      .from("programs")
      .select("id")
      .eq("id", programId!);
    expect(own.error).toBeNull();
    expect(own.data).toHaveLength(1);
  });
});
