# Advantage Design System v2

> **v3 exists and is the current authority on component behaviour.** Claude
> Design project `abcb65f6-4e66-44bc-b9de-b3b47f4313c1` — *Advantage Design
> System v3*. It ships a larger library than v2 (adds `IconButton`, `DataTable`,
> `Delta`, `Avatar`, `Notice`, `Radio`, `EntitySelect`, `ActivityTray`) plus
> `guidelines/*.card.html` and its own `SKILL.md`. This document still describes
> the v2 import, which is what the repo's tokens came from; where v3 and v2
> disagree about a component, **v3 wins**.
>
> Corrections already taken from v3:
>
> - **Secondary buttons hover to a surface wash, never to blue.** `outline` and
>   `ghost` were turning their border and label blue, which reads as a second
>   primary. v3's `.adv-btn-outline:hover` is `background: var(--surface-subtle)`
>   and nothing else. Fixed in `src/lib/ui/adv-button.ts`,
>   `settings-button.tsx` and `retry-submission.tsx`.
> - **`danger` and `danger-solid` are real variants**, now transcribed into
>   `advButton()`. `danger-solid` is for confirmed destruction only — an action
>   whose cost the person has already read.
>
> v3's own non-negotiables worth repeating here: Signal Blue is the single
> accent and should stay under ~10% of any screen; nav active state is a neutral
> wash, not blue; people-state chips are grey, never blue; a dialog carries one
> primary, never two.
>
> **Provenance.** Imported from the Claude Design project *Advantage Design
> System v2* (`932d1406-360f-4a6e-8617-5a3c600ecb67`), which was rebuilt from
> this codebase on the `splitstep-integration` branch. It replaces the previous
> `DESIGN.md`/`DESIGN.json` — v2 deliberately did not source those, treating
> them as outdated v1 documents.
>
> Tokens live at [`src/styles/design-system/`](src/styles/design-system/) and are
> imported by `globals.css`. Two of the four files are adapted rather than
> verbatim; each documents what was left out and why. The practical build
> reference is still
> [`.skills/advantage-analytics-design/SKILL.md`](.skills/advantage-analytics-design/SKILL.md).
>
> **The component library is not imported.** v2 ships 21 React primitives that
> overlap the existing shadcn set in `src/components/ui/`. Porting them is the UI
> revamp itself, one component at a time — see
> [`docs/ui-revamp-guardrails.md`](docs/ui-revamp-guardrails.md) first.
>
> **Deferred on purpose — available, not rolled out:**
> - **Dark mode.** The `.dark` ramp below is defined and `@custom-variant dark`
>   is wired, but no component reads these tokens yet, so nothing renders dark.
>   It arrives surface by surface as pages are reworked, not as a switch.
> - **The v2 shadow values.** `--shadow-card-elevated` and `--shadow-tooltip`
>   still hold this app's original values, deliberately — v2's differ and a bulk
>   swap would restyle every elevated card and tooltip at once. Use
>   `--shadow-card-emphasis` / `--shadow-dropdown` explicitly on a page you are
>   already reworking.

Design system for **Advantage Analytics** — performance intelligence for competitive tennis. Players (college athletes, serious club players, coaches, parents of juniors) upload match video or SwingVision exports and get trustworthy statistical breakdowns, court visualizations and AI match commentary. The brand voice: **Modern. Athletic. Innovative.** A pro-level training room, not a consumer app.

v2 is rebuilt from the live product code on the `splitstep-integration` branch — the "Advantage Intelligence" era, where the source of truth becomes the player's own match video processed asynchronously by a vision pipeline (vendor never named in UI copy).

## v2 vs v1 — what changed

