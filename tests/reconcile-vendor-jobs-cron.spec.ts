import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

// The scheduled reconcile: a lost vendor webhook is found within minutes, not
// on the uploader's next page load. Source checks, as for the stalled-upload
// sweep — the sweeps themselves are covered by the reconcile specs.

test("the route checks the bearer before it builds the service-role client", () => {
  const src = readFileSync(
    resolve(process.cwd(), "src/app/api/cron/reconcile-vendor-jobs/route.ts"),
    "utf8",
  );
  const auth = src.indexOf(
    "authorizeCronRequest(request, process.env.CRON_SECRET)",
  );
  const refuse = src.indexOf("{ status: 401 }");
  const admin = src.indexOf("createAdminClient()");
  expect(auth).toBeGreaterThan(-1);
  expect(refuse).toBeGreaterThan(auth);
  expect(admin).toBeGreaterThan(refuse);
});

test("the route sweeps every job, not a page's matches", () => {
  const src = readFileSync(
    resolve(process.cwd(), "src/app/api/cron/reconcile-vendor-jobs/route.ts"),
    "utf8",
  );
  expect(src).toContain("reconcileVendorJobs({ supabase, cap: POLL_CAP })");
  expect(src).toContain("recoverUndeliveredResults({ supabase })");
  expect(src).not.toContain("matchIds");
});

test("the schedule runs every ten minutes and carries no secret", () => {
  const dir = resolve(process.cwd(), "supabase/migrations");
  const file = readdirSync(dir).find((name) =>
    name.endsWith("_schedule_vendor_job_reconcile.sql"),
  );
  expect(file).toBeDefined();
  const sql = readFileSync(resolve(dir, file!), "utf8");
  expect(sql).toContain("'*/10 * * * *'");
  expect(sql).toContain("/api/cron/reconcile-vendor-jobs");
  expect(sql).toContain("from vault.decrypted_secrets as secret");
  expect(sql).toContain("where secret.name = 'cron_secret'");
  const code = sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
  expect(code).not.toMatch(/Bearer [A-Za-z0-9_-]{8,}/);
});
