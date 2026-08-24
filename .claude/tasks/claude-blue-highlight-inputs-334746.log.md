# Run log — claude/blue-highlight-inputs-334746

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Make input focus rings neutral, not blue — done
- **gate:** mechanical — `npm run lint` 0 errors (38 pre-existing
  react-hooks warnings, baseline unchanged), `npx tsc --noEmit` clean, `npm test`
  66/66 passed. Completion review — `VERDICT: pass`; it verified by compiling the
  Tailwind output for each changed className rather than reading class strings,
  and independently confirmed the `ring-inset` reasoning behind the one
  deviation from the reference treatment. Guardrails — `pipeline-guardrails-reviewer`
  ran (diff touches `src/components/dashboard/`) and reported clean, explicitly
  confirming the diff goes nowhere near the three wizard inputs that silently
  misattribute statistics. `rls-boundary-reviewer` skipped: the diff touches no
  `src/lib/supabase/`, `src/lib/data/`, `src/app/api/` or `supabase/migrations/`
  path and adds no table, view or query; `git ls-files --others` was empty, so
  no untracked file hid such a surface.
- **changed:** Six focus rings on text inputs recoloured from blue to the neutral
  grey treatment already in `src/components/ui/input.tsx:12`. Five were the call
  sites the contract grep names — `statistics/match-selector.tsx:104,112`,
  `schedule/score-entry.tsx:179,199`, `schedule/single-score-entry.tsx:157`. The
  sixth, `matches/matches-page-content.tsx:604`, is a blue-ringed `<input>` the
  criterion's `-A8` grep window misses by one line (the tag opens at 595); the
  reviewer judged it in scope rather than creep. That one field kept `ring-2` and
  took a colour-only change, because its resting state is `ring-1 ring-inset
  ring-[#EAECF0]` and the literal 1px/30% reference would have rendered the
  focused ring fainter than the unfocused one — a focus indicator that vanishes
  on focus. Blue rings on buttons, links, tabs, sidebar rows and filter pills
  are untouched.
- **note:** Both reviewers observed the same thing independently — the neutral
  ring is genuinely lower contrast than the blue one it replaces. That is the
  app-wide baseline from `ui/input.tsx`, not something this task invented, but
  it is worth a visual check on `/dashboard/team/schedule/[eventId]`, where the
  26px score cells make the indicator faintest.

## T2 · Carve text fields out of the design-system focus-ring spec — done
- **gate:** mechanical — `npm run lint` 0 errors (38 pre-existing react-hooks
  warnings, baseline unchanged), `npx tsc --noEmit` clean, `npm test` 66/66
  passed. Completion review — `VERDICT: pass`; because this is a
  documentation-accuracy task, the reviewer was asked to verify every factual
  claim the new prose makes against the code rather than check that words were
  added, and it traced each one: the `:where()` selector list, `--focus-ring`
  through to `rgba(59,130,246,0.40)`, and the quoted class string byte-for-byte
  against `ui/input.tsx:12`. Guardrails — BOTH skipped, and legitimately: the
  diff touches no `src/` path at all, only `.skills/`, `DESIGN.md` and this
  queue file. Confirmed from `git diff HEAD --stat` and an empty
  `git ls-files --others --exclude-standard`, so no untracked file hid a
  dashboard or data-layer surface.
- **changed:** `.skills/advantage-analytics-design/SKILL.md` — the `### Focus`
  section grew from 4 lines to ~24. It keeps the blue
  `ring-2 ring-[#3B82F6]/40` string for buttons, links, tabs and pills, adds the
  neutral `border-[#E5E5E5] ring-[#E5E5E5]/30 ring-[1px]` string for text
  fields, and states that `focus.css` currently hands the blue `--focus-ring` to
  bare `input, select, textarea` at specificity 0 — so the doc describes today's
  behaviour, not the post-T3 world. `DESIGN.md:92` updated to agree rather than
  left alone; the implementer's reason (docs/README.md indexes only `docs/*`, so
  nothing marks DESIGN.md point-in-time, and its header already carries live
  corrections) was checked and held.
- **note:** The reviewer flagged one clause as editorial rather than sourced —
  "blue on a focused field reads as a validation state". The codebase's actual
  validation colour is red (`aria-invalid:border-destructive` in `input.tsx`),
  not blue. No criterion required that sentence to be sourced, so it did not
  fail the gate, but in a doc whose whole product is accuracy it is worth
  deleting on the next pass through that file. Two follow-ups surfaced for T3:
  `DESIGN.md:91` ("same vocabulary as Input focus") reads ambiguously now, and
  `schedule/lineup-editor.tsx:295` styles a focus *border* with `outline-none`,
  so it does not override the focus.css box-shadow and currently renders both a
  blue ring and a blue underline.

## T3 · Make the global focus-ring default neutral for text fields — done
- **gate:** mechanical — `npm run lint` 0 errors (38 pre-existing react-hooks
  warnings), `npx tsc --noEmit` clean, `npm test` 66/66. Completion review —
  `VERDICT: pass`, verified in a live browser on `/login` with computed
  box-shadow values, not screenshots alone. Guardrails —
  `pipeline-guardrails-reviewer` RUN, deliberately, even though
  `src/styles/design-system/` is not one of its literal trigger paths: this is a
  global rule reaching every focusable control in the app, a wider blast radius
  than the component change in T1 that did trigger it. Skipping on a path
  technicality would have been the letter beating the intent. It reported no
  violations and confirmed the three silent-misattribution wizard inputs are
  `<button>`-based `SelectCell`s carrying their own `focusRingCls`, so they were
  never subject to this rule and are unaffected in value, submission and even
  ring colour. `rls-boundary-reviewer` skipped: no data-layer, API, Supabase or
  migration path, and `git ls-files --others` was empty.
