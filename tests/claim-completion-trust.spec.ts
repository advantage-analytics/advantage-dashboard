import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

/**
 * Who may set a claim's review evidence — pinned offline, against the source.
 *
 * `program_claims.domain_matched`, `skips_manual_review` and `match_reason`
 * are printed in the admin review drawer as facts. `complete_program_claim`
 * stores them as its caller passes them, so the caller must be trusted server
 * code: until 2026-10-01 the function was executable by `authenticated`, and
 * any signed-in user could call it through /rest/v1/rpc and write their own.
 *
 * Three things keep that closed, and each has regressed-by-accident written
 * all over it:
 *
 *  1. `completeClaim()` calls the RPC through the service-role client with
 *     the verified user id passed explicitly — never through the session.
 *  2. No migration from the fix onwards grants `complete_program_claim` to
 *     anything but `service_role`. The pilot-terms enforcement file
 *     is the one to watch: it re-creates the function, and once
 *     re-created the exposed overload and granted it to `authenticated`.
 *  3. The legacy overload, for as long as it exists, ignores what it is told.
 *
 * The live half is `claim-completion-rpc-live.spec.ts`.
 *
 * Run on demand:  npx playwright test claim-completion-trust
 */

const MIGRATIONS = "supabase/migrations";
const FIX = "20261001183845_claim_completion_service_role_only.sql";
const PILOT_TERMS = "20261002044101_pilot_terms_enforcement.sql";

const read = (path: string) => readFileSync(path, "utf8");

/** SQL with `--` comments removed, so a commented rollback is not a statement. */
function statements(file: string): string {
  return read(join(MIGRATIONS, file))
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

test("completeClaim calls the RPC through the service role, with the verified user", () => {
  const source = read("src/lib/services/programs/claim-actions.ts");
  const start = source.indexOf("export async function completeClaim()");
  const body = source.slice(
    start,
    source.indexOf("export async function completeClaimWithToken", start),
  );

  expect(body).toMatch(
    /await db\.rpc\("complete_program_claim", \{\s*p_claimant_user_id: user\.id,/,
  );
  // The session client may read the user; it may not make this call.
  expect(body).not.toMatch(/supabase\.rpc\(/);
  // And the evidence still comes from the server's own check.
  expect(body).toContain("p_domain_matched: check.domainMatched");
  expect(body).toContain("p_skips_manual_review: check.skipsManualReview");
  expect(body).toContain("p_match_reason: check.reason");
});

test("no migration from the fix onwards grants complete_program_claim beyond the service role", () => {
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .filter((f) => f >= FIX);
  expect(files).toContain(FIX);

  // `complete_program_claim(` only — the `_with_token` sibling has its own
  // signature and was service-role-only from the start.
  const grant =
    /grant\s+execute\s+on\s+function\s+public\.complete_program_claim\s*\([^)]*\)\s*to\s+([^;]+);/gi;

  let seen = 0;
  for (const file of files) {
    for (const match of statements(file).matchAll(grant)) {
      seen += 1;
      const grantees = match[1].split(",").map((g) => g.trim().toLowerCase());
      expect(grantees, `${file} grants to ${match[1].trim()}`).toEqual([
        "service_role",
      ]);
    }
  }
  expect(seen).toBeGreaterThan(0);
});

test("every create of the service-role overload is followed by a revoke from authenticated", () => {
  // Supabase's default privileges give EXECUTE on a new public function to
  // anon and authenticated, so a `create` without the revoke is an exposure.
  for (const file of [FIX, PILOT_TERMS]) {
    const sql = statements(file);
    expect(sql, file).toMatch(
      /function public\.complete_program_claim\(\s*p_claimant_user_id\s+uuid,/,
    );
    expect(sql, file).toMatch(
      /revoke\s+execute\s+on\s+function\s+public\.complete_program_claim\(\s*uuid, text, text, text, text, boolean, boolean, text\s*\)\s*from public, anon, authenticated;/,
    );
    // The exposed signature is never created again.
    expect(sql, file).not.toMatch(
      /create\s+function\s+public\.complete_program_claim\(\s*p_program_key/,
    );
  }
});

test("the legacy overload records no caller-supplied evidence", () => {
  const sql = statements(FIX);
  const legacy = sql.slice(
    sql.indexOf(
      "create or replace function public.complete_program_claim(\n  p_program_key",
    ),
  );
  expect(legacy.length).toBeGreaterThan(0);

  const insert = legacy.slice(
    legacy.indexOf("insert into public.program_claims"),
    legacy.indexOf("insert into public.program_members"),
  );
  expect(insert).toContain("false, false, v_contact,");
  expect(insert).not.toContain("p_domain_matched");
  expect(insert).not.toContain("p_skips_manual_review");
  expect(insert).not.toContain("p_match_reason");
});

test("the pilot-terms enforcement file no longer re-creates the exposed overload", () => {
  const sql = statements(PILOT_TERMS);
  expect(sql).not.toMatch(
    /complete_program_claim\(\s*text, text, text, text, boolean, boolean, text\s*\)/,
  );
  // The gate reads the explicit claimant, since a service-role call has no
  // `auth.uid()`.
  const body = sql.slice(
    sql.indexOf("create or replace function public.complete_program_claim("),
    sql.indexOf(
      "create or replace function public.complete_program_claim_with_token(",
    ),
  );
  expect(body).toContain("v_uid     uuid := p_claimant_user_id;");
  expect(body).toContain("perform public.assert_pilot_terms_accepted(v_uid);");
  expect(body).not.toContain("auth.uid()");
});
