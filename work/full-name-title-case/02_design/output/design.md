# Design — full-name-title-case

## Approaches considered

### A. Title-case in SQL

Change both `SECURITY DEFINER` functions to compose the full name *and* case it,
with `initcap()`.

Rejected. `initcap('MCCARTHY')` is `'Mccarthy'` and `initcap('O''BRIEN')` is
`'O''Brien'` only by luck of the delimiter set — Postgres treats any
non-alphanumeric as a word boundary, so `initcap` also "corrects" names it
should leave alone, and it downcases every deliberate internal capital. Worse,
the rule would then live in a definer function with no test harness, where the
repo's whole convention for a naming rule (`normalizedPersonName`, and the spec
that pins it) is a tested TypeScript function.

### B. SQL returns raw parts; TypeScript composes and formats

Replace `owner_display text` with `owner_first_name text, owner_last_name text`
in both functions and build the string in TypeScript.

Rejected on churn for no gain. Changing a `returns table(...)` column list is
not a `create or replace` — it needs `drop function` + `create` + re-grant on
two functions that `anon` depends on, and it reshapes `ProgramSearchResult`,
the `PlayerProgramRow` union, and the public JSON of `/api/programs/search`.
Everything it buys, C already has. It also spreads the "never an address"
promise across two layers instead of keeping it auditable in one.

### C. SQL composes the full name; TypeScript owns the casing — **recommended**

Each function keeps its exact column list and returns the *full* name with
whatever casing the row holds. One pure TypeScript formatter title-cases it, and
it is applied at the two points where a person's name crosses from data into the
app. `create or replace` works; no type, JSON or grant changes.

This also lands the two halves in the layer that can hold their reasons: the
privacy decision (show the surname) is a database-boundary decision and stays
documented on the function; the casing decision is a presentation rule and stays
in a tested function next to `normalizedPersonName`.

## Chosen design

### Architecture

Two changes, at two choke points, plus one new pure function.

```
program_public_status()  ─┐                          ┌─ /claim/[programKey]
                          ├─ toResult() ──────────── ├─ /claim/[programKey]/request
search_programs()        ─┘   titleCaseName()        ├─ /claim/[programKey]/object
                                                     └─ /claim/program dropdown

users.first/last_name ──── displayName() ─────────── /join/[token] and forms
                              titleCaseName()
```

`toResult()` in `src/lib/data/programs-server.ts` is documented as shaping
"both the search RPC and the status RPC return", so every claim surface reads
its owner name through that one function. `displayName()` in
`src/lib/services/programs/invite-acceptance.ts` is the join half's equivalent.
Two lines, not six render sites.

### Components

**1. `titleCaseName(value: string): string` — new, in
`src/lib/data/person-name.ts`**

Beside `normalizedPersonName`, which is that file's stated job: the one
definition of a person-name rule. This is its display counterpart — matching and
display are the two things you do to a name, and they belong in one file so the
next person finds both.

Total: never throws, returns `""` for blank or whitespace-only input. Trims and
collapses internal whitespace. Takes a whole name or a single part.

The rules, in order, applied per whitespace-separated token:

- **R1 — deliberate casing wins.** A token holding an uppercase letter anywhere
  after its first character is returned untouched. Covers `McCarthy`, `O'Brien`,
  `DeMarco`, `MacLeod`, `LaSalle`, and the suffixes `II` / `III`, all of which a
  user typed on purpose.
- **R2 — otherwise re-case.** Lowercase the token, then uppercase the first
  letter of each segment split on `-` and `'`. `clajerson` → `Clajerson`,
  `GIMENA` → `Gimena`, `o'brien` → `O'Brien`, `smith-jones` → `Smith-Jones`.
- **R2a — one exception inside R2.** A segment beginning `mc` with at least two
  more letters also uppercases the letter after `mc`, so `MCCARTHY` →
  `McCarthy`. **No `mac` equivalent**: `Macon`, `Macey` and `Mackey` are not
  Mac-names and the rule would corrupt them.

Deliberately declined, and documented in the function's doc comment so nobody
files it as a bug:

- **Particles.** `DE LA CRUZ` becomes `De La Cruz`, not `de la Cruz`. Lowercasing
  particles would hit `Van` and `De` used as given names.
