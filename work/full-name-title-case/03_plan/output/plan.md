# Plan — full-name-title-case

Five steps. Each is one surface, sized for a fresh subagent context.

Steps 1 and 2 are independent and could run in either order, but 2 depends on 1
existing (it imports the formatter), so the order below is the dependency order.
Step 3 is the only one that touches the database. Steps 4 and 5 are the two
halves of "the change is recorded, not just made".

**Dependency order:** 1 → 2 → 3 → 4 → 5. Step 3 may run before 2 without
breaking anything (the SQL and the TypeScript are independent halves of the same
result), but the plan is written in the order a reviewer will read it.

---

## Step 1 — The formatter and its spec

**Files**
- `src/lib/data/person-name.ts` (add)
- `tests/person-name-display.spec.ts` (new)

**Change**

Add `titleCaseName(value: string): string` beside `normalizedPersonName`. Total —
never throws, returns `""` for blank or whitespace-only input. Trims and
collapses internal whitespace, then applies per whitespace-separated token, in
order:

- **R1** — a token with an uppercase letter anywhere after its first character is
  returned untouched (`McCarthy`, `O'Brien`, `DeMarco`, `MacLeod`, `III`).
- **R2** — otherwise lowercase the token and uppercase the first letter of each
  segment split on `-` and `'`.
- **R2a** — inside R2 only, a segment beginning `mc` with at least two more
  letters also uppercases the letter after `mc` (`MCCARTHY` → `McCarthy`). No
  `mac` equivalent.

The doc comment carries the three declined cases as decisions — particles
(`DE LA CRUZ` → `De La Cruz`), lowercase suffixes (`iii` → `Iii`), and why there
is no `mac` rule (`Macon`, `Macey`, `Mackey`) — plus the note that this side
collapses `\s+` including U+00A0 while its neighbour's SQL counterpart does not,
and that the divergence is harmless here because this is display, not a matching
key.

The spec is Playwright in the repo's pure-function style — offline, no browser,
no database, following `score-format.spec.ts` and `person-name-matching.spec.ts`.
Per that house convention every describe ends on what must *not* change, so the
R1 cases are asserted as identity. Cases: the re-cased set, the untouched set,
the three declined cases pinned so the limitation is a decision, and blank/
whitespace input.

**Verification**

`npx playwright test tests/person-name-display.spec.ts` passes. `npm run lint`.
Nothing else in the app calls it yet, so this step cannot change any screen.

---

## Step 2 — Wire the two choke points

**Files**
- `src/lib/data/programs-server.ts` (`toResult`, line 130)
- `src/lib/services/programs/invite-acceptance.ts` (`displayName`, line 194)

**Change**

Two lines, one per file. In `toResult`, title-case `owner_display` as the row
crosses from SQL into TypeScript; in `displayName`, title-case the composed name
before returning. Both keep `|| null` exactly as it is — a nameless user row
composes to `""` and every consumer's copy is written for `null` (the status
page's `?? "Someone"`, the dropdown's `?? "Set up"`, the contact form's
conditional, the join page's "Nobody was notified"). A blank must not survive as
`""` rendered where a name goes.

`toResult` shapes both RPC returns, so this one line reaches every claim surface:
the status page, `/request`, `/object`, the contact form, and the search
dropdown.

**Known spillover, approved at stage 02 and not to be widened here.**
`displayName` also feeds `/onboarding`, `/invitations/[inviteId]`,
`components/join/invite-offer.tsx` and the dashboard activity tray, which
inherit the corrected casing. Casing only — no surface gains a name it did not
already show, and no abbreviation changes. Do not touch those files.

**Verification**

`npm run lint` and `npm run build`. Existing specs still pass — no current spec
asserts on `displayName` output, which was checked at stage 02, so this step
should break nothing. Until step 3 lands, the claim surfaces still render
`Clajerson G.` because the abbreviation is still in SQL; title-casing an
already-abbreviated string is harmless and correct.

---

## Step 3 — The migration: both functions compose the full name

**Files**
- `supabase/migrations/<timestamp>_full_owner_name.sql` (new)
- the live database (the migration is applied, not only written)

**Change**

