# Visualizations tab — Phase 1 (in-shell) design

**Status:** draft for review · 2026-09-19
**Branch:** `claude/visualizations-tab-design-aefa43` → `splitstep-integration`

## Source

Claude Design project `afde9116-328b-445c-aeff-8b3c2a702d6f`:

- `F4 - Handoff - Visualizations.dc.html` — the canvas. Frames `P1a…P1j`
  (phase 1) and `P2a…P2q` (phase 2), each with a "Handoff notes" card.
- `design_handoff_visualizations/README.md` — the developer summary of every
  frame. Read in full; it is the text source for this spec.

**Reading the canvas.** It exceeds DesignSync's 256 KiB `get_file` cap — only
P1a and part of P1b survive as markup. The rendered frames are reachable in the
user's Chrome via **Present → New tab** (now a pan/zoom canvas). Each slice
below verifies its pixel values against the rendered frame, not against README
prose alone.

## Scope

The route is `/dashboard/matches/[matchId]?tab=shots`. The rail label
("Visualizations") and the `?tab=` rule in `match-detail/report-view.ts` are
unchanged.

**Phase 1 (this spec)** — everything in the normal shell: the wall (P1a/P1b),
the focused court (P1c/P1g), the cut and chart menus (P1d/P1e), the Filters
popover (P1f), saved views with Manage (P1h) and a Save dialog on the light
surface.

**Phase 2 (own spec, later)** — the fullscreen viewer and its corner glyph,
`FloatMenu`'s dark `tone`, Heat and Rally-position charts, depth/contact band
editor, and **Settings › Units** (P1i/P1j) with `formatDistance()`.

### Decisions made with the user (do not re-infer)

1. **Saved views ship in Phase 1, as its last slice.** Earlier slices ship in
   the P1b state (band absent).
2. **Won/lost dot colour is relative to the player whose court it is.** On the
   opponent's row green means the opponent won the point.
3. **Saved views are private by default; sharing is a choice.** In a team
   workspace any member — player or coach — can share a view team-wide
   (`saved_views.shared`) and un-share it. Staff can also rename or delete a view once
   it is shared; only its creator can make it private again. Personal-workspace views are always private.
4. **Units moves to Phase 2** — nothing in Phase 1 reads a distance, and a
   setting that visibly does nothing should not ship. This deviates from the
   handoff's phase-1 list on purpose.

## Where the handoff and the code disagree

| Handoff                                                   | Code today                                                                 | Resolution                                                                        |
| --------------------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| One row of courts per player + a Player filter            | `use-shot-filters.ts` takes `youIsPlayer1` once; only your shots are drawn | Model becomes per-subject (below)                                                 |
| Cut / chart / filters are URL state                       | `useState` inside the hook                                                 | Pure parse/serialize layer                                                        |
| `SavedView` per workspace                                 | no table                                                                   | New table + RLS (slice 1D)                                                        |
| Cuts: Serve placement · Return placement · Return contact | one return court draws landing + contact together                          | Two cuts over the same dot builder, filtered by `variant`                         |
| Heat / Rally position rows in menus                       | not built                                                                  | Rows render disabled with a "Fullscreen viewer" second line; phase 2 enables them |
| Save dialog drawn only dark (P2f)                         | —                                                                          | Same layout on the light surface: `surface-card`, `border-field`, `--blue` focus  |

## Architecture

`use-shot-filters.ts` (562 lines) mixes vocabulary, predicates, dot builders
and React state in one "you"-only hook. The wall needs six-plus courts at
once, each with its own cut and filters, so the hook is split into a pure core
and a URL layer. Rejected: instantiating the hook per court (state cannot live
in the URL, six memo chains); computing dots server-side (a round trip for
data `useMatchData()` already holds).

### Attribution (guardrails §4)

"You" still enters exactly once, from `useMatchSides()` in `shots-tab.tsx`.
Everything below takes a `subjectIsPlayer1: boolean` — the player whose court
is being drawn. The opponent is `!sides.you.isPlayer1`; no file below the tab
reads `player1`/`player2` off the match. Serve cut = the subject's serves;
return cuts = the subject's returns; won/lost = the point went to the subject.

### Units

All under `src/components/dashboard/matches/match-detail/shots/`.

