# Design — eyebrow text wrap on the claim status and setup screens

## The measurement everything follows from

The brief estimated the eyebrow at roughly 9px per character. Measured in a
real browser with Inter 500 at the token's 10px and 2.5px tracking, uppercase,
it is **8.0–8.5px per character**, and the worst case is 8.53. That number
turns the brief's open questions into arithmetic.

| String | Chars | Rendered | Status column (492px) | Setup column (612px) |
|---|---|---|---|---|
| Worst 4-field, JUCO conference | 136 | 1,134px | no | no |
| Median 4-field | 76 | 623px | no | no |
| Worst 3-field, no conference | 74 | 616px | no | no (by 4px) |
| **Longest school name, alone** | 58 | **495px** | **no (by 3px)** | yes |
| Typical 3-field | 37 | 302px | yes | yes |

The fourth row is the finding that settles the design. On the unclaimed status
screen the longest school's own name — "North Carolina Agricultural and
Technical State University" — is 495px wide in a 492px column, with no squad,
no division and no conference beside it. **No amount of distilling can keep
that eyebrow on one line in that column**, because the only field left to cut
is the school's identity on the screen that asks someone to claim it.

Equally, the first row rules out layout alone: 1,134px overruns even the full
1000px shell. The brief's "layout or content?" is answered *both*, and the
evidence for each is independent.

## Approaches considered

**A. Content only — drop conference from the status eyebrow.**
Brings the status eyebrow to the setup screen's composition, which already
drops conference on purpose. Median falls from 76 to 38 characters. Rejected
as insufficient: the worst 3-field is still 616px against a 492px column, and
495px of bare school name overruns it regardless. Would fix roughly 93% of
programs and leave the wrap in place for the rest.

**B. Layout only — give the heading the full shell width.**
Hoists the eyebrow out of the column the aside narrows, from 492px to 840px on
the status screen and 612px to 1000px on setup. Rejected as insufficient: the
worst 4-field eyebrow is 1,134px and fits neither. Would fix most programs and
fail conspicuously on exactly the JUCO community colleges whose conference
names are the problem.

**C. Content plus layout — recommended.**
Drop conference on the status screen *and* hoist the heading to full shell
width on both. Worst case after both changes is 616px against an 840px budget,
leaving 224px of headroom. Every one of the 1,941 programs in the live table
fits on one line at 768px and above.

**D. Shrink the type.** Rejected outright. `.eyebrow-sm` at 9px buys about 10%,
which does not rescue 1,134px, and the token is shared with auth, dashboard and
join surfaces. The brief rules the token out of scope.

## Chosen design

### Architecture

Two changes, each small and independently sound.

1. **`ClaimShell` gains an optional `heading` slot** rendered above the
   two-column grid, at the shell's full width rather than inside the column the
   aside narrows.
2. **The unclaimed status eyebrow drops conference**, becoming the same three
   fields the setup screen already composes.

Neither introduces state, a query, or a schema change. No migration.

### Components

**`src/components/claim/claim-shell.tsx`** — add `heading?: React.ReactNode` to
`ClaimShell`. The body becomes a flex column carrying the existing `gap`, with
`{heading}` above the grid-or-column that renders today:

```
<div style={{ maxWidth: width }}>
  <div className="flex flex-col" style={{ gap }}>
    {heading}
    {aside ? <grid>…</grid> : <ClaimColumn gap={gap}>{children}</ClaimColumn>}
  </div>
</div>
```

The gap between the hoisted heading and what follows is the same `gap` that
separates blocks inside the column today — 16 on both screens — so the change
adds no vertical space, which is one of the brief's success criteria. When
`heading` is absent the wrapper holds a single child and nothing moves, so the
five claim screens that do not opt in are untouched.

The aside's `items-start` alignment now tops out against the body copy rather
than the page eyebrow. That is the one deliberate visual consequence.

**`src/app/claim/[programKey]/page.tsx`** — the F3.2 unclaimed branch only.
Move its `ClaimHeading` from `children` into `heading=`, and give that branch
its own three-field eyebrow.

The `eyebrow` const at line 48 is shared by all three states this file renders,
and the other two — "Being set up now" and "<owner> manages Advantage here" —
are outside the brief's scope. So the unclaimed branch composes its own,
alongside a comment saying why there are two. Rewriting the shared const would
silently change two screens nobody asked about.

**`src/app/claim/[programKey]/setup/page.tsx`** — move `ClaimHeading` into
`heading=`. Its eyebrow already omits conference and needs no content change;
it needs the width, because its worst case misses its column by 4px.

**`src/lib/data/programs-server.ts`** — add a small pure helper beside the
label functions already there:

```ts
export function programEyebrow(
  schoolName: string,
  team: string,
  division: string | null
): string
```

composing `school · squad · division` with the existing `teamLabel` and
`divisionLabel`. Two pages compose these same three fields from differently
named columns (`schoolName` vs `school_name`), and the regression test below
needs one importable unit to assert against. `programSubtitle` stays exactly as
it is — the object, request and search surfaces still use it.

### Data flow

Unchanged. Both pages are Server Components that already read the program row
they need, the status page through `getProgramPublicStatus()` and the setup
page through a four-column `programs` select. The eyebrow is composed from
columns already in hand and passed down as a string. Nothing new is fetched,
and nothing reaches a client component.

