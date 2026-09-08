# Brief — add-event-polish

Four follow-ups on the "Add an Event" flow that landed in PR #178, each a
defect the human saw on the screens after that PR's own review passes. All
four are on the dual create path: the chooser, the opponent search, and the
lineup/details step. Nothing here is new capability.

## Goal

The three create screens a coach walks through to add a dual read the way the
design draws them: the chooser sits centred, the opponent search shows each
school's mark at the design's size, picking a school is unmistakably a pick
that lets you continue, and every field on the details step marks focus with
its blue rule alone.

## Scope

Exactly these four, as the human listed them:

1. **"What are you adding?" is still not centred in the viewport.** An
   earlier fix centred the heading and card grid as a column inside the
   screen's own shell; the human still sees the screen off-centre. The brief
   asks for the screen to read as centred where the coach actually sees it.
2. **"Who are you playing?" — the crest is too small.** The school mark drawn
   on conference and search rows is 26px today. Make it "slightly bigger" —
   the design's size, if the design draws one, is the target.
3. **Selecting a school shows the grey hover, not the blue check — and then
   Continue does not let you go on.** Two symptoms of one gesture: the chosen
   row must show the selected mark (blue check) rather than the hover wash,
   and once a school is chosen the step must allow continuing. *Read as a
   bug report — see Open questions.*
4. **"When it's played, and how." still shows a focus outline.** The dual
   details/lineup step: some control there still draws a ring or outline on
   focus. The rule for underline fields on this branch is that the bottom
   blue rule is the only focus mark.

## Non-goals

- Migrating `AdvSelect`'s four remaining callers (profile form, match-edit
  dialog, player fields, claim page) to `MenuSelect`. Decided today as its
  own branch after PR #178 merges.
- The tournament create path, the event pages, score entry, or edit flows.
- Any change to what the wizard writes: format, `adScoring`, player ids,
  opponent labels. These screens carry the inputs
  `docs/ui-revamp-guardrails.md` §3.1 and §4 protect; this work is visual
  and interaction only.
- Rewording any copy beyond what the four fixes strictly require.

## Constraints

- **Design authority:** `.skills/advantage-analytics-design/SKILL.md` and
  the "Add an Event" canvas (Final page, frames 1–12). Blue `#3B82F6` is the
  single accent; Lucide only; `advButton()` for buttons.
- **Focus rule on this branch (settled in PR #178):** an underline field
  answers focus by its rule going 2px blue, and opts out of the field ring
  only because of that change. `focus.css` is the mechanism; an opt-out must
  never hand a control back to the browser's default outline (fixed in
  `df64023`). A control whose rule does *not* change on focus keeps the ring —
  removing the ring there is a WCAG 2.4.7 failure, not a fix.
- **Select primitive:** `MenuSelect` is the chosen select (decided
  2026-09-08). The details step still draws two raw native `<select>`s; if
  item 4's outline is on one of them, that decision governs the fix.
- **`tests/schedule-static-copy.spec.ts` reads `static/*.tsx` source.** Any
  drawn-copy change updates its assertion in the same diff.
- **`EventShell` is shared** by four other screens; a centring fix that
  touches it must not move them.
- Branch: `claude/dual-match-tournament-designs-26cc2f`, on top of PR #178.
  The three files these screens live in are `static-event-chooser.tsx`,
  `dual-school-step.tsx` and `dual-build-step.tsx` (+ `lineup-name-picker.tsx`).

## Success criteria

1. At 1440×900 and 1200×800, the chooser's heading and card grid are centred
   in the content area the coach sees (measured: column centre within 1px of
   that area's centre). The four screens that share the shell are unmoved.
2. Every conference and search row on "Who are you playing?" draws the crest
   at the design's size (state the number in the plan). Row height and
   alignment still match the design.
3. Clicking a school row: the row shows the blue check and reads as selected
   after the pointer leaves it; the hover wash is not what marks selection;
   Continue becomes enabled and advances to the lineup step with that school.
   Keyboard selection behaves the same.
4. Tabbing through every focusable control on "When it's played, and how." —
   date, site, surface, format, all nine name cells, opponent cells, forfeit
   controls, the actions — shows exactly one focus indicator per control,
   and for every underline field that indicator is the blue rule with no ring
   and no outline (measured: `box-shadow: none`, `outline-style: none`,
   `border-bottom: 2px rgb(59,130,246)` on focus-visible).
5. `npm run lint`, `npx tsc --noEmit`, `npm test` green; the copy spec
   updated if any drawn string changed.

## Open questions

1. **Item 3's second half.** "…and that it doesn't let you continue
   afterwards" is read as: *today, after picking a school, Continue stays
   disabled — fix that.* If the intent was the opposite (picking should
   *block* continuing until something else happens), say so in this file.
2. **"Centered in the viewport" — which viewport?** The dashboard has a
   232px sidebar. Is the chooser to be centred in the area right of the
   sidebar (the content area), or in the full browser window? The brief
   assumes the content area; a coach never sees the screen without the
   sidebar.
3. **How much bigger is "slightly"?** If the canvas draws the crest at a
   specific size, that number wins. If not, name one (e.g. 32px) in stage
   02 and it becomes the criterion.
4. **Which control still outlines on the details step?** Not identified in
   the seed. Stage 02 should reproduce by tabbing the whole step before
   proposing anything — the fix differs by control kind.
