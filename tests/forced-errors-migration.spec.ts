import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

// T1 of forced vs unforced errors: the migration that gives
// `match_stats.forced_errors` a meaning. Source checks on the committed file —
// the live function is the source of truth, this pins what the repo promised
// to apply to it.

const dir = resolve(process.cwd(), "supabase/migrations");
const file = readdirSync(dir).find((name) =>
  name.endsWith("_forced_errors_judged.sql"),
);
const sql = file ? readFileSync(resolve(dir, file), "utf8") : "";

test("the migration file is committed", () => {
  expect(file).toBeDefined();
});

test("it adds the nullable errors_judged_at marker", () => {
  expect(sql).toMatch(
    /alter table public\.matches\s+add column if not exists errors_judged_at timestamptz null;/,
  );
  expect(sql).toContain("comment on column public.matches.errors_judged_at");
});

test("forced_errors is counted only on a judged match, and never from Unforced", () => {
  const guards = sql.match(
    /m\.source_provider = 'swing-vision' OR m\.errors_judged_at IS NOT NULL/g,
  );
  expect(guards).toHaveLength(2); // one per side
  const notUnforced = sql.match(/NOT LIKE '%Unforced%'/g);
  expect(notUnforced).toHaveLength(2);
  expect(sql).toContain("ELSE NULL");
  // The two sides count the errors the side committed, i.e. the point it lost.
  expect(sql).toMatch(
    /NOT LIKE '%Unforced%' AND won_by_player1 = false\)\s+ELSE NULL/,
  );
  expect(sql).toMatch(
    /NOT LIKE '%Unforced%' AND won_by_player1 = true\)\s+ELSE NULL/,
  );
});

test("unforced errors and the hand breakdown are left as they were", () => {
  expect(sql).toContain(
    "result_type LIKE '%Unforced Error%' AND won_by_player1 = false",
  );
  expect(sql).toContain(
    "result_type = 'Forehand Unforced Error' AND won_by_player1 = false",
  );
  expect(sql).toContain(
    "result_type = 'Backhand Unforced Error' AND won_by_player1 = true",
  );
});

test("it replaces the function in place and restates grants without anon", () => {
  expect(sql).toContain(
    "CREATE OR REPLACE FUNCTION public.calculate_match_stats(p_match_id uuid)",
  );
  expect(sql).not.toMatch(/drop\s+function/i);
  expect(sql).toContain(
    "revoke all on function public.calculate_match_stats(uuid) from public, anon;",
  );
  expect(sql).toContain(
    "grant execute on function public.calculate_match_stats(uuid) to authenticated, service_role;",
  );
  expect(sql).not.toMatch(/grant[^;]*to[^;]*\banon\b/i);
});

test("it recomputes every swing-vision match", () => {
  expect(sql).toMatch(
    /for v_match_id in\s+select id from public\.matches where source_provider = 'swing-vision'\s+loop\s+perform public\.calculate_match_stats\(v_match_id\);/,
  );
  expect(sql).toContain("261");
});
