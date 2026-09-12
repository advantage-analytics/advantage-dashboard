# Settings Pages

> Part of the Advantage Analytics design system. Read
> `.skills/advantage-analytics-design/SKILL.md` first — it carries the Banned
> list, the precedence rule and the routing table into this directory.

## Settings Pages

> **Provenance.** Unlike the **(v3)** rules above, this section is not
> transcribed from the Claude Design project — it was decided in-repo while
> designing Settings › Teams (2026-09-06) and generalizes to every settings
> page and every card that lists people or meters a quota. It has no round
> number, because round numbers belong to that project's changelog. When the
> project next moves, reconcile this section rather than assuming it agrees.

### Quota widgets — a meter or a row of boxes

The form follows the quantity, not the habit:

- **Continuous quota → meter.** Analysis hours are a duration, so they get the
  6px/3px bar. The **track is a light step of the fill's own hue**
  (`#E4EEFD` under Signal Blue), never neutral `--ink-100`: a grey track only
  colours the part already spent, so state has to be re-read at the boundary
  instead of across the whole bar.
- **Countable quota, small N → unit boxes.** Seats are 25 discrete things, so
  they are 25 8px squares on 2px radius (the DS keeps circles for avatars).
  You can see "three left" without reading a number, which a bar at 20% cannot
  say. Filled = taken, **outlined = reserved but not yet taken**, `--ink-100`
  = free. That middle state is the reason the form is worth it: a held invite
  is a real thing the data tracks and a sentence buries.
- **Never both on one card.** Two quota visuals stacked read as one measure
  drawn twice; the second becomes a count in the title slot.

**Lead with what is left, and say when it renews.** `11h 48m left of 20h`
above `8h 12m / 20h` — the second makes the reader subtract to answer the
question they actually have. The figure is 24px/300 with **proportional**
figures (`tabular-nums` loosens a standalone number at display sizes; reserve
it for columns), and it stays `--ink-900` until there is something to say.

**Severity rides the fill, not the figure**: Signal Blue → `--viz-key` amber at
80% → `--danger` at 100%, each with a short label and a triangle glyph beside
it (_Running low_, _Spent — uploads pause until Oct 1_). Never colour alone.
At amber and red the figure takes the same colour, because then it _is_ the
message.

**Detail unfolds in place.** A per-person breakdown is a disclosure inside the
card, not a link to the page that owns the ledger — those pages are scoped to
the **active workspace**, so a link from a record you have not switched into
shows a different program's numbers. Rows carry an 88px share bar, ordered by
magnitude, plus the in-flight total the meter includes but the list otherwise
omits (_Reserved but not yet finished_).

### Person row in a card

One shape for every person a card lists — members, invitees, usage lines:

```
[22px avatar] [name 12/500] [You] ……… [action or date 11px] [state pill 62px]
```

- **The state pill is a right-aligned column**, `width:62px`, centred text.
  Placed straight after the name it lands at a different x on every row, and a
  long email drags it further than a short name — the column is what makes the
  list scan.
- **Meta is not a biography.** Role is the pill; a position and a joining date
  beneath the name are a second, softer answer to the question the pill already
  answered. Slot the row's one useful variable there instead — a date on an
  invitation, an action on a member.
- **The role is a menu on the rows the viewer may change**, in the pill's
  column: a 28px bordered trigger (`Coach ▾`), a 212px float menu with one
  line per option saying what it lets you do, the current one carrying the
  blue check, and a closing note — _Ownership moves by transfer, not from
  this menu._ Owner is never an option. What the viewer may set mirrors
  `set_program_member_role`: an owner sees coach / staff / player on every
  row but their own; a coach sees staff / player on staff and player rows
  only. A row that is not theirs keeps the flat pill — with a lock glyph
  before it when the viewer is staff, and nothing extra for a player, for
  whom no row was ever a control. Picking commits at once.
