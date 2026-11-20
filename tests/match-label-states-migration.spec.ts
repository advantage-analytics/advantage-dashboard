import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

// T40: `match_label_states`, the one read a customer page makes about
// labelling. Source checks on the committed file, read as text: nothing here
// needs a database. The live database is the source of truth; this pins what
// the repo promised to apply — above all that a SECURITY DEFINER function any
// signed-in user can call hands back four columns and nothing else.

const dir = resolve(process.cwd(), "supabase/migrations");
const file = readdirSync(dir).find((name) =>
  name.endsWith("_match_label_states.sql"),
);
const sql = file ? readFileSync(resolve(dir, file), "utf8") : "";

/** SQL with `--` comments removed, so prose about grants is not read as one. */
const code = sql.replace(/--.*$/gm, "");

const SIGNATURE = "public.match_label_states(uuid[])";

/** The whole `create or replace function` statement, body included. */
const fn =
  code.match(
    /create or replace function public\.match_label_states\([\s\S]*?\nas \$\$\n[\s\S]*?\n\$\$;/,
  )?.[0] ?? "";

/** Everything before the body: name, arguments, return type and options. */
const header = fn.split("\nas $$\n")[0] ?? "";

/** The body between the dollar quotes, whitespace collapsed. */
const body = (fn.split("\nas $$\n")[1] ?? "")
  .replace(/\$\$;$/, "")
  .replace(/\s+/g, " ")
  .trim();

test("the migration file is committed and sorts after the publish check", () => {
  expect(file).toBeDefined();
  const names = readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  expect(names.indexOf(file ?? "")).toBeGreaterThan(
    names.indexOf("20261114091835_label_publish_check.sql"),
  );
});

test("it creates one function and drops nothing", () => {
  expect(fn).not.toBe("");
  expect(code.match(/create or replace function/g)).toHaveLength(1);
  expect(code).not.toMatch(/\bdrop\b/i);
  expect(header).toContain(
    "create or replace function public.match_label_states(p_match_ids uuid[])",
  );
});

test("it is security definer with an empty search_path", () => {
  expect(header).toMatch(
    /language sql\s+stable\s+security definer\s+set search_path = ''$/,
  );
});

test("it returns exactly the four columns", () => {
  const returns = header.match(/returns table \(([\s\S]*?)\)\s*language/)?.[1];
  const columns = (returns ?? "")
    .split(",")
    .map((column) => column.trim().replace(/\s+/g, " "));
  expect(columns).toEqual([
    "match_id uuid",
    "results_at timestamptz",
    "has_video boolean",
    "labeling boolean",
  ]);
});

test("the outer select names four expressions and no labeler or session", () => {
  // The select list, up to the outer FROM.
  const list = body.slice(0, body.indexOf(" from public.matches m"));
  expect(list).toMatch(
    /^select m\.id, j\.completed_at, j\.has_video, exists \(/,
  );
  // Nothing of the session leaves except through EXISTS.
  expect(body).toContain("select 1 from public.label_sessions s");
  expect(body.match(/\bs\.\w+/g)?.sort()).toEqual([
    "s.assigned_to",
    "s.kind",
    "s.match_id",
    "s.status",
  ]);
  for (const leak of [
    "labeller",
    "checked_by",
    "sent_back_by",
    "s.id",
    "job_id",
    "created_by",
  ]) {
    expect(body).not.toContain(leak);
  }
  // The only job column selected besides the video flag is completed_at.
  expect(body).toContain("select pj.completed_at, case");
});

test("rows are limited to matches the caller can read, never a verified one", () => {
  expect(body).toContain("where m.id = any (p_match_ids)");
  expect(body).toContain("and m.id in (select public.visible_match_ids())");
  expect(body).toContain("and m.verified is false");
  // An inner join on the job: a match with no completed job has no row.
  expect(body).toContain("from public.matches m cross join lateral (");
  expect(body).not.toMatch(/left join/);
});

test("labeling is an assigned, open analyst session", () => {
  expect(body).toContain(
    "exists ( select 1 from public.label_sessions s where s.match_id = m.id and s.kind = 'analyst' and s.status in ('labeling', 'submitted') and s.assigned_to is not null )",
  );
});

test("results_at and has_video come from the latest completed job", () => {
  expect(body).toContain(
    "where pj.match_id = m.id and pj.status = 'completed' and pj.completed_at is not null order by pj.completed_at desc, pj.id desc limit 1",
  );
  // jobVideoSeconds(): the trimmed span when the end is finite and past the
  // start, else what was billed.
  expect(body).toContain(
    "case when pj.end_time_seconds not in ('NaN', 'Infinity', '-Infinity') and pj.end_time_seconds > coalesce(pj.start_time_seconds, 0) then true else coalesce(pj.billable_seconds, 0) > 0 end as has_video",
  );
});

test("execute goes to authenticated and service_role, never anon or public", () => {
  expect(code).toContain(
    `revoke execute on function ${SIGNATURE} from public, anon;`,
  );
  expect(code).toContain(
    `grant execute on function ${SIGNATURE} to authenticated, service_role;`,
  );
  const grants = code.match(/^\s*grant\b[^;]*;/gim) ?? [];
  expect(grants).toHaveLength(1);
  expect(grants[0]).not.toMatch(/\b(anon|public)\b\s*[,;]/i);
  expect(code.match(/^\s*revoke\b[^;]*;/gim)).toHaveLength(1);
});
