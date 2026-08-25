# Roster editing and people search — design plans

> **Point-in-time (2026-08-25).** Two designed-but-unbuilt changes to the team roster
> surface, plus the record of a third that was deliberately declined. Written after the
> Design System v3 port (`Team Roster.dc.html` §07) merged in PR #137.
>
> Plan 1 is queued as **T1** on `claude/roster-edit-player`; that task's `done when:` list
> is the contract, and this document is the reasoning behind it. Plan 2 is not queued.
> Both were researched against the code at `998c4b5` — re-verify line numbers before
> relying on them.
>
> **Superseded in part (2026-08-25) — Plan 1 is built.** T1 shipped on
> `claude/roster-edit-player`. One §1 decision did not survive review: the
> *"Archived rows are editable"* risk below chose to mitigate in TypeScript and write no
> migration, on the premise that the write was "reachable only from a stale dialog".
> `rls-boundary-reviewer` disproved that premise — `update_program_player` is
> `security definer` and granted to `authenticated`, so any staff session can call it
> directly and skip the pre-flight read entirely. Migration
> `20260825120000_update_program_player_skips_archived.sql` adds `archived_at is null` to
> the RPC's row lookup and is applied live. That risk bullet and step 7 of §1's test list
> are annotated where they now read false; the rest of §1 is as built, and §2 and §3 are
> untouched.

## 1 · Edit a roster player (meatball → Edit)

### Context

A coach can create a player with a name, class year, lineup spot and email — and
then never change any of them. `add-player-dialog.tsx` is the only writer, and it
only inserts. The motivating case is the **singles lineup spot**: once set at
creation it is frozen, so a mid-season reshuffle is impossible without deleting
and re-adding the athlete, which would orphan their matches.

The database side already exists and has never been wired up.
`update_program_player` (`supabase/migrations/20260822090700_program_player_writes.sql:115-177`)
is granted to `authenticated`, guarded by `is_program_staff`, validates names and
email shape, and audits as `player.updated`. A grep for it across `src/` returns
zero hits. This task is the UI for a write path someone already built.

**Drag-and-drop reordering is deliberately out of scope.** It needs a bulk
reorder RPC that does not exist — `update_program_player` is a full-row overwrite,
so renumbering six players today means six round-trips, six audit rows and no
transaction. Filed as a separate later task.

### Decisions already made

- **Approach**: meatball → Edit dialog. Not drag-and-drop.
- **Branch**: `claude/roster-edit-player`, cut from `splitstep-integration` at `998c4b5`
  once #137 merged. Kept separate from the 9a–9d design port on purpose — this is a new
  capability, not part of that change.

### The correction that drives the design

**The dialog must NOT seed from the `RosterMember` already in props.** Two reasons,
both verified against source:

1. `RosterMember` has no `firstName`/`lastName` — only `name: string`
   (`src/lib/data/team-roster-server.ts:69`), because `program_roster_full` builds it
   as `btrim(pp.first_name || ' ' || pp.last_name)`. Splitting client-side is lossy
   on two-word surnames and middle names.
2. `program_roster_full` **coalesces with the user account**
   (`supabase/migrations/20260822090500_program_roster_full.sql:42,45`):
   ```sql
   coalesce(pp.email, u.email),
   coalesce(pp.class_year, u.class),
   ```
   So for a claimed player with no profile email, `member.email` is their *login
   address*. Seeding from it and saving writes that personal address into
   `program_players.email` — a value the coach never typed, which can also trip the
   partial unique index `program_players_email_key`.

This is silent, fires on the most common roster shape (claimed athletes), and the
coach's own submission looks correct. The separate read is the whole mitigation.
Guard it with a comment; it looks like a redundant round-trip and will invite
"simplification".

### Implementation

### 1. `src/components/dashboard/team/roster-actions.ts` — two actions

Follow `addProgramPlayer` (line 96): resolve the program from `getWorkspaceContext()`,
never from the caller; refuse unless `workspace.active.kind === "team"`.

