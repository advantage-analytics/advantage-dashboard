# Tasks — claude/track-unforced-errors-cace98

> Scope: forced vs unforced errors — "Errors" until the split is judged (SwingVision, or verified with every error marked), and the label console's forced/unforced marking. Spec: https://claude.ai/artifact/VTDLnj8Mf6WMdDsf52hp6E

Run one with `/task-next`. To drain the file, loop a plain-text instruction —
**not** `/loop /task-next`, which a scheduled fire cannot invoke:

> `/loop Read .claude/skills/task-next/SKILL.md and follow it exactly — run one task from this branch's queue; do not add, edit, or reorder tasks; then stop.`

Append freely while it runs: the queue is re-read at the start of every
iteration, and the runner only ever rewrites a task's `status:` line.
Mark a task `next` to jump the queue.

Status values: `todo` (eligible to run), `next` (jump the queue), `doing` /
`done` / `blocked` (written by the runner around a dispatch), and `later`
(deferred — `/task-next`'s picker never selects it, so a loop drain skips
straight past it; promote a task to `todo` by hand once it's actually
ready).

## T1 · Migration: errors_judged_at marker and calculate_match_stats counts forced errors

- **status:** done
- **model:** fable
- **files:** supabase/migrations/<timestamp>_forced_errors_judged.sql (new), src/lib/services/splitstep/derivation/result-type.ts (header comment) — guess; the live `calculate_match_stats` body must be read from the live DB (`pg_get_functiondef`), not from supabase/migrations/20260219000000_populate_serve_return_placement_stats.sql, which is ~100 migrations behind
- **done when:**
  - [ ] A committed migration adds `matches.errors_judged_at timestamptz null` (comment: set when a match is published with every error marked forced or unforced; null = nobody judged the split) and is applied to the live project through the Supabase MCP (`apply_migration`), with the same file in `supabase/migrations/`
  - [ ] The same migration re-creates `calculate_match_stats` so `forced_errors` (both sides) is `count(*) where result_type LIKE '%Forced Error%' AND result_type NOT LIKE '%Unforced%'` when the match's `source_provider = 'swing-vision'` OR `errors_judged_at IS NOT NULL`, and literal NULL otherwise; `unforced_errors` and the forehand/backhand breakdown are unchanged; grants are re-stated after the `create or replace` (service_role + authenticated, no anon) per AGENTS.md
  - [ ] The migration ends with a `DO` block that re-runs `calculate_match_stats` for every match with `source_provider = 'swing-vision'`, so their `match_stats.forced_errors` rows are non-null, and a comment states the expected live result (the 261 "Forced Error" points land in `forced_errors`; the 28 older non-null rows are normalised by the same recompute)
  - [ ] The header comment of `result-type.ts` no longer says `forced_errors` is inserted as literal NULL / "not consumed anywhere"; it says the column is counted only on a judged match (SwingVision, or `errors_judged_at` set at publish) and that the derivation still never emits a Forced Error string
  - [ ] A spec (new `tests/forced-errors-migration.spec.ts`, or a case in an existing migration-text spec) reads the committed migration file and asserts it contains the `errors_judged_at` column add, the `NOT LIKE '%Unforced%'` guard, and the `swing-vision` recompute loop
- **notes:** Live DB is the source of truth — pull the current function with `select pg_get_functiondef('public.calculate_match_stats(uuid)'::regprocedure)` first and change only the `forced_errors` expressions. Do NOT touch the verified flags of the 18 pre-existing verified matches: with `errors_judged_at` null they keep NULL `forced_errors`, which is the point. Read AGENTS.md on function grants and `supabase-postgres-best-practices` before writing SQL. No `drop function`. Phase 2's T11 is what sets `errors_judged_at` for video matches. Checked 2026-10-29: the 28 older non-null `forced_errors` rows all belong to 14 `swing-vision` matches, so the recompute normalises them; 11 matches have a null `source_provider` and stay unjudged.

