# Account deletion that leaves team data behind — Design

Date: 2026-09-01
Status: approved 2026-09-01; implemented on `claude/delete-cjgimena-email-d017fe`
Branch: `claude/delete-cjgimena-email-d017fe`
Reviewed against: the *Supabase Postgres Best Practices* skill
(`supabase:supabase-postgres-best-practices`, rules `security-privileges`,
`security-rls-performance`, `security-rls-basics`, `schema-constraints`,
`schema-foreign-key-indexes`, `lock-short-transactions`,
`lock-deadlock-prevention`, `query-partial-indexes`) — see §9.

## What this is

Settings › Account › **Delete account** currently deletes every match the
person ever uploaded, wherever it was filed, and then fails outright for
anyone who has claimed a roster profile. This design makes deletion do what
a collegiate program expects:

- Matches the person filed **under a program** stay with that program, video
  included, attributed to a roster profile the coaches now manage.
- Matches filed **personally** are purged with the account, as today.
- The person's login, personal data, and seat are gone.

## Why it fails today

Deleting `auth.users` cascades into `public.users`, and three tables point at
`users` with `ON DELETE SET NULL` or `CASCADE` in ways the rest of the schema
does not allow:

| Column | FK action | What actually happens |
|---|---|---|
| `program_players.claimed_by_user_id` | SET NULL | Violates `program_players_claim_check`, which requires `claimed_by_user_id` and `claimed_at` to be null together. **This is the error you hit.** |
| `match_files.uploaded_by` | CASCADE | Deletes the provider-file rows of every match, including ones the team is supposed to keep. |
| `matches.created_by`, `processing_jobs.created_by`, `processing_usage.created_by` | NO ACTION | Refuse the delete while any row remains. `deleteAccount()` clears them by deleting the matches — all of them. |

Verified against the live database on 2026-09-01. `supabase/migrations/`
runs behind it and is not a schema source.

## Decisions (from brainstorm)

1. **Retention is decided per match by `matches.program_id`.** A match can
   only be filed under a program by a current member
   (`matches_block_client_regraft`), and `program_id` can never change
   afterwards. So "filed under the program" *is* "uploaded while on the team".
   No membership history, no `left_at`, no date arithmetic.
2. **Re-point self-uploads to the profile, audit-logged.** A player's own
   team upload carries their *login* id in `player1_id`, not their profile
   id (5 of the 15 live team matches). Once the login is gone, nothing links
   those rows to the coach-managed profile, so the deletion re-points
   `player1_id`/`player2_id` from the login id to the profile id, on that
   program's rows only, and writes the match ids to `program_audit_log`.
   This is the second reviewed exception to `docs/ui-revamp-guardrails.md`
   §2 ("existing match data: no mutations"), granted on the same terms as
   `merge_program_players`: one explicit action, one person's rows, one
   program, attribution columns only, audit-logged.
3. **Null the uploader columns on retained rows** (approach A). Not re-homed
   to the program owner (misattributes usage, and there is nobody to re-home
   to when the owner is the one leaving) and not a scrubbed tombstone row in
   `users` (breaks the invariant that a `users` row is a login).
4. **Sole-owner guard.** An account that still owns a program cannot be
   deleted until ownership is transferred. Transfer already exists in Team
   settings. The current page copy ("the program goes with you") is false —
   the program survives ownerless — and gets corrected.
5. **Personal-workspace uploads made while on the team stay personal** and
   are purged. The team never had access to them; deletion must not grant it.

## 1. Behaviour

| Scenario | Program-filed matches | Personal matches | Roster profile | Seat |
|---|---|---|---|---|
| Deletes while on the team | Retained, re-pointed to profile, uploader cleared | Purged | Un-claimed → coach-managed | Released |
| Removed/archived by a coach earlier, then deletes | Retained (they were filed while a member), re-pointed | Purged | Un-claimed (removal never un-claims; archive already hid it) | Already released |
| Uploaded more after leaving, then deletes | n/a — cannot be filed under a program they are not in | Purged | — | — |
| Still owns a program | **Refused** with "transfer ownership first" | — | — | — |

