import { expect, test } from "@playwright/test";

import {
  ASK_SQL_FUNCTION_ALLOWLIST,
  ASK_VIEWS,
  checkAskSql,
} from "@/lib/services/ask/sql-guard";

/**
 * Pure-logic spec for T6: the static guard the Ask route runs over the two
 * model-written SQL strings before `ask_run_query` sees them (design
 * "Route → Check step", plan step 4). No database, no network — every case is
 * a string pair in and a verdict out.
 */

/** A `scope_sql` every `sql` case below is checked against. */
const SCOPE =
  "select match_id from ask.matches where played_on >= '2026-01-01'";

function check(sql: string, scopeSql = SCOPE) {
  return checkAskSql({ scopeSql, sql });
}

function expectRefused(result: ReturnType<typeof checkAskSql>, reason: RegExp) {
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.reason).toMatch(reason);
}

test.describe("checkAskSql — accepts", () => {
  test("a plain aggregate over ask.match_stats joined to scope", () => {
    expect(
      check(
        `select count(*) as matches, round(avg(s.first_serve_pct), 1) as first_serve_pct
         from ask.match_stats s
         join scope on scope.match_id = s.match_id
         where s.side = 'me'`,
      ),
    ).toEqual({ ok: true });
  });

  test("a non-modifying CTE, a window function, count filter, date_trunc, round and coalesce", () => {
    expect(
      check(
        `with mine as (
           select match_id, first_serve_pct, second_serve_won_pct
           from ask.match_stats
           where side = 'me'
         )
         select date_trunc('month', m.played_on) as month,
                round(avg(mine.first_serve_pct), 1) as first_serve_pct,
                count(*) filter (where m.i_won) as wins,
                coalesce(sum(m.duration_seconds), 0) as seconds,
                row_number() over (partition by m.opponent_name order by m.played_on desc) as nth_vs_opponent
         from ask.matches m
         join scope on scope.match_id = m.match_id
         join mine on mine.match_id = m.match_id
         group by 1, m.opponent_name, m.played_on, mine.first_serve_pct
         order by 1 desc`,
      ),
    ).toEqual({ ok: true });
  });

  test("a scope_sql selecting match_id from ask.matches with a date range and opponent filter", () => {
    expect(
      check(
        "select count(*) from scope",
        `select match_id
         from ask.matches
         where played_on >= '2026-03-01'
           and played_on < '2026-06-01'
           and opponent_name ilike '%smith%'`,
      ),
    ).toEqual({ ok: true });
  });

  test("current_date arithmetic, a subquery, a union and unqualified view names", () => {
    expect(
      check(
        `select p.set_number, count(*) as points
         from ask.points p
         where p.match_id in (select match_id from scope)
         group by p.set_number
         union all
         select 0, count(*) from shots where match_id in (select match_id from scope)`,
        "select match_id from matches where played_on >= current_date - interval '90 days'",
      ),
    ).toEqual({ ok: true });
  });

  test("exists against another view, extract and a cast", () => {
    expect(
      check(
        `select extract(year from m.played_on)::int as year, m.played_on::text as day
         from ask.matches m
         join scope on scope.match_id = m.match_id
         where exists (select 1 from ask.points p where p.match_id = m.match_id and p.is_break_point)`,
      ),
    ).toEqual({ ok: true });
  });
});