## T2 · errorSplitJudged predicate and forced-errors plumbing into report data

- **status:** done
- **model:** opus
- **needs:** T1
- **files:** src/lib/data/error-split.ts (new, guess), src/lib/data/match-detail-server.ts, src/lib/data/match-stats-server.ts, src/lib/data/types.ts, src/components/dashboard/matches/match-detail/match-filters/model.ts (MatchFilterContext), src/components/dashboard/matches/match-detail/match-report-context.tsx, tests/error-split.spec.ts (new)
- **done when:**
  - [ ] A pure function `errorSplitJudged({ sourceProvider, verified, errorsJudgedAt })` returns true for `sourceProvider === "swing-vision"`, true for `verified && errorsJudgedAt != null`, and false otherwise (verified with null marker — the 18 pre-existing matches — and any unverified video match); `tests/error-split.spec.ts` covers all four cases
  - [ ] `getMatchDetailData()` selects `errors_judged_at` and exposes `errorSplitJudged: boolean` on the match header, and `MatchFilterContext` (match-filters/model.ts) carries the same boolean so client cards read it from context, not from props re-derived per card
  - [ ] The per-match stats shape (`types.ts` / match-stats-server.ts row mapping) gains `forcedErrors: number | null`, read from `match_stats.forced_errors` (NULL stays null, never coerced to 0), and the match-detail select lists include `forced_errors`
  - [ ] The sample match fixture (`src/lib/sample-match/fixture.json`) and any typed sample loader compile with the new field (null or a value), and `npm run typecheck` passes
  - [ ] The predicate and the field are the only behaviour change: no user-visible string changes in this task (those are T3–T5)
- **notes:** Read `src/lib/data/match-verification.ts` first — `verificationFor()` is the one reading of `verified`; the new predicate should take the same row shape. `source_provider` values live in `src/lib/services/splitstep/config.ts` ("splitstep") and process-match ("swing-vision"); never compare against "swingvision". The predicate decides on `verified && errors_judged_at`, not on `errors_judged_at` alone, so a reopened match drops back to "Errors".

## T3 · Report cards and Film labels: "Errors" until the split is judged

