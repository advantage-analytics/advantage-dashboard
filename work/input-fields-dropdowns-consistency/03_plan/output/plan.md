# Plan — input-fields-dropdowns-consistency

From `../02_design/output/design.md`, bounded by `../01_brief/output/brief.md`.
Fourteen steps, each sized for one fresh subagent context. No step sweeps two
large files.

## Three corrections to the design, found while sizing

The design named files it had not opened. Sizing them changed the plan:

1. **`schedule/lineup-editor.tsx` and `schedule/field-row.tsx` do not exist.**
   Both are cited as live examples — `lineup-editor.tsx`'s `NameField` in the
   underline table at `focus.css:48` and `SKILL.md:1109`, and `field-row.tsx`
   as the counter-example that must keep its ring. Neither file is in the tree
   and no `NameField` is defined anywhere. The design's "bring `NameField` in"
   item is deleted. The stale references are a documentation defect in the
   design system, not this feature's to fix — see Out of scope.

2. **The two largest files in scope do not need touching.**
   `schedule/static/dual-build-step.tsx` (1207 lines) and
   `static-tournament-builder.tsx` (916 lines) render their inputs and selects
   as `bg-transparent … outline-none` with no border and no radius, wrapped in
   `new-match-wizard/FieldCell.tsx`. The cell owns the geometry. Fixing
   `FieldCell.tsx` (493 lines) fixes both builders without editing 2100 lines
   of guarded schedule code. This is the single biggest saving in the plan.

3. **Three files carry `data-focus-ring="none"` for the *composite-field*
   reason, not the underline reason** — `claim/program-search.tsx`,
   `matches/matches-page-content.tsx`, `schedule/static/opponent-popup.tsx`.
   Their comments say so ("the box above carries it", "the popup frame"). They
   are boxed wrappers and must not be swept into the underline work.

---

## Step order and dependencies

```
1 ──▶ 2 ──▶ 3 ──▶ 4
 │           └──▶ 5, 6, 7, 8, 9, 10   (independent of each other, after 1)
 └──────────────▶ 11, 12, 13          (underline; independent of 2–10)
                        14            (gate — last, needs 2–10 landed)
```

Step 1 blocks everything. Step 2 should precede the boxed conversions so
`advField()` is proven on the smallest surface first. Steps 5–10 are mutually
independent and may run in any order or in parallel. Steps 11–13 touch a
different vocabulary and share no files with 2–10. Step 14 is the gate and runs
only once the boxed steps have landed, or it fails on files not yet converted.

---

## Step 1 — the `advField()` helper

**Files:** `src/lib/ui/adv-field.ts` *(new)*

**Change:** Add the class helper, modelled file-for-file on
`src/lib/ui/adv-button.ts` — same header habit of naming each value and the
reason it is that value, not a nearby one.

- `advField(kind: "boxed" | "underline" = "boxed", size: "sm" | "md" = "md")`
- Boxed: `rounded-[var(--radius-button)]`, `h-9`/`h-8`, `text-[13px]`/`text-[12px]`,
  `border border-[var(--border-field)]`, `bg-[var(--surface-card)]`, `px-3`,
  `text-[var(--ink-900)]`, `placeholder:text-[var(--ink-400)]`,
  `disabled:bg-[var(--bg-field)]`.
- Underline: `h-[34px]`, `border-b border-[var(--border-field)]`,
  `focus:border-b-2 focus:border-[var(--blue)]`, `bg-transparent`, `text-[13px]`.
- **No focus utility.** The header must say why: `focus.css` is unlayered and
  silently discards `focus-visible:*` utilities, and it already supplies
  `--focus-ring-field` to `input`/`select`/`textarea`.
- The header must also record the two-radius-scale trap (design Finding 1):
  `rounded-md`/`lg`/`xl` resolve to 8/10/14px here, not the design system's
  8/12px, so field radius is written as a token and never as a class name.

**Verification:** `npm run lint`. No consumers yet, so no visual change. Confirm
by inspection that every value matches the design's table.

---

## Step 2 — the three shared primitives, and their one consumer

**Files:** `src/components/ui/input.tsx` (21), `src/components/ui/select.tsx`
(185), `src/components/ui/textarea.tsx` (24),
`src/components/dashboard/matches/new-match-wizard/ScoreCell.tsx` (51)

