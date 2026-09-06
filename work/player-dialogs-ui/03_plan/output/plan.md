# Plan — player-dialogs-ui

Eight steps. Each is one surface, sized for a fresh subagent context. Steps 1–3
are the two bug fixes and are independent of the dialog work; 4–7 are the
dialog work and must run in order. Step 8 is the closing verification sweep.

**Prerequisite, once, before any step:** this worktree has no `node_modules`.
Run `npm ci` before the first build, lint or test. Not a step — a precondition
every step's verification depends on.

---

## Step 1 — `playedSets()` helper

**Files**
- `src/lib/ui/score-format.ts` (add one exported function)
- a unit test for it, colocated the way this repo's other pure-helper tests are

**Change**
Add a pure, exported `playedSets(sets: ScoreLineSet[]): ScoreLineSet[]` that
trims **trailing** sets where both `player1` and `player2` are `0`. Trailing
only — never interior, never leading. An all-zero score trims to `[]`.

Do **not** change `scoreSetsFrom`, `tiebreakOf`, `formatScoreText`, or any
loader. This function is additive; nothing calls it yet after this step.

Document in the function's doc comment *why* it is separate from
`scoreSetsFrom`: the trim is display-only and must never reach a write path or
change what other readers of the adapter see.

**Verification**
Unit tests, all five cases from the design:
`[6-4, 0-0, 0-0] → [6-4]` · `[6-4, 7-6, 0-0] → [6-4, 7-6]` ·
`[0-0, 0-0, 0-0] → []` · `[0-6, 6-0] → unchanged` · `[] → []`.
`npm run lint`.

**Depends on** nothing.

---

## Step 2 — Drawer recent-match score

**Files**
- `src/components/dashboard/team/player-drawer.tsx` (the recent-match rows,
  around lines 697–755)

**Change**
Two edits in the one row:
1. `sets={playedSets(match.sets)}` on the `<ScoreLine>`, importing the helper
   from step 1.
2. The row's grid: change the score track from a fixed `72px` to
   `minmax(72px, max-content)` so a real three-setter is not clipped, and let
   the already-`truncate` opponent/event cell (`minmax(0,1fr)`) give up the
   width. The score cell keeps `whitespace-nowrap`; drop `overflow-hidden` only
   if it is now doing nothing but hiding a fix.

Do not touch `match-rows.tsx` or any other `ScoreLine` caller — they have the
same latent defect and are deliberately out of this brief's scope.

**Verification**
Playwright: open `/dashboard/team/roster`, select a player with a recent match,
assert the score reads `6-4` (no trailing `0-0`) and that the score cell's
`scrollWidth <= clientWidth` — the clipping assertion, measured, not eyeballed.

**Depends on** step 1.

---

## Step 3 — Bench divider dash spacing

**Files**
- `src/components/dashboard/team/roster-table.tsx` (~line 717, the `BENCH`
  `Reorder.Item`)

**Change**
Today the container is `gap-2.5` and the em dash lives inside the trailing
string, so the dash has ~10px to its left and ~4px to its right. Pull the dash
out into its own `aria-hidden` span and set one gap value on the container
(start at `gap-1.5`; `gap-1` is the alternative) so both sides are symmetric by
construction rather than by a space character inside a string.

State in the commit or a code comment which gap value was chosen and that it
was picked by eye at 11px against the eyebrow.

**Verification**
Render the roster in lineup mode and measure the two gaps — they must be equal.
`npm run lint`.

**Depends on** nothing.

---

## Step 4 — Dialog shell width

**Files**
- `src/components/dashboard/team/dialog-shell.tsx`

**Change**
Extend the `width` union to admit `560`, and change `RosterDialog`'s default
from `440` to `520`. Merge profiles keeps its explicit `520`; review requests
keeps `480`. Add / Invite / Edit inherit the new default without each passing
a number.

Add to the file's header comment that 520 is a **documented deviation** from
SKILL.md § Dialog (v3)'s `w-[440px]` form width — it borrows the DS's own
compare-dialog width rather than inventing a number, because the roster forms
carry more rows than the v3 form dialog anticipates.

Nothing else in the shell changes: padding, the 18px rhythm, the 16px/500
title, the 12px contract sentence, the 28px chrome close and the footer grammar
are already the v3 spec and are why the dialogs read as one family.

**Verification**
Open all four dialogs (Add, Invite, Edit, Merge) and confirm each renders at
its intended width, the footer grammar is unchanged, and nothing overflows at
`calc(100vw - 32px)` on a narrow viewport. `npm run build`.

**Depends on** nothing, but must land before steps 5–7 so their layout is
judged at the final width.

---

## Step 5 — Add Player: occupied-spot confirm

**Files**
- `src/components/dashboard/team/add-player-dialog.tsx`

**Change**
Gate submission on an explicit acknowledgement when the chosen lineup spot is
already held:
- New state `spotAcknowledged`, cleared by `reset()` **and** by the
  `setLineupSpot` handler (moving to a different occupied spot must re-ask).
- When `spotTakenBy.length > 0`, render a checkbox directly under the existing
  `RosterNote`, reading e.g. *"Yes — share #N with {names} for now."* Reuse the
  visual grammar of the existing "Also send an invite" checkbox
  (`accent-[var(--blue)]`, 12px label, 11px sub-line) — no new control
  vocabulary.