- **status:** done
- **model:** opus
- **needs:** T2
- **files:** src/components/dashboard/matches/match-detail/head-to-head-card.tsx, src/components/dashboard/matches/match-detail/point-endings-card.tsx, src/components/dashboard/matches/match-detail/film-cut-context.tsx, src/components/dashboard/matches/match-detail/match-filters/model.ts (`pointResultLabel`), tests/match-h2h-rows.spec.ts, tests/head-to-head-cuts.spec.ts, tests/film-cut-intent.spec.ts
- **routes:** /dashboard/matches/[matchId]
- **done when:**
  - [ ] Head to head, Points group: when `errorSplitJudged` is false the row reads "Errors" with value `unforcedErrors + (forcedErrors ?? 0)` and its cut is Result › Ending Error with no Film-only `ending` narrowing (opens every error); when true it renders two rows, "Unforced errors" (today's row, unchanged) then "Forced errors" (`forcedErrors`, lowerIsBetter, cut `ending: "forced-error"`), in that order before "Total points won" — asserted in `tests/match-h2h-rows.spec.ts`
  - [ ] `FilmCutEnding` gains `"forced-error"` (resultType contains "forced error" and not "unforced error") and `"error"` (any resultType ending in "error"), and `matchesFilmCutEnding` is covered for all three error buckets in `tests/film-cut-intent.spec.ts`
  - [ ] Point endings card: when unjudged the third outcome's `label` is "Errors" and `legendLabel` "Errors" and its base cut is `{ resultEnding: ["error"], ending: "error" }` with the tally including forced errors; when judged it is today's "Unforced errors"/"Unforced" with the `unforced-error` cut, and double faults remain excluded from both
  - [ ] `pointResultLabel()` (Film point list row titles) drops the kind from the label only when unjudged: "Backhand Unforced Error" → "Backhand Error", "Forehand Forced Error" → "Forehand Error", "Unforced Error" → "Error"; the stored `resultType` is untouched and a judged match returns the stored string as today — unit-tested in the model's spec
  - [ ] No other copy on the two cards changes (Winners, Aces, Double faults rows and legends are byte-identical in the diff)
- **notes:** Read docs/ui-revamp-guardrails.md and `.skills/advantage-analytics-design/SKILL.md` (+ `reference/components`) first; run `trace-route` — "head-to-head" exists only once but point-endings' `sideCut` delegates to the H2H card's, so the new Forced row must go through the same `sideCut`. Spec copy: forced-or-unforced mockup boards A1 and A3. The `you`/`opp` resolution stays through `youIsPlayer1` (guardrails §4) — do not read player order in the new row.

## T4 · Shots tab errors cut: "Errors" until judged, forced URL fallback

- **status:** blocked
- **model:** opus
- **needs:** T2
- **files:** src/components/dashboard/matches/match-detail/shots/default-cuts.ts, src/components/dashboard/matches/match-detail/shots/filters-popover.tsx, src/components/dashboard/matches/match-detail/shots/viz-url.ts, src/components/dashboard/matches/match-detail/shots/viz-model.ts (`errorKindOf`), tests/viz-url.spec.ts, tests/viz-model.spec.ts
- **routes:** /dashboard/matches/[matchId]
- **done when:**
  - [ ] On an unjudged match the errors default cut is named "Errors", its filters are `{ error: ["unforced", "forced"] }` (every error, double faults excluded as today) and its pills read ["All errors", "All strokes"]; on a judged match the cut is byte-identical to today's ("Unforced errors", `["unforced"]`, ["Unforced", "All strokes"]) — `default-cuts.ts` takes the judged flag (or a selector does) and a spec covers both
  - [ ] The Error type group in `filters-popover.tsx` offers "Errors · Double faults" when unjudged (one option that toggles both `unforced` and `forced` together) and today's "Unforced errors · Forced errors · Double faults" when judged; `OPTIONS.error` labels in `viz-url.ts` are the source of both wordings
  - [ ] `viz-url.ts` parsing: a URL with `verr=forced` (alone or with `unforced`) opened on an unjudged match resolves to the all-errors cut (`error: ["unforced","forced"]`), never to an empty chart; on a judged match it parses as today — both asserted in `tests/viz-url.spec.ts`
  - [ ] `errorKindOf()` in viz-model.ts classifies "forced error" (not "unforced") as `"forced"` and a bare "... Error" as `"unforced"` only on a judged match; the applied-strip / readout words for the collapsed option read "Errors" — covered in `tests/viz-model.spec.ts`
  - [ ] No change to the serve, return and rally cuts, to the Film tab's own Result › Ending filter (already "Winner · Error"), or to saved-view storage format (a saved view's `error` array is read, not rewritten)
- **notes:** Read docs/ui-revamp-guardrails.md and the design skill (`reference/components` for the popover) first. Spec copy: forced-or-unforced mockup board A2. `custom-filters.config.ts` under visuals/configs appears unused — do not route the change through it. The judged flag comes from the match filter context added in T2.

## T5 · Cross-match surfaces always say "Errors" (unforced + forced)