**`getPlayerForEdit(profileId)` → `LoadPlayerResult`**
Plain select from `program_players` (SELECT is granted and RLS-scoped, so no RPC
needed) returning `firstName`, `lastName`, `classYear`, `lineupSpot`, `email`,
`updatedAt`, `claimed`. Return `reason: "gone"` when the row is missing, merged,
archived, **or `program_id !== workspace.active.id`** — the RPC derives the program
from the row, so a stale `profileId` from another program the coach staffs would
otherwise be edited successfully while they look at a different roster.
Precedent for a read in this file: `previewMerge`.

**`updateProgramPlayer(input)` → `UpdatePlayerResult`**
`EditPlayerInput` uses **required-but-nullable** properties, unlike
`addProgramPlayer`'s `?:`. The RPC defaults every parameter to null and writes all
five columns unconditionally, so an omitted field is not "leave alone", it is
"erase". Comment this, or someone will make the two interfaces consistent.

Steps: workspace guard → reject `lineupSpot < 1` client-side (the RPC lacks
`add_program_player`'s `>= 1` check, so only the table constraint catches it, with a
raw message) → pre-flight re-read for gone/conflict via `updatedAt` → call the RPC
with all five params explicit → map errors by SQLSTATE.

Error mapping (the existing four actions read `error.message` only; that is wrong
here because the unique index can fire underneath the RPC):

| code | handling |
|---|---|
| `42501`, `22023` | pass `error.message` through — the RPC raises human sentences |
| `23505` | **replace**: "Somebody else on this roster already uses that email address." Never pass the raw constraint string |
| `28000` | replace: "Your session expired. Sign in again." |
| else | existing house fallback |

Revalidate `ROSTER_PATH` + `TEAM_HOME_PATH`, plus
`revalidatePath("/dashboard/team/roster/[playerId]", "page")` — that page renders
class year, name and `#N singles`. The `type` argument is **required** for a dynamic
segment. Do **not** revalidate `SETTINGS_PATH`: archive and merge do so because they
move a seat; this edit touches neither `program_members` nor seat occupancy.

### 2. `src/components/dashboard/team/player-fields.tsx` — new, extracted

Move **verbatim, comments included**, out of `add-player-dialog.tsx`: `CLASS_YEARS`,
`UnderlineSelect`, `RosterNote`, `duplicateNameNote`, `spotHeldNote`, `nameList`.
Add `LINEUP_SPOTS` (currently inlined at `add-player-dialog.tsx:469`) and:

```ts
rosterNotes(roster, fields, excludeProfileId): { nameNote, spotNote }
```

Add passes its `createdProfileId`; Edit always passes its own `profileId` —
otherwise the coach is told "#3 is already held by Maya Chen" about Maya Chen's own
current spot.

`add-player-dialog.tsx`'s diff must be deletions plus imports plus one call. Its
`created`/`formKey` machinery stays — that computes *which id to exclude*, which is
add-specific, and its comment documents a silent-duplicate bug it exists to prevent.

Extract the leaves, not the form: a shared `PlayerForm` with `mode="add"|"edit"` is
the wrong call. The exclusion inverts, edit has loading/gone/conflict states add
lacks, add has `alsoInvite`'s two-phase submit edit lacks, and the email field means
different things on each.

### 3. `src/components/dashboard/team/edit-player-dialog.tsx` — new

Props follow `MergeProfilesDialog`, not `AddPlayerDialog`: `{ player: RosterMember | null, roster, onOpenChange }`.
Copy merge's **during-render reset** keyed on `player?.profileId ?? ""`
(`merge-profiles-dialog.tsx:74-81`) — `return null` does not unmount, so state
survives across targets, and an effect-based reset paints the previous player's name
for a frame. Copy its fetch effect with the `live` guard.

Reuses `RosterDialog` (width 440), `DialogProblem`, `DialogInfoRow`, `SettingsField`,
`SettingsUnderlineInput`, `advButton`, `normalizedPersonName`.

