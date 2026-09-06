# Review — workspace-breadcrumb-hairline

**Sign-off: pending**

*Edit that line to `approved` — or annotate it — once you have run the visual
walk in "Success criteria" below. This is the pipeline's final gate, and it is
the one thing no automated check in this repo can close.*

- **Target reviewed:** branch range `8e8d017...HEAD` against
  `splitstep-integration`, working tree clean.
- **`pr-check` receipt:** `51e9b49  ready  2026-09-06T20:27:52Z`, recorded with
  `--reviewed branch-range` and a clean tree.
- **Verdict from the gate:** everything `pr-check` can check is green. What it
  cannot check is criteria 1–5 below.

## Success criteria, one by one

From `01_brief/output/brief.md`. Verified means *someone or something actually
checked*, not *the code looks like it should work*.

| # | Criterion | Status |
|---|---|---|
| 1 | Personal rail walk carries the workspace, greeting still on Home | **NOT VERIFIED** — needs eyes |
| 2 | Team rail walk carries the program name on all seven | **NOT VERIFIED** — needs eyes |
| 3 | Flow paths still show trails, unchanged | **partly verified** — see below |
| 4 | No page ends with neither a chrome name nor a body title | **verified** |
| 5 | Bottom edge visible unscrolled, at normal viewing distance | **NOT VERIFIED** — needs eyes |
| 6 | Scroll does not lose the edge or make it jump | **verified by construction** |
| 7 | `lint` / `build` / `test` pass, no unrelated surface moves | **verified** |

**Criterion 3 — partly verified.** `tests/header-slot.spec.ts` pins the
predicate side of it: a match detail page, `matches/new`, a schedule create
screen and a settings sub-page all return `false`, so they take the trail
branch. `pipeline-guardrails-reviewer` separately confirmed `isDestination`
cannot match `/dashboard/matches/[matchId]`. What is *not* verified is that the
trail then renders as it did before — that is a rendering claim, and it needs
walk 3.

**Criterion 4 — verified**, by direct inspection of every page that gained the
title:

| Page | Names itself? |
|---|---|
| `/dashboard/statistics` | `ComingSoonPage title="Statistics"` → `<h1 class="text-display">` |
| `/dashboard/ask` | `ComingSoonPage title="Ask"` |
| `/dashboard/help` | own `<h1 class="text-display">Help center</h1>` |
| `/dashboard/opponents` | `ComingSoonPage title="Opponents"` |
| `/dashboard/team/statistics` | `ComingSoonPage title="Statistics"` |
| `/dashboard/team/ask` | `ComingSoonPage title="Ask"` |
| `/dashboard/team/roster` | own `text-display` h1 |
| `/dashboard/team/schedule` | `StaticSchedule` → `<h1 class="text-display">Schedule</h1>` |

`/dashboard/settings` is in `DESTINATIONS` but `redirect()`s, so the title
branch can never render for it. Same for `/dashboard/team/settings`.

**Criterion 6 — verified by construction.** Nothing changes on scroll any
more; the state that changed it was deleted. An edge that never changes cannot
be lost or made to jump.

**Criterion 7 — verified.** `lint` 0 errors (32 pre-existing warnings, none
new), `tsc --noEmit` clean, `build` pass, `npm test` **443 passed / 0 failed**.
Range touches three code files and nothing else.

### What still needs eyes

Run `npm run dev` on port 3000 or 3101, then:

1. **Personal:** Home → Matches → Statistics → Ask. Greeting on Home, workspace
   title on the other three.
2. **Team:** Team Home → Schedule → Matches → Roster → Opponents → Statistics →
   Ask. Program name on all seven.
3. **Flows:** a match detail page, `matches/new`, a schedule create screen,
   `settings/usage` — trails, unchanged.
4. **The edge:** any page, unscrolled. Then scroll; it should not change. Check
   a page that cannot scroll at all (Ask) — that is the case the old behaviour
   never drew an edge for.

**Criterion 5 is the one that can still send this back.** `--border-medium` is
`#E5E5EA`, **1.26:1** on white. That is a real step up from the `#F3F3F3`
(1.11:1) it replaces, and it is the darkest token that belongs in this design
language — but "visible" is a judgment made with eyes, not a ratio. If it still
reads as absent, the design's stated fix is a **new token** (`--border-chrome`,
around `#DCDCDC`), never a bare hex in the header. That is a one-value change
and invalidates nothing else here.

## Gate stages

