# Design system revamp — token-first docs + icon-first primitives

**Date:** 2026-08-20
**Branch:** `claude/advantage-analytics-design-revamp-ebe98b`
**Status:** approved design, pending implementation plan

---

## 1. Problem

The design system is not badly designed. It is badly indexed. Three
measured symptoms, each verified against the code on this branch:

**1.1 The docs restate values the CSS already owns.**
`.skills/advantage-analytics-design/SKILL.md` hardcodes 121 literal
hexes (`text-[#0D0D0D]`, `bg-[#F5F5F5]`, `text-[#3B82F6]`). The same values
are declared as tokens in `src/styles/design-system/colors.css`
(`--ink-900`, `--surface-subtle`, `--blue`). Two sources, one truth. A dark
scope exists in the token layer and is WCAG-AA verified, but any component
built by following SKILL.md literally is permanently light-only, because a
baked hex cannot respond to `.dark`.

**1.2 The icon-button pattern is prose, so it gets re-typed.**
SKILL.md describes a "Chrome Icon Button" in words. Three components then
hand-roll it independently:

| Site | Form |
|---|---|
| `match-actions/match-actions-menu.tsx:33` | a `triggerClasses` string literal |
| `sidebar/rail-item.tsx` | inline `className` on a Link/button |
| `ui/button.tsx` | shadcn's `size: "icon"`, which does not match the doc |

Same control, three spellings, no primitive, no shared accessibility floor.

**1.3 The base tooltip is unusable as shipped.**
`src/components/ui/tooltip.tsx` is stock shadcn: `bg-primary`, arrow on by
default. DESIGN.md specifies the opposite ("No caret"). Every real caller
therefore overrides it. Of seven call sites across six files, two use
`!`-utility walls, one of which (`half-court-svg.tsx:457`) additionally
resorts to `[&>:last-child]:!hidden` purely to delete the arrow the default
adds. The design system's tooltip is documented but does not exist in code.

### 1.4 Two defects found while diagnosing

Both are pre-existing, both are fixed by this work rather than worked around.

**Contrast failure on outcome deltas.** `shared/kpi-tile.tsx:219` renders
performance deltas in `#5DB955` / `#E51837` at 10–11px.

| Colour | On white | AA (normal text) | Verdict |
|---|---|---|---|
| `#5DB955` Win Green | **2.46:1** | 4.5:1 | fails |
| `#E51837` Loss Red | 4.65:1 | 4.5:1 | passes |

DESIGN.md already warns "avoid bare win-green under 12px (2.5:1 on white)".
The shipped tile does it anyway. Only the green fails.

**Invalid table semantics.** `matches-grid.tsx:68` applies `role="row"` and
`role="columnheader"` with no `role="table"` / `rowgroup` ancestor. Orphaned
row roles are not exposed as a table by assistive technology, so the matches
list announces as a pile of generic groups.

---

## 2. Goals

1. Make the docs stop duplicating the CSS, so this drift cannot recur.
2. Ship the four primitives named in the brief, wired to real tokens.
3. Establish an icon-only rule set precise enough to settle arguments.
4. Prove all of it by migrating one real surface end to end.
5. Fix 1.4's two defects as part of the above.

## 3. Non-goals

- **No brand-fill or typeface change.** Signal Blue `#3B82F6`, Win Green
  `#5DB955`, Loss Red `#E51837` and Inter + Roboto Mono all stay exactly as
  they are. Four palette directions were explored and all four declined
  (2026-08-21) in favour of keeping the existing identity.
  What *does* change is narrow and listed in §5: four ink tokens added, two
  greys darkened (`--nav-fg`, `--ink-600`), one token retired (`--error`),
  24 dead aliases deleted. No fill moves.
- **No dark-mode rollout, and no theme toggle.** See §3.1 — this is the one
  non-goal with a substantive argument behind it.
- **No bulk find-and-replace of hexes across the app.** Only the migration
  surface in §7 changes. Other components keep their hexes until they are
  separately reworked.
- **No change to any file listed in `docs/ui-revamp-guardrails.md` §2.**

### 3.1 On dark mode specifically

DESIGN.md describes dark mode as "deferred on purpose — available, not
rolled out." Measured against the code, that is too generous. Dark mode in
this application is **unreachable dead CSS**:

