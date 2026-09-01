# Brief — events-lineups

## Goal

Reproduce every artboard of `Events & Lineups.dc.html` in the app as
presentation-only UI that matches the design exactly. Fidelity to the design
file is the deliverable; working data is explicitly not. The human's words:
*"Copy this UI design exactly, don't worry about the database or linking to
external pages. We can do that later."*

## Scope

The design file holds **ten artboards in five sections**, all 1280px-wide
frames. All ten are in scope:

| § | Artboard | Frame | What it shows |
|---|---|---|---|
| 1 · Day zero | `7e` | 1280×620 | Schedule with no events; drawer sections read "None yet"; pane holds the empty state over a nine-line scaffold |
| 2 · Choose the event type | `3b` | 1280×840 | Two cards — dual vs tournament — each stating what it creates; one-off matches point at Matches |
| 3 · Dual branch | `2c` | 1280×900 | Step one: find the school — conference first, then all programs, then free text |
| | `2b` | 1280×900 | Step two: master-detail builder — conference left, date/site/format/nine lines right |
| | `2d` | 1280×900 | Add-opponent popup, similar saved name found |
| | `2e` | 1280×900 | Add-opponent popup, name saved, line resolved |
| 4 · Tournament branch | `3c` | 1280×900 | Roster left feeds entries right; no lineup, no matches until played |
| 5 · The living schedule | `7d` | 1280×620 | Landing state, nothing selected — pane prompts, carries season facts |
| | `7c` | 1280×620 | A selection: breadcrumb terminal, drawer-footed CTA, scoped detail header, inset hairlines |
| | `4c` | 1280×860 | 7c's chrome at full height — dual widget, all nine lines resolved |

**Fidelity standard — "exactly" means:** spacing, type scale and weight,
colour, radii, borders, shadows, icon choice and stroke width, grid structure,
and **copy verbatim** down to typographic characters (curly quotes, en and em
dashes, the `·` separators). Where the design and the current app disagree,
the design wins — including where the current app arguably looks better.
Divergence is a defect, not a judgement call.

**Static means:** every screen renders from fixture data carried on the
branch, reproducing the design's own sample content (Meridian State, Elena
Vasquez, Ridgeline University, the 09-26 dual, the 10-03→10-05 tournament,
"3–1 in duals · 31 of 36 lines analyzed", and so on). No query, no mutation.

## Non-goals

- **No database.** No Supabase reads or writes, no server actions that
  persist, no migrations, no schema work.
- **No external page linking.** Links may be inert or point within the
  rebuilt set; wiring them to real destinations is later work.
- **No redesign, no improvement.** Judgement about whether the design is
  right belongs upstream of this run.
- **No responsive design work** beyond what the design file specifies — it
  specifies one width (see Open questions).
- **Preserving the existing implementation's behaviour is not a goal.** See
  Constraints.

## Constraints

1. **The design is already fully implemented, and this run replaces that
   work.** All ten artboards exist today as ~5,500 lines across 21 components
   in `src/components/dashboard/schedule/`, built from this same design file
   and wired to `program_events` — `3b`→`new-event-chooser.tsx` (`c7c66bd`),
   `2c`→`school-search.tsx` (`0f4db8e`), `2b`→`dual-form.tsx` (`ceacb28`),
   `2d`/`2e`→`opponent-name-cell.tsx` (`edefcf7`), `3c`→`tournament-form.tsx`,
   `4c`/`7c`→`event-detail-pane.tsx` + `dual-detail.tsx` (`cf60f6b`),
   `7d`/`7e`→`schedule-list.tsx`. Replacing working, DB-wired UI with static
   UI is a **deliberate loss of function**, chosen by the human on 2026-08-31
   with the cost stated. It must be recorded in the eventual PR, never shipped
   silently as if nothing regressed.
2. **A prior run's 5a/5b empty-state work is abandoned** and carries no
   authority — see `../BRIEF-SEED.md`. Its "keep the header and New event CTA
   consistent with the existing codebase" instruction is void here: the design
   file governs.
3. **Design system v3 tokens.** The repo already carries every token and
   utility class the design uses — `--surface-page/card/subtle`, the `--ink-*`
   and `--border-*` ramps, `--blue`/`--blue-hover`, `--radius-card/button/
   element`, `--shadow-cta-glow`, `--font-sans`/`--font-mono`, and the
   `.eyebrow`, `.eyebrow-sm`, `.text-body`, `.text-body-sm`, `.text-micro`,
   `.text-title-lg`, `.tabular` classes. **`--shadow-card` is the sole
   missing token.**