"Retained" means: still visible to program members through the `matches`
SELECT policy's program route, still counted for that roster row in team
stats via `program_roster_full` → `canonicalRosterIds()`, videos and results
untouched in Azure and Supabase Storage, `processing_usage` still on the
program's ledger.

## 2. Deletion sequence

`deleteAccount()` in `src/components/dashboard/settings/actions.ts` keeps
its shape — row work first, login last, every step retryable — and becomes:

1. `getUser()`; refuse when no session (unchanged).
2. **Release from programs** — `supabase.rpc('release_my_account_from_programs')`
   with the **user's own client**, not the admin client. The function derives
   the subject from `auth.uid()` and takes no arguments, so it cannot be
   pointed at anyone else (§4). One transaction. Refuses with `42501` while
   the caller owns a program; that error is surfaced as the page message.
3. **Personal matches** — list `matches` with `created_by = user and
   program_id is null` (admin client), `purgeMatchStorage()`, delete rows.
   Unchanged from today except for the `program_id is null` filter.
4. **Stragglers** — `processing_jobs` and `processing_usage` rows still
   carrying `created_by = user` (individual-ledger usage, jobs against
   matches that were never theirs). Unchanged.
5. `auth.admin.deleteUser(user.id)` (admin client). Unchanged.

If step 2 commits and step 5 fails, the existing message — "Your data was
removed but the account itself could not be deleted. Contact support" — is
now literally true, and a retry is safe: every write in step 2 is keyed on
the caller's id and finds nothing the second time.

Step 2 runs before step 3 so that a failure inside it destroys nothing:
the person can retry with everything intact.

## 3. Migration — one file

`supabase/migrations/<stamp>_account_deletion_retains_program_data.sql`,
stamp from `date -u +%Y%m%d%H%M%S` at write time, applied with
`mcp__supabase__apply_migration`, then verified with `execute_sql` and
`get_advisors` (per `.claude/skills/create-migration/SKILL.md`).

```sql
-- 1. Uploader columns may outlive the uploader.
alter table public.processing_jobs  alter column created_by drop not null;
alter table public.processing_usage alter column created_by drop not null;

-- 2. match_files: a departed uploader must not take the team's file rows
--    with it. Guarded so a re-run is a no-op (schema-constraints rule).
do $$
begin
  if exists (
    select 1 from pg_constraint
     where conname = 'match_files_uploaded_by_fkey'
       and conrelid = 'public.match_files'::regclass
       and confdeltype = 'c'
  ) then
    alter table public.match_files drop constraint match_files_uploaded_by_fkey;
    alter table public.match_files
      add constraint match_files_uploaded_by_fkey
      foreign key (uploaded_by) references public.users(id)
      on update cascade on delete set null;
  end if;
end $$;

-- 3. The paired-null invariant, enforced where the FK action cannot see it.
--    Referential actions run as ordinary UPDATEs and fire row triggers, so
--    a Studio delete of auth.users now un-claims instead of failing.
create or replace function public.program_players_clear_claimed_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.claimed_at := null;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists program_players_clear_claimed_at on public.program_players;
create trigger program_players_clear_claimed_at
  before update of claimed_by_user_id on public.program_players
  for each row
  when (new.claimed_by_user_id is null and new.claimed_at is not null)
  execute function public.program_players_clear_claimed_at();

-- 4. The FK column the release function and the SET NULL action both
--    filter on has no usable index (the unique index leads on program_id).
create index if not exists program_players_claimed_by_idx
  on public.program_players (claimed_by_user_id)
  where claimed_by_user_id is not null;

-- 5. The release function — §4.
```

Nothing else changes. The three `NO ACTION` keys on `users` stay: they are
the guard that turns a careless delete into an error instead of a leak, and
`deleteAccount()` satisfies them in code, in order, as it does today.

## 4. `release_my_account_from_programs()`