### Error handling

- A null division already falls out through `.filter(Boolean)`, and
  `programEyebrow` keeps that behaviour, so a program with no division renders
  `school · squad` rather than a trailing separator.
- No `white-space: nowrap` is added. A future school name past roughly 97
  characters would wrap rather than overflow its container or be clipped —
  degradation stays graceful, and the test below is what catches it before a
  user does.
- Truncation remains excluded, per the brief.

### Viewport guarantee, stated honestly

The claim flow mounts no mobile gate; `MobileGate` is dashboard-only. These
pages are reachable on a phone, and there the guarantee cannot hold.

| Viewport | Content width | Programs fitting on one line |
|---|---|---|
| 840px shell, hoisted | 840px | 1,941 of 1,941 |
| 768px tablet | ~688px | 1,941 of 1,941 |
| 430px phone | ~382px | 1,770 of 1,941 |
| 390px phone | ~342px | 1,319 of 1,941 (68%) |

At 390px even a bare 58-character school name is 495px, so no composition of
real fields fits every program on a phone. **The design guarantees one line at
768px and above**, which covers the two-column frames the bug was reported
against and every desktop viewport. Below that, the long tail wraps, and it
wraps onto a second line of eyebrow rather than breaking the layout. Changing
that would mean per-breakpoint tracking, which is a token change the brief
excludes — carried as an open question rather than built.

### Testing

A node-level Playwright spec, `tests/claim-eyebrow-width.spec.ts`, following
the live-database pattern in `tests/fixtures/live-db.ts` including its skip
guard. The live table is the only honest source for a long-tail assertion; a
fixture would encode today's longest name and stop being a guard the moment a
longer program is added.

- Compose `programEyebrow()` for every row in `programs` and assert each result
  is at most **97 characters** — 840px divided by the measured 8.6px worst-case
  per character, with the constant and its provenance in a comment. Current
  worst is 74, so the test passes with room and fails when a school name lands
  that would wrap on the desktop frames.
- Assert `programEyebrow()` never includes conference, which is the property
  that keeps the 1,134px case from returning.
- Visual check during the build, not automated: the two worst rows —
  North Carolina A&T and Mississippi Gulf Coast Community College — on both
  screens at 1280px and 768px.

`docs/ui-revamp-guardrails.md` does not apply: it governs dashboard UI and the
upload wizard, and nothing here touches either. No RLS surface changes.

## Open questions

1. **Four programs lose their only disambiguator.** Exactly two groups collide
   on school, squad and division: Glendale Community College men's and women's
   JUCO exist twice, one in the Western State Conference and one in Arizona's
   ACCAC. Conference is the only field telling them apart. The design accepts
   this — the page is reached by program key from a search result that shows
   conference, and the body copy names the school — but it is a real 0.2%
   ambiguity on a screen where claiming the wrong program matters. Overrule
   this if those four are worth a special case.
2. **Phone behaviour below 768px.** Accepted as wrapping for 32% of programs at
   390px. The alternative is reduced tracking under `sm`, which is a token
   change. Say so if the phone matters enough to reopen that.
3. **The screens this deliberately leaves wrapped.** "Being set up now" and
   "<owner> manages Advantage here" share the status route and still carry the
   full four-field eyebrow in a 720px single column, as do the object and
   request screens. All four are worse off than the two being fixed. They are
   out of scope by the brief and want their own branch.

Resolved from the brief: the grey card is the `AsidePanel` beside the heading,
not a terms card, and centring it is not the fix — hoisting the heading above
it is. "Layout or content" is both, for independent measured reasons.

## Also consulted

Beyond the declared inputs (`brief.md`, `MAP.md`):

- `src/components/claim/claim-shell.tsx` — the shell, grid and heading it
  changes.
- `src/app/claim/[programKey]/page.tsx`, `.../setup/page.tsx` — the two pages,
  and the three states the first one renders.
- `src/app/claim/[programKey]/{object,request}/page.tsx`,
  `src/components/claim/program-search.tsx`,
  `src/components/dashboard/schedule/static/dual-build-step.tsx` — every other
  `programSubtitle` caller, to confirm the helper stays.
- `src/lib/data/programs-server.ts` — `teamLabel`, `divisionLabel`,
  `programSubtitle`.
- `src/styles/design-system/typography.css` — `.eyebrow` (10px/500/2.5px) and
  `.text-title-lg`.
- `src/app/layout.tsx` — Inter weights, to measure the right face.
- `.skills/advantage-analytics-design/SKILL.md` — eyebrow grammar; the "Next ·
  B1G Conference" recipe is the precedent for a field appearing only when it
  earns its place.
- `src/components/dashboard/mobile-gate.tsx`,
  `src/components/dashboard/dashboard-shell.tsx` — to establish that the claim
  flow has no mobile gate.
- `tests/fixtures/live-db.ts`, `tests/schedule-static-copy.spec.ts` — the spec
  patterns the new test follows.
- The live `programs` table via the Supabase MCP — length distributions, the
  collision check, and the per-viewport fit counts.
- A throwaway measurement page rendering the real strings in Inter 500 at the
  token's metrics, driven through Playwright. It was deleted after measuring;
  the numbers it produced are the table at the top.
