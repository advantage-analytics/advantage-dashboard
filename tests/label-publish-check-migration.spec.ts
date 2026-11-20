import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

// T31: publish on submit, then the admin's check — the migration that adds
// the published / checked / sent-back columns to label_sessions. Source checks
// on the committed file, read as text: nothing here needs a database. The live
// database is the source of truth; this pins what the repo promised to apply.

const dir = resolve(process.cwd(), "supabase/migrations");
const file = readdirSync(dir).find((name) =>
  name.endsWith("_label_publish_check.sql"),
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

/** The body of one named CHECK, whitespace collapsed. */
function checkSource(name: string): string {
  const pattern = new RegExp(
    `add constraint ${name} check \\(\\n([\\s\\S]*?)\\n {2}\\)[,;]`,
  );
  return (code.match(pattern)?.[1] ?? "").replace(/\s+/g, " ").trim();
}

const stamp = functionSource("label_sessions_stamp_published");
const verify = functionSource("verify_match");
const release = functionSource("release_stale_label_claims");

test("the migration file is committed and sorts after the queue claims", () => {
  expect(file).toBeDefined();
  const names = readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  expect(names.indexOf(file ?? "")).toBeGreaterThan(
    names.indexOf("20261114060750_label_queue_claims.sql"),
  );
});

test("it adds the six nullable columns to label_sessions", () => {
  expect(code).toMatch(/alter table public\.label_sessions\s+add column/);
  for (const column of [
    "published_at timestamptz",
    "checked_at timestamptz",
    "checked_by uuid references public.users(id) on delete set null",
    "sent_back_at timestamptz",
    "sent_back_by uuid references public.users(id) on delete set null",
    "sent_back_note text",
  ]) {
    expect(code).toContain(`  add column ${column},\n`);
  }
  expect(code.match(/^\s*add column /gm)).toHaveLength(6);
  expect(code).not.toMatch(/add column [^,\n]*(not null|default)/);
});

test("it adds the four CHECKs", () => {
  expect(checkSource("label_sessions_checked_needs_complete")).toBe(
    "checked_at is null or status = 'complete'",
  );
  expect(checkSource("label_sessions_sent_back_open")).toBe(
    "sent_back_at is null or status = 'labelling'",
  );
  expect(checkSource("label_sessions_sent_back_note")).toBe(
    "(sent_back_at is null) = (sent_back_note is null) and ( sent_back_note is null or char_length(btrim(sent_back_note)) between 1 and 2000 )",
  );
  expect(checkSource("label_sessions_practice_never_published")).toBe(
    "kind <> 'practice' or (published_at is null and checked_at is null and sent_back_at is null)",
  );
  expect(code.match(/add constraint \w+ check/g)).toHaveLength(4);
});

test("the trigger stamps only the move to complete and leaves checked_at alone", () => {
  expect(stamp).toContain("returns trigger");
  expect(stamp).toContain("set search_path = ''");
  // One guard, and every write to the row sits inside it.
  expect(stamp).toMatch(
    /begin\s+if new\.status = 'complete' and old\.status is distinct from 'complete' then\s+new\.published_at := coalesce\(new\.published_at, now\(\)\);\s+new\.sent_back_at := null;\s+new\.sent_back_by := null;\s+new\.sent_back_note := null;\s+end if;\s+return new;\s+end;/,
  );
  expect(stamp.match(/new\.\w+ :=/g)).toHaveLength(4);
  expect(stamp).not.toContain("checked_at");
  expect(stamp).not.toContain("checked_by");
  expect(code).toMatch(
    /create or replace trigger label_sessions_stamp_published\s+before update of status on public\.label_sessions\s+for each row execute function public\.label_sessions_stamp_published\(\);/,
  );
  expect(code).toContain(
    "revoke execute on function public.label_sessions_stamp_published() from public, anon, authenticated;",
  );
});

test("the backfill marks completed sessions published and checked", () => {
  const backfill =
    code.match(/\nupdate public\.label_sessions s\n[\s\S]*?;/)?.[0] ?? "";
  expect(backfill).toMatch(
    /set published_at = s\.completed_at,\s+checked_at = s\.completed_at,\s+checked_by = \(/,
  );
  expect(backfill).toMatch(
    /select u\.id\s+from public\.matches m\s+join public\.users u on u\.id = m\.verified_by\s+where m\.id = s\.match_id\s+and m\.verified\s+\)/,
  );
  expect(backfill).toMatch(
    /where s\.status = 'complete'\s+and s\.kind <> 'practice'/,
  );
  // It runs before the trigger exists, so the stamp cannot fire on it.
  expect(code.indexOf(backfill)).toBeLessThan(
    code.indexOf("create or replace trigger"),
  );
});

test("verify_match accepts an admin or a labeller", () => {
  expect(verify).toMatch(
    /public\.verify_match\(p_match_id uuid, p_actor uuid, p_errors_judged boolean default false\)\s+returns timestamp with time zone\s+language plpgsql\s+security definer\s+set search_path = ''/,
  );
  expect(verify).toMatch(
    /if not exists \(\s+select 1 from public\.users u where u\.id = p_actor and \(u\.is_admin or u\.is_labeller\)\s+\) then\s+raise exception [^;]*using errcode = '42501';/,
  );
  // The rest of the live body is carried over.
  expect(verify).toMatch(
    /update public\.matches\s+set verified = true,\s+verified_at = now\(\),\s+verified_by = p_actor,/,
  );
  expect(verify).toContain("using errcode = 'P0002';");
  expect(verify).toContain("perform public.calculate_match_stats(p_match_id);");
  expect(verify).toContain("return v_at;");
});

test("release_stale_label_claims skips a session that was ever published", () => {
  expect(release).toMatch(
    /public\.release_stale_label_claims\(p_idle interval\)\s+returns integer/,
  );
  expect(release).toContain("set search_path = ''");
  expect(release).toContain("and s.published_at is null");
  // T22's body is otherwise intact.
  expect(release).toMatch(
    /set assigned_to = null,\s+assigned_at = null,\s+claimed_at = null/,
  );
  expect(release).toContain("s.status = 'labelling'");
  expect(release).toContain("s.kind = 'analyst'");
  expect(release).toContain("s.claimed_at is not null");
  expect(release).toContain(
    "(s.publishing_since is null or s.publishing_since <= now() - interval '5 minutes')",
  );
  expect(release).toMatch(
    /greatest\(\s+s\.claimed_at,\s+\(\s+select max\(b\.minute\)\s+from public\.label_work_beats b\s+where b\.session_id = s\.id\s+and b\.user_id = s\.assigned_to\s+\)\s+\) < now\(\) - p_idle/,
  );
  expect(release).toContain("select count(*)::integer from released;");
});

test("nothing is granted to anon or authenticated", () => {
  for (const signature of [
    "public.verify_match(uuid, uuid, boolean)",
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
  expect(code).not.toMatch(/\bto\s+(anon|authenticated)\b/i);
  // The migration is re-creatable without a drop, which the MCP declines.
  expect(code).not.toMatch(/\bdrop\b/i);
});
