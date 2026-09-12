# Stage 06 — Review

Sign-off: pending

> **Update — F1 is resolved** (see "Resolution of F1" near the end). F2 remains
> open and is live in production. The verdict line below is the review as
> written; re-read the resolution section before signing off.

Target reviewed: **branch range `40f5505...HEAD`** (clean tree at start; the
stage-2 quality fixes below are uncommitted at time of writing).
Gate run: `.claude/skills/pr-check/SKILL.md`.

**Verdict: NOT ready to merge.** One high-severity regression against real
production data (F1), plus one live security gap (F2). The rest is debt that
can land as follow-ups. The feature's architecture is sound — the failures are
at the seams, not in the design.

---

## Success criteria (from `01_brief/output/brief.md`)

| # | Criterion | Status |
| --- | --- | --- |
| 1 | Each team role has a deliberate, comprehensible schedule-view and schedule-action state | **Met** — owner/coach/staff/player each have defined view + action states (T4, T7, T8, T9), DB-enforced, with hydrated coverage for all four roles. |
| 2 | A user can understand what actions are available without a dead or misleading control | **NOT met** — F1, F3 and F5 each produce a dead or misleading control. This is the criterion the branch fails. |
| 3 | Authorized users can maintain schedule matches/events and record outcomes for either participant | **Met** — all three kinds × both sides, on duals and tournament rounds, with edit and delete (T5, T6, T9, T16, T17). |
| 4 | Event creation prevents accidental duplicate players; pairings, identity, venue, draw type are clear | **Met** — T10 (duplicate/pair validation), T11 (roster-identity doubles), T14 (draw + roster field), T15 (venue casing). |
| 5 | The Import affordance has a defined, working purpose or is removed | **Met** — removed in T7; guardrails review confirms it has not returned. |

Four of five met. Criterion 2 is the blocker.

---

## Stage 1 — mechanical gates

| Gate | Result |
| --- | --- |
| `npm run lint` | pass (exit 0) |
| `npx tsc --noEmit` | pass (exit 0, no stale-`.next/` re-run needed) |
| `npm run format:check` | pass |
| `npm test` | pass — 730 passed, 17 skipped, 0 failed |

Re-run after the stage-2 fixes: all four still green, 730 passed.

**Note:** green tests did **not** catch F1. See F1's fixture analysis.

---

## Findings

### F1 — Played dual lines render as unanswered (HIGH, blocking)

`src/lib/schedule/entry-state.ts:46`, `line-row.tsx:61`, `event-drawer.tsx:547`,
`entry-state.ts:390`

`resolveEntryResult` finds a match with `entry.matches.find(m => m.round === round)`.
Every dual caller passes `round = null` (`dual-detail.tsx:212`), but
`actions.ts:727` stores a dual match's round as **`entry.slot`**:

```ts
event.kind === "dual" ? (entry.slot as string | null) : input.round;
```

The `EntryMatch.round` doc comment one screen up (`actions.ts:126`) asserts the
opposite — *"Null on a dual line, whose slot is its round."* The loader passes
the raw value through (`schedule-server.ts:219`), so the lookup never matches.

**Verified against the live database** — every dual match carries an S-slot,
none carries NULL:

```
dual | S1 | 2     dual | S4 | 1
dual | S2 | 1     dual | S5 | 1
dual | S3 | 1     dual | S6 | 1
```

Consequences, all on already-scored production data:
- dual detail: no ✓/✗ mark, `"vs"` instead of `"d."`/`"f."`, and the Action
  column offers **"Add result"** for a line with a scored, analysed match
- Schedule drawer: scored lines fall through to "Awaiting result"; their score
  and chevron link to the match page disappear
- `readyMatchIdsFrom` does not in fact exclude outcome-covered dual matches,
  contradicting its own doc comment

**Why the suite passed:** `tests/fixtures/schedule-dual-outcomes-data.ts:16,58`
hard-codes `round: null` on dual matches. The fixture encodes an assumption
that contradicts what `recordResult` writes, so the tests agree with themselves
rather than with production. This is the same failure class the RLS reviewer
caught in T21's first attempt, in a different place.

**Fix shape:** one round key for a dual line — either store `null` (matching the
type comment) and migrate the 7 existing rows, or have the dual callers pass
`entry.slot`. Do **not** fix only the fixture.

### F2 — Cross-program existence oracle on the `matches` guard (MEDIUM, live in production)

