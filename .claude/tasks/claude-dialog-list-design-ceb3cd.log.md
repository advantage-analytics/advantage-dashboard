# Run log — claude/dialog-list-design-ceb3cd

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Replace the Matches New pill with an unread dot in the row gutter — done

**gate:** mechanical `GATE PASS`; completion `VERDICT: pass`.

**changed:** `NewPill` is gone — `src/components/ui/new-pill.tsx` deleted, its
one import removed. An unread match now draws a 5px `--blue` dot absolutely
positioned at `left-[6px]`, vertically centred, in the row's own `-mx-4 px-4`
padding — outside every grid cell, so no track shifts and the opponent name
keeps one x whether or not the row is unread. Paired with an `sr-only`
"Unread" so the state is not colour-only. Doc comments updated on the `unseen`
prop and on `state-pill.tsx`, which had named `NewPill` as the sanctioned
blue-tinted exception.

The risk on this one was the marker becoming a grid child and sliding every
later cell a track left. Both new elements are `position: absolute` — the
`sr-only` class carries it too, verified against the compiled CSS — so neither
enters grid flow. `match-list-layout.ts` is untouched.

**follow-ups:**

1. The opponent-name wrapper in `match-card-list.tsx` still carries
   `flex items-center gap-2` from when it held the name _and_ the pill. It now
   wraps only the name, so the `gap-2` is inert. Harmless; worth tidying if
   someone is in that block anyway.

## T2 · Draw a free seat as an outline in SeatBoxes — done

**gate:** mechanical `GATE PASS`; completion `VERDICT: pass`.

**changed:** A free seat is now an inset `--ink-300` hairline with no fill,
matching the shape the `held` branch already used. It was `--ink-100` #F3F3F3
drawn on `SeatNote`'s `--surface-subtle` #F5F5F5 panel — two points apart on
every channel, so half the quota was not drawn and a 20-seat program with four
players read as a 5-seat one.

The meter now has one grammar rather than four unrelated treatments: outline
means not spent (grey free, blue held), solid means spent (blue used, 40% blue
adding, `--danger` full). An outline is also ground-independent, which matters
because `SeatBoxes` is drawn on three different backgrounds — `--surface-subtle`
twice, and `SeatPips` in Settings on no fill at all, since `SettingsCard` sets
border and shadow only.

`reference/settings.md` needed amending as a consequence: it said an outlined
seat box stands for an invitation, which stopped being unambiguous once free
seats are outlined too. It now says the colour marks the invite, not the
outline alone. No call site changed.

## T3 · Reconcile the "New is the one blue-tinted pill" rule across the design system — done

**gate:** mechanical `GATE PASS`; completion `VERDICT: pass`.

**changed:** T1 deleted `NewPill`, which made the design system false in seven
places across five files — all of them asserting that "New" is the one
sanctioned blue-tinted pill. Reconciled: the exception is gone rather than
relocated, so the rule simplifies to **every state pill is grey and no pill is
blue-tinted**, owned by Data Table rule 4 in `reference/tables.md` with
one-line pointers from `primitives.md` and the SKILL.md roll-call.

Three of the files had justified themselves by _availability_ — "the
blue-tinted pill is spoken for", "a second blue costs the first its meaning" —
and that argument evaporates once nothing holds the slot, so each now states
the reason instead: blue is action and emphasis, and a pill is a label nobody
can click. Six `_Supersedes (v3): "…"._` notes carry the retired text verbatim;
the reviewer checked each against `git show HEAD:<path>` rather than trusting
the quotes.

Two judgement calls worth keeping. `tables.md`'s retired rule read "Unread is
not a dot and not a column" — only the first half became false, so "and still
not a column" stays live rule, with the dot's position in the row's own padding
written in as its justification, so nobody later promotes it into a track.
And `settings.md`'s `You` ruling contains a long `_The retired rule read "…"_`
historical quote that names "New"; that was left byte-identical, correctly,
with a sentence appended noting its premise has since gone too.

**follow-ups:**

1. `scripts/check-design-drift.mjs` check 7 counts `You` drift, but nothing
   guards against a blue-tinted pill returning. A check failing on
   `--blue-tint-08`/`-10` used as a pill background would make the reconciled
   rule enforceable rather than documentary.
2. The v3 Claude Design project still documents `NewPill`. The repo and the
   project now disagree here — expected, in the repo's favour — but the change
   should be pushed back into the project's `CHANGELOG.md` so a future
   DesignSync round does not reinstate the blue pill.