**Change:** Move the primitives onto the canonical values so they stop
disagreeing with each other and with the design system: 6px radius via the
token (not `rounded-md`), `h-9` default with `h-8` as the small tier, one text
size per tier. Then delete the now-redundant `rounded-[6px] h-8` override in
`ScoreCell`, which currently exists only to fight the primitive.

**Guardrail:** `ScoreCell` is the set-score input — guardrails §4 items 2 and 3.
Its `value`, `onValueChange`, `type`, `inputMode`, `!w-7` width and the parent's
top-player-first ordering must be untouched. Class strings only.

**Verification:** `npm run lint`; `pipeline-guardrails-reviewer`; screenshot the
score grid in both consumers — `new-match-wizard/DetailsContent.tsx` and
`match-actions/edit-match-dialog.tsx` — and confirm the cells are unchanged in
size and position, since they were already at the target values by override.

---

## Step 3 — `CLAIM_FIELD`, the largest single family

**Files:** `src/components/claim/claim-shell.tsx` (352),
`src/components/claim/program-search.tsx` (231)

**Change:** `CLAIM_FIELD` becomes `advField("boxed")` plus `w-full`. This is the
most visible diff in the feature: 38px → 36px tall, 8px → 6px radius, across
every field in the claim, join and onboarding flows at once. Apply the same to
`program-search.tsx`'s hand-rolled 38px/8px wrapper, keeping its
`focus-within:shadow-[var(--focus-ring-field)]` and its `data-focus-ring="none"`
on the inner input — that is the composite-field case and it stays.

**Verification:** `npm run lint`; screenshot `/claim`, `/claim/team/setup` and
one `/join/[token]` page before and after. Confirm no field lost its focus ring
by tabbing through one form.

---

## Step 4 — the `CLAIM_FIELD` consumers, verify-only

**Files:** `src/components/claim/setup-form.tsx` (225),
`team-setup-form.tsx` (185), `unlisted-program-form.tsx` (122),
`contact-owner-form.tsx` (239), `src/components/join/join-forms.tsx` (346),
`src/app/onboarding/onboarding-flow.tsx` (454)

**Change:** Expected to be zero-diff — all six consume `CLAIM_FIELD` and inherit
step 3. The work is to confirm that, and to fix only the sites that override it:
`onboarding-flow.tsx:353` wraps it in a `cn(` with additions, and four files
append `cursor-pointer`. Any override that re-specifies height, radius, border
or text size is removed; anything else stays.

**Verification:** `git diff --stat` should be small or empty. Screenshot
`/onboarding` and one claim form. `npm run lint`.

---

## Step 5 — settings fields

**Files:** `src/components/dashboard/settings/team-settings-form.tsx` (486),
`src/app/dashboard/settings/account/page.tsx` (284),
`src/components/dashboard/settings/settings-inline-select.tsx` (66)

**Change:** Three boxed controls already at the correct 6px radius but at 30px
height. Move to `advField("boxed", "sm")` (32px), keeping each one's explicit
width (`w-[190px]`, `w-[220px]`) and the account page's
`focus:border-[var(--danger)]`, which is a deliberate destructive-confirm
affordance. `settings-inline-select.tsx` keeps its `focus-within` ring and its
`opacity-0` select and must **not** gain `data-focus-ring="none"` — with an
invisible select there is no second ring to suppress.

**Verification:** `npm run lint`; screenshots of `/dashboard/settings/team` and
`/dashboard/settings/account`; tab to the delete-confirmation field and confirm
the danger border still fires.

---

## Step 6 — schedule score entry

**Files:** `src/components/dashboard/schedule/score-entry.tsx` (202),
`src/components/dashboard/schedule/single-score-entry.tsx` (164)

**Change:** 30px → 32px score cells on `advField("boxed", "sm")`, keeping the
`w-[26px]` cell width and the `#EAECF0` literal replaced by
`var(--border-field)`. These are score inputs: values, handlers and any
tiebreak or set ordering are untouched.

**Verification:** `npm run lint`; screenshot a schedule result row; enter a
score and confirm it still records.

---

## Step 7 — the statistics match selector

**Files:** `src/components/dashboard/statistics/match-selector.tsx` (202)