`supabase/migrations/20260910184159_authorize_schedule_outcome_writes.sql:40-66`

`guard_schedule_result()`'s `program_event_outcomes` branch checks
`program_members` membership *before* probing, with a comment stating exactly
why: *"BEFORE triggers precede RLS WITH CHECK. Refuse unauthorized sessions
before disclosing whether another program has a legacy result."* The `matches`
branch of the same function has **no such check** — it takes
`new.event_entry_id` unconditionally and probes.

Verified in production: `guard_schedule_match` sorts alphabetically **before**
`matches_block_client_regraft`, so the unguarded trigger fires first; and the
`matches` INSERT policy is `(select auth.uid()) = created_by`, trivially
satisfiable. An authenticated caller naming another program's `event_entry_id`
learns from which of two errors returns whether that line has a saved outcome
or legacy forfeit.

Write is still blocked by the second trigger, so this is a boolean oracle, not
a write bypass, and it needs an entry UUID from another program to be useful.
Low exploitability — but a gap the author demonstrably intended to close and
missed on the second table, **and it is already applied to production.**

**Fix shape:** add the same membership pre-check to the `matches` branch and
`return new` when it fails (let the regraft guard do the rejecting, uniformly).
Prefer that over renaming the trigger to reorder it, which is fragile.

### F3 — Tournament outcomes checked at the wrong grain (MEDIUM)

`src/lib/schedule/line-choices.ts:37,95`

`lineupChoices` and `presetFor` call `outcomeForRound(entry, null)`
unconditionally. Correct for a dual; a no-op for a tournament, where every
outcome carries a real round (DB-enforced by
`program_event_outcomes_round_check`). The pinned bar's "Change" menu can
therefore offer a round as pickable that was recorded defaulted/forfeited/
withdrawn. `presetFor`'s `supportsVideo` has the same round-`null` blind spot.

DB-backstopped — `guard_schedule_result` refuses the eventual insert — so the
failure is a confusing rejection, not corruption. `tests/line-choices.spec.ts`
has **zero tournament coverage**, consistent with the gap being untested.

### F4 — `saveBuilderForfeits` can half-commit and invite a duplicate event (MEDIUM)

`src/lib/schedule/actions.ts:464`, `dual-build-step.tsx:836`

It runs after the event and entries are inserted. On failure it returns an
`ActionError` rendered on the still-open form without navigating — the event
exists, Save is still armed, and clicking again creates a **duplicate dual**.
It also short-circuits the remaining `createDual` work (opponent identity sync).

This is the half-applied state `entry-plan.ts` was explicitly designed to make
impossible. It also only ever *records*: clearing a forfeit in the builder
leaves the outcome row standing, and `entry-plan.ts:151`'s `changed()` compares
the now-dead `forfeit` column, so `planEntryChanges` cannot see a builder
forfeit change at all.

### F5 — "Played — enter score" is a dead end on a line with a saved outcome (MEDIUM)

`src/components/dashboard/schedule/result-choice.tsx:13`

The option list always includes `played`. On a line with a saved outcome,
choosing it and entering a score reaches `recordResult`, which returns *"Clear
the saved outcome before adding a score"* — and the DB trigger refuses too.
Nothing auto-clears, so the coach must guess the sequence: Clear saved outcome
→ Save → reopen → enter score.

### F6 — Legacy `entry.forfeit` readers outside the schedule subtree (LOW)

`createDual`/`updateDual` write `forfeit: null` unconditionally and
`set_schedule_outcome` never populates the column; the only writer left,
`setForfeit` (`actions.ts:1077`), has **no caller**. So the column is
permanently null for new data while several sites still read it.

Severity is lower than it first appears, and the initial reading was corrected
during review: `entryPlayed`, `lineWon` and `entryState` all consult
`outcomeForRound`, and the DB guard makes an outcome and a match mutually
exclusive on one line — so the report-link and Team-Home-state paths are dead
branches, not wrong ones. What actually remains:

- `team-court-record.ts:122` → `court-record-mosaic.tsx:205` drops the
  "Forfeited" / "Won by forfeit" label (W/L itself stays correct)
- `player-profile-server.ts:405` — same label class
- `wizard/actions.ts:90`, `add-result-dialog.tsx:51` — an outcome-forfeited
  line is still offered as an upload/result target (dead end, DB-backstopped)
