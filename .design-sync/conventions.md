# Building with Advantage Analytics components

These are the React components the Advantage Analytics dashboard actually
ships (tennis analytics for college programs), bundled from source. Every
component is pre-styled with the design system's tokens and needs **no
provider**: import from `window.AdvantageDS` and render. Tooltips
self-provide; wrap a cluster of icon buttons in `TooltipProvider` only so
neighbours share the hover delay. Inter and Roboto Mono ship in the bundle.

## The styling idiom: tokens and inline style, not new utility classes

Components carry their own look. For **your** layout glue — page columns,
spacing between cards, a row of chips — use inline `style` with the CSS
custom properties below, plus the type classes. The compiled stylesheet
contains only the Tailwind utilities the app itself uses; a class it does
not contain (`w-[40%]`, `gap-7`, `grid-cols-[…]`) silently does nothing.
Before writing any Tailwind class, confirm it exists in `_ds_bundle.css`.

| Family       | Use these names                                                                                                                                                                                                |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ink (text)   | `--ink-900` headings/values · `--ink-700` body · `--ink-600` muted-readable · `--ink-500` captions · `--ink-400` placeholders · `--ink-300` disabled · `--ink-200`/`--ink-100` rules and fills                 |
| Accent       | `--blue` (one action per surface), `--blue-hover`, `--blue-tint-08` wash · `--success` won · `--danger` lost/destructive · `--warning-bg`/`--warning-border`/`--warning-text`                                  |
| Surfaces     | `--surface-card` (white — every dashboard surface), `--surface-subtle` (row hover, pill fill), `--surface-page`, `--surface-field`, `--surface-skeleton`                                                       |
| Borders      | `--border-hairline` (rows, footers), `--border-card` (a card's edge), `--border-field`, `--border-medium`                                                                                                      |
| Radius       | `--radius-card` (14px), `--radius-button` (6px), `--radius-element` (8px), `--radius-pill`, `--radius-dropdown`                                                                                                |
| Shadow       | `--shadow-card` (resting card), `--shadow-dropdown` (menus, dialogs)                                                                                                                                           |
| Type classes | `.text-display` · `.text-title-lg` · `.text-title` · `.text-body` · `.text-body-sm` · `.text-micro` · `.text-data`/`.text-score` for numbers · `.mono` for ids and timestamps · `.tabular` for aligned figures |
| Card         | `.surface-card` (white, hairline, radius, shadow) — cards never nest                                                                                                                                           |
| Charts only  | `--viz-good`/`--viz-bad`, `--viz-you`/`--viz-opp` — never for chrome                                                                                                                                           |

Rules that outrank taste: one blue primary per surface (`SettingsButton`
default); secondary actions are `variant="outline"`; state pills are grey
(`StatePill`, `YouPill`), never blue; a match outcome is `ResultMark`
(glyph), never the word; a missing value is `EmptyMark`, never blank;
scores go through `ScoreLine` (tiebreaks are superscripts); every confirm
is `ConfirmDialog`; every dropdown is `FloatMenu`/`MenuSelect`; icons are
Lucide at 14px, stroke 1.5; light theme only; Inter only.

## Where the truth lives

Read `styles.css` and its import `_ds_bundle.css` for every token value.
`guidelines/SKILL.md` is the rulebook (banned patterns, precedence);
`guidelines/foundations.md`, `components.md`, `tables.md`, `chrome.md`
and `primitives.md` cover layout, tables, menus and the tennis vocabulary.
Each component's `<Name>.prompt.md` shows its props and a verified example.

## One idiomatic composition

```jsx
const {
  SettingsCard,
  SettingsCardTitle,
  SettingsCardRow,
  SettingsCardFootnote,
  AdvSwitch,
  MenuSelect,
} = window.AdvantageDS;

<div style={{ maxWidth: 520 }}>
  <SettingsCard>
    <SettingsCardTitle>Notifications</SettingsCardTitle>
    <SettingsCardRow
      label="Email me when an analysis finishes"
      description="One message per match."
      control={
        <AdvSwitch
          checked
          onCheckedChange={() => {}}
          label="Email on analysis finished"
        />
      }
    />
    <SettingsCardRow
      label="Serve speed"
      control={
        <MenuSelect
          label="Serve speed units"
          value="mph"
          onChange={() => {}}
          options={[
            { value: "mph", label: "mph" },
            { value: "kmh", label: "km/h" },
          ]}
        />
      }
    />
    <SettingsCardFootnote>
      Changes apply the next time a match is analyzed.
    </SettingsCardFootnote>
  </SettingsCard>
</div>;
```