4. **Lucide icons only**, at the stroke widths the design sets (1.5
   throughout).
5. **Repo conventions bind**: `docs/ui-revamp-guardrails.md` must be read
   before any dashboard UI change; routes get traced to the rendered component
   before editing; `advButton()` for primary buttons where the design's button
   matches it.
6. **The frames include app chrome that already exists** — the 232px `Sidebar`
   (imported into all ten artboards as `active="schedule"`) and a 44px
   breadcrumb topbar. The design shows them for context.
7. **Lint, types and build must stay green**; the branch's lint baseline is 43
   warnings.

## Success criteria

1. All ten artboards are reachable and rendered in the running app.
2. Each rendered screen matches its artboard on a side-by-side check at
   1280px width: no divergence in spacing, type, colour, radius, border,
   icon, or grid structure.
3. All copy matches the design **character for character**, typographic
   punctuation included.
4. No screen issues a database query or mutation; every screen renders from
   branch-local fixture data.
5. The design's stateful pairs read correctly as states of one thing:
   `2d`→`2e` (popup: similar name found → saved) and `7d`→`7c`→`4c`
   (schedule: nothing selected → selected → full height).
6. `npm run lint` adds no warnings over the 43 baseline; `npx tsc --noEmit`
   is clean; `npm run build` succeeds; `npm test` passes.
7. The PR states plainly which working, DB-wired behaviour was replaced by
   static UI.

## Open questions

Answered by the human in chat on 2026-08-31, immediately after reading this
brief, and transcribed here by the runner rather than typed into the file by
hand. The decisions are theirs; the keystrokes are not.

1. **Where does the static rebuild live? → Replace.** The rebuild takes over
   the existing routes in place. `/dashboard/team/schedule` and the
   `schedule/new` branch become the static copy; the route surface does not
   grow a parallel preview area. Accepted consequence: those routes stop
   working for real teams until the later re-wiring.
2. **What happens to the existing DB-wired components? → Leave dormant.**
   They stay in the tree, unreferenced by the rebuilt routes, as the material
   the "we can do that later" re-wiring draws on. They are not deleted, and
   they are not kept working.
3. **Responsive behaviour → desktop only.** *"The dashboard is not meant to
   be used at a screensize close to mobile."* The design's 1280px is the
   target; no mobile layout is owed. Narrow-viewport behaviour needs only to
   not break — it is not a design surface in this run.
6. **How interactive is "static"? → The states move.** `2d`→`2e` and
   `7d`→`7c`→`4c` are each one component whose local state moves between the
   frames, not separate static screens. "Static" constrains the *data* (no
   database), not the interaction: local UI state is expected to work.

### Still open

4. **Role variants — "maybe".** All ten artboards show a coach/staff
   viewpoint and the design file has no player variant. Unresolved: whether
   the rebuild needs a player-facing counterpart, and if so what it shows.
   Stage 02 should put a proposal in front of the human rather than assume
   either way.
5. **`--shadow-card` — "not too sure".** Missing from the repo tokens and
   used on the design's frame chrome. Unresolved whether it belongs in the
   app's token set or is canvas-only. A small question, but it wants an
   answer before anything relies on it.

## Also consulted

Beyond the declared inputs (`../BRIEF-SEED.md`; `references/` was empty):

- `Events & Lineups.dc.html`, read via the claude_design MCP from project
  `afde9116-328b-445c-aeff-8b3c2a702d6f` — the subject of the brief, named in
  the seed. Its `_ds` token files and `support.js` were listed but not read;
  the repo token check below made reading them unnecessary at this stage.
- `src/app/dashboard/team/schedule/page.tsx` — to establish what the route
  renders today.
- `src/components/dashboard/schedule/` (file listing, line counts, and the
  head of `schedule-list.tsx`) — to establish that the design is already built.
- `src/styles/design-system/{colors,typography,spacing,effects}.css` — to
  verify which design tokens and utility classes already exist.
- `git log` over `src/components/dashboard/schedule/` — to establish that the
  existing components were built from this same design file.