- **status:** done
- **model:** opus
- **files:** src/lib/data/performance-server.ts, src/lib/data/home-recent-data.ts, src/lib/data/player-profile.ts, src/lib/data/player-profile-server.ts, src/lib/data/match-stats-server.ts (the averaged `unforcedErrors`), src/components/dashboard/matches/analysis-sidebar.tsx (check whether it is cross-match; leave it if it is a single-match surface), tests/player-profile.spec.ts
- **routes:** /dashboard, /dashboard/team/roster/[playerId], /dashboard/matches/[matchId] (Performance tracker)
- **done when:**
  - [ ] Performance tracker tile `unforced-errors` has `label: "ERRORS"`, description "Shots into the net or out of bounds, forced or not", and `pick` returns `unforced_errors + coalesce(forced_errors, 0)` (null only when `unforced_errors` is null); the tile `key` is unchanged so saved tile selections keep working
  - [ ] Home recent-match loader (`home-recent-data.ts`) selects `forced_errors` beside `unforced_errors` and its `errors` field is the sum, with the same null rule
  - [ ] Player profile (`player-profile.ts` / `player-profile-server.ts`) sums the two columns and the chip label is "Errors" instead of "Unforced"; `tests/player-profile.spec.ts` asserts the label and that a row with `forced_errors` 3 and `unforced_errors` 10 shows 13
  - [ ] Every averaged stats select in `match-stats-server.ts` that lists `unforced_errors` also lists `forced_errors`, and the averaged value feeding Home/profile is the per-match sum averaged, not unforced alone — a spec case (new or in an existing match-stats spec) checks one match at 10+3 and one at 8+null average to 10.5
  - [ ] No per-match report card is touched in this task (those are T3/T4)
- **notes:** Read docs/ui-revamp-guardrails.md and the design skill first for the label change. Rule from the spec: cross-match surfaces average many matches, most unverified, so they never show a split. Independent of T1/T2 — `match_stats.forced_errors` already exists; until T1 lands it is NULL on video matches and non-null on 28 older SwingVision rows, and the coalesce handles both.

## T6 · AI summary says "errors" on an unjudged match

- **status:** blocked
- **model:** opus
- **needs:** T2
- **files:** supabase/functions/generate-insights/index.ts, tests/generate-insights-prompt.spec.ts
- **done when:**
  - [ ] The function reads `matches.source_provider`, `verified` and `errors_judged_at` and computes the same predicate as `errorSplitJudged` (duplicated in Deno, with a comment naming `src/lib/data/error-split.ts` as the source of the rule)
  - [ ] When unjudged, the stats block handed to Gemini presents the figure under the name `errors` (value `unforced_errors + (forced_errors ?? 0)`) and never a key or word containing "unforced" or "forced"; the prompt rules gain one sentence that the player's errors were not split into forced and unforced, so the summary says "errors"; when judged the payload keeps `unforced_errors` and `forced_errors` and may use both words
  - [ ] The prior-match averages block (`AVG_FIELDS`) follows the same naming, so a comparison sentence on an unjudged match also says "errors"
  - [ ] `tests/generate-insights-prompt.spec.ts` gains two cases: an unjudged match's captured prompt body contains "errors" and not "unforced"; a judged match's body contains "unforced_errors"; the existing voice assertions (2–3 sentences, < 350 chars, first sentence the takeaway, percentages inline) still pass unchanged
  - [ ] The commit's description notes the function must be deployed with `deploy_edge_function` and the task's run log records that it was (the function runs from what is deployed, not from git)
- **notes:** Respect the settled insight voice in AGENTS.md — no lengthening, no new sampling parameters or `thinkingBudget`. Model and key per AGENTS.md (`GEMINI_MODEL`, `GEMINI_KEY`). Keep the JSON `responseSchema` unchanged.

## T7 · Ask says "errors" on an unjudged match