```sql
create or replace function public.release_my_account_from_programs()
returns table (program_id uuid, profile_id uuid, retained integer, repointed integer)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid   uuid := (select auth.uid());
  v_class text;
  r       record;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- Sole-owner guard, enforced here so no caller can skip it.
  if exists (
    select 1 from public.program_members pm
     where pm.user_id = v_uid and pm.role = 'owner'
  ) then
    raise exception 'transfer ownership of your program before deleting your account'
      using errcode = '42501';
  end if;

  select u.class into v_class from public.users u where u.id = v_uid;

  -- One loop over every program this person touches: a membership, a
  -- claimed profile, or a program-filed match. Statement order inside the
  -- loop is fixed (matches → jobs → files → usage → profile → membership →
  -- audit) so two concurrent releases cannot lock in opposite orders.
  for r in
    select p.id as program_id,
           pp.id as profile_id,
           pm.role
      from public.programs p
      left join public.program_players pp
        on pp.program_id = p.id
       and pp.claimed_by_user_id = v_uid
       and pp.merged_into_id is null
      left join public.program_members pm
        on pm.program_id = p.id and pm.user_id = v_uid
     where pp.id is not null
        or pm.id is not null
        or exists (select 1 from public.matches m
                    where m.program_id = p.id and m.created_by = v_uid)
     order by p.id
  loop
    repointed := 0;

    if r.profile_id is not null then
      -- Attribution columns only. Self-uploads with no player id at all are
      -- the uploader's, which is the rule playerSide() already applies.
      with moved as (
        update public.matches m
           set player1_id = case
                 when m.player1_id = v_uid then r.profile_id
                 when m.player1_id is null and m.player2_id is null
                      and m.created_by = v_uid then r.profile_id
                 else m.player1_id end,
               player2_id = case when m.player2_id = v_uid then r.profile_id
                                 else m.player2_id end
         where m.program_id = r.program_id
           and (m.player1_id = v_uid or m.player2_id = v_uid
                or (m.player1_id is null and m.player2_id is null
                    and m.created_by = v_uid))
         returning m.id
      )
      select count(*) into repointed from moved;
    end if;

    -- Uploader columns: the login is leaving; the rows are not.
    update public.processing_jobs pj set created_by = null
     where pj.created_by = v_uid
       and pj.match_id in (select m.id from public.matches m
                            where m.program_id = r.program_id);
    update public.match_files mf set uploaded_by = null
     where mf.uploaded_by = v_uid
       and mf.match_id in (select m.id from public.matches m
                            where m.program_id = r.program_id);
    update public.processing_usage pu set created_by = null
     where pu.created_by = v_uid
       and pu.account_type = 'program' and pu.account_id = r.program_id;
    with kept as (
      update public.matches m set created_by = null
       where m.program_id = r.program_id and m.created_by = v_uid
       returning m.id
    )
    select count(*) into retained from kept;

    -- The profile becomes coach-managed. class_year is filled only where the
    -- coach never recorded one; the login email is never written here.
    if r.profile_id is not null then
      update public.program_players pp
         set claimed_by_user_id = null,
             claimed_at = null,
             class_year = coalesce(pp.class_year, v_class),
             updated_at = now()
       where pp.id = r.profile_id;
    end if;

    delete from public.program_members pm
     where pm.program_id = r.program_id and pm.user_id = v_uid;

    insert into public.program_audit_log
      (program_id, actor_user_id, action, subject_id, details)
    values
      (r.program_id, v_uid, 'member.account_deleted', r.profile_id,
       jsonb_build_object(
         'former_user_id', v_uid,
         'role', r.role,
         'matches_retained', retained,
         'matches_repointed', repointed));

    program_id := r.program_id;
    profile_id := r.profile_id;
    return next;
  end loop;
end;
$$;

revoke execute on function public.release_my_account_from_programs() from public, anon;
grant  execute on function public.release_my_account_from_programs() to authenticated;
```

Notes the plan must carry:

- **`matches_block_client_regraft` fires** (the caller is `authenticated`) and
  *passes*: `program_id`/`event_entry_id` are untouched, and the new
  `player1_id` is a profile of the same program, which is the exact condition
  its UPDATE branch checks.
- The audit row's `actor_user_id` is nulled by the FK when the login is
  deleted moments later. `details.former_user_id` is the durable reference,
  which is why it is written twice.
