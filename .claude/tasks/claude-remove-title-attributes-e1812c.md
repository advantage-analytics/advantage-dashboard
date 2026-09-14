# Tasks — claude/remove-title-attributes-e1812c

> Scope: Remove every native hover tooltip (DOM `title` attribute) from the dashboard, claim and help UI, preserving accessible names via `aria-label`; document `<title>`/`metadata.title` stays.

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

## T1 · Drop DOM title tooltips — matches list, wizard, KPI strip

- **status:** blocked
- **model:** sonnet
- **files:** src/components/dashboard/matches/match-card-gallery.tsx, src/components/dashboard/matches/matches-page-content.tsx, src/components/dashboard/matches/matches-filter-panel.tsx, src/components/dashboard/matches/new-match-wizard/DetailsStepContent.tsx, src/components/dashboard/matches/new-match-wizard/MissingFieldsPill.tsx, src/components/dashboard/shared/season-kpi-strip.tsx (surveyed, not guessed)
- **done when:**
  - [ ] These seven `title` attributes are removed and nothing else on the element changes: `match-card-gallery.tsx:99` `<span title="Verified result">` (inner svg keeps its `aria-label`); `matches-page-content.tsx:336` `<SortTrigger title={…}>`; `matches-filter-panel.tsx:154` `<FilterTrigger title={label}>`; `DetailsStepContent.tsx:842` Attach `<button title="Fills opponent…">`; `DetailsStepContent.tsx:1657` `<button title="Change the opponent">`; `MissingFieldsPill.tsx:25` `<button title={…}>`; `season-kpi-strip.tsx:342` `<button title={disabled ? … : undefined}>`.
  - [ ] The `DetailsStepContent.tsx:1657` opponent button gains `aria-label={\`Change the opponent, ${formData.opponentName}\`}`so the action name survives — every other site already has an`aria-label`, sr-only text, or visible label, and nothing else gains an `aria-label`.
  - [ ] `grep -nE '\stitle=' ` on the six files returns no hit whose enclosing tag is a lowercase DOM element, `SortTrigger` or `FilterTrigger` (the remaining `<Section title=…>` / `<HomeWidgetFrame title=…>` etc. are untouched).
  - [ ] `npm run typecheck` and `npm run lint` pass.
- **notes:** `SortTrigger`/`FilterTrigger` spread `...props` onto a `<button>` (`src/components/dashboard/shared/list-toolbar-trigger.tsx:12`), which is why their `title` is a real tooltip. Do not touch `SessionRow`, `SourceCard`, `Step`, `HomeWidgetFrame`, `Section`, `FormHeader`, `WizardShell` props — they render `title` as text. The document `<title>`/`metadata.title` is the browser-tab name, not a hover tooltip; keep it. Lost affordances to record in the commit body: the KPI-strip disabled reason ("Keep at least N tiles visible") and the filter button's `label` are no longer surfaced anywhere on hover.

## T2 · Drop DOM title tooltips — team, settings, claim, help

- **status:** done
- **model:** sonnet
- **files:** src/components/dashboard/team/roster-invite-dialog.tsx, src/components/dashboard/team/join-requests-card.tsx, src/components/dashboard/settings/image-adjust-dialog.tsx, src/components/claim/claim-shell.tsx, src/app/dashboard/help/help-toc.tsx (surveyed, not guessed)
- **done when:**
  - [ ] These eight `title` attributes are removed and nothing else on the element changes: `roster-invite-dialog.tsx:885` `<button title={reason}>` (keeps its sr-only reason span); `join-requests-card.tsx:240` `<span title={request.email}>` and `:275` `<span title={request.note}>`; `image-adjust-dialog.tsx:548` and `:576` `<button title={label}>` (both keep `aria-label={label}`); `claim-shell.tsx:116` `<Link title="Back">` and `:131` `<Link title={exitLabel}>` (both keep their `aria-label`); `help-toc.tsx:207` `<span title="Press ? from anywhere on this page">`.
  - [ ] The `RoleCard title="Player"` / `"Assistant coach"` props at `roster-invite-dialog.tsx:655/661` and the `RosterDialog title` at `:424` are unchanged — they render visible text.
  - [ ] `grep -nE '\stitle=' ` on the five files returns no hit whose enclosing tag is a lowercase DOM element or `Link`.
  - [ ] `npm run typecheck` and `npm run lint` pass.
- **notes:** Truncation reveal is lost at `join-requests-card.tsx:240/275` (email and note are `truncate`d and the title showed the full string) and the "Press ?" hint at `help-toc.tsx:207` is lost — do not invent a replacement; note both in the commit body. Every icon-only control here already carries an `aria-label` or sr-only text, so no new `aria-label` is needed.