- `new-dual-flow.tsx:221` seeds the draft forfeit from the dead column while
  `dualLineLock` reads outcomes — one row seeded from two disagreeing sources

**Fix shape:** drop `forfeit` from the public `EventEntry` and expose it only on
the DB row shape, so the compiler names every site, then delete `setForfeit`.

### F7 — `DualLineLock` collapses to `string` (LOW)

`dual-build-step.tsx:321,1384` — `resultLabelFromOutcome` returns `string`, so
`"played" | "forfeited" | ReturnType<…>` is just `string`; `locked` no longer
narrows and `setDraftForfeit`'s guard accepts any string. The
`locked === "forfeited"` branch at :1384 is unreachable, since `dualLineLock`
now returns the human label for legacy forfeits too.

### F8 — Stale migration header (LOW)

`20260910120000_add_program_event_outcomes.sql` still says the migration *"is
not applied remotely"* and gates production on a spec that has since passed.
All three migrations were applied to production after T21. Comment cleanup only.

---

## Fixed in response (stage 2, `simplify`)

Applied, with all four gates re-run green afterwards:

1. `schedule-server.ts` — `Map` replaces an `entries.find()` inside the outcome
   loop (was O(outcomes × entries) on the feature's hot path, over an unbounded
   entry list; the `Map` idiom was already in use eight lines above).
2. `pairKey()` exported from `lineup-validation.ts` and used at all three sites
   — the doubles-pair identity key was spelled three times across the
   server/client boundary; drift there makes the picker offer a pair the save
   rejects, the exact dead end the validation exists to prevent.
3. `canManageTeamSchedule` now delegates to `isProgramStaff` — they were
   character-identical 27 lines apart, and `isProgramStaff` exists *because*
   this predicate was consolidated once already.
4. `line-row.tsx` — dropped the unused `entry` prop from `Action`.

---

## Consciously left

Real, none a one-liner, none blocking:

- The matches+outcomes round-row merge is written twice
  (`tournament-detail.tsx:249`, `event-drawer.tsx:655`) with a byte-identical
  sort comparator, which orphaned `groupByDraw` (`tournament-run.ts:26`) — now
  app-dead but still spec-pinned, so it can drift while passing. Wants one
  `resultRowsFor(entry)`.
- The non-played submit path is duplicated between `score-entry.tsx` and
  `score-only-flow.tsx`; wants a `useResultChoice` hook.
- `ScheduleCapabilities`' five flags are three copies of one predicate plus a
  `canView` every consumer has already established; and it is consulted at
  exactly one call site while six other Schedule routes still call
  `isProgramStaff` directly.
- `saveBuilderForfeits`' redundant `SELECT` (fixable via `.select("id, slot")`
  on the insert) and its serial per-line RPC loop — left deliberately, because
  F4 argues the function should disappear rather than be optimised.
- `RosterTypeahead` carries two props it never reads and four unreachable
  `discipline === "doubles"` branches.
- `usedPairSlots` is rebuilt per row inside JSX, defeating memoisation.

---

## Reviewers run

| Reviewer | Result |
| --- | --- |
| `simplify` (4 agents: reuse, simplification, efficiency, altitude) | 4 fixes applied, 6 left; surfaced F6 and contributed to F4 |
| `vercel-react-best-practices` | **No findings.** Both `"use client"` additions are on genuinely interactive new components; neither was added to an existing server component; all four importers of `result-choice.tsx` are already client components |
| `supabase:supabase-postgres-best-practices` | **No findings.** Policies use the `(select auth.uid())` initPlan form; `program_members_program_user_key (program_id, user_id)` indexes the membership subquery; SECURITY DEFINER guards are in a non-exposed schema with `search_path = ''` and revoked grants; both RPCs are SECURITY INVOKER and re-check membership |
| `code-review medium` | 7 findings — F1 (×4 related), F4, F5, F7 |
| `pipeline-guardrails-reviewer` | F3, F8. **Misattribution check clean** — the three wizard inputs are untouched by this branch and `adScoring` keeps its `boolean \| null` discipline |
| `rls-boundary-reviewer` | F2. Seven other checks clean, incl. column-scoped INSERT grants preventing a forged `actor_user_id`, and no service-role or server-loader leak into a client bundle |

Both guardrail reviewers were run over the **whole range**, not treated as
covered per-task: the range contains `feat(schedule): support both forfeit
sides in lineup` and eight pipeline/docs commits that never faced the per-task
gate, so the "all task-gated" economy did not apply. That was the right call —
F1, F3 and F6 are all cross-surface effects that a per-task diff structurally
could not reveal.