- **changed:** `focus.css` splits its `:where()` selector list in two —
  `input, select, textarea` resolve to a new neutral `--focus-ring-field`,
  while `a[href]`, `button`, `[role="button"]`, `summary` and `[tabindex]`
  keep the blue `--focus-ring`. Both stay at specificity 0. The token is
  defined beside `--focus-ring` in `effects.css` as a two-layer shadow
  (`0 0 0 1px #E5E5E5, 0 0 0 2px rgba(229,229,229,0.30)`) because
  `ui/input.tsx:12` is a border+ring pair, not a ring alone; the ring half by
  itself composites to #F7F7F7 on white and is invisible. The file's header
  comment was extended to explain the split and name the two things it must not
  do. `lineup-editor.tsx:295` now renders a neutral ring plus its blue
  underline — the underline vocabulary survived, the blue box on top of it did
  not.
- **correction to the T1 entry above:** T1's classname edits were cosmetically
  inert, and this run is what actually delivered T1's intent. `globals.css:5`
  imports the design system OUTSIDE any `@layer` while Tailwind v4 puts its
  utilities in `@layer utilities`, and unlayered CSS beats layered CSS
  regardless of specificity. So `focus.css`'s `:where()` rule had always won
  over `ui/input.tsx`'s and T1's `focus-visible:ring-*` utilities — the blue
  ring users saw on those six fields came from this file the whole time.
  Independently confirmed by two reviewers and by direct inspection of
  `globals.css`. T3's criterion 4 asserted the opposite as its rationale; that
  premise was false when written. The criterion was ruled met on its testable
  half (both rules inside `:where()`, specificity 0), with the rationale
  recorded as an authoring error in the spec rather than a defect in the work.
- **open, not gated:** the neutral ring measures ~1.07:1 (translucent layer)
  to ~1.26:1 (opaque layer) against white, both far under WCAG 1.4.11's 3:1
  bar for non-text contrast. Three separate reviewers have now flagged it. No
  criterion in T1 or T3 set a contrast floor, so nothing blocked on it, but the
  app-wide focus indicator for text fields — and now for native checkboxes and
  radios, which match `input` — is below the accessibility threshold. This
  wants its own task. Two call sites inherit it incidentally:
  `statistics/match-selector.tsx:137` and `team/add-player-dialog.tsx:257`.

## T4 · Close the remaining blue focus surfaces — done
- **gate:** mechanical — `npm run lint` 0 errors (38 pre-existing warnings),
  `npx tsc --noEmit` clean, `npm test` 66/66. Completion review —
  `VERDICT: pass`, verified live with real Tab focus on `/claim/program` and
  `/claim/program/new`, and via a throwaway probe route for the auth-gated
  `SettingsInlineSelect`. Guardrails — `pipeline-guardrails-reviewer` run
  (diff touches `src/components/dashboard/settings/` and `/team/`), no
  violations; it traced all four `CLAIM_FIELD` consumers and confirmed every
  one is an input/select/textarea, and that no handler, role gate, invite path
  or claim-state logic moved. `rls-boundary-reviewer` skipped: no data-layer,
  API, Supabase or migration path; `git ls-files --others` empty.
- **changed:** FIVE of the six named sites, not six. Two wrapper cases
  (`program-search.tsx`, `invite-dialog.tsx`) moved the ring onto the wrapper
  as `focus-within:shadow-[var(--focus-ring-field)]`, since a `<div>`/`<label>`
  matches no `focus.css` selector and so was rendering the blue Tailwind
  utility normally. Three tag cases (`claim-shell.tsx`'s shared `CLAIM_FIELD`,
  `team-settings-form.tsx`, `settings-inline-select.tsx`) simply dropped their
  blue focus classes and fall through to `focus.css`. No token value changed
  and `src/styles/` has an empty diff, as the task required.
- **task authoring error, corrected by the run:** `settings-card.tsx:193` was
  listed as a boxed leak. It is not — it is `SettingsUnderlineInput`, whose
  only border is `border-b`, so `focus:border-[var(--blue)]` renders the blue
  UNDERLINE that criterion 2 exists to protect. My classifying grep sampled
  only line 193 and missed the `border-b` two lines below. Criterion 1 ("none
  of the six") and criterion 2 ("the underline vocabulary stays") therefore
  contradicted each other at that one site; the implementer left it alone and
  the reviewer independently read the class string and ruled criterion 2
  governs. Verified here too. Five changes is the correct outcome.
- **note:** Two inner `<input>`s carry an inline `style={{ boxShadow: "none" }}`.
  With the ring moved to the wrapper, `focus.css` would still ring the inner
  input as well — two indicators for one field, misaligned by the 38px the
  input sits inside its box. `focus.css` is unlayered, so no utility can cancel
  it and inline is the only local override available. Both reviewers checked
  it: neither input had a pre-existing `style` prop, no resting-state shadow is
  affected, and each field keeps exactly one visible indicator. It is a
  workaround for the unlayered-import problem, not a preference — the real fix
  is the layering, which remains unqueued.
- **hazard worth remembering:** port 3000 is the MAIN checkout's dev server,
  not this worktree. The implementer ran this worktree on 3101 and the reviewer
  followed suit. Verifying a worktree change against 3000 would silently
  measure the wrong tree and report a false pass.
