---
name: create-migration
description: Write and apply a Supabase migration for this project — correct filename stamp, RLS enabled with a policy in the same migration, and a check that views do not leak across accounts. Use when adding or altering a table, column, view, or policy.
disable-model-invocation: true
argument-hint: "[what the migration should do]"
---

# Create a Supabase migration

Migrations live in `supabase/migrations/` and are applied with the Supabase
MCP `apply_migration` tool. **Never edit an already-applied migration** — its
effects are live in the remote project. Write a new one.

## 1. Name the file

Format: `YYYYMMDDHHMMSS_snake_case_description.sql`

```bash
date -u +%Y%m%d%H%M%S
```

Compare against what already exists so the new stamp sorts last:

```bash
ls supabase/migrations/ | tail -5
```

The description says what the migration *does*, in the imperative:
`add_shot_zone`, `secure_match_stats_view`, `fix_rally_length`.

## 2. Understand what you are changing

Before writing SQL:

- `mcp__supabase__list_tables` — what is actually deployed right now. The live
  database is the only schema reference; `supabase/migrations/` runs well
  behind it.
- For anything touching programs, members, claims or usage, read
  `src/lib/workspace/types.ts` first. Its comments explain why membership is a
  table and not `users.role`, and a migration that re-centralises it on
  `users.role` would undo a deliberate decision.

## 3. RLS is not a follow-up

**Every `CREATE TABLE` enables RLS and adds a policy in the same migration.**
A table that ships without one is readable by every authenticated user until
someone notices.

```sql
alter table public.new_table enable row level security;

create policy "Users read own rows"
  on public.new_table for select
  using (auth.uid() = user_id);
```

For program-scoped tables the predicate is membership, not ownership — check
how an existing program table does it rather than inventing a new shape.

**Views do not inherit RLS from their base tables.** This repo already has
`20260219130601_secure_match_stats_view.sql` because that was learned the hard
way. Read it before creating or altering any view, and match its approach.

## 4. Apply it

```
mcp__supabase__apply_migration
```

Then verify against the live database rather than assuming:

```
mcp__supabase__execute_sql   -- confirm shape, policies, and a sample read
mcp__supabase__get_advisors  -- catches missing RLS and other security gaps
```

`get_advisors` is the check that catches what you forgot. Run it every time,
and report what it says.

## 5. Downstream

A schema change usually has code consequences. Before calling it done:

- Row types are `Db`-prefixed in `src/lib/data/types.ts` — update them.
- `mcp__supabase__generate_typescript_types` if the generated types are used.
- If you changed anything the stats read, check both
  `src/lib/data/statistics-server.ts` and `statistics-client.ts`. They produce
  the same shape from different sources and must be changed together.

## Checklist before reporting done

- [ ] Filename stamp sorts after every existing migration
- [ ] RLS enabled + policy, in this same file, for any new table
- [ ] Views checked for cross-account leakage
- [ ] Applied, and verified with a real query
- [ ] `get_advisors` run and its output reported
- [ ] `Db*` types and any dependent loaders updated
