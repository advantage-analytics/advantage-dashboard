# Video tab in-shell — H1 handoff, phase 1

Source: Claude Design project `afde9116-328b-445c-aeff-8b3c2a702d6f`, file
`H1 - Handoff - Video tab in-shell.dc.html`, extracted 2026-09-20. The frames are checked in
beside this file in [`2026-09-20-video-tab-in-shell-h1/`](2026-09-20-video-tab-in-shell-h1/) —
inline styles there are the measurements. **Read the frame for your surface before writing any
px, ink or radius value**; this document paraphrases, the frame does not. Where a fragment
(A/B/C) and a route frame (E: P1/P2) disagree, **the route frame is the build target**.

| Frame file                   | Holds                                                           |
| ---------------------------- | --------------------------------------------------------------- |
| `E-route-P1-P2.html`         | The whole route at 1440: rail open (P1) and rail collapsed (P2) |
| `A-point-list-P1-P5.html`    | Point list: resting, cut applied, quick menu, Advanced, zeros   |
| `B-current-point-T1-T2.html` | "Current point" widget: five and eight columns                  |
| `C-no-film.html`             | The no-film refusals                                            |
| `D-phase2-inherits.html`     | Which pieces fullscreen reuses (tone prop)                      |
| `render-vals.txt`            | Sample rows and the copy tables the `{{ }}` bindings resolve to |

Scope: `src/components/dashboard/matches/match-detail/film/*`, entry `film-tab.tsx`.
`report-view.ts` and the view switcher are unchanged. The fullscreen room (FS1–FS11) is phase 2
and is **not** redesigned here.

## Settled mismatches between the handoff and the codebase

- The handoff writes `?tab=video`. The real param is **`?tab=film`** (`report-view.ts`); keep it.
- `film/filters/types.ts` does not exist yet; the fifteen axes live in `film-filters.tsx`. Step 1
  creates that path.
- "Doesn't look right? Edit this point" is **omitted** — no edit flow exists. The footer carries
  only `N shots · Ns · {how it ended}`.
- Keyboard: **↑/← step to the previous point, ↓/→ to the next**, both under the applied cut.
  ±5 s seek moves to **J / L**. Same mapping in the fullscreen room so the two hosts agree.
- Saved stays the existing `points.saved` boolean. Per-user saves are a follow-up; no migration.
- No-film headings map onto existing conditions only (table below). There is no "permission
  withdrawn" condition in the code and none is added.
- The "Analysis still running" list zero state is **not built**: `matches/[matchId]/page.tsx`
  short-circuits the whole pane to `MatchAnalysisProgress` while a match is analysing, so the
  list can never be in that state.
- Row title/detail follow frame P1 (`Forehand Winner` / `Topspin Deep cross · Breakpoint`), not
  fragment A's `{result} · {player} {stroke}`.

## Rules that apply to every task

- Read `.skills/advantage-analytics-design/SKILL.md` first, then only the reference files the
  surface needs. DS type classes are unlayered and beat Tailwind colour utilities — override
  colour with inline `style`.
- `docs/ui-revamp-guardrails.md` §4: player names and you/opponent come from `useMatchSides()`,
  never from player1/player2 order. §1: the file is "the match video", never a highlight or cut.
- Buttons: `advButton()` from `src/lib/ui/adv-button.ts`. Buttons are `rounded-[6px]`;
  `rounded-full` is for pills, tabs, avatars, indicators.
- Motion: 200ms `--ease-primary`; `prefers-reduced-motion` drops movement, keeps reveals.
- One selected-point store. `FilmRoom` in `film-tab.tsx` already owns points, filters, playhead
  and the single `useAttachmentPlayback` hook — add to it, do not create a second store.
- The film never pauses or reloads because of a filter operation.

## A — Point list (`point-list.tsx`, `film-quick-filters.tsx`, new `film-advanced-panel.tsx`)