test.describe("checkAskSql — refuses", () => {
  test("an insert", () => {
    expectRefused(
      check("insert into ask.matches (match_id) values ('x')"),
      /must be a SELECT statement, not "insert"/,
    );
  });

  test("an update", () => {
    expectRefused(check("update ask.matches set i_won = true"), /not "update"/);
  });

  test("a delete", () => {
    expectRefused(check("delete from ask.matches"), /not "delete"/);
  });

  test("DDL", () => {
    expectRefused(check("create table t (id int)"), /not "create table"/);
    expectRefused(check("drop table ask.matches"), /not "drop table"/);
    expectRefused(
      check("select 1 from scope", "alter table ask.matches add column x int"),
      /not "alter table"/,
    );
  });

  test("two statements in one string", () => {
    expectRefused(
      check("select * from scope; select 1"),
      /exactly one statement, got 2/,
    );
    expectRefused(
      check(
        "select * from scope",
        "select match_id from ask.matches; delete from ask.matches",
      ),
      /exactly one statement/,
    );
  });

  test("a data-modifying CTE", () => {
    expectRefused(
      check(
        "with w as (delete from ask.matches returning match_id) select * from w join scope on true",
      ),
      /Unsupported syntax: "delete"/,
    );
    expectRefused(
      check(
        "with w as (insert into ask.matches (match_id) values ('x') returning match_id) select * from scope, w",
      ),
      /Unsupported syntax: "insert"/,
    );
  });

  test("a reference to public.users", () => {
    expectRefused(
      check("select u.email from public.users u join scope on true"),
      /"public\.users" is not an ask view/,
    );
  });

  test("a reference to an unqualified users", () => {
    expectRefused(
      check("select * from scope where match_id in (select id from users)"),
      /"users" is not one of the ask views/,
    );
  });

  test("any pg_catalog or information_schema relation", () => {
    expectRefused(
      check("select (select count(*) from pg_catalog.pg_class) from scope"),
      /"pg_catalog\.pg_class" is not an ask view/,
    );
    expectRefused(
      check("select table_name from information_schema.tables, scope"),
      /"information_schema\.tables" is not an ask view/,
    );
    // The bare catalog name resolves through search_path; it is still not a view.
    expectRefused(
      check("select relname from pg_class, scope"),
      /"pg_class" is not one of the ask views/,
    );
  });

  test("a function outside the allowlist", () => {
    expectRefused(
      check("select pg_sleep(1) from scope"),
      /Function "pg_sleep\(\)" is not on the allowlist/,
    );
    expectRefused(
      check("select current_setting('x') from scope"),
      /Function "current_setting\(\)" is not on the allowlist/,
    );
    expectRefused(
      check("select pg_catalog.count(*) from scope"),
      /Schema-qualified function "pg_catalog\.count\(\)"/,
    );
    expectRefused(
      check("select * from scope, generate_series(1, 10)"),
      /Function "generate_series\(\)"/,
    );
  });

  test("sql that does not reference scope", () => {
    expectRefused(
      check("select count(*) from ask.matches"),
      /sql must read from scope/,
    );
  });

  test("text the parser cannot parse", () => {
    expectRefused(
      check("select from where from scope"),
      /sql could not be parsed/,
    );
    expectRefused(
      check("select * from scope", "not sql at all"),
      /scope_sql could not be parsed/,
    );
    expectRefused(check("   "), /sql is empty/);
  });

  test("a relation inside the ask schema that is not one of the four views", () => {
    expectRefused(
      check("select * from ask.users u, scope"),
      /"ask\.users" is not one of the ask views/,
    );
  });

  test("a CTE that shadows scope or a view", () => {
    expectRefused(
      check(
        "with scope as (select match_id from ask.matches) select count(*) from scope",
      ),
      /A CTE may not be named "scope"/,
    );
    expectRefused(
      check(
        "with matches as (select 1 as match_id) select * from matches join scope on true",
      ),
      /A CTE may not be named "matches"/,
    );
  });

  test("scope_sql reading scope, with recursive, for update, and a parameter", () => {
    expectRefused(
      check("select * from scope", "select match_id from scope"),
      /scope_sql defines scope and may not read it/,
    );
    expectRefused(
      check(
        "with recursive r(n) as (select 1 union all select n + 1 from r) select * from r, scope",
      ),
      /not "with recursive"/,
    );
    expectRefused(
      check("select * from scope for update"),
      /Unsupported syntax: "update"/,
    );
    expectRefused(
      check("select * from scope where match_id = $1"),
      /Unsupported syntax: "parameter"/,
    );
    expectRefused(
      check("select current_user from scope"),
      /Keyword "current_user" is not allowed/,
    );
    expectRefused(
      check("select 'ask.matches'::regclass from scope"),
      /Cast to "regclass" is not allowed/,
    );
  });
});

test.describe("checkAskSql — allowlists", () => {
  test("the relation allowlist is the four ask views", () => {
    expect([...ASK_VIEWS]).toEqual([
      "matches",
      "match_stats",
      "points",
      "shots",
    ]);
  });

  test("the function allowlist is one exported constant with the helpers the accept cases use", () => {
    for (const name of [
      "count",
      "avg",
      "round",
      "coalesce",
      "date_trunc",
      "row_number",
      "exists",
    ]) {
      expect(ASK_SQL_FUNCTION_ALLOWLIST.has(name)).toBe(true);
    }
    for (const name of [
      "pg_sleep",
      "current_setting",
      "setval",
      "generate_series",
      "pg_read_file",
    ]) {
      expect(ASK_SQL_FUNCTION_ALLOWLIST.has(name)).toBe(false);
    }
  });
});