## T3 · Drop DOM title tooltips — schedule

- **status:** done
- **model:** sonnet
- **files:** src/components/dashboard/schedule/static/lineup-rows.tsx, src/components/dashboard/schedule/static/event-drawer.tsx (surveyed, not guessed)
- **done when:**
  - [ ] `lineup-rows.tsx:904` `<button title={names.length > 0 ? names.join(" / ") : undefined}>` loses the `title` prop and keeps `aria-label={\`Their pair at ${line.slot}\`}`and`aria-expanded`.
  - [ ] `event-drawer.tsx:275` `<div className="text-title-lg truncate" title={event.name}>` loses the `title` prop; className and children are unchanged.
  - [ ] `grep -nE '\stitle=' ` on both files returns no hit whose enclosing tag is a lowercase DOM element (`OptionCard title=…` in `opponent-popup.tsx` and `LineupHeading title=…` are out of scope and untouched).
  - [ ] `npm run typecheck` and `npm run lint` pass.
- **notes:** Both are truncation/expansion reveals (pair names, full event name); the reveal is lost on hover — record it, don't replace it. Every 340px rail drawer shares the roster's shell — change only the one `div`, not the drawer chrome.

## T4 · (optional) ESLint guard against DOM title attributes

- **status:** todo
- **model:** sonnet
- **needs:** T1, T2, T3
- **files:** eslint.config.mjs
- **done when:**
  - [ ] `eslint.config.mjs` gains a `react/forbid-dom-props` rule (plugin already loaded via `eslint-config-next/core-web-vitals`; `eslint-plugin-react` 7.37.5 in node_modules) at `error` with `forbid: [{ propName: "title", message: "<why: native hover tooltip; use aria-label or visible text>" }]`, scoped to `**/*.tsx` under `src/`.
  - [ ] `npm run lint` passes on the tree as left by T1–T3.
  - [ ] Temporarily adding `<span title="x" />` to any `src/**/*.tsx` makes `npm run lint` fail naming `react/forbid-dom-props`; the probe is removed before commit.
  - [ ] The rule's comment in `eslint.config.mjs` states the two known gaps: it does not see `title` on capitalised components (`Link`, `SortTrigger`/`FilterTrigger` whose `...props` reach a `<button>`), nor `title` keys inside spread objects.
- **notes:** Optional. Cheap (one rule block) and observable via the probe. Skip if the user would rather not add lint surface; the sweep in T1–T3 stands on its own.

## T5 · Land T1's title sweep with the spec re-anchored

- **status:** todo
- **model:** sonnet
- **files:** src/components/dashboard/matches/match-card-gallery.tsx, src/components/dashboard/matches/matches-page-content.tsx, src/components/dashboard/matches/matches-filter-panel.tsx, src/components/dashboard/matches/new-match-wizard/DetailsStepContent.tsx, src/components/dashboard/matches/new-match-wizard/MissingFieldsPill.tsx, src/components/dashboard/shared/season-kpi-strip.tsx, tests/upload-player-details.spec.ts (surveyed, not guessed)
- **done when:**
  - [ ] The seven `title` attributes listed in T1's first criterion are removed and nothing else on those elements changes; the `DetailsStepContent.tsx` opponent button gains `aria-label` reading "Change the opponent, " followed by `formData.opponentName`, and no other element gains an `aria-label`.
  - [ ] `tests/upload-player-details.spec.ts:291` anchors its `indexOf` on the literal text "Change the opponent, " from the new aria-label (or an equivalent literal that appears exactly once in the file) instead of `title="Change the opponent"`; the `<Pencil` assertion 400 chars after it still holds; no other line of the spec changes.
  - [ ] `grep -nE '\stitle=' ` on the six source files returns no hit whose enclosing tag is a lowercase DOM element, `SortTrigger` or `FilterTrigger`.
  - [ ] `npm run typecheck`, `npm run lint` and `npm test` all pass — the KPI-strip footer at `season-kpi-strip.tsx:378-384` is untouched, since it already prints the disabled reason ("All slots full — uncheck to swap." / "Minimum N tiles.") that the removed `title` duplicated.
- **notes:** Replaces T1 (blocked at the mechanical gate: the spec, not the code). Optional shortcut: T1's edits are intact in stash `49a4994a6dbe97d3809674bea00621ef50d935d2` — `git stash apply <sha>` (never pop; the stack is shared), then re-anchor the spec. Re-doing the seven removals by hand is equally fine. Keep T1's notes on which capitalised `title` props render text and must not be touched. Do not add tooltips here; the one "lost" affordance on this surface (KPI disabled reason) is already visible in the menu footer.

## T6 · Join requests — unclip the email, expand the note