**P1 resting.** Card 320px fixed (the column width comes from `film-tab.tsx`), pane height,
`padding:10px 8px`. Header = 28px trigger + hairline; the header does not scroll, the list does.
Rows 52px min, 12px side padding, 8px radius. Group caption 9px mono, 1.4px tracking
(`Set 2 · Game 7` left, `3-3 · Reid serves` right — already built). Mark = 30px square on 6px
radius (a point is an event, not a person). Row click seeks and selects; playing row carries the
2px blue progress rule at its foot and `surface-subtle`. Hover/focus-within slides the score 26px
left and reveals the bookmark, no layout shift. Score = the score after the point, tabular.
_Accept:_ count reads `174 / 174` unfiltered · **no Saved pill and no applied-filter strip
anywhere in the column** · the list scrolls, the header does not.

**P2 cut applied.** The header gains a 22px X between trigger and count; nothing else moves. The
glyph turns `--blue`, the label becomes the cut's name. The header IS the applied-filter strip —
no chips row. X clears every axis at once, including Advanced. Count is `matched / total`, always
both. Quick cut lives in the URL (`?tab=film&cut=break`, `cut=saved`, `serve=you|opp`) so a
shared link opens on the same cut; Advanced axes are session state, not URL.
_Accept:_ applying a cut never pauses or reloads the film · the playing point stays selected even
when the cut excludes it, and the count does not lie about it.

**P3 quick menu.** One surface: `ui/float-menu.tsx` — 284px, 12px radius, 5px inset, hairline
border, `--shadow-dropdown`, 6px under the trigger, left-aligned. Rows 7/9px padding, 12px label,
11px ink-500 second line only where the label alone is not enough, 12px blue check. Two radio
groups — **Show points** (All points · Break points "Points that could break serve" · Saved
only) and **Serve** (Either · {You} serving · {Opp} serving); within a group replaces, across
groups composes. "Advanced filters…" swaps the column to P4 — not a nested menu. Esc and
click-outside close; trigger holds `aria-expanded` and flips to chevron-up. Closing note is a
`FloatMenuNote`: "Filters apply to ↑↓ as well as the list."
`FilmQuickFilters` is lifted out of the fullscreen scope: **one component, `tone="light" |
"dark"`, two token sets**. Dark keeps today's `FilmDarkMenu` look.
_Accept:_ no uppercase eyebrows in the menu · the closing note is a `FloatMenuNote`, not a row.

**P4 Advanced, in the column.** Takes the list's own column — no modal, no overlay. 40px title
row (label + count + 24px X), scrolling section stack with `scrollbar-gutter:stable`, 42px
section rows, 52px footer over a hairline. Expanded section: 10px group captions, 26px count
pills, 6px gaps, 16px bottom pad. Six sections — **Score · Serve · Return · Rally · Result ·
Court** — over the fifteen axes. Every option is a pill carrying its count: segmented controls,
native selects and checkboxes are retired here. Summary is blue when the section is set, ink-400
"Any" when not. "Any" is nothing selected — there is no Any option to click. Counts are live
against the other applied axes; a zero-count pill is disabled, not hidden. Apply commits and
returns to P2. Clear all resets every axis and the quick cut together. Footer: `51 of 174`.
_Accept:_ Apply is dead until a value differs from what is applied · sections remember their
open/closed state for the session · nothing here exists as a chip strip outside this panel.
The shell's `FilmFiltersPanel` popover is removed; `film-advanced-filters-dialog.tsx` stays, for
fullscreen only.

**P5 zero states.** The header and its count stay drawn in all of them. No skeleton rows, no
sample points. ↑↓ do nothing rather than wrapping to a hidden point.

| When                      | Header · count         | Title                                | Body                                                                                                              | Action                                                                |
| ------------------------- | ---------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Cut matches nothing       | cut name · `0 / 174`   | No points match this cut             | States the cut in words, e.g. "Nothing in this match was a break point on Reid’s serve." (from `describeFilmCut`) | Clear the cut                                                         |
| Saved only, nothing saved | Saved only · `0 / 174` | You haven’t saved a point yet        | Hover a point and press the bookmark, or press S while it plays.                                                  | Show all points                                                       |
| Film has no point data    | All points · `0 / 0`   | No points were detected in this film | The recording plays, but nothing in it could be broken into points. Camera placement is the usual reason.         | "Recording requirements" only if a help destination exists; else none |