1. **Dark mode exists.** v1 was "light mode only." v2 ships a full `.dark` scope: inverted ink scale (incl. ink-600), lifted blues (#60A5FA) and danger (#FF6478), player attribution lifted with alpha tints, role-based viz re-ramped (density dark→bright, court #16283F), heavier shadows — all WCAG-AA-verified on #0E0E10. Light remains the default and the product's primary face.
2. **A numbered ink scale.** v1's ad-hoc named grays (ink-secondary/tertiary/muted/label) became a formal ramp — `--ink-900 … --ink-100` — that inverts cleanly in dark mode. Review decisions: `ink-600` #71717A added as the muted-but-readable step (any gray that must be read is ≥600 — 4.5:1+; 500/400 are decorative); `ink-border` merged into `ink-200` (near-twins); legacy names (`ink-dialog`, `ink-tertiary`, `ink-faint`) survive as aliases of 900/600/300.
3. **A second typeface.** v1: "Inter only." v2 adds **Roboto Mono** (400–700) for timestamps, quota readouts and job IDs. Clash Display exists in the code as an unused vestige — intentionally not shipped.
4. **The async lifecycle is component vocabulary.** Advantage Intelligence introduces states v1 never needed: uploading → uploaded → queued → processing → analyzing → ready | failed, plus the real "video processed, analysis pending" state and confidence surfacing (high = silent, medium = one quiet line, low = banner + Review score). `StatusChip` and the Matches-list progress rows encode this. Rule inherited from the spec: **never promise an ETA** — show state or nothing.
5. **One sanctioned gradient.** v1 banned gradient surfaces outright. v2 keeps the ban with a single exception the product shipped: the auth brand panel's blue mesh (`.brand-mesh-gradient`). It appears nowhere else.
6. **Tint ramps replace one-off hexes.** A deliberately small blue set — wash 8% + selection 12% (4% retired as an alias) + 30/40% rings — success 4/12/20%, danger 15/70%. Blue tints are for interactive states only (nav active, selection); informational capsules are neutral — surface-subtle + ink text (`--blue-ink-*` survive as ink aliases).
7. **Keycap kbd + raised surface.** `--surface-raised` + `--shadow-keycap` give shortcut chips a physical keycap treatment (v1's kbd was a flat gray chip).
8. **Elevation as four roles.** rest → lift → float → top (review S2): card / card-emphasis / dropdown / floating. `card-elevated` and `tooltip` retired into lift/float (legacy names alias); keycap + cta-glow reclassified as component details, not elevation.
9. **Player attribution formalized.** You own Signal Blue; the opponent recedes to cool slate #64748B (violet retired from attribution in review — it survives only in multi-series viz ramps). Each side has bar-tint + AA text values; legends are the 2×12 tick + ink name (the system's one mark vocabulary), comparison bars are 4px (review L3+B2).
10. **IA direction (from the UX brief, recommended not shipped):** Statistics → **Trends**, new **Ask** surface, jobs tray, workspace switcher for teams. Components here (SidebarNav, StatusChip) are built to serve that roadmap; the UI kit replicates what exists today.

## Content fundamentals

- **Terse, specific, zero cheerleading.** No hand-holding, no gamification, no exclamation marks. "Design for the player who knows what a second-serve percentage means."
- **Claim → evidence → so-what.** Every AI insight is a falsifiable claim backed by real computed numbers (`InsightStatChip`), never LLM-invented figures: *"You won 78% of first-serve points but landed only 54% of first serves — the serve, not the rally, decided the 2nd set."*
- **Sentence case** for UI copy and titles ("Upload a match", "Forgot Password?"); **uppercase eyebrows** for section labels. Buttons are verb-first: "Sign In", "Save changes", "View report".
- **Second person**, present tense: "Your first-serve percentage dropped six points."
- **No emoji, ever.** Unicode arrows (↑ ↓ →) only as trend glyphs.
- **Honest uncertainty.** Low-confidence stats are labeled estimates with a path to correct ("Review score"); failures get plain language + a support path, never raw vendor errors. Waiting states say "in line — we'll notify you", never fake progress.
- **Naming:** the analysis engine is **"Advantage Intelligence"** in every user-visible string. The vendor (SplitStep) is internal-only. Greeting: "Good afternoon, {first name}". Auth flavor line: "Built by former collegiate players. Designed for competitive advantage."

## Visual foundations

- **Monochrome with one chromatic voice.** Cool neutrals #FAFAFA→#0D0D0D carry every surface and word. Signal Blue #3B82F6 = action/emphasis only, ≤10% of any screen (one CTA, one active nav, one focus ring). Win Green #5DB955 / Loss Red #E51837 = match outcome ONLY — never mood, success toasts excepted (a save "wins the point"). Form errors use iOS-red #FF453A, not Loss Red — a typo never feels like losing; the two reds never share a surface (both confirmed in review). Avoid bare win-green under 12px (2.5:1 on white) — keep it on tints or beside neutral text.
- **Backgrounds:** flat #FAFAFA page, white cards. No imagery, no textures, no patterns. The one gradient is the auth mesh panel. Surface slots consolidated in review (U2): seven distinct — page/card (+ muted/raised, which diverge in dark), subtle (hover + disabled fills), ink-100 (hairline/borders/skeleton/chart grid), medium (menu borders); field/skeleton/radar-grid are aliases now.
- **Hairlines divide rows** (#F3F3F3) inside cards and tables — not borders or shadows. Card headers are quiet (review H3): eyebrow + optional 11px blue text action, no rule below — whitespace separates header from content. Signature pattern: a standalone 10px/2.5px-tracked uppercase eyebrow opens every section (no rule; whitespace does the separating).
- **Type:** Inter 300 for heroes and big numbers — the display ladder is five twin-free steps (review D2): 16 title · 24 title-lg · 30 display (headline merged in) · 40 score · 56 brand-hero. 400 body at 13px, 500 eyebrows. Scoreboards and stat values are 400 (review W3) — ink contrast (900 vs 500/300) separates lead from trail, never weight; numerals never exceed 400. Roboto Mono (confirmed in review) for machine values only — timestamps, quotas, job IDs — never stats. `tabular-nums` on any number compared to another. Body copy ≤75ch. No weight above 600.
- **Elevation:** flat by default — four roles: rest (shadow-card, 2/8 · 6%) · lift (emphasis — hover/selection) · float (dropdown — menus, tooltips, modals) · top (floating — dark toasts, dragged). Shadow is earned, never decoration. Cards never nest.
- **Radii:** six shapes (review R2) — 4 cell · 6 button/badge · 8 element · 12 floating (dropdowns, tooltips, video) · 14 surface (cards AND modals) · pill (chips, filter pills, avatars — never standard CTAs or icon buttons). Score-card 10 and modal 16 retired into 12/14; legacy names alias.
- **Motion:** three ease-out curves (`--ease-primary` .25,.46,.45,.94 · `--ease-out-expo` .23,1,.32,1 · `--ease-chart` .2,0,.4,1). 200ms hovers, 300ms page-enter (+8px rise), 400–600ms reveals. Press = scale 0.97 (buttons) / 0.998 (rows). No bounce, no elastic. Reduced motion: keep opacity, drop transforms.
- **Spacing (review P2):** two tiers — the 4px grid (4/8/12/16/20/24/32/40) is layout spacing (12 eyebrow→title, 20 card padding, 24 sections, 32/40 page x/y); half-steps 2/6/10 are component-internal only (10 toggle→label; label→input moved to grid 8 in review F2), never between elements on a page. Never invent new spacers — combine.
- **Hover:** background washes (#F5F5F5 controls, #FAFAFA rows) and text darkening; never underlines, never color inversions. Nav active = blue-soft wash + blue label (confirmed in review); tabs/switchers are underline style — 2px blue rule, same vocabulary as Input focus.
- **Focus:** `--focus-ring` = `0 0 0 2px var(--blue-ring-40)` on buttons, links, tabs and pills. `<input>`, `<textarea>` and native `<select>` take `--focus-ring-field` = `0 0 0 1px var(--field-ring), 0 0 0 2px var(--field-ring-30)` — a separate token so fields and actionable controls *can* diverge, not because they currently do: as of **2026-08-26 both resolve to the same blue** (`--field-ring` aliases `--blue-ring-*`). A neutral grey (`--ink-500`) sat here briefly and was reverted at the design owner's explicit call — one consistent focus colour across every control outweighed conserving the accent per field. The reversion owed no new contrast work: `--blue` already clears WCAG 1.4.11's 3:1 floor against both surfaces the old grey was measured on — 3.68:1 on white, 3.38:1 on #F5F5F5 (`--surface-field`) — independent of why it sits here now. Two layers on the field ring regardless of colour, because the 30% band alone composites too faint to read alone; the opaque 1px layer is what you actually see, the band only softens its edge. `design-system/focus.css` applies both rings automatically by tag, so a field needs no focus class of its own; Radix's `SelectTrigger` is a `<button>` and so takes the ring via the button path, not the field one — same colour today, but a different token, so a future split still works. The file is imported outside any `@layer`, so a Tailwind `focus-visible:ring-*` utility never overrides it — it is discarded. Override by token, not by class.
- **Underline inputs opt out of the ring, not into a second vocabulary.** A field whose own rule visibly changes on focus (thickens, recolours, or both) needs no ring on top of it — that change is already the one indicator WCAG 2.4.7 (AA) requires, and a surrounding ring is explicitly *not* required once something else on the control clearly shows focus. These opt out with `data-focus-ring="none"`, same as the wrapper-ring case below: auth's `form-field.tsx`, the settings underline input (`SettingsUnderlineInput` / `UnderlineSelect` / `ProfileSelect`), the schedule lineup editor's `NameField`, and the match-edit dialog's underline fields. The opt-out is earned by an actual on-focus change, not by looking like an underline — `schedule/field-row.tsx`'s defaults row draws a hairline that never changes, so it keeps the neutral ring; that ring is the only indicator it has.
- **The wrapper-ring pattern:** where an input sits inside a bordered box and the box is what reads as the field, the ring is drawn on the box — otherwise it lands inset, floating inside the border. The inner control opts out with `data-focus-ring="none"`, a rule inside `focus.css` scoped to `:focus-visible` rather than an inline `style={{ boxShadow: "none" }}`: inline would suppress the focus ring *and* any shadow the component ever sets for its own reasons, unconditionally, and invisibly to anyone grepping for focus. Which selector draws the ring depends on what else the box holds, and one of the three live cases is a deliberate exception — SKILL.md → Focus specifies all three, and is the copy to follow.
- **Transparency/blur:** none decoratively; blur only as a rare sticky-bar legibility shield.
- **Data-viz:** role-based palette in `src/styles/design-system/colors.css` (review M1) — You = blue steps (`--viz-you*`), Opponent/context = slate steps (`--viz-opp*`), Good/Bad = the outcome pair (`--viz-good/bad` + softs), amber `--viz-key` for key moments ONLY (break points, momentum shifts), heatmap #F2F2F2→#3B82F6, court fill #D6E4F9. Violet and surface hues retired — categories (e.g. by-surface breakdowns) are text labels + your blue, never hue-coded. Charts only, never chrome.
- **Anti-patterns (banned):** glassmorphism, neon, gradient text, warm/earthy tones, bouncy animation, badges/streaks/confetti, colored left-border stripes, nested cards, emoji icons, weights 800+, hero-metric cards outside the KPI strip.

## Effects tokens — the shipped set

Every custom property `src/styles/design-system/effects.css` defines, with its
live value and where the reasoning lives. `focus.css` defines **no** tokens: it
only consumes the two rings and adds the `data-focus-ring="none"` opt-out
attribute. The file headers record what was deliberately *not* imported from v2.

The five shadows are printed here because nothing else in this file carries
their values:

| Shadow token | Shipped value | Role |
|---|---|---|
| `--shadow-card-emphasis` | `0px 4px 16px 0px rgba(0,0,0,0.10)` | lift — Visual foundations · SKILL.md Shadows |
| `--shadow-dropdown` | `0 8px 30px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.04)` | float — Visual foundations · SKILL.md Shadows |
| `--shadow-floating` | `0px 8px 32px rgba(0,0,0,0.25), 0px 0px 0px 1px rgba(255,255,255,0.06) inset` | top — Visual foundations · SKILL.md Shadows |
| `--shadow-keycap` | `0 1px 0 rgba(15,23,42,0.04)` | detail, not elevation — v2 vs v1 §7 · SKILL.md Shadows |
| `--shadow-cta-glow` | `0 1px 3px rgba(57,134,243,0.25)` | detail, not elevation — v2 vs v1 §8 · SKILL.md Shadows |

The other nine are accounted for without being re-printed, deliberately: the
three `--ease-*` curves under Motion above, the four `--duration-*` steps
(150/200/300/400ms) in SKILL.md's Duration Scale, and `--focus-ring` /
`--focus-ring-field` under Focus above. A value copied to a third place is a
value that goes stale in two — this section is the ledger that nothing in
`effects.css` is undocumented, not a second copy of it.

Two things in `effects.css` are **deliberately undocumented** as build guidance:

- **The `.dark` block.** It re-declares three of the five shadows —
  `--shadow-card-emphasis` to one layer at 0.5, `--shadow-dropdown` to 0.5 and
  0.3, `--shadow-keycap` to 0.45 — and leaves `--shadow-floating` and
  `--shadow-cta-glow` on their light values. None of it renders: dark mode is
  deferred (the blockquote at the top of this file), so these are staged values,
  not shipped ones,
  and nothing in SKILL.md tells you to build against them.
- **`@keyframes adv-status-pulse`.** Not a token, and not general vocabulary —
  it belongs to `src/components/ui/status-chip.tsx`'s live dot. Opacity only, so
  it costs no layout, and the component disables it outright under reduced
  motion rather than the stylesheet softening it.

## Iconography

- **Lucide only**, strokeWidth 1.5. Sizes: 14px inline/nav (`size-3.5`), 15px header chrome, 12/16/20px supporting, 32px empty states. Never emoji, never hand-rolled SVGs.
- Product marks live in `/public/icons` (tennis-court, tournament, verified ×2). Provider logos: SwingVision, ATP.
- Logos in `/public/logos`. The design project renames them; the art is the same and already here:

  | v2 name | In this repo | Size |
  |---|---|---|
  | `logo-wordmark.svg` (sidebar) | `logo4.svg` | 141×24 — exact match |
  | `logo-mark.svg` (collapsed swoosh) | `logo3.svg` | 46×31 (v2 exports at 30×21; SVG, so it scales) |
  | `logo.svg` (auth lockup) | `logo.svg` | 320×57 |
  | alternates | `logo2.svg`, `logo5.svg` | |

  Nothing needs pulling from the design project. White-on-dark via `filter: brightness(0) invert(1)`.

## Component library — in the design project, not the repo

v2 ships 21 React primitives with `.d.ts` + `.prompt.md` per component:

- `actions/` — **Button**, **IconButton**
- `forms/` — **Input**, **Select**, **Checkbox**, **Switch**, **Textarea**
- `display/` — **Card**, **Eyebrow**, **Badge**, **Kbd**, **Skeleton**, **Tooltip**
- `navigation/` — **SidebarNav**, **Tabs**, **Breadcrumb**
- `overlays/` — **Dialog**
- `data/` — **KpiTile** (+ **KpiStrip**), **StatusChip**, **InsightStatChip**, **FormPills**

Plus 18 specimen cards under `guidelines/` and an interactive UI kit
(`ui_kits/dashboard/` — login → home → matches → match report).

These overlap the existing shadcn primitives in `src/components/ui/`, so they
are **not** imported wholesale. Port them one at a time as surfaces are
redesigned, checking `docs/ui-revamp-guardrails.md` for the components the video
pipeline depends on.

**StatusChip** is the one with no v1 equivalent: it encodes the Advantage
Intelligence job lifecycle from `processing_jobs`. Treatment is a quiet inline
dot + text, no container — chosen over chip/pill variants in review. The repo's
current equivalent is the analysis column in `match-card-list.tsx`.
