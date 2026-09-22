# Loading and Empty States

> Part of the Advantage Analytics design system. Read
> `.skills/advantage-analytics-design/SKILL.md` first — it carries the Banned
> list, the precedence rule and the routing table into this directory.

### Loading Skeleton

```
bg-[#F0F0F0] rounded animate-pulse
// Various heights: h-2.5, h-3, h-4, h-5
// Proportional widths: w-24, w-32, w-40
```

**A skeleton is a promise that something is arriving.** It belongs to a
request that will resolve — a fetch in flight, a page mounting. It never
stands in for data that does not exist, because a shape that says "loading"
when the truth is "nothing here yet" is a status message that is not true,
and a reader who waits for it to resolve concludes the page is broken. Empty
is a different state with a different pattern; see below.

### Empty State

**Three things can fill a region with no data, and only one of them is
right.**

1. **Honest zero state — use this.** Render what the region will be, holding
   nothing: the card, its eyebrow, its axis and column labels, and a mark
   where each value goes. Say what will appear here and give one way to make
   it appear. The labels are the payload — a player who reads "break points
   saved" knows what comes back without a figure being invented.
2. **Skeleton — never.** See above. Reserved for loading.
3. **Sample or demo data — never in the user's own workspace.** A fabricated
   number is a claim about this account, and on the day the real one lands at
   a different value the page has already told them a different story. The
   one defensible form is a single, clearly quoted **example** carrying its
   own label in the card header, and it does not scale past one card — a
   marker under a screen of confident-looking figures survives neither a skim
   nor a screenshot. Even at one card it is expensive: it was built for Home's
   Focus card and rejected, because a card showing finished prose sits
   visibly apart from neighbours that all show structure. Prefer the card's
   own anatomy, empty.

**A zero is not a blank.** Write `—` where a value is unmeasured; `0%` is a
statement about the athlete, `—` is not. `0` is correct only when zero is the
measured answer.

**Scale the treatment down as the region does.** One page-level path to first
data beats six illustrated cards; a dashboard of empty widgets goes text-only
rather than repeating an icon per card (see Icons → 28–32px empty states for
the one-icon case).

**Never show an empty state for something that exists but is unavailable.** A
match still analysing gets progress, not an empty chart — an empty serve
chart reads as "you hit no serves". `matches/[matchId]/page.tsx` short-circuits
to the hero + `MatchAnalysisProgress` for exactly this reason.

```
flex flex-col items-center justify-center py-12 px-6 text-center
// Icon container: bg-[#F5F5F5] p-4 rounded-full
// Icon: h-8 w-8 text-[#888888]
// Title: text-[#0D0D0D]
// Description: text-[12px] text-[#888888]
```

This centred recipe is the **small-region** form — a card or a list with
nothing in it, reached from a populated page. A whole personal page with no
data is a different composition — the offer over the page's own dimmed shape:
Personal Home Recipes → Day zero for Home, Data Table → Table page states for
a list.

**Three states, three treatments — never borrow one for another.**

| The page is                                       | Treatment                                                          | Shipped                                                                                                                       |
| ------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| built, no data yet (**day zero**)                 | the offer over the page's own shape, dimmed and `inert`            | `home/day-zero-home.tsx`, `matches/matches-day-zero.tsx`, `schedule/static/schedule-day-zero.tsx`, `team/roster-day-zero.tsx` |
| built, no data, and its shape is too dense to dim | the offer, then a labelled run naming what arrives                 | _(no shipped example — Statistics held this slot until the page went back to coming-soon)_                                    |
| **not built yet**                                 | "Coming soon", one statement, one way onward — **no shape at all** | `dashboard/coming-soon.tsx`                                                                                                   |

The last row is the one that gets confused. A feature that does not exist has
no shape, so a dimmed mock-up of one invents a layout that may never ship —
the same fabrication these rules exist to prevent — and a reader who cannot
tell "nothing here yet" from "not built yet" will wait for data that is not
coming. **A page counts as not built until it is finalised, not until it
renders**: Statistics ran with every component wired and was still moved back
here, because a day-zero offer on a page whose shape is unsettled promises a
layout it cannot keep.

_The shape_ (`dashboard/coming-soon.tsx`): one **48ch** column, centred, the
statement and the sentence sharing that measure. Held narrower — a 22ch
heading over a 46ch paragraph — the block reads pinched: a wide line over a
narrow one over a wide one. At 48ch the statement sits on **one line** and the
sentence on two, and **keeping every heading to one line is part of the
template**, not an accident of the copy. The statement is `text-title-lg`
under the page's own 30px h1, because two headings a hair apart read as a
mistake; the sentence is `text-body` at 1.7, not `text-body-sm`, which was the
fine-print step doing the work of body copy.

_The marker_ is a **24px outlined pill** — hairline border, no fill, ink-600 at
11/500 — and the three alternatives were each rejected for a reason worth
keeping. An eyebrow labels a SECTION; this labels the page's condition. Grey
`StatePill` is the right register but is sized for a table row, and 18px alone
above a 24px statement reads undersized. The blue-tinted pill is spoken for:
it belongs to "New" and to nothing else, and a second blue pill costs the
first its meaning.

The middle row is a judgement, not a loophole: Home dims one card and one row
because those are shapes worth previewing, and Statistics does not because
twenty-one stat components as grey rules is a screen of noise (Carbon says the
same — a dashboard of empty widgets goes text-only rather than repeating a
treatment per region). Where the shape is skipped, the labelled run carries
the promise instead — Statistics names serve, return, rally and trends, which
is what a report will hold, with no figure invented.

All three share the offer's own words wherever a match is what is missing:
`DayZeroOffer` takes a headline and measure, and everything beneath the
sentence is byte-identical across Home, Matches and Statistics.