- **Pending → outlined pill + dashed-ring avatar.** An `Invited` row is a state
  of the same list, not a different kind of row. The outlined pill deliberately
  matches the outlined seat box representing that same invite.
- **The `You` pill is the one sanctioned blue-tinted pill besides "New"**
  (design owner's call, 2026-09-06, overriding _people-state chips are grey_).
  It marks identity, not standing, so it sits **beside the name** and the role
  stays in the pill column. 18px, `--blue-tint-08` on `--blue`. A third blue
  pill costs both of these their meaning — do not add one.

### Selects on a settings page are `MenuSelect`

The product's own menu (see **Dropdown / Menu**, `reference/chrome.md`, for the primitives):
`underline` under a `SettingsField` caption, `pill` beside a
`SettingsCardRow` label. Options with something to explain — a role, an
upload policy — get the second line; plain values (a surface) do not. There
is no native select left in settings, and none is to be added.

**Who can upload team matches** is a four-rung ladder, not a switch: _Owner
only · Owner and coaches · All staff · Everyone on the team_
(`programs.upload_policy`; `players_can_upload` is derived from it and keeps
the roster's own switch working).

### A field the viewer may not change

Never a `disabled` input: it still looks like an input, so it reads as broken
rather than as not-yours. The recipe is the field, quieted, plus a reason:

- value on a faint `--ink-100` rule (not `--border-field`, which says _editable_)
- a 11px lock glyph before it, value at `--ink-600`
- **the reason in `SettingsField`'s existing `hint` slot, naming the person**:
  _"Ask Alina Fischer, the owner, to change it."_ A lock that does not say who
  holds the key sends the reader to support.

The caption stays plain — no `· owner only` tag, which restates the hint. Note
the cost: the hint makes a locked field taller than its editable neighbours, so
a two-column grid loses its shared baseline. Reserve the hint's line height on
every field in the grid where that matters.

**Field-level gating is presentation only.** The RPC behind the form must
re-check per group, the way `program_invites_role_check` fences `owner` out of
invitations. A greyed field stops nobody with a console.

### Card footnotes and their rule

`SettingsCardFootnote`'s `border-top` earns its place only when the content
above it is **not already hairline-delimited**. Above a field grid, or below a
list whose last row already drew a rule, it is a second line two pixels from
the first. Drop it there and let 14px of space do the work; keep it where the
note closes a figure, a meter, or a paragraph.

### One action, one surface

A settings card must not grow its own copy of an action another page owns. The
Members card carries no invite field: the roster's dialog can bind an
invitation to a player already listed — so their matches and video stay put —
and a second, thinner control produces orphan logins beside existing rows.
Summarize, then hand off. The split is by _what the act is_, not by page:
adding and removing people is roster admin and lives on the Roster; what a
person **is** — their role, and ownership — is decided on their row here,
because that is where the person is.

**A control that leaves the page wears `↗`, not `›`.** The chevron means
_expands_ or _next step_ and is already spoken for by disclosures; on the same
page as one, an outbound chevron is the same glyph with two meanings. Keep the
outline button and the title slot — only the glyph changes.

### Confirmation is a changed state, not a tick

`--success` is fenced to win/loss (`colors.css`), and a confirmation tick is
exactly the mood use that fence excludes — spend green there and it stops
meaning _won a match_ on a match card. A completed action shows **the rows it
changed**, in the vocabulary of the surface behind the dialog:

```
MR  Marcus Reyes          was Coach   [ Owner ]
CG  Cj Gimena  [You]      was Owner   [ Coach ]
```

Closing the dialog then confirms what was just shown, instead of asking the
reader to trust an assertion.

### Dialog steps

**A step that re-asks what the entry point already answered must not exist.**
_Make owner_ on a member row names the person; a picker step after it opened a
second copy of the member list to choose them again. Where an action can start
from the row that is its subject, start it there and let the dialog begin at
the consequence.

---