**Change:** The worst radius offender — two selects at `rounded-lg`, which is
10px here, not the 8px the class name implies. Move to `advField("boxed", "sm")`.
Replace the `#F7F7F7` / `#F3F3F3` literals with `--bg-field` and
`--border-field`. The `w-3.5 h-3.5 rounded accent-[#3B82F6]` checkbox on line
141 is out of scope per the brief.

**Verification:** `npm run lint`; screenshot `/dashboard/statistics` with the
selector open; change a filter and confirm the chart recomputes.

---

## Step 8 — `FieldCell`, which carries both schedule builders

**Files:** `src/components/dashboard/matches/new-match-wizard/FieldCell.tsx` (493)

**Change:** The cell renders at `rounded-[8px]`; move it to the 6px token and
the canonical border. Its children stay transparent — the whole point of the
composite-field pattern is that the cell is the field. Do not add
`data-focus-ring="none"` unless the cell demonstrably draws its own focus
treatment; check before assuming.

**Verification:** `npm run lint`; screenshots of **three** surfaces, because
this one file renders in all of them: the new-match wizard details step,
`/dashboard/team/schedule/new/dual`, and
`/dashboard/team/schedule/new/tournament`. This is the step most likely to
surprise, and the one whose blast radius is widest per line changed.

---

## Step 9 — the matches page float panels

**Files:** `src/components/dashboard/matches/matches-page-content.tsx` (1019)

**Change:** Panel radius only. Two float panels at `rounded-xl`, which is 14px
here, move to `rounded-[var(--radius-dropdown)]` (12px). **The 28px `h-7` search
control is explicitly not touched** — the design system's Header section fixes
chrome search at 28px/radius 8, and it is a documented carve-out from the field
rules, added to the step 14 allowlist rather than converted.

**Verification:** `npm run lint`; screenshot the matches page with the sort menu
and the filter panel open. Confirm the search control is visually unchanged.

---

## Step 10 — admin review rows

**Files:** `src/components/admin/review-rows.tsx` (335)

**Change:** Two inputs already at `h-8` and 6px — only the border token is
wrong (`--border-medium`, which is the dropdown/modal border, rather than
`--border-field`). Smallest diff in the plan; move both to `advField("boxed", "sm")`.

**Verification:** `npm run lint`; screenshot `/admin/claims` with a row expanded.

---

## Step 11 — audit the underline family

**Files:** read-only across `src/components/auth/form-field.tsx` (116),
`settings/settings-card.tsx` (204), `settings/profile-form.tsx` (403),
`team/player-fields.tsx` (166),
`matches/match-actions/edit-match-dialog.tsx` (855),
`matches/new-match-wizard/DetailsContent.tsx` (940)

**Change:** None. Produce a short table of each site's actual rule weight,
height, text size and focus mechanism, and mark which differ from the 34px /
`border-b` baseline that `settings-card`, `profile-form` and `player-fields`
already share.

This step exists because the family uses two mechanisms — `border-b`/`border-b-2`
in three files, an explicit `h-[1px]`→`h-[2px]` div in the other three — that
render identically. **Rewriting the mechanism is out of scope**: it is churn
with real risk in two guarded files and no visual payoff. Only genuine geometry
differences get fixed, in steps 12 and 13, and this audit is what says which
those are.

**Verification:** the table is the deliverable. No code changes, so no diff.

---

## Step 12 — align the non-guarded underline fields

**Files:** whichever of `auth/form-field.tsx`, `settings/settings-card.tsx`,
`settings/profile-form.tsx`, `team/player-fields.tsx` step 11 flagged

**Change:** Bring flagged sites to the baseline height and text size. Keep each
file's existing focus mechanism and its `data-focus-ring="none"` — the opt-out
stays earned because the rule still visibly changes on focus. Do not add the
attribute anywhere new.

**Verification:** `npm run lint`; screenshot `/login`, `/dashboard/settings/profile`
and `/dashboard/team/roster/[playerId]`; tab through each form and confirm every
field still shows a visible focus change.

---

## Step 13 — align the guarded underline fields

**Files:** `src/components/dashboard/matches/match-actions/edit-match-dialog.tsx`
(855) **or** `matches/new-match-wizard/DetailsContent.tsx` (940) — *one per
subagent run; do not attempt both in one context*