| File                             | Kind      | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `viz-model.ts`                   | pure      | `Cut = "serve" \| "returnPlacement" \| "returnContact"`, `Chart = "scatter" \| "zones"`, `VizFilters` (today's eight keys + `player: "you" \| "opponent"`), `dotsFor(points, cut, filters, subjectIsPlayer1)`, `zoneStatsFor(...)`, `countsFor(...)` ("63 of 96"). Moves the predicates out of `use-shot-filters.ts` unchanged; keeps importing `pointToServeDot` / `computeZoneStats` so dots land on today's pixels. |
| `viz-url.ts`                     | pure      | `parseVizState(params)` / `vizStateQuery(params, state)`. Absent = default, same rule as `reportViewQuery`. `carryFilters(filters, nextCut)` drops keys the new cut does not have (`zone` off serve, etc.). No `cut` param = wall.                                                                                                                                                                                     |
| `default-cuts.ts`                | pure      | The three default cuts per player — code, not rows: Serve placement (1st · all zones) · Return placement · Return contact (1st serve).                                                                                                                                                                                                                                                                                 |
| `court-art.tsx`                  | component | Half-court SVG from `visuals/half-court-svg.tsx` geometry, recoloured `#86AC91` out / `#6092CE` court / white lines 1.5. Points `--viz-good` / `--viz-bad` / `--ink-300`, r 2.5, 0.4px `#000` stroke.                                                                                                                                                                                                                  |
| `court-tile.tsx`                 | component | The card: art, 20px player chip, name, filter pills, mono count. Shared by wall and saved-views band. Whole tile is the button (click / Enter → focused).                                                                                                                                                                                                                                                              |
| `viz-wall.tsx`                   | component | `repeat(3, minmax(0,1fr))` gap 16, you first, then opponent; saved-views band under it.                                                                                                                                                                                                                                                                                                                                |
| `viz-focused.tsx`                | component | Toolbar (cut menu · chart menu · hairline · applied strip · Filters), court card (`flex:1 1 0; min-width:360`, art max-height 400, "Back to wall"), zone card (292px, serve cut only), saved-views band.                                                                                                                                                                                                               |
| `cut-menu.tsx`, `chart-menu.tsx` | component | `FloatMenu` 300px / 272px, `use-listbox-nav.ts` keyboard. Zones row hidden off serve.                                                                                                                                                                                                                                                                                                                                  |
| `filters-popover.tsx`            | component | 400px popover on the FloatMenu surface, 2-col groups, 26px pills, live apply, "n applied · x of y". No badge on the trigger.                                                                                                                                                                                                                                                                                           |
| `applied-strip.tsx`              | component | 24px removable tokens + blue "Clear"; absent with no filters (P1g).                                                                                                                                                                                                                                                                                                                                                    |
| `saved-views-band.tsx`           | component | Heading + count, "Manage views", tiles, dashed "New view". Absent entirely with zero views (P1b). Manage mode: ⋯ menu (Rename in place · Duplicate · Delete), pointer-drag reorder.                                                                                                                                                                                                                                    |
| `save-view-dialog.tsx`           | component | Name field, "Saves" well, duplicate-name error (P2g rules on light).                                                                                                                                                                                                                                                                                                                                                   |
| `shots-tab.tsx`                  | component | Resolves sides once; renders wall or focused from URL state.                                                                                                                                                                                                                                                                                                                                                           |

**Removed:** `court-header.tsx`, `serve-zones-court.tsx`, the
`maximizeContent` modal, and `use-shot-filters.ts` once its exports have moved.
`zone-table.tsx`'s numbers feed the zone card; the file goes if nothing else
imports it.

**Unchanged:** `page.tsx` already swaps in `MatchAnalysisProgress` while a
match is analysing, so the wall never draws an empty court.

### URL state

`?tab=shots&cut=serve&chart=scatter&player=you&ball=first&zone=t…&view={id}`

Filter keys are the existing vocabulary: `set · game · ball · court · zone ·
pressure · result · rally`, plus `player`. `view` is set when a saved view is
loaded and cleared on the first edit after. Open menus and Manage mode are
client state.

### Data (slice 1D)

```
saved_views
  id            uuid pk
  <workspace scope — see below>
  name          text        -- unique per workspace, case-insensitive
  cut           text
  chart         text
  filters       jsonb
  "order"       int
  created_by    uuid
  created_at    timestamptz
```

- **Workspace scope** is verified against the live DB before the DDL is
  written (repo migrations are ~100 behind): team workspaces key on
  `program_id`; how a personal workspace is keyed decides whether this is one
  nullable column pair or a single id.
- **RLS:** select / insert / update / delete only for members of that
  workspace (`program_members`) or the owning user for personal. No
  service-role access from the client.
- `src/lib/data/saved-views-server.ts` loader (called beside
  `getMatchDetailData`) + server actions: create, rename, duplicate, delete,
  reorder. Delete is immediate with "View deleted · Undo" for 6 s (re-insert).
- Migration applied to the live DB and committed under `supabase/migrations/`.

## Slices

Each is independently shippable and its own commit series.

| Slice  | Frames                      | Contents                                                                                                                 | Done when                                                                                                                                       |
| ------ | --------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **1A** | P1a, P1b                    | `viz-model`, `viz-url`, `default-cuts` + unit tests; `court-art`, `court-tile`, `viz-wall`; `shots-tab` renders the wall | Six tiles render for a real match with correct counts; player-2 viewer sees their own row first; tile click writes `cut=` to the URL            |
| **1B** | P1c, P1d, P1e, P1g          | `viz-focused`, both menus, zone card, "Back to wall"; old court-header / serve-zones-court / modal removed               | Wall → focused → back round-trips through the URL; cut switch carries valid filters; Zones hidden off serve                                     |
| **1C** | P1f                         | `filters-popover`, `applied-strip`                                                                                       | Every filter key applies live, shows as a token, survives reload; "Clear" returns to P1g                                                        |
| **1D** | P1a band, P1h, P2f-on-light | table + RLS, loader, actions, band, Manage, Save dialog                                                                  | Save → tile appears on wall and focused; rename / duplicate / delete-undo / reorder persist; a non-member cannot read another workspace's views |

## Testing

- **Unit** (`viz-model`, `viz-url`): player-1 and player-2 viewers, opponent
  subject, first/second serve, end-change flip, filter carry-over on cut
  switch, URL round trip.
- **Playwright:** wall → focused → filter → reload; saved-view CRUD (1D).
- **Visual:** each slice against the rendered Present frame via the
  unauthenticated preview harness.
- **Reviewers:** `pipeline-guardrails-reviewer` on every slice (attribution);
  `rls-boundary-reviewer` on 1D; `widget-states` audit on the wall and focused
  cards.

## Flags — design copy vs reality

- The frame's summary line reads "188 points · 31 games · 2 saved views". The
  existing `report-facts.tsx` stays; only the saved-view count is appended
  (and dropped at zero).
- The handoff says tokens live in `src/app/globals.css`; they live in
  `src/styles/design-system/`. Court colours are the only literals.
- "Compare" in the title row is existing chrome and is not touched.

## Out of scope

Fullscreen glyph and viewer, dark surface, Heat / Rally charts, depth and
contact bands, Units preference, Advantage Intelligence–specific cuts.
