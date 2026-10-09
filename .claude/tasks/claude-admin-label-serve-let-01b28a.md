# Tasks — claude/admin-label-serve-let-01b28a

> Scope: admin hand-labelling — mark a serve as a let in the full-screen console (design A1–A3).

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

## T1 · Let serve result · data model and session rule

- **status:** done
- **model:** fable
- **files:** supabase/migrations/<new>_label_shots_result_let.sql, src/lib/services/labels/seed.ts, src/lib/services/labels/edit.ts, src/lib/services/labels/session.ts, src/lib/services/labels/shot-derived.ts, src/lib/data/labels-server.ts, src/components/admin/labels/label-format.ts, tests/fixtures/label-session.ts, tests/label-edit.spec.ts, tests/label-shot-derived.spec.ts, tests/label-session-order.spec.ts (guess)
- **done when:**
  - [ ] `label_shots.result` accepts `'let'`: a migration under `supabase/migrations/` replaces the `result in ('in','out','net')` check with one that includes `'let'`, and the same DDL is applied to the live project with the Supabase MCP (`apply_migration`, file named to the live version) after confirming the live constraint name with `execute_sql` — the repo folder is ~100 migrations behind live, so verify there, not in the folder.
  - [ ] `LabelShotResult` (seed.ts) and `LABEL_SHOT_RESULTS` (edit.ts) include `"let"`, `RESULT_LABEL` prints it as `Let`, and the edit validator refuses `result: "let"` on a row whose stroke is not `first_serve`/`second_serve` with an error sentence; a spec in tests/label-edit.spec.ts pins the refusal and the accepted serve case.
  - [ ] `LabelSession` gains `playOnLets: boolean`, read in `readLabelSessionRows`/`buildLabelSession` from `matches.format.play_on_lets` (`true` only when the column is literally `true`; `null`/missing format = lets replayed = `false`), the `matches` select adds `format`, and `labelSessionFixture()` carries the field; a `buildLabelSession` spec pins null→false and true→true.
  - [ ] `positionPatch` (shot-derived.ts) leaves a stored `"let"` alone: with `shot.result === "let"` the returned patch carries the coordinates and no `result` key, while a non-let shot still gets the derived result; pinned in tests/label-shot-derived.spec.ts.
  - [ ] `npm run typecheck` and the label specs pass.
- **notes:** Approved design https://claude.ai/artifact/CWDraCz5nbrR2Q8JN4aTJM (A1 Main, A2 ResultMenu, A3 NoLet) — read with the Artifact tool's `read` action. The point-level `let_replayed` ending already exists and is unrelated; this is a shot-level serve result. Interpretation made here: a let is a stored override, so a position edit keeps it ("picking the calculated item returns to the derived result" is the only way back). Not required: what happens to a let when the stroke is retyped off a serve. `supabase/migrations/` is not Prettier-formatted — never hand-format it.

## T2 · Let serve · derivation and scoring semantics

- **status:** done
- **model:** opus
- **needs:** T1
- **files:** src/lib/services/labels/ending-derived.ts, src/components/admin/labels/label-format.ts, src/lib/services/labels/marks-state.ts, src/lib/services/labels/scorecard.ts, tests/label-ending-derived.spec.ts, tests/label-black-rows.spec.ts or tests/label-console.spec.ts, tests/label-marks.spec.ts (guess)
- **done when:**
  - [ ] `isFault()` returns false for a serve with `result: "let"` — pinned by a spec.
  - [ ] `deriveEnding()` ignores let serves: a point whose last live stroke is a let derives `null` (not `ace`), and a missed `first_serve` preceded only by a let derives `null` (not `double_fault`); both pinned in tests/label-ending-derived.spec.ts.
  - [ ] The following serve stays a first serve: `secondServeAsFirst()` raises no `second_serve_as_first` mark for a `first_serve` that follows a let — pinned by a spec.
  - [ ] `pointSummary().rally` excludes let serves: let + first serve + two groundstrokes is a rally of 3, and let + serve alone is a rally of 1 — pinned by a spec.
  - [ ] `npm run typecheck` passes; any `scorecard.ts` switch that `typecheck` surfaces for the new result value treats a let as neither in nor missed and the existing label scorecard spec still passes.
- **notes:** `isMissedResult` only matches out/net, so most of this already holds — the specs are the deliverable; the real behaviour changes are in `deriveEnding` (ending-derived.ts:66-77) and `pointSummary`. Vendor-side marks (`isServeFault`, `second_serve_called_out` in marks.ts) read the SplitStep rally, not labels — out of scope.

## T3 · Rail serve-result menu with Let

