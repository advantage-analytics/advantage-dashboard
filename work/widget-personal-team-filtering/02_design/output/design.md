# Design — personal-home widgets must exclude program matches

## What the trace found

`/dashboard` resolves to `src/app/dashboard/(home)/page.tsx` → `home-content.tsx`.
It is the **personal home only**: `PERSONAL_NAV` links `/dashboard`, `TEAM_NAV`
links `/dashboard/team` (a separate route with its own loaders,
`src/lib/dashboard/nav.ts:33` and `:84`). The home page never reads
`getWorkspaceContext()` and does not branch on workspace kind — so its loaders
should be unconditionally personal, and today three of them are not.

Per-widget audit of every match read the personal home makes:

| Widget / value | Loader | Scope today | Verdict |
|---|---|---|---|
| KPI strip, Win Rate, form, `matchCount`, `analyzedMatchCount`, Season title, Focus-card evidence | `getOverallPerformance()` — `src/lib/data/performance-server.ts:846`, query at `:858-861` | `created_by = me` only | **LEAKS** |
| Recent Matches card + its realtime toast | `src/app/dashboard/(home)/recent-activity.tsx:338-342` (browser client) | `created_by = me` only | **LEAKS** |
| Serve Placement (home) | `src/components/dashboard/home/serve-placement-home.tsx:57-62` (browser client) | `created_by = me` only | **LEAKS** |
| Activity heatmap | `getPersonalActivity()` — `src/lib/data/personal-activity-server.ts:84-88` | `created_by = me AND program_id IS NULL` | correct |
| Usage footer | `getPersonalUsage()` — `src/lib/data/usage-server.ts:58-64` | `processing_usage.account_type = 'individual'` | correct (different ledger, not a match read) |
| Getting-set-up line, greeting | `users` / `user_preferences` | own row | not a match read |
| `getMyPlayerIds()` | `src/lib/data/player-identity-server.ts:34` | identity, not match scope | not a match read |

Three leaks, all the same one-clause omission. Two of them run on the **browser**
client, where RLS is no defence: the viewer is a legitimate member of the
program, so the program's matches are rows they are allowed to read. The
predicate has to be explicit.

Live-DB check (`matches` grouped by `created_by`, project `pouxujkhtbvkdwbzfvka`):
`clajersongimena@gmail.com` (`8732762f…`) holds **3 personal and 16
program-attached** matches. That account is the reproduction: its personal home
counts 19 today and must count 3 after the fix. No other account has any
program-attached match, so nobody else's home changes.

### Brief's open questions, resolved

1. **Shared loaders or home-specific?** Home-specific. `/dashboard/matches`
   (`page.tsx:76`) and `/dashboard/statistics` (`statistics-server.ts:289,386`)
   already apply `created_by = me AND program_id IS NULL`, with comments
   explaining why. The home page is the straggler, not the source. The brief's
   non-goal stands and needs no follow-on branch for those two pages.
2. **Does `activity-server.ts`'s comment reverse a product decision?** No — it
   is a **different surface and a different table**. `getActivityFeed()`
   (`activity-server.ts:100`) feeds the header's activity tray and reads
   `processing_jobs`, not `matches`. Its personal branch is `created_by = me`
   with no program clause, justified by a comment claiming `program_id` "does
   not exist until the program migrations land". That justification is stale —
   the column exists on the live DB and four other call sites filter on it — so
   a coach's in-flight program uploads do appear in their personal tray. It is
   the same class of bug on adjacent, out-of-scope code: **carried forward as an
   open question below, for its own branch.** Not touched here.
3. **Reproduction data?** Yes, real and live — see above. No seeding or preview
   harness needed for manual verification.

## Approaches considered

### A. Add the predicate inline at the three leaking call sites *(recommended)*

One `.is("program_id", null)` per query, with a short comment pointing at the
convention, exactly as the four correct sites already do.

- **For:** smallest possible diff; makes seven call sites read identically;
  zero new indirection; no risk to team surfaces, which share none of this code.
- **Against:** the predicate stays duplicated seven times, so an eighth reader
  can still forget it.

### B. Extract a `personalMatchScope(query, userId)` helper and route every site through it

- **For:** one definition; a new reader is nudged toward it; unit-testable
  offline against a recording stub, which is the only cheap way to test this.