| Question | Answer |
|---|---|
| Is there a `next-themes`, provider or `useTheme`? | No |
| Does anything apply the `.dark` class? | **No — nothing, anywhere** |
| Is there a `prefers-color-scheme` query? | No |
| Is there an appearance setting in the UI? | No |
| Files carrying `dark:` variants | 8, all vestigial shadcn defaults (`dark:bg-input/30`) |

The `.dark` scope in `colors.css` is well-built and its AA figures are
plausible, but they are inherited from the design project. **No dark pixel
has ever rendered in this app.** Any claim about how it looks is
unverified.

#### Why a toggle is not the answer yet

| Metric | Value |
|---|---|
| Component files containing hardcoded hexes | **97 of 162 (60%)** |
| Hex literals across `src/components` | **1,565** |

A hardcoded hex cannot respond to `.dark`. Shipping a toggle today would
paint 60% of the app in light-mode colours on a dark ground — not a partial
dark mode but a broken one, and materially worse than having no toggle at
all. The prerequisite is the hex migration.

**That migration is smaller than the raw count suggests.** The 1,565
literals are only **59 distinct values**, and they are steeply concentrated:

| Coverage | Literals | Share |
|---|---|---|
| Top 12 values | 1,329 | **84.9%** |
| Top 16 values | 1,432 | **91.5%** |

Every one of the top 12 has an exact 1:1 token already defined in
`colors.css` — `#AAAAAA`→`--ink-400`, `#3B82F6`→`--blue`,
`#0D0D0D`→`--ink-900`, `#525252`→`--ink-700`, and so on. That portion is a
scripted substitution with per-file review, not hand editing.

The residue is a tail of ~130 literals needing judgement, including three
that have no token yet and want a decision rather than a mapping:

| Value | Uses | Question |
|---|---|---|
| `#F0F0F0` | 52 | Skeleton fill. `--surface-skeleton` currently aliases `--ink-100` `#F3F3F3` — merge, or give skeletons their own token? |
| `#EAECF0` | 18 | Already ruled a near-twin of `--ink-200`; applying it is a real, if tiny, value change |
| `#1D1D1F` | 13 | Dialog ink; `--ink-dialog` aliases `--ink-900` `#0D0D0D`, so likewise |
| `#E7E7E7` | 10 | No token, no ruling |

**So the codemod is the cheap part. The expensive part is looking at every
surface in a mode no one has ever seen** — roughly 40 dashboard surfaces,
each needing a human to judge whether it reads correctly. No tooling
removes that, and it is the reason dark belongs in its own effort with its
own verification budget, rather than riding along inside a design-system
revamp.

#### What this work does deliver

Dark stops being a claim and starts being an observation, at zero
production cost:

1. The four primitives and the migrated matches list are token-built, so
   they are the first components in the app **capable** of rendering dark.
2. "Renders correctly under `.dark`" becomes an **acceptance criterion**
   for them (§9.7), verified by toggling the class in the browser — no
   provider, no toggle UI, no shipped code. If a primitive is wrong in
   dark, it is wrong before it has any callers, which is the cheapest
   moment to find out.
3. `--success-ink` is a **new** token, so unlike the inherited ramp its
   dark value has never been checked by anyone. §9.7 checks it.

After this work the matches list is the first dark-clean dashboard surface.
Stated honestly, that is 13 of 1,565 literals — about 0.8%. This is a
beachhead and a verified pattern to repeat, not a dark mode.

---

## 4. Document architecture

Three artifacts, three distinct jobs. No value is stated in more than one.

| Artifact | Owns | Audience |
|---|---|---|
| `src/styles/design-system/*.css` | **The values.** Every hex, ms, px. | Build |
| `.skills/advantage-analytics-design/SKILL.md` | **The rules.** Token names, selection guidance, recipes. | Agents |
| `DESIGN.md` | **The reasons.** Principles, decisions, trade-offs, deferrals. | Humans |

### 4.1 The enforcing invariant

> A bare `#RRGGBB` appearing in SKILL.md is a bug.

This is the mechanism that prevents recurrence. Today's 121 hexes are 121
independent chances to diverge; after the revamp there are zero. The rule is
mechanically checkable (`grep -E '#[0-9A-Fa-f]{6}'`), so a future reviewer or
agent can verify compliance without judgement.

