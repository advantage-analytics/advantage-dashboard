import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

// pg_cron calls the app only when the database has work for it. An ungated
// GET every five or ten minutes is ~430 Vercel invocations a day for nothing,
// which is what took the Hobby plan to 90% of its Fluid Active CPU allowance.

const dir = resolve(process.cwd(), "supabase/migrations");
const file = readdirSync(dir).find((name) =>
  name.endsWith("_gate_cron_http_on_pending_work.sql"),
);

function jobBody(sql: string, name: string): string {
  const start = sql.indexOf(`'${name}'`);
  expect(start).toBeGreaterThan(-1);
  const open = sql.indexOf("$job$", start);
  const close = sql.indexOf("$job$", open + 5);
  return sql.slice(open, close);
}

test("both HTTP crons are gated on pending work", () => {
  expect(file).toBeDefined();
  const sql = readFileSync(resolve(dir, file!), "utf8");

  const reap = jobBody(sql, "reap-stalled-uploads");
  expect(reap).toContain(
    "select public.reap_stalled_uploads(interval '6 hours');",
  );
  expect(reap).toContain("and exists (");
  expect(reap).toContain("job.status = 'uploading'");
  // Same 20 minutes as UPLOAD_PAUSED_AFTER_MS, same key as claimKey().
  expect(reap).toContain("interval '20 minutes'");
  expect(reap).toContain("'upload_paused:' || job.id::text");

  const reconcile = jobBody(sql, "reconcile-vendor-jobs");
  expect(reconcile).toContain("and exists (");
  expect(reconcile).toContain("job.status = 'queued'");
  expect(reconcile).toContain("job.status in ('submitting', 'processing')");
  // Same 30 minutes as STALE_AFTER_MS in reconcile.ts.
  expect(reconcile).toContain("interval '30 minutes'");
  expect(reconcile).toContain("job.results_object_key is null");

  expect(sql).toContain("'*/5 * * * *'");
  expect(sql).toContain("'*/10 * * * *'");
  const code = sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
  expect(code).not.toMatch(/Bearer [A-Za-z0-9_-]{8,}/);
});

test("the gate's thresholds still match the sweeps they guard", () => {
  const analysis = readFileSync(
    resolve(process.cwd(), "src/lib/data/match-analysis.ts"),
    "utf8",
  );
  expect(analysis).toContain("UPLOAD_PAUSED_AFTER_MS = 20 * 60 * 1000");
  const reconcile = readFileSync(
    resolve(process.cwd(), "src/lib/services/splitstep/reconcile.ts"),
    "utf8",
  );
  expect(reconcile).toContain("STALE_AFTER_MS = 30 * 60 * 1000");
  expect(reconcile).toContain(
    'POLLABLE_STATUSES = ["submitting", "queued", "processing"]',
  );
  const mail = readFileSync(
    resolve(
      process.cwd(),
      "src/lib/services/notifications/upload-paused-mail.ts",
    ),
    "utf8",
  );
  expect(mail).toContain("return `upload_paused:${jobId}`;");
});