- **Against:** the four already-correct sites are explicitly out of scope
  (brief's non-goals), so routing only the three fixed ones through a helper
  leaves the codebase *less* consistent than it is now — four inline, three via
  a helper. Doing all seven widens the change into working code for an
  abstraction over a two-clause filter. Rejected on both counts.

### C. Thread `getWorkspaceContext()` into the home page and branch personal/team like `matches/page.tsx`

- **For:** mirrors the matches list; would future-proof if `/dashboard` ever
  served both workspaces.
- **Against:** it never will — team home is `/dashboard/team` with its own
  loaders, and `TEAM_NAV` has no `/dashboard` entry. This adds an await, a prop
  chain into a client component, and a dead branch. Rejected as YAGNI.

**Recommendation: A.**

## Chosen design

### Architecture

No new files, no new modules, no schema change, no RLS change. Three query
builders gain one clause each. The distinction is already carried by
`matches.program_id`, nullable precisely so that NULL means "personal"
(`statistics-server.ts:288-289` states this).

### Components / changes

1. **`src/lib/data/performance-server.ts`** — in `getOverallPerformance()`, add
   `.is("program_id", null)` after `.eq("created_by", user.id)` (line 860).
   This one edit fixes the KPI strip, Win Rate, form, both match counts, the
   Season title, `buildInsightEvidence()`'s inputs and therefore the Focus
   card's evidence chips and the AI insight's prompt — every downstream value on
   the page derives from this single `matches` read.

2. **`src/app/dashboard/(home)/recent-activity.tsx`** — add `.is("program_id",
   null)` after `.eq("created_by", userId)` (line 342). The realtime toast path
   below (`match_stats` by `match_id`, line 448) keys off a match id this
   component already holds and needs no change.

3. **`src/components/dashboard/home/serve-placement-home.tsx`** — add
   `.is("program_id", null)` after `.eq("created_by", userId)` (line 60), before
   the `.order().limit(4)`. The `shots` read below is keyed by those match ids
   and follows automatically.

Each edit carries a one-line comment naming the rule and pointing at
`matches/page.tsx` as the canonical statement of it, matching how
`statistics-server.ts` and `personal-activity-server.ts` already document theirs.

### Data flow

Unchanged in shape. `matches` rows enter each widget through the same path; the
row set is simply narrower. `matchCount` falls, so `hasMatches` may become
false for a user whose matches are all program-attached — which correctly routes
the page to `DayZeroHome`, the designed empty state, rather than to zeroes.
`analyzedMatchCount` falls likewise, correctly swapping `KpiCards` for
`KpiStripEmpty`.

### Error handling

Nothing new can fail. `.is()` on an existing, indexed, nullable column cannot
error; every one of these reads already tolerates an empty result
(`DEFAULT_PERFORMANCE`, `RecentMatchesEmpty`, `ServePlacementHome`'s early
return). The only behavioural edge is the all-program-matches user, and the
day-zero composition already exists to hold it.

### Testing

- **`npm run lint` and `npm test` must pass** — the suite includes
  `rls-workspace-isolation.spec.ts`, which proves cross-program isolation and
  must stay green.
- **New spec, `tests/personal-home-scope.spec.ts`**, built on
  `tests/fixtures/live-db` (the harness `rls-workspace-isolation.spec.ts` uses:
  service-role fixtures under a per-run prefix, torn down in `afterAll`). Seed
  one user with one personal match and one program-attached match, then, signed
  in as that user, issue each of the three home queries **as the source now
  writes them** and assert each returns only the personal row. This is a
  query-shape mirror test, and worth saying so plainly: its value is that
  dropping the predicate from any of the three call sites turns it red. It does
  not execute the loaders themselves — `getOverallPerformance()` builds its
  client from request cookies and is not callable from the Playwright node
  context.
- **Manual verification, real data:** sign in as `clajersongimena@gmail.com`,
  open `/dashboard` in the **personal** workspace. Season title and KPI counts
  read 3, not 19; Recent Matches lists only the three personal matches; Serve
  Placement draws from those three. Then switch to the team workspace and
  confirm `/dashboard/team` is byte-for-byte unchanged.
- **Guardrails:** run `pipeline-guardrails-reviewer` on the diff — it touches
  `src/app/dashboard/` and `src/components/dashboard/`.

## Open questions

- **`getActivityFeed()`'s personal branch (`src/lib/data/activity-server.ts:100`)
  has the same leak** on `processing_jobs`, and its stale comment gives a reason
  that no longer holds. It is header chrome on every page, not a home widget, so
  it is outside this brief's scope. Recommend a separate branch; flag here so the
  finding is not lost. **Does the human want it folded in instead?**
- Should the Recent Matches empty state say something specific to "your team
  matches live in the team workspace" for a user whose personal home is now
  empty? Out of scope as a copy change; noted because that user's experience
  changes most.

## Also consulted

Beyond the declared inputs (`brief.md`, `MAP.md`, `docs/ui-revamp-guardrails.md`),
these were read to verify the specific facts named above:

- `src/app/dashboard/(home)/page.tsx`, `home-content.tsx`, `recent-activity.tsx`
- `src/components/dashboard/home/serve-placement-home.tsx`
- `src/lib/data/performance-server.ts` (query at 846-893),
  `personal-activity-server.ts`, `usage-server.ts`, `activity-server.ts`,
  `player-identity-server.ts`, `statistics-server.ts`
- `src/app/dashboard/matches/page.tsx` (the canonical personal predicate)
- `src/lib/dashboard/nav.ts`, `src/components/dashboard/app-sidebar.tsx`,
  `src/app/dashboard/layout.tsx` (to establish `/dashboard` is personal-only)
- `src/lib/workspace/types.ts`
- `tests/rls-workspace-isolation.spec.ts`, `tests/set-scope.spec.ts` (test style)
- Live database, project `pouxujkhtbvkdwbzfvka`, via Supabase MCP: `matches`
  grouped by `created_by` × `program_id IS NULL`, and the owning account's email.