Layout mirrors add exactly. **Both `sr-only` `aria-live` regions must stay
always-mounted** — the visible `RosterNote` is `aria-hidden`, and the easy transplant
error is to copy the visible half and drop the announcing one.

No `autoFocus`: every field is populated and the motivating action is the lineup
spot; focusing a correct name invites overtyping it.

When `loaded.claimed`, a `DialogInfoRow`: changes update the roster, not their login
or their own profile page. The RPC writes `program_players` and can never reach
`users`.

On `reason: "gone" | "conflict"`, replace the fields with a terminal `DialogProblem`
and a single **Close** button that calls `router.refresh()` — the roster on screen is
provably stale and `revalidatePath` cannot help from the client.

### 4. `src/components/dashboard/team/roster-table.tsx` — `RowMenu`

- Gate on `const canEdit = member.profileId !== null`, **never on role**. Staff seats
  come from `program_roster_full`'s arms 2 and 3 with a null `profile_id`; their name
  lives in `users` and the RPC cannot reach it.
- Add `canEdit` to the early-return condition (line 240). This changes no row's
  behaviour today — every row with a `profileId` already satisfies `canRemove` or
  `canToggleSend` — but the condition should enumerate every entry the menu can hold.
- **Make the Popover controlled** and close it before opening the dialog. Radix
  Dialog opening from inside an open Radix Popover fights over focus.
- Edit sits first, above the "Can send video" block, styled after the existing Remove
  button in the same file. No danger tint.
- Thread `onEdit` exactly as `onMerge` is threaded today; `RosterTable` gains an
  `editing` state beside `merging`.

### Verification

```bash
npx tsc --noEmit && npm run lint && npm test
```
Lint holds at its pre-existing warnings, 0 errors. No route added, so `MAP.md` stays
valid.

**Before writing the action**, confirm `update_program_player`'s live signature via
the Supabase MCP — CLAUDE.md is explicit that `supabase/migrations/` runs behind the
live database.

Click-through as owner/coach on a team workspace:
1. Edit a player with a **two-word surname** — confirm First/Last split correctly.
2. Edit a **claimed player with no profile email** — the email field must be
   **empty**, not their login address. This is the correction above; getting it wrong
   is invisible until Save.
3. Change lineup spot only → Save → `#` column updates, row moves, no reload.
4. Reopen → class year and email survived. This is the full-row-overwrite proof.
5. Set a spot another player holds → note appears, does **not** block, and does not
   name the player being edited when re-selecting their own spot.