## B — Current point (`film-this-point.tsx`)

Card `padding:10px 8px 8px`. Head = "Current point" eyebrow with the 28px point stepper
right-aligned (`‹ 96 / 174 ›`), no rule under it. Header row of 10px ink-400 labels over a
hairline; 40px rows at 8px radius; hairline footer `5 shots · 14s · Unforced error`. Column gap
20px throughout. Placement takes the one fluid track; Mph is tabular and right-aligned.

- Rail open: `# · Player · Stroke · Placement · Result`.
- Rail collapsed (⌘\, 168px returned): `# · Player · Spin · Stroke · Type · Placement · Mph ·
Result`. Columns are **added and removed, never re-sorted**; the five shared columns hold the
  same x in both states.
- Drive the switch with a container query on the report pane (`@container` on
  `match-report.tsx`), not by reading sidebar state — pick the breakpoint that separates the two
  rail states at a 1440 viewport and say which in the commit.
- Row 1's Stroke reads `Serve`; later rows the bare stroke. Unmeasured speed, spin or placement
  is an ink-400 em dash, never `0`.
- Stepper walks points under the applied cut via the same `player.step` the transport uses. Row
  click seeks the film to that shot.
- Removed: the "Open in the room" button (fullscreen is entered from the player's own maximize
  control), the prose line, the embedded `PointRow`, and any "Edit this point" link.

_Accept:_ toggling the rail adds columns without moving the five · a two-shot point (ace, double
fault) draws the same head and one or two rows, never an empty state · the rail toggle's label
and tooltip say nothing about columns.

## C — No film to watch (`film-unavailable-state.tsx`, `film-player.tsx`)

Left-aligned, top-weighted in the pane — not a centred column, **no icon**. 16px heading, 12px
body on 56ch, 32px buttons 12px apart. Rail, header and view switcher all stay; the player, point
list and Current point are absent, not empty. Condition is already resolved server-side.

| Existing condition                          | Heading                          | Body                                                                                                         | Buttons                                  |
| ------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| `stale`                                     | This video is no longer attached | The recording was removed from this match. The statistics and visualizations computed from it are unchanged. | ghost "Back to the report"               |
| `unavailable` (attachment present, unknown) | The video could not be reached   | Storage did not answer. Nothing has been lost — the recording is still attached to this match.               | ghost "Back to the report" · "Try again" |
| in-player load failure (`playback.problem`) | The film stopped loading         | The stream broke partway through. Your position is kept.                                                     | the player's existing retry, "Try again" |

"Back to the report" goes to the Statistics view of the same match. "Try again" on the page
condition is `router.refresh()`. `FilmEntryActions` stays for owners. `film-empty-state.tsx`
("No video for this match" / Add video) is unchanged. Keep the copy in one exported table so
phase 2's FS10 reads the same strings.

## Steps

1. Extract the filter model to `film/filters/types.ts` (re-export from `film-filters.tsx`); add
   `cutName`, per-option live counts, `parseCut`/`serializeCut`; unit spec.
2. `FilmQuickFilters` tone prop + light variant through `ui/float-menu.tsx`; `savedOnly` joins
   the filter object so stepping honours it; fullscreen passes `tone="dark"`.
3. Point list header, rows and the three zero states (section A: P1, P2, P5).
4. Advanced panel in the column (P4); remove the shell popover.
5. Quick cut in the URL via `window.history.replaceState` (check
   `node_modules/next/dist/docs` for the Next 16 pattern first).
6. Current point widget (section B).
7. Keyboard mapping in `film-tab.tsx` and `film-fullscreen.tsx`.
8. No-film refusals (section C).
