# Brief — eyebrow text wrap on the claim status and setup screens

## Goal

The program eyebrow above "No one has set this up yet" and "Set up <school>
<squad> tennis" must render on one line. Today it wraps onto a second row,
which breaks the tight eyebrow → title pair those screens are built on: the
heading block sets a 2px gap and lets the title carry its own top padding
precisely so the two lines read as one unit, and a wrapped eyebrow puts a
second line of tracked-out uppercase inside that gap.

## Scope

Two screens, both rendering `ClaimHeading` with a `.eyebrow` label composed
from live `programs` columns:

- **Unclaimed status** — `src/app/claim/[programKey]/page.tsx:146`, the F3.2
  branch titled "No one has set this up yet". Its eyebrow is school · squad ·
  division · conference. The page runs an 840px shell with a 300px aside, so
  the eyebrow's column is roughly 490px.
- **Setup** — `src/app/claim/[programKey]/setup/page.tsx:56`, titled
  "Set up <school> <squad> tennis". Its eyebrow is school · squad · division,
  already one field shorter by deliberate choice. The page runs a 1000px shell
  with a 340px aside, so its column is roughly 610px.

### What the data says

The seed says "sometimes". For the status screen that is generous — the wrap
is close to universal, and only the setup screen is genuinely occasional.
Measured against all 1,941 rows in the live `programs` table:

| Eyebrow | Median chars | Max chars | Over 50 chars | Over 60 chars |
|---|---|---|---|---|
| Status (4 fields) | 75 | 136 | 1,895 | 1,744 |
| Setup (3 fields) | 38 | 74 | 134 | 5 |

`.eyebrow` is 10px uppercase at 2.5px letter-spacing, so each character costs
roughly 9px including tracking. A 490px column therefore holds somewhere near
55 characters. At a median of 75 the status eyebrow overruns its column for
nine programs in ten, and the worst case is a full conference name:
"Region 23 - Mississippi Association of Community Colleges Conference (MACCC)"
alone is longer than the column it has to fit in.

The setup eyebrow is close to correct as built. Its median of 38 fits with room
to spare; only the longest school names — "North Carolina Agricultural and
Technical State University" at 74 characters — exceed their column.

This asymmetry matters for stage 02: the two screens do not have the same
problem. One eyebrow carries a field it cannot afford, and the other is
occasionally defeated by a long school name.

## Non-goals

- Other claim screens. `object/page.tsx` and `request/page.tsx` build the same
  four-field eyebrow and are likely worse off, both being single-column 720px
  screens, but the seed names two titles and they get their own branch.
- The `.eyebrow` type token itself. It is used across auth, dashboard and join
  surfaces; changing 10px/2.5px to fix two claim pages would move type
  everywhere.
- The aside panels' own content. "What you take on" and the setup asides are
  not in question, only whether their column placement is what starves the
  eyebrow.
- Truncation with an ellipsis. Cutting a school's own name mid-word on the
  screen that asks someone to claim that school is a worse failure than the
  wrap, so it is out of bounds as an answer.

## Constraints

- `ClaimHeading` is shared by seven claim screens. A change to the component
  rather than to its callers lands on all of them.
- The eyebrow's content is real data, not copy. School and conference names
  arrive from the `programs` table and cannot be shortened by editing a string.
- Division already passes through a label map (`D1` → `D-I`); conference does
  not, and arrives verbatim including parentheticals and "Region 23 - " style
  prefixes.
- The design system's ladder is fixed: eyebrow → `text-title-lg` → body, Inter
  only, no new type sizes.
- Both screens are two-column at `lg` and single-column below it, so any answer
  has to hold at both breakpoints — the narrow viewport gives the eyebrow more
  width, not less, since the aside drops below.

## Success criteria

- On both named screens the eyebrow occupies exactly one line at every viewport
  the pages support.
- It still identifies the program unambiguously — a coach who runs both squads
  can tell which roster the screen concerns.
- The eyebrow → title gap still reads as one unit; no new vertical space is
  introduced above the title.
- Verified against the real long tail, not a short fixture: the JUCO conference
  names and the longest university names above are the cases to check.
- No change to the `.eyebrow` token or to claim screens outside the two named.

## Open questions

1. **Which grey card does the seed mean?** Read here as the grey `AsidePanel`
   to the right of the heading — "What you take on" on the unclaimed screen,
   the setup asides on the other. There is no grey card called "terms" on
   either screen; the join flow's sharing terms are a different surface
   entirely. If something else was meant, stage 02 needs to know before it
   picks an approach.
2. **Layout or content?** The seed offers both: centre the grey card, or distil
   the eyebrow. The measurements suggest a layout change alone cannot rescue a
   136-character eyebrow — even the full 840px shell is short of it — while
   content alone may be enough. Stage 02 decides, and may well answer
   differently per screen given the asymmetry above.
3. **Is conference load-bearing on the unclaimed screen?** It is the one field
   the setup screen already drops, and its own comment explains why: by that
   point the program is chosen. Whether the status screen still needs it to
   disambiguate is a product question, not a layout one.
4. **Should the same answer reach the two sibling screens?** Deliberately out
   of scope, but if stage 02's answer is a component-level change they will
   inherit it whether or not that is intended.

## Also consulted

Beyond the declared inputs, to verify specific facts:

- `src/app/claim/[programKey]/page.tsx`, `.../setup/page.tsx` — which strings,
  which eyebrow fields, which shell widths.
- `src/components/claim/claim-shell.tsx` — `ClaimHeading` structure, the aside
  grid, the width and gap vocabulary.
- `src/styles/design-system/typography.css` — the `.eyebrow` token.
- `src/lib/data/programs-server.ts` — `teamLabel`, `divisionLabel`,
  `programSubtitle`, and the division label map.
- `src/app/claim/[programKey]/{object,request}/page.tsx` — to confirm the
  sibling screens share the composition and are out of scope.
- `src/components/claim/setup-form.tsx` — the setup asides, to identify the
  grey card.
- `src/components/join/join-terms.tsx` — to rule it out as the "terms card".
- The live `programs` table via the Supabase MCP, for the length table above.
