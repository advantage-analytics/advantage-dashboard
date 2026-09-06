# Brief — player-dialogs-ui

## Goal

Make the roster's player dialogs — **Add a Player**, **Invite**, **Edit
Player** — feel like first-class design-system surfaces rather than cramped
forms, give the coach a coherent path when the person they want isn't on the
roster yet, let a new player be placed directly into a lineup spot at add
time, and fix two display defects in the roster drawer.

## Scope

**1. Dialog shell and layout (all three dialogs)**
- Widen and heighten the dialogs so the form breathes; the current width
  leaves fields cramped and the content stranded in a small box.
- Bring the internals in line with the design system: field styling, labels,
  spacing scale, section rhythm, footer button treatment (`advButton()` for
  the primary), type scale, and icon usage.
- Keep the three dialogs visually consistent with each other — same shell,
  same header/footer geometry, same field column.

**2. Invite → Add hand-off**
- In the Invite flow, choosing "someone not on the roster / someone new"
  hands off to the **Add Player** dialog rather than dead-ending.
- Whatever the coach has already typed (name, email) carries across into the
  Add Player form — they should not retype it.

**3. Lineup spot assignment at add time**
- The Add Player dialog can assign the new player to a lineup spot.
- Choosing a spot that is **already occupied is allowed**, but the dialog
  **warns first**: it names the current holder and states what happens to
  them (they are displaced out of the lineup) before the coach confirms.
- No silent overwrite.

**4. Bug — cut-off score in the drawer's recent matches**
- Scores render as `6-4 0-0 0-0`, overflowing and getting clipped.
- Display only the sets that were actually played; unplayed trailing sets are
  not shown.
- **This is a display-layer change only.** The trimmed form must never be
  written back to the database — stored match scores stay exactly as entered.
- Event name treatment may be shortened/truncated as needed so the score is
  not squeezed out.

**5. Bug — uneven spacing around the dash**
- The "Not in the lineup …" text has asymmetric spacing around its `–`.
  Make the spacing even.

## Non-goals

- No redesign of the roster page itself, the roster table, or the drawer
  beyond the two named defects.
- No change to how scores are stored, parsed, or entered.
- No change to invite delivery, email templates, seat reservation, or the
  membership/approval model.
- No new lineup-management UI outside the Add Player dialog; the existing
  lineup surface is untouched.
- No merging of Add and Invite into a single dialog — they stay distinct
  surfaces joined by a hand-off.
- No dark-mode work.

## Constraints

- `.skills/advantage-analytics-design/SKILL.md` is the authoritative build
  reference for anything visual; the DS v3 rules there govern.
- Primary buttons come from `advButton()` — no hand-rolled near-miss, and the
  primary is blue, not black.
- Buttons use `rounded-[6px]`; `rounded-full` is reserved for filter pills,
  tabs, avatars and indicators.
- Displacing a player from a lineup spot touches roster/lineup data — the
  write path must stay RLS-scoped and workspace-scoped, and must respect the
  existing `program_members` role model.
- The right-rail drawer follows the established rail-drawer pattern; the two
  bug fixes must not disturb its shell or selection model.
- `docs/ui-revamp-guardrails.md` applies to dashboard UI changes.

## Success criteria

1. All three dialogs render at a noticeably larger width/height, with DS-
   conformant fields, spacing, type and footer buttons, and read as one
   family.
2. From Invite, selecting "someone new" lands the coach in Add Player with
   their typed name/email pre-filled.
3. Add Player offers a lineup spot; picking an occupied spot shows a warning
   naming the incumbent and what happens to them, and only proceeds on
   confirmation.
4. After the add, the new player holds the spot and the displaced player is
   out of the lineup — reflected correctly on the roster/lineup surface.
5. The drawer's recent matches show only played sets (e.g. `6-4`), fully
   visible with no clipping, at the drawer's real width.
6. Stored score values in the database are byte-identical before and after —
   verified, not assumed.
7. The "Not in the lineup –" text has symmetric spacing around the dash.

## Open questions

- Which lineup model does the roster actually use (singles ladder positions,
  doubles pairings, or both), and is a "spot" one-per-player? Stage 02 must
  resolve this against the live schema before designing the assignment UI.
- Where does a displaced player land — unassigned, or the bottom of the
  ladder? The brief says "out of the lineup"; the exact resting state depends
  on the model above.
- Is there an existing confirm/warning primitive in the DS to reuse for the
  displacement warning (inline banner inside the dialog vs. a second confirm
  step)?
- Does the drawer's recent-match row come from a shared match-summary
  component used elsewhere? If so, trimming must not change the other
  callers' output.

## Also consulted

None beyond the declared inputs. Three ambiguities in the seed were resolved
by asking the human in chat: the incomplete lineup-spot sentence (→ displace
with a warning), the invite redirect question (→ yes, hand off to Add
carrying typed input), and the score display (→ show only played sets, and
never persist the trimmed form).