Two bounded exemptions, both explicitly marked in the doc where they appear:
- DESIGN.md may quote hexes when narrating a decision ("violet `#A855F7` was
  retired from attribution"). It is a history document; frozen values are
  the point.
- SKILL.md's brand section may name `#3B82F6` **once**, prose-only, as the
  identity of Signal Blue — never inside a class string.

### 4.2 SKILL.md structure after the revamp

1. Brand and users — condensed, no change in substance
2. **The token contract** — how to reference tokens; the class-layering trap
   (DS type classes are unlayered and beat Tailwind utilities on colour, so
   an override must be an inline `style`, not a utility); and the
   inverting-ramp rule from §5.3 — **an inverting ramp (`--ink-*`) is for
   ink; a surface needs a token that does not invert in lockstep with its
   own foreground.** Pairing `bg-[var(--ink-900)]` with `text-white` is the
   canonical way to produce white-on-white in dark.
3. Typography — scale by token and role
4. Colour — by semantic role, never by value
5. Spacing — the two tiers (4px grid = layout between elements; half-steps
   2/6/10 = component-internal only)
6. Radii — the six shapes
7. Elevation — the four roles (rest / lift / float / top)
8. Motion — three curves, the duration tokens
9. **Iconography and the icon-only rule set** (§6) — new
10. Component recipes — pointing at the real primitives, not describing them
11. Navigation patterns
12. Accessibility floor
13. Anti-patterns

---

## 5. Token additions

Approved 2026-08-21. The brand fills are **kept exactly as they are** —
Signal Blue `#3B82F6` and Win Green `#5DB955` do not move. What is added is
the *ink* half of each pair, for type below 12px. Two existing tokens change
value and one is retired.

Every value below was solved in OKLCH, holding hue, and verified against all
three surfaces it can sit on — card, page, and the hover surface. Solving in
HSL instead is what produced an earlier, needlessly desaturated green.

### 5.1 The fill / ink split — why it is the whole answer

The system already separates *fill* colour from *text* colour, but only
once: `--player-1` `#3B82F6` for bars, `--player-1-text` `#1D4ED8` for type.
It clears AA on every surface, and it is the only colour family in the system
that does. Blue, green, amber and the greys all skipped the split, and all
four failed.

Every token in §5.3 is that one pattern, applied to the four places it was
missing. No new hues enter the system — each ink sits within 3 degrees of
the fill it partners.

The governing rule, to be stated in SKILL.md:

> **Outcome, accent and amber colour on text below 12px uses the `-ink`
> token. On a fill, bar, dot, tinted glyph or chart series it uses the base
> token.** An ink is never used as a fill, so the two values in a pair never
> render adjacent and never read as an inconsistency.

The second half of that rule is what keeps the brand intact: Signal Blue and
Win Green are untouched everywhere they are not a letterform — progress
bars, chart series, court fills, dots, tint backgrounds. Only type moved.

The dark scope needs no ink values at all. On `#0E0E10` the bright originals
already clear AA — `#5DB955` at 7.8:1 — so `--success-ink` and friends alias
straight back to their fills under `.dark`.

### 5.2 Layout constants

Currently magic numbers duplicated across files.

```css
:root{
  --row-height:52px;    /* was literal in match-card-list + matches-skeleton */
  --nav-rail-w:64px;    /* was RAIL_WIDTH in sidebar-state.tsx */
  --nav-panel-w:232px;  /* was PANEL_WIDTH in sidebar-state.tsx */
}
```

`sidebar-state.tsx` keeps exporting `RAIL_WIDTH` / `PANEL_WIDTH` as the JS
mirror — the sidebar animates width in JS and needs numbers, not strings.
The tokens exist so CSS-side consumers stop guessing.

### 5.3 Outcome, accent and chrome inks — the approved set

| Token | Value | card / page / hover | Note |
|---|---|---|---|
| `--blue-ink` | `#2563EB` | 5.17 / 4.95 / 4.74 | hue 262.9 vs the fill's 259.8 — the same blue, darker |
| `--success-ink` | `#028321` | 4.92 / 4.71 / 4.51 | hue 144.9 vs 142.1, chroma 0.166 vs 0.163 — the same green, darker |
| `--danger-ink` | `#DA0324` | 5.22 / 5.01 / 4.79 | hue 25.0 vs 22.4. `--danger` itself is 4.26 on hover, so it cannot serve |
| `--viz-key-ink` | `#A16103` | 4.97 / 4.76 / 4.56 | amber sheds 15% chroma to pass — see below |
| `--nav-fg` | `#707074` | 4.93 / 4.72 / 4.52 | **changed** from `#8A8A8E` (3.44, failing) |
| `--ink-600` | `#6E6E76` | 5.05 / 4.84 / 4.64 | **changed** from `#71717A` (4.43 on hover) |

The three ink values sit within 3 degrees of hue of the fills they partner.
They are not new colours; they are the same colours at a passing lightness.

`--viz-key-ink` is the one exception: amber cannot hold its chroma while
darkening — it leaves sRGB gamut first. It loses 15%. That is the argument
for a rule rather than a workaround: **amber marks key moments, it never
carries words.** Legends name the moment in ink and mark it in amber.

#### `--error` retired

`--error` `#FF453A` becomes an alias of `--danger`. It was 3.41:1 — the
"friendlier" red was the inaccessible one — and sat 12 degrees from Loss Red,
a distinction no viewer can perceive. Context already separates a scoreboard
from a form field. Retiring it removes a token, a failure, and a rule that
only discipline enforced.

### 5.4 Tooltip surface pair

Found while writing §9.7's dark check, and worth stating as a caution about
inverting ramps generally.

The obvious way to build a dark tooltip is `bg-[var(--ink-900)]` with
`text-white` — which is exactly what `sidebar/rail-tooltip.tsx` does today.
It is wrong. `--ink-900` is the *ink* ramp: it inverts, `#0D0D0D` in light
to `#F5F5F5` in dark. A literal `text-white` foreground does not invert with
it. Under `.dark` the tooltip becomes **white text on a near-white
surface** — unreadable.

The tooltip surface is chrome, not ink, so it needs tokens that do not
invert in lockstep:

```css
:root{
  --tooltip-surface:#0D0D0D;
  --tooltip-ink:#FFFFFF;        /* 19.4:1 */
}
.dark{
  --tooltip-surface:var(--surface-raised); /* #1F1F1F — lifts off the page */
  --tooltip-ink:var(--ink-900);            /* #F5F5F5 — 15.1:1 */
}
```

In dark the tooltip lifts *lighter* than the page rather than inverting to
white, which is the conventional treatment and keeps it reading as a
floating surface.

This also fixes a latent defect in `rail-tooltip.tsx`, which would have
rendered white-on-white the first time anyone enabled dark. It is repaired
as part of that file's migration in §7.2, not as separate work.

---

### 5.5 Alias retirement — measured, not assumed

The token file carries 27 pure `var()` aliases. Scanning all 336 source files
for real references splits them cleanly:

| | Count | Disposition |
|---|---|---|
| Zero references anywhere | **24** | Delete outright. No migration, no risk. |
| Actively referenced | **3** | **Keep.** See below. |

Deleted: `--ink-border`, `--ink-dialog`, `--ink-tertiary`, `--ink-faint`,
`--text-heading`, `--text-muted`, `--text-label`, `--text-disabled`,
`--surface-field`, `--surface-skeleton`, `--radar-grid`, `--blue-tint-04`,
`--blue-ink-deep`, `--blue-ink-mid`, `--viz-won`, `--viz-lost`, `--viz-amber`,
`--viz-slate-deep`, `--viz-slate`, `--viz-slate-light`, `--viz-blue-deep`,
`--viz-blue`, `--viz-blue-mid`, `--viz-blue-light`.

**The remaining three are kept, and reclassified.** `--border-hairline` (54
refs), `--border-field` (18) and `--border-card` (7) were counted as legacy
debt in the audit. They are not. They are semantic role names pointing at ramp
steps — a hairline is a *role*, `--ink-100` is a *value* — which is the same
indirection this revamp adds deliberately for fills and inks. Deleting them
would replace 79 meaningful references with raw ramp steps, which is the
opposite of the goal. They move out of the "aliases" section of `colors.css`
and into the surface/border block, documented as roles.

This drops the file from 94 declarations to 70, and from 28% aliases to 4%.

### 5.6 Open — what fills the primary button

Keeping Signal Blue leaves exactly one gap, and it is the most visible
control in the product. A white label on `#3B82F6` is **3.68:1**. It is not
tunable: the value has to move, or the label does.

| Option | Effect | Ratio |
|---|---|---|
| **a. Fill with `--blue-ink` `#2563EB`** *(assumed)* | Every primary CTA deepens one step. `#3B82F6` keeps tints, rings, active nav, progress bars, court fills and chart series | **5.17** |
| b. Keep `#3B82F6`, enlarge the label | Button type goes 13px/500 to 14px/600 to qualify as large text, where the bar is 3:1. Changes the button's proportions everywhere | 3.68 |
| c. Keep both as they are | The primary CTA stays below AA | 3.68 |

**Proceeding on (a)** unless told otherwise — it follows from "add the blue
ink token", and it is the only option that leaves both the brand blue and
the type scale untouched. The trade is that the button face is a step
deeper than the brand blue, which is visible if you put them side by side,
and invisible otherwise.

Worth noting the same question does *not* arise for green or red: neither is
ever a button fill under a white label.

---

## 6. The icon-only rule set

The brief asks for a heavy mix of glyph-only controls. Density is only worth
having if it does not cost comprehension, so the rule is written as a
decision procedure rather than a preference.

### 6.1 A glyph may stand alone only when all four hold

1. **Repeated** — the action appears at least 3 times on screen (row
   actions, nav items, toolbar). A one-off action has no density to buy and
   pays full comprehension cost for nothing.
2. **Conventional** — the glyph has a near-universal mapping: pencil/edit,
   trash/delete, X/close, download, search, plus/add. If the metaphor has to
   be invented or explained, it is a label.
3. **Recoverable** — the action is undoable or non-destructive, **or** it is
   gated behind an explicit confirm step.
4. **Named in the accessibility tree** — `aria-label` is mandatory.

> **The tooltip is never the accessible name.** It is visual redundancy for
> sighted pointer users. Screen readers, touch users and keyboard-only users
> get their label from `aria-label`. A control whose only label is a tooltip
> is unlabeled.

### 6.2 A glyph must never stand alone when any holds

- It is the **primary CTA** of a page or card. "Upload a match" never
  becomes a bare arrow glyph.
- It is **immediately destructive** with no confirm step.
- It is the **only instance** on screen — nothing to amortise the cost over.
- It appears in a **first-run or empty state**, where the user has no model
  of the interface yet.

### 6.3 Two hard constraints

**Touch.** Tooltips do not exist on coarse pointers; hover is not available
and long-press is claimed by the OS. Under `@media (pointer: coarse)` an
icon-only row cluster collapses to a single overflow menu whose items carry
**visible text labels**. This is not a nicety — without it, touch users
receive a row of unexplained glyphs. Implemented with Tailwind v4's
`pointer-coarse:` / `pointer-fine:` variants (available in 4.2.2) rather
than a JS media query, so there is no hydration mismatch and no flash.

**Cluster budget.** At most one icon-only cluster per row, at most 3 glyphs
in it. Beyond 3, the cluster becomes an overflow menu. Four or more
undifferentiated glyphs stop being scannable and become a puzzle.

---

## 7. The four primitives

All four live in `src/components/ui/`, are token-built (no literal hexes),
and are additive — nothing outside §8's migration surface is rewired.

### 7.1 `IconButton` — `src/components/ui/icon-button.tsx`

Consolidates the three hand-rolled spellings from §1.2.

```tsx
type IconButtonSize = "sm" | "md";                  // 28px | 32px
type IconButtonVariant = "chrome" | "ghost" | "danger";

interface IconButtonProps extends Omit<React.ComponentProps<"button">, "children"> {
  icon: LucideIcon;
  label: string;              // REQUIRED — becomes aria-label AND tooltip text
  size?: IconButtonSize;      // default "md"
  variant?: IconButtonVariant;// default "chrome"
  tooltipSide?: "top" | "right" | "bottom" | "left";  // default "top"
  tooltip?: boolean;          // default true — false when an ancestor already names it
  asChild?: boolean;          // render as Link, PopoverTrigger, etc.
}
```

**`label` is a required, non-optional prop.** This is the accessibility
enforcement mechanism and the single most important decision in the
component: an unlabeled icon button is a TypeScript error, not a review
finding. Rule 6.1.4 stops depending on anyone remembering it.

Radius is `--radius-element` (8px), never pill — full-round is reserved for
filter pills, tabs, avatars and indicators. Focus uses `--focus-ring`. Press
is `active:scale-[0.97]`, suppressed under `motion-reduce`.

| Variant | Resting | Hover |
|---|---|---|
| `chrome` | `--nav-fg` | `--nav-fg-hover` on `--surface-subtle` |
| `ghost` | `--ink-500` | `--ink-900` on `--surface-subtle` |
| `danger` | `--ink-500` | `--danger-ink` on `--danger-tint-15` |

Icons render at `strokeWidth={1.5}`; `size-3.5` (14px) in `sm`, `size-[15px]`
in `md`, matching the sizes SKILL.md already specifies for chrome.

### 7.2 `Tooltip` — rewrite `src/components/ui/tooltip.tsx`

Change the defaults to the treatment DESIGN.md already specifies, and add
the two variants that the call sites are currently faking.

```tsx
type TooltipVariant = "label" | "data";  // default "label"
// showArrow default flips true -> false
```

| Variant | Treatment | Replaces |
|---|---|---|
| `label` | `--tooltip-surface` + `--tooltip-ink` (§5.3, never `--ink-900`/`text-white`), 12px medium, `--radius-dropdown`, `px-2.5 py-[7px]`, `--shadow-dropdown` | RailTooltip's local `SURFACE` const |
| `data` | `--surface-card`, `--border-hairline` hairline, `--radius-dropdown`, `--shadow-card-emphasis`, zero padding (caller pads inside) | the two `!`-utility walls |

**This is a breaking change to a shared primitive, so the blast radius is
enumerated rather than estimated.** Seven call sites across six files, all of which are
touched in the same change:

| File | Today | After |
|---|---|---|
| `sidebar/rail-tooltip.tsx` | local `SURFACE` const, `showArrow={false}` | `variant="label"`, const deleted |
| `activity/activity-tray.tsx` | shadcn default + arrow | `variant="label"`, arrow gone |
| `shared/kpi-tile.tsx` | shadcn default + arrow | `variant="label"`, arrow gone |
| `match-detail/match-statistics-card.tsx` (×2) | shadcn default + arrow, local padding | `variant="label"`, padding kept |
| `visuals/court-visualization.tsx` | 6 `!` overrides | `variant="data"` |
| `visuals/half-court-svg.tsx` | 7 `!` overrides incl. `[&>:last-child]:!hidden` | `variant="data"` |

The visible change is that arrows disappear from three label tooltips. That
aligns them with the documented system ("No caret") and with the two data
tooltips that were already deleting the arrow by hand. The two data
tooltips currently disagree with each other on border and shadow
(`#F3F3F3` + `shadow-card` vs `#E7E7E7` + `shadow-card-emphasis`); the
variant settles that on the emphasis value.

`radar-chart-section.tsx` imports the module but renders no `TooltipContent`;
no change needed. Verify during implementation.

### 7.3 `DataCard` — `src/components/ui/data-card.tsx`

Brief item 3: data cards with metric indicators and status glyphs.
Compound component, so callers compose only the parts they need.

```tsx
<DataCard>
  <DataCard.Header eyebrow="First serve" action={<IconButton … />} />
  <DataCard.Metric
    value="62%"
    delta={{ change: -4.2, lowerIsBetter: false, label: "last 30 days" }}
  />
  <DataCard.Status state="ready" label="Analyzed" />
</DataCard>
```

- **Surface**: `--surface-card`, `--border-hairline`, `--radius-card`,
  `--shadow-card`. Cards never nest.
- **Header**: uppercase eyebrow, no rule beneath — whitespace separates.
  Optional trailing action slot, sized for an `IconButton size="sm"`.
- **Metric**: value at weight 400 with `tabular-nums` in `--ink-900`;
  numerals never exceed 400, per the existing rule that ink contrast, not
  weight, separates lead from trail.
- **Delta**: arrow glyph (`↑` `↓` `→`) plus signed number, coloured with
  `--success-ink` / `--danger-ink` / `--ink-600`, honouring `lowerIsBetter`.
  The arrow carries the meaning independently of hue, satisfying WCAG 1.4.1;
  the `-ink` tokens satisfy 1.4.3. This is the §1.4 contrast fix.
- **Status**: quiet inline dot plus text, no container — the treatment
  DESIGN.md already selected over chip and pill variants.

### 7.4 `DataTable` — `src/components/ui/data-table.tsx`

Brief item 4: a compact table with icon-only row actions.

```tsx
interface Column<T> {
  key: string;
  header: string;
  width: string;                  // CSS grid track: "2fr" | "62px"
  align?: "start" | "end";        // default "start"
  sortable?: boolean;
  cell: (row: T) => React.ReactNode;
}

interface RowAction<T> {
  icon: LucideIcon;
  label: string;                  // aria-label, tooltip, and menu item text
  onSelect: (row: T) => void;
  destructive?: boolean;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  getRowHref?: (row: T) => string;
  rowActions?: RowAction<T>[];
  sort?: { key: string; dir: "asc" | "desc" };
  onSort?: (key: string) => void;
  emptyState?: React.ReactNode;
}
```

- **CSS grid, not `<table>`.** Keeps the existing locked header/row track
  approach, which is a deliberate and correct decision: one
  `gridTemplateColumns` value drives header, rows and skeleton, so a header
  cell cannot drift out of line with the column it names.
- **Correct roles.** `role="table"` wraps `role="rowgroup"` wraps
  `role="row"` wraps `role="cell"` / `role="columnheader"`. This is the
  §1.4 semantics fix. Because the visual grid is a flat DOM, the roles are
  applied on explicit wrapper elements rather than assumed.
- **Row actions** render as an `IconButton` cluster (§6.3), revealed on
  `group-hover` / `group-focus-within` on fine pointers, always present in
  the tab order. Under `pointer-coarse:` the cluster is hidden and a single
  labeled overflow menu shows instead.
- **Row chrome**: `--row-height`, `--border-hairline` divider, hover
  `--surface-subtle`, press `active:scale-[0.998]`.
- **Row navigation** via `getRowHref` uses the existing stretched-link
  pattern (`after:absolute after:inset-0`) so the whole row is clickable
  without nesting interactive elements; the action cluster sits above it on
  `z-10` and stops propagation.

---

## 8. Migration — the matches list

Files: `matches/match-card-list.tsx`, `matches/matches-grid.tsx`,
`matches/matches-skeleton.tsx`.

Chosen because it is the strongest available proof: it is already a compact
data table with a hover-revealed icon row action, it is the densest hex site
in the app (13 literals over 8 distinct colours), and its analysis column
exercises status glyphs against real lifecycle states.

### 8.1 What changes

| Before | After |
|---|---|
| 13 hardcoded hex literals, 8 distinct | tokens |
| inline `onMouseEnter`/`onMouseLeave` colour mutation (`match-card-list.tsx:155`) | CSS hover on a token |
| orphaned `role="row"` | correct table role nesting |
| bespoke grid + row frame consts | `DataTable` `columns` config |
| kebab overflow menu | 2-glyph `IconButton` cluster on fine pointers |
| `#F3F3F3` divider, `#F5F5F5` hover | `--border-hairline`, `--surface-subtle` |

The kebab-to-cluster change is the one interaction change to a shipped
surface. Edit and Delete become discrete glyphs, saving a click. Both remain
legal under §6.1: they are repeated (every row), conventional (pencil,
trash), and recoverable — Delete is gated behind the existing
`DeleteMatchDialog` confirm, which is what rule 6.1.3 requires. On coarse
pointers the kebab is retained per §6.3.

### 8.2 What must not change

Per `docs/ui-revamp-guardrails.md` §3.2, the analysis cell's logic is
load-bearing and was consolidated after two components disagreed about one
row. The migration moves **presentation only**:

- `isInFlight`, `isWorking` and `isLiveUpdating` remain three distinct
  predicates and are never collapsed. They answer different questions —
  respectively: will this ever change, is something happening right now, is
  a DB update actually coming.
- `resolveAnalysisStatus(status, derivation_version)` keeps consuming both
  columns. `processed` must keep rendering "Stats pending", never
  "Analyzed"; treating the vendor's `completed` as show-stats renders a page
  of empty charts, which reads to a player as "you hit no serves".
- `ANALYSIS_LABEL`, `analysisAction`, `outcomeInk` and `resultInk` are
  imported unchanged from `lib/data/match-analysis.ts`. That module is not
  edited.

`AnalysisProgressTrack` keeps its 3px weight, matching the match page's
stage bars — the same state must not be two different weights on two
screens.

### 8.3 Ordering

The three files share `LIST_GRID_COLS` and `LIST_ROW_FRAME`, so they change
together in one step or the header drifts from its columns mid-migration.

---

## 9. Verification

1. `npm run lint` and `npm run build` both clean.
2. **Worktree prerequisite**: this `.claude/worktrees/*` checkout needs its
   own `npm ci` and `.env.local`. A `node_modules` symlink panics Turbopack.
   Confirm before assuming a dev server can start.
3. Browser verification of `/dashboard/matches` via the preview tools:
   - tooltips fire on the row action cluster, and do not fire when expanded
   - full keyboard traversal — every glyph reachable, focus ring visible
   - row link still activates; action cluster does not trigger navigation
   - `pointer-coarse` path renders the labeled menu (emulated viewport)
4. **Contrast re-measure** of `--success-ink` / `--danger-ink` as actually
   rendered, confirming ≥4.5:1. The claim is 5.12:1 and 4.65:1; verify
   rather than assert.
5. Accessibility tree spot-check: the list announces as a table with column
   headers, and every glyph button announces its label.
6. `grep -E '#[0-9A-Fa-f]{6}' .skills/advantage-analytics-design/SKILL.md`
   returns only the single sanctioned brand mention (§4.1).
7. **Dark-scope check (§3.1).** With the page loaded, apply the class by
   hand — `document.documentElement.classList.add('dark')` — and inspect
   the four primitives and the migrated list. This ships nothing; it exists
   so the dark claim is observed rather than asserted. Check specifically:
   - `--success-ink` / `--danger-ink` deltas remain legible on
     `--surface-card` `#0E0E10` (expected 7.8:1 and ~5:1 — **measure**)
   - `IconButton` `danger` hover on `--danger-tint-15`, which changes from
     `rgba(229,24,55,0.15)` to `rgba(255,100,120,0.18)` between scopes
   - Tooltip `label` variant renders `--tooltip-surface` / `--tooltip-ink`
     (§5.3) and **not** `--ink-900` / `text-white`. This was the one dark
     defect found at design time; confirm the fix rather than trusting it.
   - `DataCard` shadows, since `--shadow-card` is redeclared in
     globals.css's own `.dark` block (see §10)
   Record what fails. Fixing dark bugs found here is in scope for the
   primitives; fixing them in the other 97 files is not.

---

## 10. Risks

| Risk | Mitigation |
|---|---|
| Tooltip default change silently restyles callers | All 5 enumerated in §7.2 and migrated in the same change; visible delta is arrow removal, which aligns with documented intent |
| Kebab-to-cluster alters a shipped interaction | Explicitly approved; kebab retained on coarse pointers; both actions keep their existing dialogs |
| Analysis-status logic damaged during presentation swap | `lib/data/match-analysis.ts` is not edited; §8.2 lists the invariants; guardrails §3.2 is the reference |
| Two `.dark` scopes activate together — `globals.css` declares its own `.dark` blocks (incl. a second `--shadow-card`) and `colors.css` adds another. Neither has ever rendered, so conflicts between them are unobserved | §9.7 renders the primitives under `.dark` and records what breaks. Scope of the fix is the four primitives plus the migrated surface — not the whole app |
| Inverting ink tokens used as chrome surfaces produce white-on-white in dark. Found in the drafted Tooltip design and latent in today's `rail-tooltip.tsx` | Designed out in §5.3 via a non-inverting `--tooltip-surface` / `--tooltip-ink` pair; §9.7 confirms. Generalise the caution in SKILL.md: an inverting ramp is for ink, not for surfaces |
| An ink reads as a second, clashing colour beside its fill | Each ink sits within 3 degrees of hue of its fill and is never used as a fill, so the pair never renders adjacent. Verified: blue 3.1 deg, green 2.8 deg, red 2.7 deg |
| Deleting an alias breaks a surface | All 336 source files were scanned; the 24 deleted have zero references. The 3 with references (79 total) are kept and reclassified as roles, not aliases (§5.5) |
| The CTA keeps a failing label | **Open — see §5.6.** White on `#3B82F6` is 3.68:1 and cannot be tuned |
| Docs lose the convenience of looking up a hex | Accepted trade. Values are one file away in `colors.css`, and the token name is what belongs in code anyway |

## 11. Out of scope

Deliberately not in this work, and not blocked by it: the dark-mode
rollout and theme toggle (§3.1);
migrating the remaining ~40 components off hexes (the token *values* they
will migrate onto are now settled by §5, which is what makes that pass
mechanical); the IA changes proposed in
`docs/ux-overhaul-brief.md` (Statistics to Trends, an Ask surface, jobs
tray); porting the remaining 17 v2 primitives; deleting the dead
`match-video-panel.tsx` / `use-video-upload.ts`.