---

## Recommended disposition

1. **Fix F1 on this branch.** It regresses already-scored production data and
   the fix is small. Fix the round key, not the fixture; add dual coverage that
   uses a real S-slot.
2. **Fix F2 on this branch or immediately after** — it is live in production.
3. F3, F4, F5 — own branch, before the feature is announced.
4. F6, F7, F8 and everything under "Consciously left" — own branch, per the
   repo's branch-scope rule.

---

## Also consulted

Beyond the contract's declared inputs (`05_build/output/build.md`, the range
diff, `01_brief/output/brief.md`, `.claude/skills/pr-check/SKILL.md`):

- `AGENTS.md`, `docs/ui-revamp-guardrails.md`
- `src/lib/schedule/{entry-state,line-choices,lineup-validation,actions,entry-plan}.ts`
- `src/lib/data/{schedule-server,team-court-record,team-home-server}.ts`
- `src/lib/workspace/types.ts`
- `src/components/dashboard/schedule/{line-row,result-choice,dual-detail}.tsx`
- `src/components/dashboard/schedule/static/{dual-build-step,lineup-name-picker}.tsx`
- `src/components/dashboard/team/court-record-mosaic.tsx`
- `tests/fixtures/schedule-dual-outcomes-data.ts`
- `supabase/migrations/2026091012{0000,4159},20260910190731_*.sql`
- the **live Supabase database**, read-only, to verify F1's round keys, F2's
  trigger firing order and `matches` INSERT policy, and the applied state of
  the three migrations

---

## Resolution of F1

Fixed on this branch. The investigation changed the diagnosis, so the fix is
not the one the finding first proposed — worth recording why.

**What the finding got right:** the resolver never matches a dual's match, and
played dual lines render as unanswered.

**What changed on investigation:** F1 originally proposed normalising dual
match rounds to `null` and migrating the 7 production rows. That would have
been wrong. `matches.round = <slot>` on a dual is not a mistake — it is the
established convention, written by **two** independent paths (`recordResult`
and the upload wizard), surfaced in the wizard's user-facing Round field, and
read back as the slot by `lineupChoices`. Normalising it would have changed a
product-visible convention and touched guardrail-sensitive wizard code.

The real defect is that **two grains legitimately coexist** and the new domain
code assumed one:

| Representation | Dual grain | Enforced by |
| --- | --- | --- |
| `program_event_outcomes.round` | `null` | `program_event_outcomes_round_check` (database) |
| `matches.round` | the line's slot (`S1`…`D3`) | `recordResult`, the upload wizard |

**The fix** translates between them once, in the module that owns the
derivation (`entry-state.ts`), instead of letting each call site guess:

- `outcomeRoundOf(entry, matchRound)` — private; maps a match's round to the
  outcome grain (slot → `null` on a dual, unchanged elsewhere)
- `outcomeForMatch(entry, match)` — the outcome covering a match's line
- `matchForRound(entry, round)` — the match answering a caller's round grain

Call sites moved onto them: `resolveEntryResult`, `entryState`,
`readyMatchIdsFrom`, `lineWon` (both branches), and `uploadQueueFrom`'s two
lookups in `schedule-server.ts`. No production data was changed, no writer was
changed, and tournaments are untouched — their entries carry no slot and their
rounds never equal one.

`lineWon` was **not** in the original finding. The new tests caught it: it fed
a raw `match.round` into the resolver, so a dual with a saved outcome would
have reported the match's winner instead of the outcome's.

**Regression guard.** `tests/fixtures/schedule-dual-outcomes-data.ts` now
stamps the slot onto any fixture match built without a round, so *every*
existing dual test runs against the production shape rather than the
round-`null` shape that hid this. Four targeted tests were added to
`tests/schedule-outcomes.spec.ts` covering: resolves as played; does not offer
the editor on a scored line; a saved outcome still outranks a contradictory
match and keeps it out of `readyMatchIdsFrom`; and a tournament round is
unaffected by the translation.

Gates after the fix: `lint` 0, `tsc` 0, `format:check` 0, `npm test`
**734 passed, 0 failed** (730 before, plus the 4 new).

F1 no longer blocks. **F2 is still open and is live in production** — it needs
a corrective migration, which is a separate decision.