- Add `&& (spotTakenBy.length === 0 || spotAcknowledged)` to `ready`. The
  primary is already `disabled={!ready || pending}`.

**Do not**: change `spotHeldNote` (shared with Edit player), add the gate to
Edit player, render this through `DialogProblem` (red / `role="alert"` stays
reserved for what `add_program_player` refused), or write to any other player's
row. There is **no displacement** — `addProgramPlayer` and the SQL function are
untouched.

**Verification**
Playwright: open Add Player, fill both names, pick an occupied spot → "Add to
roster" is disabled; tick the acknowledgement → it enables; change to a
different occupied spot → it is disabled again; pick a free spot → enabled with
no checkbox shown.

**Depends on** step 4.

---

## Step 6 — Add Player: `initial` prefill prop

**Files**
- `src/components/dashboard/team/add-player-dialog.tsx`
- `src/components/dashboard/team/roster-header-buttons.tsx` (pass the prop)

**Change**
Add an optional prop `initial?: { firstName?: string; lastName?: string;
email?: string }`. Apply it on the closed→open transition via a `useEffect` on
`open` — **not** a `useState` initializer: this component stays mounted across
opens, which the file's existing `close()` commentary turns on.

`reset()` still clears to empty, not to `initial`, so cancelling does not
resurrect a carried-over address.

`RosterHeaderButtons` holds an `addInitial` state alongside the `open` flags it
already owns, and passes it down. Nothing sets it yet after this step.

**Verification**
Open and close Add Player repeatedly with a non-empty `initial` and confirm the
prefill applies on each open, that Cancel leaves no residue, and that the
existing `created`/`formKey` duplicate-suppression logic still behaves. Unit or
Playwright, whichever is cheaper for this component.

**Depends on** step 5 (same file — sequence them so two subagents never edit it
at once).

---

## Step 7 — Invite → Add hand-off

**Files**
- `src/components/dashboard/team/roster-invite-dialog.tsx`
- `src/components/dashboard/team/invite-target-picker.tsx` (only if the
  affordance needs to sit inside the picker rather than under the email field)
- `src/components/dashboard/team/roster-header-buttons.tsx` (the wiring)

**Change**
"Someone new" keeps working exactly as it does today — email invite, profile
minted on acceptance, seat spent then. **Nothing is removed.**

When the picker's selection is `null` *and* an email has been typed, render one
quiet blue text action under the email field — the footer-left register the DS
already defines — reading *"Add a coach-managed profile instead →"*. Clicking
it calls up to `RosterHeaderButtons`:
`setInviteOpen(false); setAddInitial({ email }); setAddOpen(true)`.

Only the email carries across; the invite dialog collects an address, not a
name. Guard the callback so it is a no-op if Add Player is already open.

**Verification**
Playwright: open Invite, type an email, choose "Someone new", click the
hand-off → Invite closes, Add Player opens with the email prefilled. Separately
confirm the unchanged path: "Someone new" + Send still sends the invitation.

**Depends on** step 6.

---

## Step 8 — Verification sweep

**Files** none — this step changes nothing.

**Change** none.

**Verification**
- `npm run lint` and `npm run build` clean.
- `npm test` (Playwright) green, including the new specs from steps 2, 5 and 7.
- **The persistence check, brief success criterion 6:** grep the whole branch
  diff for any write touching `matches.score` — there must be none. Then read
  one match's stored `score` JSON via the Supabase MCP before and after loading
  the drawer and assert it is byte-identical.
- Run the `pipeline-guardrails-reviewer` agent over the diff (dashboard UI
  changes) and the `rls-boundary-reviewer` only if anything unexpectedly
  touched a data path — it should not have.

**Depends on** every step above.

---

## Test strategy

**Three layers, deliberately unequal.**

*Unit* carries the one piece of real logic in this feature: `playedSets`. It is
pure, total, and its edge cases (interior zeros, all-zero, empty) are exactly
where a wrong implementation would silently corrupt a displayed score. This is
the only step that gets exhaustive case coverage.

*Playwright* carries everything that is a state machine across components: the
confirm gate's enable/disable transitions, the prefill surviving open/close,
and the hand-off crossing two dialogs. These are cheap to get wrong in a way no
type checks and no unit test would catch.

*Measured, not eyeballed:* the two display bugs both get an assertion rather
than a screenshot review — `scrollWidth <= clientWidth` for the clipped score,
and equal computed gaps for the bench dash. "It looks fine" is what shipped the
current state.

**The one non-functional assertion that matters most** is the persistence
check in step 8. The human's constraint is that trimmed scores must never reach
the database, and the design satisfies it structurally (the trim is a separate
function applied at one call site, and no write path is touched) — but
structural safety is a claim, and criterion 6 asks for it verified. A diff grep
plus a before/after read of the stored JSON is the whole of it.

**What is deliberately not tested:** the other `ScoreLine` callers. They still
show phantom `0-0` sets and that is knowingly left alone here; a test asserting
their current wrong output would have to be deleted by the follow-on branch
that fixes them.