- **status:** done
- **model:** opus
- **needs:** T2
- **files:** src/lib/services/ask/schema.ts, src/lib/services/ask/measures.ts, src/lib/services/ask/prompts.ts, src/lib/services/ask/compare.ts, src/lib/services/ask/review.ts, tests/ask-measures.spec.ts, tests/ask-compare.spec.ts
- **done when:**
  - [ ] `schema.ts`: the `unforced_errors` meaning says it is every error the side made unless `forced_errors` is non-null (then only the unforced ones), and the `forced_errors` meaning says "null when nobody judged the split — an unverified video match, or one verified before the split existed; SwingVision matches and matches verified from now on carry it"
  - [ ] The prompt rules in `prompts.ts` carry one rule: when a row's `forced_errors` is null (or the question spans matches where any is null), name the figure "errors", never "unforced errors"; the worked example (`ASK_ANSWER_EXAMPLE_REPLY`) still validates against `ASK_ANSWER_EXAMPLE_ROWS`
  - [ ] `measures.ts` / `review.ts` / `compare.ts` expose an `errors` measure (unforced + coalesce(forced, 0)) with label "Errors" that the phrase table (`compare.ts` regex list) maps "errors" / "mistakes" to, while "unforced errors" keeps mapping to `unforced_errors`; `tests/ask-measures.spec.ts` and `tests/ask-compare.spec.ts` cover the new measure and the two phrases
  - [ ] No change to `database.ts` (the three service-role calls) or to the SQL guard; any new column the measure needs is already in the ask views (verify via `describe_views` output or the live view definition and say so in a comment) — if a view change is needed, it is a committed migration in this task
  - [ ] `npm run typecheck` and the existing ask specs pass
- **notes:** `docs/ask-improvement-roadmap.md` lists Ask conventions; read AGENTS.md's Ask paragraph before touching anything near `database.ts`. The model never types a number, so "errors" vs "unforced errors" is a labelling/measure matter, not a formatting one.

## T8 · label_points.error_kind write path, undo/redo and point shape

- **status:** done
- **model:** opus
- **files:** src/lib/services/labels/edit.ts, src/lib/services/labels/edit-session.ts, src/lib/services/labels/undo-diff.ts, src/lib/services/labels/rows.ts (point shape), src/lib/services/labels/ending-derived.ts, tests/label-edit.spec.ts, tests/label-console-edit.spec.ts
- **done when:**
  - [ ] `LABEL_POINT_VALUE_FIELDS` includes `"error_kind"` with type `"forced" | "unforced" | null`; `parseLabelPointPatch` accepts exactly those values and rejects any other string — asserted in `tests/label-edit.spec.ts`
  - [ ] `updateLabelPoint` (edit-session.ts) writes `error_kind` through the same optimistic `updated_at` UPDATE as the other point values, and the point row the console reads (`rows.ts` / the session reader) carries `errorKind` (null when unmarked)
  - [ ] The undo diff for a point patch records the previous `error_kind`, so undo restores the prior value and redo re-applies it — a case in `tests/label-console-edit.spec.ts` (or the undo spec) patches forced → unforced → undo → redo and checks the value at each step
  - [ ] A pure helper `isMarkableError(point, ghosts)` (ending-derived.ts, or a sibling) returns true only when `deriveEnding()` is `"error"` — not a missed return (`service_winner`), not a double fault, not an ace — with a spec in `tests/label-ending-derived.spec.ts`
  - [ ] Setting `error_kind` does not count as a "seed changed" edit for the point's status (`LABEL_POINT_STATUS_FIELDS` or equivalent is unchanged), so marking the kind alone does not flip every error point to "edited"
- **notes:** The column exists live (`label_points.error_kind`, migration 20261028025013_self_review) and is never set by the console today; the `seed` jsonb has no `error_kind` key, so treat null as the baseline. No migration needed. Live tests: Quan v Harazaki only, and revert any edits.

## T9 · Label console: Forced | Unforced tray pair, key E, shortcut sheet