One migration, two `create or replace function` statements. Both keep their
exact column lists — `owner_display text` stays — so this is a body change, not
a signature change. Replace the owner expression in each with:

```sql
btrim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, ''))
```

`btrim` absorbs a blank half on either side and yields `''` when both are blank,
which is the existing null path through `toResult`. `program_public_status`
keeps its `case when u.id is null then null` wrapper.

Carry over verbatim on both: `stable`, `security definer`,
`set search_path to ''`. `create or replace` preserves grants; re-state
`revoke all ... from public` and the `anon, authenticated` grants anyway, matching
the style of the migrations these supersede.

Update both `comment on function` texts in the same migration — see step 4 for
what they must say.

Per the repo's standing rule the live database is the source of truth: apply the
migration, then read both live definitions back and confirm they match the file.

**Verification**

Both live definitions verified after apply. `program_public_status()` for the ZZ
Test Program returns the owner's full name with no trailing `.`; `search_programs()`
on a term matching a claimed program returns a full name, not `C. Gimena`.

---

## Step 4 — The decision record: three comments that now lie

**Files**
- the two `comment on function` statements in step 3's migration
- `src/app/api/programs/search/route.ts` (the doc block, ~line 11)

**Change**

Each of these states the *old* behaviour as a promise. Leaving them is how this
change gets reverted by someone doing the right thing.

- `program_public_status` — currently "Returns an owner as \"First L.\" and never
  an address". Becomes: the full name, still never an address, and the reason —
  this page is reachable by anonymous visitors and showing the surname is a
  deliberate product decision, not an oversight.
- `search_programs` — its equivalent comment, same correction.
- `route.ts` — "the owner comes back as \"D. Wu\" with no address" is now false.
  Correct that sentence only. The paragraph below it explaining why the player
  intent is redacted server-side is still exactly right and must not be touched.

If step 3 lands the two SQL comments, this step is only `route.ts`; keeping them
listed together is deliberate, because the three sentences are one decision.

**Verification**

`grep -rn "First L\.\|D\. Wu" src/ supabase/` returns nothing outside historical
migration files. `npm run lint`.

---

## Step 5 — Verify the flow end to end

**Files** — none. Verification only.

**Change**

Nothing. This step exists because the previous four are each individually
invisible and the point of the feature is what a person reads on a page.

**Verification**

Against the ZZ Test Program, whose sole owner is the account in the original
screenshot:

1. `/claim/<programKey>` — headline reads the full name in title case; the footer
   note reads "Notifies <Full Name>." with **one** period.
2. `/claim/<programKey>/request` and `/object` — same name, same shape.
3. `/claim/program` — searching the school shows the full name in the owner
   column, not `C. Gimena`.
4. `/claim/program?intent=join` (the player path) — still shows "On Advantage"
   and the network response still carries no owner name. This is the regression
   that would matter most; the redaction is untouched but it is the one thing
   worth proving rather than assuming.
5. `/join/<token>` for a live invite — inviter's name in title case.
6. A program whose owner row has no name — still "Someone manages Advantage
   here", no stray punctuation, no `undefined`.

---

## Test strategy

Three layers, matching how the repo already tests this kind of rule.

**Pure function, offline.** `tests/person-name-display.spec.ts` is the contract
for the casing rule and the only place the declined cases are pinned. It is the
regression fence: if someone later "improves" the formatter to lowercase
particles or add a `mac` rule, this fails. Follows the house convention of
closing each describe on cases that must NOT change.

**Live database, two assertions.** The SQL half is otherwise untested, and
`join-requests-staff-read.spec.ts` is the precedent for a spec that reads the
live database. One assertion per function: the returned owner string matches the
row's `first_name last_name` and carries no abbreviation period. Two assertions,
not a suite — this is a fence, not coverage.

**Manual, once, at step 5.** The six checks above. The player-redaction check is
the one that is not optional: everything else failing is visible, and that one
failing would not be.

**Not tested, deliberately.** No new Playwright browser spec for the claim pages.
They are server-rendered pages whose only change is the string in an existing
element; a browser spec would assert that React renders a prop, which the two
layers above already cover at their sources.

Run before the branch is considered done: `npm run lint`, `npm run build`,
`npm test`. `npm run map` is not needed — no route is added or removed.
