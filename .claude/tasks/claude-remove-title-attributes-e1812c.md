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

- **status:** todo
- **model:** sonnet
- **files:** src/components/dashboard/team/roster-invite-dialog.tsx, src/components/dashboard/team/join-requests-card.tsx, src/components/dashboard/settings/image-adjust-dialog.tsx, src/components/claim/claim-shell.tsx, src/app/dashboard/help/help-toc.tsx (surveyed, not guessed)
- **done when:**
  - [ ] These eight `title` attributes are removed and nothing else on the element changes: `roster-invite-dialog.tsx:885` `<button title={reason}>` (keeps its sr-only reason span); `join-requests-card.tsx:240` `<span title={request.email}>` and `:275` `<span title={request.note}>`; `image-adjust-dialog.tsx:548` and `:576` `<button title={label}>` (both keep `aria-label={label}`); `claim-shell.tsx:116` `<Link title="Back">` and `:131` `<Link title={exitLabel}>` (both keep their `aria-label`); `help-toc.tsx:207` `<span title="Press ? from anywhere on this page">`.
  - [ ] The `RoleCard title="Player"` / `"Assistant coach"` props at `roster-invite-dialog.tsx:655/661` and the `RosterDialog title` at `:424` are unchanged — they render visible text.
  - [ ] `grep -nE '\stitle=' ` on the five files returns no hit whose enclosing tag is a lowercase DOM element or `Link`.
  - [ ] `npm run typecheck` and `npm run lint` pass.
- **notes:** Truncation reveal is lost at `join-requests-card.tsx:240/275` (email and note are `truncate`d and the title showed the full string) and the "Press ?" hint at `help-toc.tsx:207` is lost — do not invent a replacement; note both in the commit body. Every icon-only control here already carries an `aria-label` or sr-only text, so no new `aria-label` is needed.

## T3 · Drop DOM title tooltips — schedule

- **status:** todo
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