- **status:** todo
- **model:** opus
- **files:** src/components/dashboard/team/join-requests-card.tsx (surveyed, not guessed)
- **done when:**
  - [ ] The email span at `join-requests-card.tsx:239-241` loses `truncate` and gains `break-all` (a 60-character address with no break points wraps onto a second line inside the 11px row rather than being cut with an ellipsis); no other class on it changes.
  - [ ] Under the note span (`:270-274`, still `line-clamp-2 break-words`) a text button reading "Show more" renders only when the clamped span overflows (its `scrollHeight` exceeds its `clientHeight`, measured after mount and on resize); a two-line note shows no button.
  - [ ] Clicking "Show more" removes `line-clamp-2` from that request's note only, the button reads "Show less", and clicking again restores the clamp; state is per request, so expanding one card leaves its neighbours clamped.
  - [ ] The "Show more" / "Show less" control is a `<button type="button">` styled with the card's existing 11px text-link pattern (no `advButton`, no pill), reachable by Tab, with `aria-expanded` reflecting the state.
  - [ ] `npm run typecheck` and `npm run lint` pass; `npm test` passes.
- **notes:** Follow-up to T2, which removed the `title` that carried the full email and note. Design system (`reference/chrome.md` §Dark Tooltip) forbids a tooltip on text and says to remove the clipping instead — the email is the only copy on screen and nothing opens it, so it wraps; the note stays clamped by default (the source comment explains why: a 5,000-character "word" from a public form) and opens on demand. Update the two source comments that still say "the full text is on the title".

## T7 · Help TOC — make the ? hint a keycap with an sr-only sentence

- **status:** todo
- **model:** sonnet
- **files:** src/app/dashboard/help/help-toc.tsx (surveyed, not guessed)
- **done when:**
  - [ ] The bare `<span>?</span>` at `help-toc.tsx:205-207` is replaced by `<Kbd size="sm" aria-hidden="true">?</Kbd>` (import from `@/components/ui/kbd`, default `raised` variant — the help page's own keycap) followed by a `<span className="sr-only">Press ? from anywhere on this page to jump to these topics</span>`, both inside the existing `flex items-baseline justify-between` header row.
  - [ ] The sr-only sentence is the only place that text appears; no `title`, no tooltip, no `aria-label` is added.
  - [ ] The `?`-key handler at `help-toc.tsx:110-133` and the mobile pill bar are unchanged.
  - [ ] `npm run typecheck` and `npm run lint` pass.
- **notes:** Follow-up to T2. `Kbd` is the product's only keyboard chip (`reference/components.md` §Keyboard Shortcut Chip: "a keyboard path is stated once, where the mode is stated"; `aria-hidden` on the chip when text already says the shortcut). The `Kbd` component signature has no `aria-hidden` prop today — if `cn`-only props reject it, pass it via `className`-adjacent spread or wrap the chip in `<span aria-hidden="true">`; note whichever you did in the commit body. A dark tooltip is off-limits here: the `?` is not a control.

## T8 · Schedule — wrap the event name, name the pair in the button

- **status:** todo
- **model:** sonnet
- **needs:** T3
- **files:** src/components/dashboard/schedule/static/event-drawer.tsx, src/components/dashboard/schedule/static/lineup-rows.tsx (surveyed, not guessed)
- **done when:**
  - [ ] `event-drawer.tsx:275` `<div className="text-title-lg truncate">` becomes `<div className="text-title-lg line-clamp-2 break-words">` — a 60-character event name shows on two lines in the 340px rail with no ellipsis, a 200-character one still clamps at two; nothing else in the header block changes and the drawer chrome is untouched.
  - [ ] The source comment above that div (`:272-274`) no longer says `title` carries the full name; it states the two-line wrap instead.
  - [ ] `lineup-rows.tsx:902` "their pair" button's `aria-label` becomes "Their pair at " + `line.slot` when `names` is empty, and "Their pair at " + `line.slot` + ": " + `names.join(" / ")` when set, so a screen reader hears the full names the visible text abbreviates to surnames; `aria-expanded` and every `data-*` attribute are unchanged.
  - [ ] `grep -nE '\stitle=' ` on both files still returns no lowercase-DOM hit, and `npm run typecheck` and `npm run lint` pass.
- **notes:** Follow-up to T3. `reference/chrome.md` §Dark Tooltip: "a name in a 340px drawer wraps to two lines, and the panel scrolls anyway"; the pair names are one click away in the popup (`lineup-rows.tsx:938-975` lists every chosen player in full), so the visible button truncates bare and only the accessible name carries them. Do not wrap either in a tooltip — neither the div nor a text button is icon-only chrome. Every 340px rail shares the roster's shell: touch only the one `div`.