- `program_audit_log_program_idx (program_id, created_at desc)` serves the
  audit reads; `matches_program_idx` serves every `program_id = …`
  predicate above; `processing_jobs_match_id_idx`, `idx_match_files_match_id`,
  `processing_usage_account_month_idx` serve the sub-selects.
- The function is short and makes no external calls; the transaction holds
  row locks for milliseconds (`lock-short-transactions`).

## 5. Code changes

| File | Change |
|---|---|
| `src/components/dashboard/settings/actions.ts` | `deleteAccount()`: sequence in §2; map `42501` from the RPC to the ownership sentence; personal-match query gains `.is("program_id", null)`; log the RPC's returned rows. The long doc comment gets a paragraph on retention and the second guardrail exception. |
| `src/app/dashboard/settings/account/page.tsx` | Deletion sentence: personal matches, statistics and reports are removed; matches filed under a team stay with that team as a coach-managed profile. Owner box: computed from **every** workspace in `available`, not just `active`, and reads "Deletion is blocked until you transfer ownership." |
| Row types | No `Db*` type in `src/lib/data/types.ts` declares these columns. Three narrow read types do — `api/splitstep/jobs/route.ts:142`, `services/splitstep/resubmit-job.ts:106`, `api/splitstep/jobs/[jobId]/resubmit/route.ts:78` — and each only compares `created_by` to the caller, so a null compares unequal and the code stays correct (a departed uploader's job can be resubmitted by nobody, which is the existing uploader-only rule). Widen them to `string \| null` so the type tells the truth. Insert payload types (`new-match-wizard/types.ts:146`, `services/upload/types.ts:91`) stay `string`: an insert always has an uploader. |
| `docs/ui-revamp-guardrails.md` §2 | Second reviewed exception paragraph, dated, mirroring the merge one. |
| `MAP.md` | No route added; nothing to regenerate. |

Readers already tolerate a null uploader on program matches:
`match-detail-server.ts` returns no "uploaded by" label when `created_by`
is null; personal scopes filter `program_id is null` and never see these
rows; `program_usage_by_member` inner-joins `users` and so drops a departed
member's minutes from the per-person breakdown while `program_usage_total`
keeps them. That last one is the one visible change and is accepted.

## 6. Error handling

| Failure | User sees | State |
|---|---|---|
| Owns a program | The ownership sentence, inline | Nothing changed |
| RPC fails otherwise | "We couldn't release your team data, so nothing was deleted. Try again." | Nothing changed |
| Storage purge partial | Nothing (best-effort, logged; `scripts/cleanup-orphan-storage.ts` recovers) | As today |
| Personal match delete fails | Existing message | Programs released; personal data intact; retry safe |
| Auth delete fails | Existing "contact support" message | Everything but the login gone; retry safe |

## 7. Testing

`tests/account-deletion-retention.spec.ts`, live-database, on the
`fixtures/live-db` plumbing (`runMarker`, `createLogins`,
`createAdminClient`, `deleteAuthUsers`), serial, skipped without env:

Fixture: one program with an owner; one player login rostered with a
**claimed** profile; one program-filed self-upload (`player1_id` = login id)
with a `processing_jobs` row and a `program`-type `processing_usage` row;
one personal match by the same player; a second program-filed match with
**no** player ids and `created_by` = player.

Assertions, calling the RPC **as the player's session**:

1. Returns one row for the program with `retained = 2`, `repointed = 2`.
2. Both program matches now carry the profile id in `player1_id`; the
   owner's session can still read them; `created_by` is null.
3. `program_roster_full` shows the profile with `managed_by = 'coach'`,
   `user_id` null, `claimed_at` null.
4. `program_usage_total` for the month is unchanged; the usage row's
   `created_by` is null.
5. `program_members` has no row for the player; `program_audit_log` has one
   `member.account_deleted` row with both match ids' counts.
6. The personal match is untouched by the RPC (it is the server action's
   job), and still readable only by the player.
7. Calling the RPC again returns no rows and changes nothing.
8. As the **owner's** session: the RPC raises `42501`.
9. Trigger proof: create a throwaway login with a claimed profile, delete it
   from `auth.users` through the admin client, and assert the profile row
   survives with both claim columns null. This is the constraint bug's
   regression test.

Cleanup in `afterAll` in FK order: matches, programs, auth users.

Also: `npx tsc --noEmit`, `npm run lint` (no new warnings), `npm test`, and
a click-through on a team workspace as a player with one team match and one
personal match.

## 8. Out of scope, flagged for their own branches

- **Staff cannot delete a retained match.** Match deletion is uploader-only
  (`api/matches/[matchId]/route.ts`), so a departed member's matches are
  permanent until staff get a delete path.
- **No self-service "leave team".** Today a coach removing or archiving you
  is the only exit. "Explicitly leaving" in the brief means that.
- **Staff self-uploads.** A coach whose own matches carry their login id as
  player has no profile to re-point to; the rows stay visible to the program
  but unattributed. No coach does this today.
- **`matches.player1_id` / `player2_id` are unindexed** although the SELECT
  policy filters on them. Cheap fix, unrelated to this change.
- **Pending `program_claims` by the departing user** lose their claimant via
  SET NULL. Approved claims are covered by the owner guard.
- **A retained match can lose its trimmed video if its uploader deletes their
  account mid-processing.** `webhooks/splitstep/route.ts` reads a job's
  `created_by` live. Once this feature nulls it on a retained program job, a
  `completed` vendor delivery arriving afterward still stores the results JSON
  (under a `null/` key segment) but SKIPS the trimmed-video copy — its guard at
  `route.ts:366` requires `created_by` — while the source blob is still deleted.
  Net: stats survive, the video is lost. Narrow (needs the vendor to deliver
  after deletion) and currently unreachable (the only user-id-attributed live
  matches belong to the blocked owner). The fix belongs in the video seam, not
  here: a retained match's video is attributable via `match_id` and deletable
  via `purgeMatchStorage`, so both artifacts can be keyed under a `former-member`
  segment symmetrically, and the stale `route.ts:355` `created_by!` assertion
  goes with it. Surfaced by the whole-branch review 2026-09-01; its own branch.

## 9. Postgres best-practices review

| Rule | How this design meets it |
|---|---|
| `security-rls-performance` — security definer functions must check the caller's identity inside, run with `search_path = ''`, and not be executable by roles that should not call them | No parameters; subject is `auth.uid()`; `28000` when absent; `search_path = ''` with every name schema-qualified; `revoke … from public, anon`, granted to `authenticated` only, matching `accept_program_invite` |
| `security-privileges` — least privilege | The server action calls the RPC with the *user's* client; the admin client is used only where it was already used (storage purge, personal rows, auth delete) |
| `security-rls-basics` | No new table, no policy change; existing policies keep filtering on the columns being nulled, which is the intended outcome (nobody but service role reaches a departed uploader's rows) |
| `schema-constraints` — no `ADD CONSTRAINT IF NOT EXISTS`; guard DDL | FK swap wrapped in a `do` block keyed on `confdeltype`; `drop trigger if exists`; `create index if not exists`; `drop not null` is idempotent |
| `schema-foreign-key-indexes` — index FK columns, especially those hit by referential actions | `program_players_claimed_by_idx` added (partial, non-null); every other column the function or the SET NULL actions filter on already has an index (listed in §4) |
| `query-partial-indexes` | The new index is partial on `claimed_by_user_id is not null`, the only shape any query asks for |
| `lock-short-transactions` | One function, no external calls, a handful of row updates |
| `lock-deadlock-prevention` | Programs iterated in `id` order; fixed statement order within each; no `select … for update` needed because every write is keyed on the caller's own id |

## 10. Open risks

- **The 5 live user-id-attributed team matches** all belong to the current
  test owner, who is blocked by the guard; nothing in production data is
  re-pointed by shipping this. First real exercise is the spec's fixture.
- **`program_usage_by_member`** silently omits departed members. If a coach
  asks where the minutes went, the total still shows them; a "Former
  member" row is a follow-up if it matters.