- **status:** done
- **model:** opus
- **needs:** T1
- **files:** src/components/admin/labels/label-black-shot-row.tsx, src/components/admin/labels/label-cells.tsx, src/components/admin/labels/label-console.tsx (threading `playOnLets` into the row edit context only), tests/fixtures/label-session.ts, tests/label-black-rows.spec.ts (guess)
- **routes:** /admin/labels/[sessionId]
- **done when:**
  - [ ] On a serve row (`first_serve`/`second_serve`) in a session with `playOnLets === false`, the result cell is an editable "Serve result" select instead of plain `data-calculated="result"` text; its menu lists exactly one calculated item — labelled with the derived result from `deriveShotResult` (Net/In/Out) and described "From where it landed" — and a "Let" item described "Replayed. Not a fault, so the next serve is still a first serve." (A2).
  - [ ] Choosing "Let" patches `{ result: "let" }`; choosing the calculated item patches `{ result: <derived> }`; a spec drives both `onChange` paths and asserts the patch.
  - [ ] A let row's result text renders in `text-[var(--rail-amber)]` and, with `status: "edited"`, the pencil `data-shot-marks` slot is present; a non-let serve row keeps the current `text-white/50`/fault ink — pinned by rendered-markup assertions.
  - [ ] Non-serve rows, and every row when `playOnLets === true` (A3), render today's plain `data-calculated="result"` text with no menu trigger — pinned by a spec.
  - [ ] While the serve-result menu is open the row's `data-shot-actions` overlay is not rendered (or the row carries a state attribute such as `data-menu-open` with the overlay hidden) so the delete control steps aside; a spec pins the open-state markup.
- **notes:** Design https://claude.ai/artifact/CWDraCz5nbrR2Q8JN4aTJM artboards A1–A3 are the spec; "option B" is not to be built. `SelectOption` is `{value,label}` — extend `SelectEditor`/`SelectOption` with an optional `description` rendered through `FloatMenuItem description` (float-menu.tsx already supports it; `FloatMenuLabel` for the "Serve result" heading) rather than hand-rolling a menu. The row is shared across rail tones via its `tone` prop; the gate is the match's `playOnLets`, not the tone — no separate docked-layout work. label-black-shot-row.tsx is ~1230 lines and label-console.tsx ~2090: read the result cell (lines ~520–560), `BlackSelectCell` (~1088) and the console's `editContext`/row props only; do not sweep either file. The pencil already appears from `status === "edited"`, so no new pencil logic. typecheck + lint must pass.

## T4 · Rail header scoring and lets rule

- **status:** done
- **model:** sonnet
- **needs:** T1
- **files:** src/components/admin/labels/label-black-rail.tsx, src/components/admin/labels/label-console.tsx (pass `playOnLets` beside `adScoring` at the rail call ~line 1738), tests/label-console.spec.ts or tests/label-black-rows.spec.ts (guess)
- **routes:** /admin/labels/[sessionId]
- **done when:**
  - [ ] `LabelBlackRail` takes `playOnLets: boolean` and the console passes `session.playOnLets` next to `adScoring`.
  - [ ] With `adScoring` true and `playOnLets` false the header shows `· Ad scoring · Lets replayed` after the `{checked} / {total} checked` span; with `playOnLets` true the tail is `· Lets: play on` — both pinned by a rendered-markup spec.
  - [ ] The header is unchanged when `showSession` is false (the "Points" title case shows no progress span) — pinned by the spec.
  - [ ] `npm run typecheck` and `npm run lint` pass.
- **notes:** Design A1 shows the header (an 11px `text-white/45` span after the checked count, `·` separators in `text-white/25`). When `adScoring` is false use "No-ad scoring". The existing `/` separator between counts stays.

## T5 · Let count in point subtitle and court title

- **status:** blocked
- **model:** sonnet
- **needs:** T1
- **files:** src/components/admin/labels/label-black-format.ts, src/components/admin/labels/label-court-panel.tsx, tests/label-black-rows.spec.ts, tests/label-court-panel.spec.ts (guess)
- **routes:** /admin/labels/[sessionId]
- **done when:**
  - [ ] `pointDetail()` appends `· 1 let` for a point with one live let serve and `· 2 lets` for two, after the rally part, and appends nothing when the point has no let — pinned in tests/label-black-rows.spec.ts.
  - [ ] Deleted (tombstoned) let serves do not count — pinned.
  - [ ] `courtReadout` (label-court-panel.tsx) ends the `data-court-title` text with ` · let` when the lit/selected shot has `result: "let"`, and leaves it unchanged otherwise — pinned in tests/label-court-panel.spec.ts.
  - [ ] `npm run typecheck` passes.
- **notes:** `pointDetail` is pure and already loaded via `createLoader()` in label-black-rows.spec.ts — add cases there. Count lets via `isServeStroke(shot.stroke) && shot.result === "let"` over `liveShots(point)`. Design A1 for placement of the suffix.
