# Design — player-dialogs-ui

## What tracing changed

Three of the brief's five items rest on premises the code contradicts. Both
were put back to the human in chat and answered; the answers are folded in
below.

1. **Add Player already has a lineup-spot field.** `LINEUP_SPOTS` (1–9) and an
   `UnderlineSelect` are already in the dialog, and `program_players` carries
   **no unique index** on the column — sharing a spot is a documented,
   deliberate decision (`player-fields.tsx`: "a coach mid-reshuffle would be
   blocked by a constraint, and there is no swap control"). `spotHeldNote`
   already names the incumbent and says the spot may be shared.
   **Human's call: raise the note to a confirm.** Keep sharing legal, keep the
   field, require an explicit acknowledgement before submitting into an
   occupied spot. **No write to any other player's row.**
2. **Invite's "Someone new" is not a dead end.** It sends an email invitation;
   acceptance mints a self-owned profile with a login and spends a seat. Add
   Player makes a coach-managed row with no login. They are different
   capabilities. **Human's call: offer the hand-off, don't force it.**
3. **440px is the DS's own dialog width.** SKILL.md § Dialog (v3):
   `w-[440px]` for forms, `w-[520px]` for compare dialogs. The shell already
   renders 440 with 24/24/20 padding, 18px gaps, a 16px/500 title, a 12px
   contract sentence and the 28px chrome close — it is *already* DS-conformant.
   "More in line with the DS" and "bigger" pull in opposite directions here.

## Approaches considered

**A — Widen the shared shell to 520 and stop there.** One prop default change
in `dialog-shell.tsx`, `width` union already admits 520 (merge uses it).
Cheapest, and 520 is a number the DS already sanctions rather than an invented
one. Risk: the extra 80px goes to whitespace, and Add Player's real problem —
that it is *tall*, with five stacked groups plus two notes plus a checkbox plus
an info row — is untouched.

**B — Widen to 520 and spend the width.** Same shell change, plus targeted
internal work: the two notes and the email hint stop wrapping to three lines,
the class-year / lineup-spot pair gets room for the confirm affordance, and
Invite/Edit adopt the same field column so the three read as one family.
Bigger diff, but it is the difference the human actually asked for.

**C — Convert Add/Edit to a right-side sheet or a full page.** Would give
unlimited room and match the roster drawer's register. Rejected: it discards a
working, heavily-commented dialog family, breaks the DS's Dialog spec outright
rather than stretching one number in it, and nothing in the brief asks for a
different surface *kind*.

**Recommendation: B.** A is a change nobody will notice; C is a rewrite. B is
one shell change plus bounded per-dialog edits, deviating from the DS on
exactly one documented number.

## Chosen design

### Route

`/dashboard/team/roster` → `src/app/dashboard/team/roster/page.tsx` →
`RosterView` (`src/components/dashboard/team/roster-view.tsx`), with
`RosterHeaderButtons` mounting `AddPlayerDialog` and `RosterInviteDialog`.
`EditPlayerDialog` and the drawer mount from the roster table / `PlayerDrawer`.
All five files live in `src/components/dashboard/team/`.

### 1 · Dialog shell (`dialog-shell.tsx`)

- Extend the `width` union to include `560` and change `RosterDialog`'s default
  from `440` to **`520`**. Add/Invite/Edit take the default; Merge keeps its
  explicit `520`; review-requests keeps `480`.
- Nothing else in the shell moves — padding, 18px rhythm, title scale, the
  hand-rolled 28px close and the footer grammar are all already the v3 spec and
  are the reason the three dialogs read as one object today.
- **Document the deviation in the file's header comment**: 520 is the DS's
  compare-dialog width used for forms, chosen over inventing a number, because
  the roster forms carry more rows than the v3 form dialog anticipates.
- `maxWidth: calc(100vw - 32px)` already handles narrow viewports; at 520 that
  is still the binding constraint below ~552px, so no new mobile work.

### 2 · Add Player (`add-player-dialog.tsx`)

Two changes, both inside the existing structure.

**(a) The occupied-spot confirm.** Today `spotNote` renders through
`RosterNote` — quiet ink, `aria-hidden` visible copy, an `sr-only` live region.
Keep that component and that sentence; add a gate:

- New state `spotAcknowledged: boolean`, reset by `reset()`.
- When `spotTakenBy.length > 0`, render a checkbox directly under the note:
  *"Yes — share #N with {names} for now."* Same visual grammar as the existing
  "Also send an invite" checkbox (`accent-[var(--blue)]`, 12px label, 11px
  sub-line), so no new control vocabulary.
- `ready` gains `&& (spotTakenBy.length === 0 || spotAcknowledged)`. The
  primary is already `disabled={!ready || pending}`, so the gate is one term in
  an expression that already exists.
- `spotAcknowledged` resets to `false` in the `setLineupSpot` handler — moving
  to a different occupied spot must re-ask.
- The note text itself is unchanged: `spotHeldNote` stays shared with Edit
  player, and Edit player does **not** get the gate (editing an existing row's
  spot is the reshuffle case the sharing decision exists for).
- **No displacement write.** `addProgramPlayer` and `add_program_player` are
  untouched; no other player's `lineup_spot` changes. This is the whole of item
  3 in the brief, per the human's answer.

**(b) Prefill from Invite.** `AddPlayerDialog` gains one optional prop,
`initial?: { firstName?: string; lastName?: string; email?: string }`, applied
when the dialog transitions closed→open (a `useEffect` on `open`, not a
`useState` initializer — the component stays mounted across opens, which the
file's `close()` commentary already turns on). `reset()` clears to empty, not
to `initial`, so a coach who cancels does not get the invite's email back.

### 3 · Invite → Add hand-off (`invite-target-picker.tsx`, `roster-invite-dialog.tsx`)

- "Someone new" keeps working exactly as it does: email-only invite, profile
  minted on acceptance, seat spent then. Nothing is removed.
- When the picker's selection is `null` (someone new) **and** the invite
  dialog holds a typed email, render one quiet blue text action under the email
  field — the footer-left register the DS already defines — reading
  *"Add a coach-managed profile instead →"*.
- Clicking it closes the invite dialog and opens Add Player with
  `initial.email` set to what was typed. `RosterHeaderButtons` already owns both
  dialogs' `open` state, so the hand-off is a callback up to that component:
  `onHandOffToAdd(email)` → `setInviteOpen(false); setAddInitial({ email });
  setAddOpen(true)`.
- Name is not carried: the invite dialog collects an address, not a name.

### 4 · Edit Player (`edit-player-dialog.tsx`)

Width only, plus whatever wrapping the extra 80px fixes. No behavioural change.
Its shared `spotHeldNote` stays quiet and ungated, as above.

### 5 · Drawer score (`player-drawer.tsx`, `lib/ui/score-format.ts`)

Root cause confirmed against the live database, not inferred:
`matches.score` genuinely stores trailing zero sets — e.g.
`player1:[6,0,0] / player2:[4,0,0]` renders as the reported `6-4 0-0 0-0`, and
`[6,7,0]/[4,6,0]` appends a phantom third set to a real two-setter. One match
stores `[0,0,0]/[0,0,0]` throughout.

- Add a pure helper in `lib/ui/score-format.ts`:

  ```ts
  /** Trailing sets where neither side won a game were never played. */
  export function playedSets(sets: ScoreLineSet[]): ScoreLineSet[]
  ```

  Trim **trailing** pairs only, both games `=== 0`, from the end. Not interior
  ones — a genuine `0-6` is not both-zero, and a real interior `0-0` cannot
  occur in a completed set, so the narrow rule is the safe one. An all-zero
  score trims to `[]`.
- **Display layer only.** `scoreSetsFrom` is *not* changed, no loader is
  changed, no write path is touched. Stored JSON is byte-identical before and
  after — that is the human's explicit constraint, and it is why the trim is a
  separate exported function rather than folded into the adapter every reader
  shares.
- Apply it at the drawer's call site: `sets={playedSets(match.sets)}`.
- **Callers not changed in this feature:** `match-rows.tsx` (Team Home) and
  every other `ScoreLine` consumer. They have the same latent defect, but
  changing them is out of this brief's scope and each has its own layout
  contract (`match-rows` sizes a 162px track on a five-set worst case). Note it
  for a follow-on branch rather than widening this one.
- **Layout, the other half of "cut off":** the drawer row is
  `grid-cols-[14px_minmax(0,1fr)_72px_40px_12px]` and the score cell carries
  `overflow-hidden … whitespace-nowrap` — so anything over 72px is silently
  clipped with no ellipsis. Trimming usually fixes it; a real three-setter
  still will not fit. Give the score track `minmax(72px, max-content)` and let
  the opponent/event cell (already `truncate`, `minmax(0,1fr)`) absorb the
  loss. The event name then shortens instead of the score — which is the
  priority the brief asks for, achieved by the truncation that is already
  there rather than by a new distillation rule.

### 6 · Dash spacing (`roster-table.tsx:717`)

The bench divider is `flex … gap-2.5` between `<span>Not in the lineup</span>`
and `<span>— drag a row below this line to bench them</span>`. The flex gap
puts 10px to the left of the em dash; the ordinary space inside the string puts
~4px to its right. Fix: drop the leading dash out of the string and set the
container to `gap-1.5`, rendering the dash as its own `aria-hidden` span with
`gap-1.5` either side — one gap value, symmetric by construction, no
whitespace-in-string doing spacing work. (Alternatively `gap-1` — pick the one
that reads at 11px against the eyebrow; 6px is the starting value.)

### Data flow

Unchanged everywhere. No new server action, no new query, no schema change, no
migration. The only cross-component wire is `RosterHeaderButtons` holding an
`addInitial` state alongside the `open` flags it already holds.

### Error handling

- The spot confirm is a *gate*, not a validation: it disables the primary, it
  never renders `DialogProblem`. Red and `role="alert"` stay reserved for what
  `add_program_player` refused — the file's existing commentary is explicit and
  correct on this.
- `playedSets` is total: empty input → empty output, no throw. `ScoreLine`
  already renders an empty span rather than `null` for `[]`, so a fully-trimmed
  score collapses the text and keeps the grid cell.
- The hand-off carries only an email string; if Add Player is already open the
  callback is a no-op guard rather than a state race.

### Testing

- Unit (`playedSets`): `[6-4, 0-0, 0-0] → [6-4]`; `[6-4, 7-6, 0-0] → [6-4,7-6]`;
  `[0-0,0-0,0-0] → []`; `[0-6, 6-0] → unchanged` (interior/leading zeros
  survive); `[] → []`.
- **Persistence assertion (brief success criterion 6):** a test or a scripted
  check that reads a match's `score` JSON before and after the drawer renders
  and asserts equality. Cheaply: grep the diff for any write path touching
  `score` — there must be none.
- Playwright (`tests/`): open the roster, click a player, assert the drawer's
  recent-match row shows `6-4` and that the score cell's `scrollWidth` is not
  greater than its `clientWidth` (the clipping assertion, not an eyeball).
- Playwright: open Add Player, pick an occupied lineup spot, assert
  "Add to roster" is disabled; tick the acknowledgement, assert it enables.
- Playwright: open Invite, type an email, choose "Someone new", click the
  hand-off, assert Add Player is open with the email prefilled.
- Visual: the bench divider's two gaps measured equal.
- `npm run lint` and `npm run build` (this worktree needs `npm ci` first —
  `node_modules` is absent).

## Open questions

- **Carried forward:** the exact gap value for the bench dash (6px vs 8px) is a
  render-and-look decision, not a spec one. Whoever builds it picks by eye at
  11px and states which they chose.
- **Carried forward, deliberately out of scope:** every other `ScoreLine`
  caller shows phantom `0-0` sets today. This design fixes the drawer only.
  Worth its own branch — per the repo's branch-scope discipline, not a
  follow-on task on this one.
- **Resolved:** the lineup model is a single `lineup_spot` integer 1–9 on
  `program_players`, non-unique by design. There is no doubles-pairing model to
  accommodate, and no displaced-player resting state to decide, because nothing
  is displaced.
- **Resolved:** no existing DS confirm primitive is needed — the acknowledgement
  reuses the checkbox grammar already in the Add dialog.

## Also consulted

Beyond the declared inputs (`../01_brief/output/brief.md`, `MAP.md`,
`.skills/advantage-analytics-design/SKILL.md`):

- `src/app/dashboard/team/roster/page.tsx` — to resolve the route.
- `src/components/dashboard/team/dialog-shell.tsx` — the shared shell and its
  `width` union.
- `src/components/dashboard/team/add-player-dialog.tsx` — to find the existing
  lineup-spot field and the reset/`created` machinery a prefill must respect.
- `src/components/dashboard/team/player-fields.tsx` — `LINEUP_SPOTS`,
  `spotHolders`, `spotHeldNote`, `RosterNote`.
- `src/components/dashboard/team/invite-target-picker.tsx` — what "Someone new"
  actually does.
- `src/components/dashboard/team/roster-header-buttons.tsx` — which component
  owns both dialogs' open state.
- `src/components/dashboard/team/player-drawer.tsx` (lines ~697–755) — the
  recent-match row grid and its clipped score cell.
- `src/components/dashboard/team/roster-table.tsx` (~line 717) — the bench
  divider and its uneven gaps.
- `src/components/dashboard/team/match-rows.tsx`,
  `src/components/dashboard/score-line.tsx`, `src/lib/ui/score-format.ts` — the
  score pipeline and the other callers.
- `src/lib/data/team-roster-server.ts` (grep only) — where `scoreSetsFrom` is
  applied for the drawer.
- **Live database** via the Supabase MCP: `select id, score from matches …`,
  confirming trailing `0-0` sets are real stored data and not a render bug.