- **Lowercase suffixes.** `iii` becomes `Iii`. Typed as `III` it survives R1
  untouched, which is the case that actually occurs; the fix for the other is
  the profile field, not the formatter.
- **The NBSP gap** its neighbour documents. This side collapses `\s+`, which
  includes U+00A0; the SQL side's `btrim` does not. That divergence is
  load-bearing for `normalizedPersonName` because it is a *matching key*. It is
  harmless here because this is display only — the note exists so the two
  functions aren't later "made consistent" in the wrong direction.

**2. `toResult()` — `src/lib/data/programs-server.ts:124`**

```ts
ownerDisplay: titleCaseName((row.owner_display as string | null) ?? "") || null,
```

The `|| null` is load-bearing and already there: a user row with no name at all
composes to `""` in SQL, and every consumer's copy is written for `null` — the
status page's `?? "Someone"`, the search dropdown's `?? "Set up"`, the contact
form's conditional. Blank must not become `""` rendered as a name.

**3. `displayName()` — `src/lib/services/programs/invite-acceptance.ts:194`**

Same shape: compose as today, title-case the result, `|| null` unchanged. Its
existing doc — "Null rather than a placeholder, because every screen that prints
this has a second sentence written for not knowing" — stays exactly true.

**4. One migration, two `create or replace`**

`program_public_status()` and `search_programs()`, column lists unchanged, the
owner expression in each replaced with:

```sql
btrim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, ''))
```

`btrim` handles a blank half on either side (`' Gimena'` → `'Gimena'`,
`'Clajerson '` → `'Clajerson'`) and yields `''` when both are blank — the
existing null path. `create or replace` preserves grants; the migration re-states
`revoke all from public` and the `anon, authenticated` grants anyway, matching
the style of the migrations it supersedes. `SECURITY DEFINER`, `stable` and
`set search_path to ''` are carried over verbatim on both.

Per the repo's standing rule, the live database is the source of truth: the
migration file is written **and** applied to live, and the two live definitions
verified afterwards.

**5. The decision record — three stale comments, all of which now lie**

These are not tidying. Each states the old behaviour as a promise, and leaving
them is how the change gets reverted by someone doing the right thing:

- `comment on function public.program_public_status(text)` — currently "Returns
  an owner as \"First L.\" and never an address". Becomes the full name, still
  never an address, **plus** the reason: this is deliberate, the page is
  anonymous, and the product owner chose it.
- `search_programs`'s equivalent comment.
- `src/app/api/programs/search/route.ts:11` — "the owner comes back as \"D. Wu\"
  with no address". Same correction. The paragraph below it, explaining why the
  player intent is redacted server-side, is untouched and stays right.

### Data flow

Unchanged in shape. `anon` still cannot read `public.users`; both definer
functions remain the only path to an owner's name, and both still return the
name only — never an address, never a user id.

The player-intent redaction is untouched: `redactForPlayer()` drops
`ownerDisplay` from the row entirely before it leaves the server, so a player
searching still sees "On Advantage" and the browser still never receives the
name. This change makes the coach-intent row's name fuller; it does not widen
who receives a row that has one.

**The one deliberate deviation from the brief.** Brief criterion 6 says nothing
outside the claim/join flow changes. `displayName()` also feeds the pending-invite
intercept (`/onboarding`, `/invitations/[inviteId]`,
`components/join/invite-offer.tsx`) and the dashboard activity tray
(`components/dashboard/activity/activity-tray.tsx`), so those inherit the
corrected casing. Recommended anyway: those surfaces name the *same inviter* the
join page names, often in the same session, and the alternative is wrapping six
render sites so that one screen says `Clajerson Gimena` and the next says
`clajerson gimena`. Nothing there gains a name it did not already show, and no
abbreviation changes — casing only. Flagged rather than absorbed; the human can
strike it before stage 03.

### Error handling

Nothing new can throw. `titleCaseName` is total on every input including `""`,
whitespace, and a single-character name. No new failure mode reaches a page.

The three states that must survive, all already handled and all unchanged:

| State | Today | After |
|---|---|---|
| Owner row has no name | `null` → "Someone manages…", "Nobody was notified" | identical |
| Program has no owner | `null` | identical |
| Player intent on search | owner stripped server-side | identical |

The doubled period in "Notifies Clajerson G.." disappears because the string no
longer ends in an abbreviation's period — a consequence, not a patch, exactly as
the brief asks.

### Testing

**`tests/person-name-display.spec.ts`** — new, Playwright in the repo's
pure-function style (`score-format.spec.ts`, `person-name-matching.spec.ts`):
offline, no browser, no database. A table of cases, and — following the house
convention that every describe ends on what must *not* change — the R1 cases are
asserted as identity:

- re-cased: `clajerson gimena` → `Clajerson Gimena`; `CLAJERSON GIMENA` →
  `Clajerson Gimena`; `o'brien` → `O'Brien`; `smith-jones` → `Smith-Jones`;
  `MCCARTHY` → `McCarthy`
- untouched: `McCarthy`, `O'Brien`, `DeMarco`, `MacLeod`, `III`
- declined, pinned so the limitation is a decision and not a surprise:
  `DE LA CRUZ` → `De La Cruz`, `iii` → `Iii`, `macon` → `Macon`
- blank: `""`, `"   "` → `""`; and via `toResult`/`displayName`, `null`

**Live-database check** — the SQL half is otherwise untested. Following
`join-requests-staff-read.spec.ts`'s precedent, one assertion per function that
the returned owner string contains no `". "`-style abbreviation and matches the
row's `first_name last_name`. Kept to two assertions; this is a regression fence,
not a suite.

**Manual** — `/claim/<programKey>` for the ZZ Test Program, whose sole owner is
the account in the screenshot: headline reads the full name, footer note ends in
one period.

`npm run lint` and `npm run build`. No route added, so `npm run map` is not
needed.

## Open questions

Brief questions 1, 3, 4 and 5 are resolved above (rule set; formatter in
TypeScript with SQL composing; the dropdown is in and its player redaction is
preserved; nothing else abbreviates). Carried forward:

1. **Brief Q2 — write-time normalization is declined, not deferred blindly.**
   Render-time only. Write-time would touch sign-up, profile and invite
   acceptance — all non-goals — need a backfill of the 3 drifted rows, and be
   *lossy*: once `McCarthy` is stored as `Mccarthy` the original is gone, where a
   render-time rule is reversible by editing one function. If a future ask wants
   names stored clean, that is its own change.
2. **The deviation above** — `displayName()`'s reach into the pending-invite
   intercept and the dashboard activity tray. Recommended, flagged, the human's
   to strike.
3. **`Mc` only, no `Mac`.** Stated as a rule rather than asked, but it is the one
   judgement call in R2a that a name in this user base could contradict.

## Also consulted

Beyond the declared inputs (`../01_brief/output/brief.md`, `MAP.md`).
`docs/ui-revamp-guardrails.md` and the design skill were **not** loaded: their
condition is dashboard UI, and this change adds no markup, tokens or components
to any dashboard surface.

- `src/lib/data/programs-server.ts` — `toResult`, `redactForPlayer`, the
  `ProgramSearchResult` / `PlayerProgramRow` union
- `src/lib/data/person-name.ts` — `normalizedPersonName` and the doc that makes
  it the home for a person-name rule
- `src/lib/services/programs/invite-acceptance.ts` — `displayName`
- `src/lib/data/pending-invites-server.ts` and its consumers (`/onboarding`,
  `/invitations/[inviteId]`, `components/join/invite-offer.tsx`,
  `components/dashboard/activity/activity-tray.tsx`) — to find the spillover
- `src/app/api/programs/search/route.ts` — the redaction boundary and the stale
  "D. Wu" comment
- `src/components/claim/program-search.tsx` — the dropdown's two row shapes
- `src/lib/utils.ts` — existing `capitalize`, deliberately not extended
- `package.json`, `tests/` — the test runner and the pure-function spec style
  (`score-format.spec.ts`, `person-name-matching.spec.ts`,
  `join-request-name.spec.ts`, `join-requests-staff-read.spec.ts`)
- Live database via Supabase MCP: the current definitions of
  `program_public_status()` and `search_programs()`