| Stage | Result |
|---|---|
| 1 · lint | pass — 0 errors |
| 1 · tsc | pass — clean, no `.next/` staleness to clear |
| 1 · test | pass — 443 passed, 0 failed |
| 2 · `simplify` | **3 findings applied**, 1 skipped (below) |
| 2 · `vercel-react-best-practices` | **not triggered** — no `"use client"` added (`grep -c` = 0), no new `.tsx` component, no data-fetching change |
| 3 · `code-review medium` | **no findings** |
| 3 · `pipeline-guardrails-reviewer` | **no findings** — ran over the full range |
| 3 · `rls-boundary-reviewer` | **skipped — surface not touched** (no `src/lib/supabase/`, `src/lib/data/`, `src/app/api/`, migration) |
| 3 · `supabase:supabase-postgres-best-practices` | **not triggered** — no SQL, table, index, policy or function in range |

The guardrail reviewer ran over the **whole range** rather than being credited
per-task. The range is not all task-gated: six `pipeline(…)` commits and the
simplify commit are not `/task-next` commits, and the simplify commit edited
`header.tsx` and `nav.ts` *after* their per-task reviews. Fail-closed, so it
ran again.

## Findings and resolutions

### Applied — `simplify`, commit `51e9b49`

1. **`ALL_LINKS` and `DESTINATIONS` were two independent spreads of the same
   four arrays** (altitude). Adding a fifth nav array meant updating both, with
   only the new spec catching a miss. `ALL_LINKS` is now composed as
   `[...UNLISTED, ...DESTINATIONS]`, so the relationship is stated rather than
   re-enumerated. Verified order- and content-identical to the literal it
   replaced — `navLabel` uses `.find()`, which is order-sensitive, so this was
   the one edit in the range with real regression potential. Both
   `code-review` and `pipeline-guardrails-reviewer` were asked to check it
   specifically and both confirmed it, including no temporal-dead-zone problem
   from the new declaration order.

2. **The header comment did not record that the rule broadened** (altitude).
   `WORKSPACE_TITLE_PATHS` held three paths and justified its exclusions with a
   claim — *"their bodies do not all carry a display-type title"* — that had
   since gone stale. The new comment now states that this widened to every rail
   destination, that each was checked, and that the rule depends on that premise
   holding. This is the fix that prevents the *next* reader repeating the
   original bug.

3. **The spec hand-wrote a test for the bottom-rail entries** beside a loop that
   generated the rest (simplification). The loop now covers every array
   `DESTINATIONS` spreads, so adding a rail row adds its test. Net +1 test (443).

### Skipped — with reasons

4. **`isDestination` could delegate to `activeHref(pathname, DESTINATIONS) === pathname`**
   (reuse). Correct that it would work — I traced it against every spec case.
   Skipped anyway: `activeHref` does *longest-prefix* matching, and expressing
   an exact-match rule through a prefix-matching helper hides the very
   distinction the design calls "the whole rule". It would also silently
   inherit any future change to `activeHref`'s semantics — inheritance this
   predicate specifically does not want. Clearer as it stands.

## Consciously left

- **`showGreeting` still compares a bare `"/dashboard"` literal** rather than
  reading from `PERSONAL_NAV`. The altitude reviewer flagged it as the last
  hand-copied path literal in the file, and it is a fair observation. Left
  because the brief lists it as an explicit non-goal — *"Not the greeting.
  Pa2's personal-Home treatment stays exactly as shipped."* Worth its own task;
  note that `PERSONAL_NAV[0].href` would be the wrong fix (it couples to array
  order), so it wants a named export.
- **`SKILL.md` still documents the DS v3 header spec this branch overrides.**
  You decided this at the stage-03 invocation: a code comment is the agreed
  form, and a DS v3 CHANGELOG amendment is not part of this branch. The comment
  names the section overruled so a future re-sync can find it.
- **`/dashboard/settings/subscription`** is absent from `SETTINGS_SECTIONS`, so
  its crumb falls back to a bare "Settings". Pre-existing, unrelated, and per
  the branch-scope rule it belongs on its own branch. Recorded in the run log's
  `follow-ups:` for T2.
- **`--border-hairline` untouched.** Confirmed ~150 other consumers across the
  dashboard, auth, claim and join surfaces — retuning it was correctly scoped
  out by the brief.

## Also consulted

Beyond this stage's declared inputs (`05_build/output/build.md`, the range
diff, `01_brief/output/brief.md`, `.claude/skills/pr-check/SKILL.md`):

- `src/lib/dashboard/nav.ts`, `src/app/dashboard/header.tsx`,
  `tests/header-slot.spec.ts` — the code under review
- `src/app/dashboard/{statistics,ask,help,opponents}/page.tsx`,
  `src/app/dashboard/team/{ask,statistics,roster,schedule}/page.tsx`,
  `src/components/dashboard/schedule/static/static-schedule.tsx` — criterion 4
- `src/app/dashboard/{settings,team/settings}/page.tsx` — both `redirect()`
- `next.config.ts` — checked for `trailingSlash` / `basePath`, either of which
  would break exact-match `usePathname()` comparison. Neither is set.
- `.claude/hooks/pr-check-receipt.sh` — stage 5