6. Enter an email another player has → mapped sentence, not the raw constraint string.
7. Stale-open: remove the player in a second tab, then Save → terminal "no longer on
   this roster". Then verify in SQL that the archived row is **unchanged**.
   *(Superseded: as built, the RPC filters `archived_at` itself — migration
   `20260825120000`. The pre-check is no longer the only thing stopping the write; it is
   what turns the database's silent refusal into a sentence the coach can read.)*
8. As a player viewer: no meatball at all.
9. Audit: `select action, subject_id from program_audit_log where action = 'player.updated'`.

### Risks

- **The email coalesce** (above) — the worst one, silent, common.
- **Archived rows are editable.** **Superseded (2026-08-25) by migration
  `20260825120000`,** which added `archived_at is null` to the RPC's row lookup. The
  original reasoning is kept because the mistake in it is the instructive part: "The RPC
  filters `merged_into_id` but not `archived_at`. Reachable only from a stale dialog, but
  it is a successful invisible write, not a no-op. The pre-flight read is the mitigation
  and is TOCTOU — say so in the comment rather than implying it is a lock." *Reachable
  only from a stale dialog* was the false step: the function is `security definer` and
  granted to `authenticated`, so a staff session can call it directly and never touch the
  pre-flight read at all. A guard a caller can skip is not a guard. The TOCTOU point
  still holds for what that read does now — it is what produces the friendly "no longer
  on this roster" state, and the residual race costs a stale success message rather than
  an invisible write.
- **Moving a player leaves a hole.** `lineup_spot` is deliberately non-unique. Moving
  #3 → #2 leaves #2 doubled and #3 empty; `getLadder()` sorts by spot with ties broken
  alphabetically and `seedLineup()` fills S1–S6 positionally, so everyone below shifts
  up rather than a gap appearing. Correct for a non-unique column, but a coach will not
  predict it — and it is the strongest argument for the deferred drag-and-drop task.
  Affects **new** duals only; existing `program_event_entries` store labels and ids.
- **Renaming a claimed athlete does not rename their account.** The `DialogInfoRow` is
  the whole mitigation.

---

## 2 · Make people findable in the command palette

*Not yet queued as a task.*

### Context

This started as "should I be able to filter the roster?" **The answer to that is no**, and
the research is worth recording so it is not re-litigated:

- The design explored roster filtering **three times** — `3c2` (filter pills + search +
  sort), `4c` (pills + sortable header + bulk select), `5a` (tabs + "Filter roster" +
  "Lineup order") — and **dropped all of it** from the finalized `9a`–`9d` flow.
- There is a dated written decision in `src/components/dashboard/team/invite-target-picker.tsx:27-31`:
  *"A college roster is nine to fifteen rows. A filter box would be one more thing to tab
  past on a list that fits on screen. If a program ever has fifty, add it then."*
- A roster is genuinely ~10–30 rows. Nothing in the app paginates or virtualises it, and
  the sibling opponent roster has no filter either.

**But the question exposed a real gap.** The header palette's tooltip advertises
*"Matches, players, help"* and it queries only the `matches` table
(`search-command-palette.tsx:182-191`). So:

- a player is findable **only if they already appear on a match row**;
- clicking a "player" navigates to `/dashboard/matches?q={name}` — a filtered match list,
  never their roster row;
- **a player a coach added last week with no matches yet cannot be found anywhere in the
  app**, by any means.

That is the thing worth fixing: not narrowing a list that fits on screen, but making people
findable at all.

### Implementation — `src/components/dashboard/search/search-command-palette.tsx`

**No migration.** `program_players` already has `grant select to authenticated` and an RLS
policy scoping it to `program_id in (select user_program_ids())`, so the client can query it
directly and cannot see another program's roster.

**1. Second query, in parallel.** Add a `program_players` select alongside the existing
`matches` query inside the same `Promise.all` — the palette already debounces 300ms and
runs on each keystroke after, so these must not be sequential.

Name matching needs care: the roster stores `first_name`/`last_name` separately, so a
PostgREST `.or()` on either column alone never matches "priya sharma". Use the two-step the
codebase already proves in `PinnedMatchContent.tsx:68-73`:

1. Split the query into tokens and `.or()` each token against `first_name`, `last_name` and
   `email` — deliberately a **superset**;
2. narrow client-side with `normalizedPersonName(name).includes(needle)` from
   `src/lib/data/person-name.ts`, the established rule for roster-name matching.

A SQL `normalized_person_name(p_first, p_last)` does exist
(`supabase/migrations/20260822140000_merge_program_players.sql:39`) and would allow a
cleaner single-query RPC — worth doing **only** if the superset proves too large in
practice. Do not add it speculatively.

**2. Scope to the active workspace.** RLS returns players from *every* program the user
belongs to, but `/dashboard/team/roster/[playerId]` is team-workspace-only and redirects
otherwise. Read `useWorkspace()` and render the PLAYERS group only when
`active.kind === "team"`, filtering to `active.id`. Without this, a coach who staffs two
programs gets results that 404 or redirect.

**3. `navigateTo` has a trap — this is the one to get right.** It currently reads:

```ts
if (item.type === "match") router.push(`/dashboard/matches/${item.data.id}`);
else router.push(`/dashboard/matches?q=${encodeURIComponent(item.data.name)}`);
```

A new `player` variant falls into that `else` and silently routes to a filtered **match
list** — which is exactly the bug being fixed, reintroduced. Add an explicit branch to
`/dashboard/team/roster/{playerId}` before the fallback.

`RosterMember.playerId` and `profileId` are the same value for player rows (arm 1 of
`program_roster_full` selects `pp.id` twice), so `program_players.id` is the correct route
param — the same one `roster-table.tsx` links to.

**4. Order the groups people-first.** `flatItems` (line ~260) is what arrow keys traverse
and what Enter selects by default, so group order is not cosmetic. PLAYERS before MATCHES:
a person is a more specific answer than a match they appear in. `MAX_PER_CATEGORY = 3`
applies unchanged. The `Users` icon is already imported.

### Verification

```bash
npx tsc --noEmit && npm run lint && npm test
```

Click-through, on a team workspace:
1. ⌘K, type a surname → a **PLAYERS** group appears above MATCHES; Enter opens
   `/dashboard/team/roster/{id}`, **not** a match list.
2. **The case that is broken today**: search a coach-added player with zero matches. They
   must be findable. Before this change they are not findable anywhere in the app.
3. Type a full "first last" — confirm multi-token matches, which the naive single-column
   `.or()` would miss.
4. Switch to a **personal** workspace → no PLAYERS group, no errors.
5. As a coach in two programs → only the active program's players appear.
6. Arrow through every group and confirm the highlight order matches the render order.

### Risks

- **"help" is still unfulfilled.** The tooltip promises three things; this delivers the
  second. Either wire help or trim the tooltip — do not leave it two-thirds true and call
  it done.
- **Opponent players stay unfindable.** RLS scopes `program_players` to your own programs;
  other programs' rosters come through `pooled_roster` / `public_roster_view`. Deliberately
  out of scope — say so rather than half-implementing it.
- **Two queries per keystroke-after-debounce.** Must be `Promise.all`, and the existing
  `stale` guard must cover both or a slow roster response can overwrite fresh results.

### Also found while researching — unrelated, likely live bug

`claimedToday` may be **permanently false**. `program_roster_full`'s `RETURNS TABLE`
declares 11 columns and `claimed_at` is not among them; no later migration redefines the
function; `team-roster-server.ts:351` computes `claimedToday: isToday(row.claimed_at)`, and
`isToday` returns false on a falsy input. If that holds against the live database, the 9d
claim receipt shipped in PR #137 and the pre-existing "Claimed today" chip are both dead
code.

**Not verified** — CLAUDE.md says migrations run ~100 behind live, and the Supabase
connector available in this session exposes only `query_logs`, no `execute_sql`. Needs one
query against the live function definition before anyone acts on it. #137 has since
merged, so if this holds the dead code is already on `splitstep-integration` — it decides
whether the claim receipt does anything at all, and nothing downstream depends on it.

---

## 3 · Roster filtering — considered and declined

Recorded so it is not re-litigated. The question was "should I be able to filter the
roster?" and the answer is no, at this scale:

- The design canvas explored it **three times** — `3c2` (filter pills + search + sort),
  `4c` (pills + sortable header + bulk selection), `5a` (tabs + "Filter roster" input +
  "Lineup order" sort) — and dropped all of it from the finalized `9a`–`9d` flow. §07's
  intro lists what `9a` inherits from `5a`; the filter row is not on that list.
- `src/components/dashboard/team/invite-target-picker.tsx:27-31` already records the same
  call: *"A college roster is nine to fifteen rows. A filter box would be one more thing
  to tab past on a list that fits on screen. If a program ever has fifty, add it then."*
- A roster is genuinely ~10–30 rows — players, staff seats and pending invites in one
  list. Nothing in the app paginates or virtualises it, and the sibling opponent roster
  (the same table, via `pooled_roster`) has no filter either.

**Revisit when a program approaches ~50 rows.** If filtering does return, the design's own
answer was *workflow-state tabs* (All / Needs review / Processing / Invited with live
counts) rather than a name search — triaging work, not finding people. Finding people is
Plan 2, and it belongs in the command palette rather than on this one page.