- **status:** done
- **model:** opus
- **needs:** T8
- **files:** src/components/admin/labels/label-black-shot-row.tsx (tray), src/components/admin/labels/stroke-keys.ts or label-black-view.tsx (key handling), src/components/admin/labels/label-shortcuts.ts, tests/label-black-rows.spec.ts, tests/label-shortcuts.spec.ts
- **routes:** /admin/labels/[sessionId]
- **done when:**
  - [ ] When the selected shot is the point's last live shot and `isMarkableError()` is true, the selected-shot tray renders a segmented pair "Forced" | "Unforced" (after Reset shot, before Delete shot, with a key hint "E"), the chosen one pressed (`aria-pressed`); on any other shot the pair is absent — asserted on rendered markup in `tests/label-black-rows.spec.ts`
  - [ ] Clicking Forced or Unforced writes `error_kind` through the T8 patch path; pressing E on a markable last shot sets `forced` when unmarked, `unforced` when forced, `forced` when unforced; E on any other shot, in a text field or with a menu open does nothing — unit-tested in the key handler's spec
  - [ ] `LABEL_SHORTCUT_GROUPS` "Selected shot" gains `{ keys: ["E"], action: "Forced or unforced error", note: "On a missed last shot. Again to switch back" }` placed after the Serve row, and `tests/label-shortcuts.spec.ts` asserts no other binding uses E
  - [ ] The tray fits the rail's 640px default width without wrapping (shorter labels allowed, e.g. "Forced" / "Unforced" only, no "error" suffix) — the width rule is written in the tray's doc comment and the pair uses the existing tray button primitives, no new colours
  - [ ] Undo (⌘Z) and redo (⌘⇧Z) revert and re-apply a kind set by click or by E (goes through T8's diff; one integration case in the console edit spec)
- **notes:** Read docs/ui-revamp-guardrails.md and `.skills/advantage-analytics-design/SKILL.md` first; the black view has its own tone file (`label-rail-tone.ts`) — stay inside it. Spec: forced-or-unforced mockup boards B1 and B2 (E is free: F B V O S C X T A R D L M are taken). Live tests: Quan v Harazaki only, revert edits.

## T10 · Point sentence names the error kind; overview stats add Forced errors

- **status:** todo
- **model:** sonnet
- **needs:** T8
- **files:** src/components/admin/labels/label-black-format.ts, src/components/admin/labels/label-dashboard.tsx, src/lib/services/labels/apply.ts (`expectedStats`), tests/label-black-rows.spec.ts, tests/label-apply.spec.ts
- **routes:** /admin/labels/[sessionId], /admin/labels
- **done when:**
  - [ ] The point sentence (`label-black-format.ts`, case `"error"`) reads "Backhand forced error by X" when `errorKind === "forced"`, "Backhand unforced error by X" when `"unforced"`, and "Backhand error by X" (today's text) while null — three cases asserted in `tests/label-black-rows.spec.ts`
  - [ ] `expectedStats()` in apply.ts gains `forcedErrors` per side, counting `error_kind === "forced"` errors, with `unforcedErrors` counting the rest (null kind included), and `tests/label-apply.spec.ts` checks one forced + two unmarked errors give 1 / 2
  - [ ] The labeller overview's "Statistics from the labels" rows gain `["Forced errors", p1.forcedErrors, p2.forcedErrors]` directly after "Unforced errors"
  - [ ] No player-facing copy changes in this task
- **notes:** The overview always shows the split — it is the labeller's working view and does not wait for verification (spec B2). Keep "forced"/"unforced" lowercase in the sentence as the mockup does.

## T11 · Publish writes the error kind to result_type and sets the judged marker

- **status:** todo
- **model:** fable
- **needs:** T1, T8
- **files:** src/lib/services/labels/apply.ts (`resultTypeOf`), src/lib/services/labels/apply-session.ts, src/lib/services/labels/session-status-session.ts, supabase/migrations/<timestamp>_verify_match_errors_judged.sql (new), tests/label-apply.spec.ts, tests/label-apply-session.spec.ts
- **done when:**
  - [ ] `resultTypeOf(ending, lastStroke, errorKind)` returns "{Side} Forced Error" for `forced`, "{Side} Unforced Error" for `unforced` and for null (today's behaviour), "Forced Error"/"Unforced Error" with no side for a volley — table-tested in `tests/label-apply.spec.ts`; its doc comment no longer says labels do not split errors
  - [ ] A committed and MCP-applied migration gives `verify_match` a third parameter `p_errors_judged boolean default false`; when true it also sets `errors_judged_at = now()`, when false it leaves the column as is; `unverify_match` is unchanged; grants restated (service_role only, as today)
  - [ ] Mark complete's publish path computes `everyErrorMarked` = no live point with derived ending `error` has `error_kind` null, and passes it as `p_errors_judged`; the apply/publish order is unchanged (points written, `calculate_match_stats` run, then verify) so the stat function sees the marker — asserted in `tests/label-apply-session.spec.ts` with a stubbed client recording the RPC args
  - [ ] Publishing a session where every error is marked yields `match_stats.forced_errors` non-null (the T1 function, via the marker); publishing one with an unmarked error (only possible for an edge case T12 does not catch, e.g. a stale client) passes `false` and leaves the column null — both covered in the session spec
  - [ ] The `expectedStats` reconciliation in apply.ts compares `forcedErrors` too, so a publish whose stat row disagrees on forced errors is reported the same way a winners mismatch is
- **notes:** This marker is what makes T2's predicate true for video matches. The 18 already-verified matches are never touched: a reopen + republish needs every error marked like any new match (T12 enforces it). Adding a parameter with `create or replace` makes a second overload: drop `public.verify_match(uuid, uuid)` first (`apply_migration` declines a DROP — run it with `execute_sql`, then the migration) and re-grant service_role. `self_review_result_type()` (migration 20261028025013) is the SQL twin of `resultTypeOf`; add a cross-reference comment. Live tests: Quan v Harazaki only — if you publish it to test, Reopen afterwards and record it in the run log.

## T12 · Mark complete blocks while any error is unmarked

- **status:** todo
- **model:** opus
- **needs:** T8
- **files:** src/lib/services/labels/session-status.ts, src/components/admin/labels/label-confirm.ts, src/components/admin/labels/label-confirm-dialog.tsx, src/components/admin/labels/label-black-view.tsx (open-point callback), tests/label-session-status.spec.ts, tests/label-console.spec.ts
- **routes:** /admin/labels/[sessionId]
- **done when:**
  - [ ] `session-status.ts` exports `unmarkedErrors(points, ghosts)` returning the point numbers (ascending) of live points whose derived ending is `error` and `error_kind` is null; `completeWarnings` is unchanged for unchecked points and open marks; `tests/label-session-status.spec.ts` covers 0, 1 and 3 unmarked
  - [ ] `label-confirm.ts` `complete-session` takes `blockers: number[]`; with blockers the title is "Mark {n} errors before publishing" ("Mark 1 error before publishing" for one) and the description is "Every error needs forced or unforced before this match can be verified. They're points 31, 58 and 140." (two: "points 31 and 58"; one: "It's point 31."); with none, today's title and descriptions are byte-identical
  - [ ] In the blocked dialog the Publish button is `disabled` and a quiet blue text action "Go to point {first}" is rendered before Close; the action closes the dialog and calls the console's open-point handler with that point; the warning list still shows "{n} errors not marked forced or unforced" first, then the unchecked-points warning
  - [ ] With no blockers the dialog matches today: unchecked points remain a warning, Publish enabled — asserted alongside the blocked state in `tests/label-console.spec.ts` on rendered markup
  - [ ] Keyboard: Enter in the blocked dialog does not publish (the confirm's default action is suppressed while disabled)
- **notes:** Read docs/ui-revamp-guardrails.md and the design skill — "quiet blue text action" is the DS's text-button, not `advButton()` primary; `Clear all = blue text, no icon` is the precedent. Spec copy: forced-or-unforced mockup board B3. Live tests: Quan v Harazaki only, revert edits.
