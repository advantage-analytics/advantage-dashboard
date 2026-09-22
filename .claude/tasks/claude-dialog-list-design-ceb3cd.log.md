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
