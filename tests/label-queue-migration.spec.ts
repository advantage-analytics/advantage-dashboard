import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

// T22: the labeller queue's migration — claims, the starting flag count and
// the stale-claim release. Source checks on the committed file, read as text:
// nothing here needs a database. The live database is the source of truth;
// this pins what the repo promised to apply to it.

const dir = resolve(process.cwd(), "supabase/migrations");
const file = readdirSync(dir).find((name) =>
  name.endsWith("_label_queue_claims.sql"),
);
const sql = file ? readFileSync(resolve(dir, file), "utf8") : "";

/** SQL with `--` comments removed, so prose about grants is not read as one. */
const code = sql.replace(/--.*$/gm, "");

/** One `create or replace function public.<name>(…)` statement, body included. */
function functionSource(name: string): string {
  const pattern = new RegExp(
    `create or replace function public\\.${name}\\([\\s\\S]*?\\nas \\$\\$\\n[\\s\\S]*?\\n\\$\\$;`,
  );
  return code.match(pattern)?.[0] ?? "";
}

const trigger = functionSource("label_sessions_record_start_open_counts");
const claim = functionSource("claim_label_session");
const release = functionSource("release_stale_label_claims");

test("the migration file is committed and sorts last", () => {
  expect(file).toBeDefined();
  const names = readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  expect(names.at(-1)).toBe(file);
});

test("it adds the two nullable columns to label_sessions", () => {
  expect(code).toMatch(
    /alter table public\.label_sessions\s+add column claimed_at timestamptz,\s+add column start_open_counts jsonb,/,
  );
  expect(code).not.toMatch(/claimed_at timestamptz[^,]*not null/);
  expect(code).not.toMatch(/start_open_counts jsonb[^,]*not null/);
});

test("start_open_counts is null or an object of non-negative integers", () => {
  const check = code.match(/add constraint \w+ check \(([\s\S]*?)\n {2}\);/);
  const body = check?.[1] ?? "";
  expect(body).toContain("start_open_counts is null");
  expect(body).toContain("jsonb_typeof(start_open_counts) = 'object'");
  for (const key of ["amber", "grey"]) {
    expect(body).toContain(
      `jsonb_typeof(start_open_counts -> '${key}') = 'number'`,
    );
    expect(body).toContain(`(start_open_counts ->> '${key}')::numeric >= 0`);
    expect(body).toContain(
      `(start_open_counts ->> '${key}')::numeric = trunc((start_open_counts ->> '${key}')::numeric)`,
    );
  }
});

test("it indexes the open analyst sessions by assignee", () => {
  expect(code).toMatch(
    /create index \w+\s+on public\.label_sessions \(assigned_to\)\s+where status = 'labelling' and kind = 'analyst';/,
  );
});

test("the trigger records the start only on the first count", () => {
  expect(trigger).toContain("set search_path = ''");
  expect(trigger).toMatch(
    /if old\.open_counts is null\s+and old\.start_open_counts is null\s+and new\.open_counts is not null then\s+new\.start_open_counts := new\.open_counts;\s+end if;/,
  );
  // The guarded assignment is the only write to the row.
  expect(trigger.match(/new\.\w+ :=/g)).toHaveLength(1);
  expect(code).toMatch(
    /create trigger \w+\s+before update of open_counts on public\.label_sessions\s+for each row execute function public\.label_sessions_record_start_open_counts\(\);/,
  );
});

test("claim_label_session answers all four words", () => {
  expect(claim).toMatch(
    /public\.claim_label_session\(p_session_id uuid, p_user_id uuid\)\s+returns text/,
  );
  expect(claim).toContain("set search_path = ''");
  for (const word of ["not_labeller", "holding", "taken", "claimed"]) {
    expect(claim).toContain(`return '${word}';`);
  }
});

test("claim_label_session locks the labeller, then checks, then claims", () => {
  expect(claim).toMatch(
    /select u\.is_labeller into labeller\s+from public\.users u\s+where u\.id = p_user_id\s+for update;/,
  );
  expect(claim).toMatch(
    /if labeller is not true then\s+return 'not_labeller';/,
  );
  expect(claim).toMatch(
    /where s\.assigned_to = p_user_id\s+and s\.status = 'labelling'\s+and s\.kind = 'analyst'\s+and s\.id <> p_session_id\s+\) then\s+return 'holding';/,
  );
  expect(claim.match(/\bupdate public\.label_sessions\b/g)).toHaveLength(1);
  expect(claim).toMatch(
    /set assigned_to = p_user_id,\s+assigned_at = now\(\),\s+claimed_at = now\(\)\s+where id = p_session_id\s+and status = 'labelling'\s+and kind = 'analyst'\s+and assigned_to is null;\s+if not found then\s+return 'taken';/,
  );
  // The order is the contract: lock, labeller check, holding check, update.
  const order = [
    "for update;",
    "return 'not_labeller';",
    "return 'holding';",
    "update public.label_sessions",
    "return 'taken';",
    "return 'claimed';",
  ].map((marker) => claim.indexOf(marker));
  expect(order.every((at) => at >= 0)).toBe(true);
  expect([...order].sort((a, b) => a - b)).toEqual(order);
});

test("release_stale_label_claims measures idleness by the claimer's beats", () => {
  expect(release).toMatch(
    /public\.release_stale_label_claims\(p_idle interval\)\s+returns integer/,
  );
  expect(release).toContain("set search_path = ''");
  expect(release).toMatch(
    /set assigned_to = null,\s+assigned_at = null,\s+claimed_at = null/,
  );
  expect(release).toContain("s.status = 'labelling'");
  expect(release).toContain("s.kind = 'analyst'");
  expect(release).toContain("s.claimed_at is not null");
  expect(release).toMatch(
    /greatest\(\s+s\.claimed_at,\s+\(\s+select max\(b\.minute\)\s+from public\.label_work_beats b\s+where b\.session_id = s\.id\s+and b\.user_id = s\.assigned_to\s+\)\s+\) < now\(\) - p_idle/,
  );
  expect(release).toContain("select count(*)::integer from released;");
  // The work signal is beats, never the row's own updated_at.
  expect(release).not.toContain("updated_at");
});

test("the release runs hourly with a 48 hours idle window", () => {
  expect(code).toContain(
    "select cron.schedule('release-stale-label-claims', '7 * * * *', $$select public.release_stale_label_claims(interval '48 hours')$$);",
  );
  expect(code.indexOf("cron.schedule(")).toBeGreaterThan(
    code.indexOf(
      "create or replace function public.release_stale_label_claims",
    ),
  );
});

test("neither function is granted to anon or authenticated", () => {
  for (const signature of [
    "public.claim_label_session(uuid, uuid)",
    "public.release_stale_label_claims(interval)",
  ]) {
    expect(code).toContain(
      `revoke execute on function ${signature} from public, anon, authenticated;`,
    );
    expect(code).toContain(
      `grant execute on function ${signature} to service_role;`,
    );
  }
  const grants = code.match(/^\s*grant\b[^;]*;/gim) ?? [];
  expect(grants).toHaveLength(2);
  for (const grant of grants) {
    expect(grant).not.toMatch(/\b(anon|authenticated|public)\b\s*[,;]/i);
    expect(grant).toMatch(/to service_role;$/);
  }
  expect(code).not.toMatch(/security definer/i);
});
