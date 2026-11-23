# Loading and Empty States

> Part of the Advantage Analytics design system. Read
> `.skills/advantage-analytics-design/SKILL.md` first — it carries the Banned
> list, the precedence rule and the routing table into this directory.

### Loading Skeleton

Build every skeleton from the three primitives in
`src/components/dashboard/loading/pending.tsx`; never hand-write a bar.

- **`PendingBar`** — one bar: `--surface-skeleton`, `rounded-[3px]`,
  `motion-safe:animate-pulse`, `aria-hidden`. Size it with classes (`h-2`–`h-9`,
  proportional widths such as `w-24`, `w-32`, `w-40`).
- **`PendingRegion`** — a card or region: the one `role="status"`, labelled
  "Loading <region>", with every bar under an `aria-hidden` wrapper.
- **`PendingFrame`** — a route's `loading.tsx`: the same status on the page's
  white ground. It pulses as one by default; `pulse={false}` when it holds real
  text, so the text renders still and only the bars pulse.

The colour is the `--surface-skeleton` token, never a hex, and the pulse is
always `motion-safe:animate-pulse`. `tests/skeleton-primitives.spec.ts` fails
any file outside `pending.tsx` that writes either by hand.

**Carbon and this system.** The
[Carbon loading pattern](https://carbondesignsystem.com/patterns/loading-pattern/)
is the reference; where it differs, this system wins.

- Skeletons for container and page loads, mirroring the loaded layout, so
  nothing jumps when the data lands.
- Chrome the page already knows (titles, eyebrows, column labels, step names)
  renders as real text; only what is arriving is a bar.
- The spinner only for blocking actions and inline button states — never a
  page load, never inside a card.
- Pulse, where Carbon shimmers.
- A token, never a hex.
- One `role="status"` per region, never one per bar.

**A list's skeleton remembers its size.** A skeleton shows before the server
has counted anything, so the only way it can draw the right number of rows is
from memory. Every list that loads behind a skeleton records what it drew and
reads it back next time, through `src/components/dashboard/loading/shape-memory.ts`
(`useRememberShape` in the loaded view, `useRecalledShape` in the skeleton).
The store is `localStorage`, per device and per workspace; never a cookie, a
server read or a guess from another list.

- **What to remember:** whatever changes the skeleton's height or structure —
  a row count, plus any section that appears only sometimes (the Roster's
  bench divider and Invited rows, the Matches Date track's year, a second
  page). Never content: no names, scores or figures.
- **One small file per surface**, beside the list it describes, holding the
  shape's type, its validator and its default: `matches/matches-shape-memory.ts`,
  `team/roster-shape-memory.tsx`, `opponents/opponents-shape-memory.ts`,
  `home-feed/home-shape-memory.tsx` (one count per Home list: matches,
  players, numbers).
- **Validate what you read.** Pass an `isShape` guard built on `isCount`, so a
  value written by an older build or edited by hand falls back to the default.
- **The default is a mid-sized list**, used on a device that has never
  rendered the page. A hard load renders the default on the server and swaps
  to the remembered shape at hydration.
- **A list that was empty** comes back as its empty state's own ghost rows
  (three), not as zero rows and not as the default.
- **Rows take the loaded row's shape:** the same height, the same leading
  block (a 78×44 still, a 32px avatar) and the same two lines, so the frame
  holds when the data lands.
- **Size it before the first paint where the data can beat hydration.** On a
  hard load a streamed region often resolves before React hydrates, so a
  skeleton that learns its size at hydration draws the default and then jumps
  by a row. Where that happens (the Home lists), the server renders every row
  the list could have and a script inline in the same HTML hides the extras
  from `localStorage` before paint; once hydrated, the count is read directly
  (`HomeListPending` in `home-feed/home-shape-memory.tsx`).
- **Chrome the server draws must know its own state.** A preference that
  changes the frame (the sidebar's width) cannot live only in `localStorage`:
  the server would draw the default and the page would slide when the client
  corrected it. Mirror what is on screen into a cookie the layout reads
  (`SIDEBAR_COOKIE`, `sidebar/sidebar-cookie.ts`); `localStorage` stays the
  preference.
- **Text placeholders keep the text's line box.** A bar standing for a line of
  type sits in a box of that line's height (`h-[1.2em]` on the type class, or
  the line-height in px), never a bare bar with a gap — the difference is what
  moves everything beneath it when the words land.
- A server-rendered list records through a client component that renders
  nothing (`RememberRosterShape`, `RememberHomeRows`).

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
above a 24px statement reads undersized. And a blue-tinted pill is not an
option — not because it is taken, but because the system has none: every pill
is grey (Data Table rule 4). Blue marks action and emphasis, and a page's
condition is neither.
_Supersedes (v3): "The blue-tinted pill is spoken for: it belongs to "New" and
to nothing else, and a second blue pill costs the first its meaning."_ "New" is
no longer a pill at all — it is a 5px `--blue` dot after the opponent's name in the Matches row.

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
