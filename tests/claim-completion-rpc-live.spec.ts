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
  clearPoolLeftovers,
  poolEmail,
  poolLogins,
} from "./fixtures/live-db-pool";

/**
 * `*_claim_completion_service_role_only.sql`, proven against the live
 * database rather than the migration's own claims: a signed-in user calling
 * `complete_program_claim` directly cannot set the evidence an admin reads.
 *
 *  1. The service-role overload refuses `authenticated` and `anon` at the
 *     grant, and creates nothing.
 *  2. The service role itself is refused when the claimed address is not the
 *     claimant account's own.
 *  3. The legacy 7-argument overload, while it still exists, stores
 *     `false / false` and its own reason whatever it is passed. Once
 *     `*_drop_legacy_complete_program_claim.sql` is applied PostgREST reports
 *     `PGRST202` instead, and that is the stronger pass.
 *
 * One throwaway unclaimed college program per run, deleted by id in
 * `afterAll`; its claims cascade with it. Test 3 is the only one that writes
 * and it runs last, because it makes the pool user the program's owner.
 *
 * A crashed run is findable by hand:
 * `select * from programs where program_key like 'claim-rpc-live-%'`.
 *
 * Run on demand:  npx playwright test claim-completion-rpc-live
 */

/** PostgREST: no function matches the name and argument names sent. */
const FUNCTION_NOT_FOUND = "PGRST202";

const { mark: MARK } = runMarker("claim-rpc-live");
const SLOTS = ["claim-completion-rpc-live-claimant"];
const CLAIMANT_EMAIL = poolEmail(SLOTS[0]);

const FORGED_REASON = "domain matched (harvard.edu)";

test.describe("complete_program_claim evidence trust (live)", () => {
  test.describe.configure({ mode: "serial", timeout: 60_000 });
  test.skip(!HAVE_ENV, SKIP_REASON);

  let admin: SupabaseClient;
  let claimant: Session;
  let programId: string | null = null;

  const serviceArgs = (email: string) => ({
    p_claimant_user_id: claimant.userId,
    p_program_key: MARK,
    p_claimed_email: email,
    p_claimant_name: "Forged Evidence",
    p_claimant_role: "other",
    p_domain_matched: true,
    p_skips_manual_review: true,
    p_match_reason: FORGED_REASON,
  });

  async function claimRows() {
    const rows = await admin
      .from("program_claims")
      .select("domain_matched, skips_manual_review, match_reason, status")
      .eq("program_id", programId!);
    if (rows.error) throw new Error(`claims read: ${rows.error.message}`);
    return rows.data;
  }

  test.beforeAll(async () => {
    test.setTimeout(180_000);
    admin = createAdminClient();

    // A crashed run leaves the pool user owning its program; the pool sweep
    // takes programs by owner.
    await clearPoolLeftovers(admin, SLOTS);
    [claimant] = await poolLogins(admin, SLOTS);

    const program = await admin
      .from("programs")
      .insert({
        program_key: MARK,
        school_group: MARK,
        school_name: `ZZ Claim RPC ${MARK}`,
        team: "mens",
      })
      .select("id, status")
      .single();
    if (program.error) throw new Error(`program: ${program.error.message}`);
    expect(program.data.status).toBe("unclaimed");
    programId = program.data.id as string;
  });

  test.afterAll(async () => {
    if (!admin || !programId) return;
    await admin.from("program_members").delete().eq("program_id", programId);
    const gone = await admin.from("programs").delete().eq("id", programId);
    if (gone.error) throw new Error(`program delete: ${gone.error.message}`);
  });

  test("a signed-in session cannot call the service-role overload", async () => {
    const attempt = await claimant.client.rpc(
      "complete_program_claim",
      serviceArgs(CLAIMANT_EMAIL),
    );
    expect(attempt.data).toBeNull();
    expect(attempt.error?.code).toBe(INSUFFICIENT_PRIVILEGE);
    expect(await claimRows()).toHaveLength(0);
  });

  test("an anonymous client cannot call it either", async () => {
    const anon = createClient(SUPABASE_URL!, ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const attempt = await anon.rpc(
      "complete_program_claim",
      serviceArgs(CLAIMANT_EMAIL),
    );
    expect(attempt.data).toBeNull();
    expect(attempt.error).not.toBeNull();
    expect(await claimRows()).toHaveLength(0);
  });

  test("the service role is refused an address that is not the claimant's", async () => {
    const attempt = await admin.rpc(
      "complete_program_claim",
      serviceArgs(`someone-else-${MARK}@example.edu`),
    );
    expect(attempt.data).toBeNull();
    expect(attempt.error?.code).toBe(INSUFFICIENT_PRIVILEGE);
    expect(await claimRows()).toHaveLength(0);
  });

  test("the legacy overload stores no caller-supplied evidence", async () => {
    const attempt = await claimant.client.rpc("complete_program_claim", {
      p_program_key: MARK,
      p_claimed_email: CLAIMANT_EMAIL,
      p_claimant_name: "Forged Evidence",
      p_claimant_role: "other",
      p_domain_matched: true,
      p_skips_manual_review: true,
      p_match_reason: FORGED_REASON,
    });

    if (attempt.error?.code === FUNCTION_NOT_FOUND) {
      // Dropped: a direct call can no longer start a claim at all.
      expect(await claimRows()).toHaveLength(0);
      return;
    }
    expect(attempt.error).toBeNull();

    const rows = await claimRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("pending_review");
    expect(rows[0].domain_matched).toBe(false);
    expect(rows[0].skips_manual_review).toBe(false);
    expect(rows[0].match_reason).not.toBe(FORGED_REASON);
    expect(rows[0].match_reason).toContain("not recorded");
  });
});
