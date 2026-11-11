import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

// T19: the migration that checks `matches.player2_id` against the program
// roster inside `public.matches_block_client_regraft()`. Source checks on the
// committed file, so the gate holds something even where the live spec
// (`matches-player2-roster-check.spec.ts`) skips. The live function is the
// source of truth; this pins what the repo promised to apply to it.

const dir = resolve(process.cwd(), "supabase/migrations");
const file = readdirSync(dir).find((name) =>
  name.endsWith("_matches_player2_roster_check.sql"),
);
const sql = file ? readFileSync(resolve(dir, file), "utf8") : "";

/** SQL with `--` comments removed, so prose about grants is not read as one. */
const code = sql.replace(/--.*$/gm, "");

/** The function body, exactly as Postgres would store it in `prosrc`. */
const body = sql.match(/as \$function\$([\s\S]*?)\$function\$;/)?.[1] ?? "";

/**
 * md5 of `prosrc` for the live function, read on 2026-11-10 with
 * `select md5(prosrc) from pg_proc where oid =
 * 'public.matches_block_client_regraft'::regproc` — the definition this
 * migration started from.
 */
const LIVE_BODY_MD5 = "df8672af3050230b39b774c7a2317f4e";

const INSERT_BLOCK =
  / {4}-- player2_id roster check \(insert\)\n[\s\S]*?\n {4}end if;\n/;
const UPDATE_BLOCK =
  / {2}-- player2_id roster check \(update\)\n[\s\S]*?\n {2}end if;\n/;

/** The two `not exists` arms, as the function writes them for one column. */
const rosterArms = (column: string, indent: string) =>
  new RegExp(
    [
      `${indent}and new\\.${column} is not null`,
      `${indent}and not exists \\(`,
      `${indent}  select 1 from public\\.program_players pp`,
      `${indent}   where pp\\.id = new\\.${column}`,
      `${indent}     and pp\\.program_id = new\\.program_id`,
      `${indent}\\)`,
      `${indent}and not exists \\(`,
      `${indent}  select 1 from public\\.program_members pm`,
      `${indent}   where pm\\.user_id = new\\.${column}`,
      `${indent}     and pm\\.program_id = new\\.program_id`,
      `${indent}\\) then`,
    ].join("\\n"),
  );

test("the migration file is committed", () => {
  expect(file).toBeDefined();
});

test("it create-or-replaces the function, never drops it", () => {
  expect(code).toMatch(
    /create or replace function public\.matches_block_client_regraft\(\)\s+returns trigger/,
  );
  // A drop + create would reset the grants to the schema default.
  expect(code).not.toMatch(/drop\s+function/i);
});

test("the function stays security definer with an empty search_path", () => {
  const header = code.slice(0, code.indexOf("$function$"));
  expect(header).toMatch(/security definer/);
  expect(header).toMatch(/set search_path to ''/);
});

test("it grants execute to nobody", () => {
  expect(code).not.toMatch(/grant\s/i);
  // The only mention of either client role is the function's own role test.
  expect(code.match(/\b(anon|authenticated)\b/g)).toEqual([
    "authenticated",
    "anon",
  ]);
});

test("the early return for non-client roles is the first statement", () => {
  expect(body).toMatch(
    /\nbegin\n {2}if not v_is_client then\n {4}return new;\n {2}end if;\n {2}if tg_op = 'INSERT' then/,
  );
});

test("an insert checks player2_id with the same two arms as player1_id", () => {
  const block = body.match(INSERT_BLOCK)?.[0] ?? "";
  expect(block).toMatch(/\n {4}if new\.program_id is not null\n/);
  expect(block).toMatch(rosterArms("player2_id", " {7}"));
  expect(block).toContain("using errcode = '42501';");
  // The player1_id arm it mirrors is still there, same shape.
  expect(body).toMatch(rosterArms("player1_id", " {7}"));
  // And it sits inside the INSERT branch, before that branch returns.
  const insertBranch = body.slice(
    body.indexOf("if tg_op = 'INSERT' then"),
    body.indexOf(
      "\n    return new;\n  end if;\n  if new.program_id is distinct",
    ),
  );
  expect(insertBranch).toContain("-- player2_id roster check (insert)");
});

test("an update checks player2_id only when it changed", () => {
  const block = body.match(UPDATE_BLOCK)?.[0] ?? "";
  expect(block).toMatch(
    /\n {2}if new\.player2_id is distinct from old\.player2_id\n {5}and new\.program_id is not null\n/,
  );
  expect(block).toMatch(rosterArms("player2_id", " {5}"));
  expect(block).toContain("using errcode = '42501';");
});

test("a match with no program is not checked", () => {
  for (const pattern of [INSERT_BLOCK, UPDATE_BLOCK]) {
    const block = body.match(pattern)?.[0] ?? "";
    expect(block).toContain("new.program_id is not null");
  }
});

test("every other branch is the live definition, byte for byte", () => {
  expect(body.match(INSERT_BLOCK)).not.toBeNull();
  expect(body.match(UPDATE_BLOCK)).not.toBeNull();
  const without = body.replace(INSERT_BLOCK, "").replace(UPDATE_BLOCK, "");
  expect(createHash("md5").update(without).digest("hex")).toBe(LIVE_BODY_MD5);
});

test("the trigger is recreated with player2_id in its UPDATE OF list", () => {
  const trigger =
    code.match(
      /create or replace trigger matches_block_client_regraft\s+before insert or update of([\s\S]*?)on public\.matches\s+for each row\s+execute function public\.matches_block_client_regraft\(\);/,
    )?.[1] ?? "";
  const columns = trigger
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
  expect(columns).toEqual([
    "program_id",
    "event_entry_id",
    "player1_id",
    "player2_id",
    "source_provider",
    "analysis_method",
    "round",
  ]);
});