**Change:** Only the geometry step 11 flagged. These two files hold the player
name inputs and the match-edit fields, and between them carry eight
`data-focus-ring="none"` sites.

**Guardrail:** guardrails §4 — the end-at-video-start control, set score
ordering and tiebreak game counts must keep their exact meaning. Class strings
only; no handler, `value`, `name`, `defaultValue` or state may move.
`pipeline-guardrails-reviewer` gates both runs.

**Verification:** `npm run lint`; `pipeline-guardrails-reviewer`; screenshot the
edit-match dialog and the wizard details step; open the wizard, fill a match and
confirm the submitted payload is unchanged.

---

## Step 14 — the invariant test that holds the line

**Files:** `tests/field-geometry.spec.ts` *(new)*

**Change:** A source-scanning Playwright spec on the
`tests/generate-map.spec.ts` pattern — reads files, drives no browser. Walk
`src/app` and `src/components`, find `<input>`, `<select>`, `<textarea>` and
`SelectTrigger`, and fail on `rounded-md`, `rounded-lg`, `rounded-xl` or bare
`rounded` in their class strings. The failure message must name the file and
say *why* the class is wrong — that those names resolve to 8/10/14px here, not
to the design system's values — or the next person will silently re-add one.

Allowlist, each with a comment: the matches page's 28px chrome search, and the
`accent-*` checkboxes the brief puts out of scope.

**Verification:** `npm test`. Confirm it fails when a `rounded-md` is
deliberately reintroduced on a field, then passes once reverted. This step must
run last — run earlier it fails on files steps 2–10 have not yet converted.

---

## Test strategy

**Per step, three gates.** `npm run lint`; a before/after screenshot of each
surface the step names, taken through the browser preview; and a keyboard tab
pass on any step that touched a control, confirming a visible focus change.
The tab pass is not optional decoration — `focus.css` exists because a missing
focus ring is invisible to everyone except a keyboard user, and it survived a
previous review for exactly that reason.

**Per guarded step (2, 6, 13).** `pipeline-guardrails-reviewer` before the
commit. The failure it catches renders a page that looks completely fine and
attributes every statistic to the wrong player.

**Whole-feature gate.** `npm test` including the new
`tests/field-geometry.spec.ts`, plus a final pass over the brief's seven
success criteria.

**Environment.** This worktree has no `node_modules`. Run `npm ci` before the
first step that lints, tests or previews; a symlinked `node_modules` panics
Turbopack, so it must be a real install.

**What is deliberately not tested.** No new unit tests: there is no new
behaviour. Visual regression is by screenshot review, not by a snapshot
harness — the app has none, and adding one is a larger decision than this
feature should make.

## Out of scope, recorded so it is not silently dropped

- **The design system's Border Radius table is wrong for this codebase**
  (design Open question B, default: defer). `radius-element → rounded-lg` and
  `radius-dropdown → rounded-xl` are stock-Tailwind mappings that resolve to
  10px and 14px here.
- **`focus.css:48` and `SKILL.md:1109` cite two files that do not exist** —
  `schedule/lineup-editor.tsx` and `schedule/field-row.tsx`. The second is
  cited as the load-bearing counter-example for when *not* to add
  `data-focus-ring="none"`, so the rule it illustrates now has no live example.
- **Radix `SelectTrigger` focuses blue while native fields focus neutral**
  (design Open question A, default: leave `focus.css` alone).

All three are documentation or design-system defects rather than field styling.
Per the branch-scope-discipline rule they belong on their own branch, and the
first two are cheap enough to be worth filing now.

## Also consulted

Beyond the declared inputs (`design.md`, `brief.md`) — line counts and control
shapes were read from every file named above, plus
`schedule/static/dual-build-step.tsx` and `static-tournament-builder.tsx` (to
establish they need no edit), `schedule/static/opponent-popup.tsx` and
`team/add-player-dialog.tsx` (to establish they are out of scope),
`src/styles/design-system/focus.css` and
`.skills/advantage-analytics-design/SKILL.md` (to confirm the two stale file
references), and `tests/generate-map.spec.ts` and `package.json` (the test
pattern and the scripts each gate runs).
