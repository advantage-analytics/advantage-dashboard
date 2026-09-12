# Events & Matches Vocabulary, v3 Primitives, Wizard & Task Primitives

> Part of the Advantage Analytics design system. Read
> `.skills/advantage-analytics-design/SKILL.md` first — it carries the Banned
> list, the precedence rule and the routing table into this directory.

## Events & Matches — the Vocabulary (v3)

Two nouns, and the copy in every list follows from them. A **match** is the
unit: one player, one opponent, one score, one video. An **event** is an
optional container — Dual · Tournament · Other (opponent program, date range,
home/away) — and a match belongs to 0 or 1. There is no "dual match" record:
a dual is 6 singles + 3 doubles sharing an event.

- **Dual:** creating the event builds the lineup — `S1`–`S6`, `D1`–`D3`, mono
  line labels. Slots are real matches once the lineup is set; an unfilled one
  reads **"Awaiting result"** (5px ink-300 dot + 11px ink-600), an unassigned
  one "Line not set" (a blue "+ Set line" row in the event drawer). The team
  score adds itself up — nobody types 4–3. Video attaches to a line, never to
  the event.
- **Tournament:** no lineup — matches added as played (player · round ·
  opponent), grouped by player in round order, rounds in mono (`R32 · R16 ·
QF · SF · F`).
- **One-off:** the upload wizard asks "Event — optional"; events are created
  from Schedule, never inside the wizard.
- **No duplicates:** video for a scored line attaches to that match; a player
  uploading their own dual video is offered their open slot. Whoever fills a
  slot is credited. Doubles are SwingVision-only for now.
- **Opponents are scoped to what names them:** personal = a private label
  from your own history; team in a dual = a program-scoped player under the
  opposing school (`opponent_player_id`, name only), reused by every later
  match so head-to-heads aggregate; outside a dual, free text. Named once in
  the Players block, never repeated as a Context field. Program players are
  edited from the roster, never from a match.

Copy conventions the lists lean on: sentence case; middots join suffixes and
counts ("Cardinal · M", "12 matches · 8 won"); waiting states say "In line —
we'll notify you", **never an invented ETA**; chrome copy is one word where
one will do (Profile · Account · Preferences · Usage · Plan · Team). The design
project's sample personas: Jordan Lee · Elena Vargas · Meridian State.

---

## v3 Primitives

**`Score`** — tiebreak scores are superscripts, never parentheses: `7-6⁴`,
digit at 0.6em raised 1.05em, 0.5px off the score. Applies to any score
anywhere, not a roster-page treatment.

**`ResultMark`** — `CircleCheck`/`CircleX`/`CircleMinus` at 14px stroke 1.5,
the outcome triple (green/red/ink-500 for a level dual). **The** outcome
register, labelled column or not — `Badge`'s word register is retired, see
**Data Table rule 2** (`reference/tables.md`). Inherits its cell's alignment, never centred. The only
green/red in a row besides form ticks; icon rather than a letter so it
survives translation.

**`Delta`** — compared-number changes color by direction: `↑` viz-good ·
`↓` viz-bad · `→` ink-500. The numeral itself stays ink-900 — direction
carries the color, not the number. Unicode arrows, never icons, and the arrow
always travels with the colour. `Delta` is the bare in-row form; labeled
evidence stats use `InsightStatChip`.

**`InsightCard` + `EngineChip`** — the one AI-authored card format. Header:
eyebrow "Focus" left + `EngineChip` right (20px ink-900 square, radius-button,
white 12×8 logo swoosh via `brightness(0) invert(1)` — never Signal Blue,
never a circle). Body: claim as a falsifiable ≤30ch sentence (text-title),
evidence at 12px ink-700 with tabular numerals — computed, never invented.
Footer: quiet blue text link + text-micro sample count ("from 12 analyzed
matches"). Renders nothing without real numbers. The engine's name lives in
the dark tooltip + `aria-label`, never as visible chrome text — icon-first
rules apply to the chip too.

**`Notice`** — two registers, both radius 8, no headings, no borders. Note
strip: passive fact (seat counts, policy effects), surface-subtle, one 13px
icon max, 11px text, optional quiet blue action — never buttons. Suggestion:
the system proposes an action — blue-tint-08 wash, bold lead names the
finding, body states the consequence, Accept (blue 500) + Decline (quiet,
never red). A suggestion earns its tint by carrying an action; a passive fact
never gets one. The same object hosts the applied-filter strip (Data Table
rule 6) and the wizard's slot suggestion (`SlotLine`, below) — the latter as a
grey strip, not a suggestion tint, since attaching to a line is reversible.

**Mode** — the third register, and the only one that is not about a record:
the surface below has temporarily become an editor, and this says which
editor and how to work it. `--blue-tint-08` wash inside a `--blue-tint-12`
border at `radius-element`, one line, `px-3.5 py-2.5`: the mode's own 14px
glyph · a bold lead naming the mode ("Setting the lineup.") · the gesture in
plain words with the keyboard path in real `Kbd` chips · and, pushed right, a
quiet 11px line saying what is **not** committed yet ("Nothing is saved until
Save lineup."). It earns the tint the way a suggestion does — by being about
an action — but it proposes nothing and has no buttons of its own; the mode's
Cancel and primary live in the page's action slot, which they have taken over
for the duration. It arrives with the mode from just above its slot and
leaves faster than it came, and the surface below is a layout-animated
sibling so it slides rather than jumps. **Stated once, above the thing it
changes** — never a hint per row, and never a second banner for the same
mode. Reorder Mode's banner is the shipped case.

**`Avatar` + `StatePill`** — profile ≠ account, and the avatar says which:
self-managed = unmarked initials (default, no chip); coach-managed = border
ring + grey pill; invited = dashed ring (no person yet, only an email);
"Claimed today" = a transition-receipt pill that decays after a session (a
one-time acknowledgment, not a permanent state). State chips are 18px pill,
10/500 ink-700 on surface-subtle — grey, never an outcome colour; "New" is the
one blue-tinted exception (Data Table rule 4). 26px in rows, 22px in menus.
The avatar is the system's one circle — entities are squares, people are
circles.

**`Radio`** (check-dot) — single-choice selection is a solid Signal Blue 14px
dot + white 9px check (stroke 2.5); unselected is a 1px ink-300 ring; disabled
is a 1px ink-200 ring at 50% opacity. One glyph means "chosen" everywhere:
dot for single-choice (`Radio`), 4px-radius square for multi-select
(`Checkbox`). `card` variant renders the option as a full card; selection
also sets border `--blue` + `--blue-tint-08` wash — the dot marks the
selected item, it never appears on hover.

**`SlotLine`** — one sentence, two hosts. When a match belongs to a lineup
slot the product says so as: line label (11px ink-500; mono only inside a
lineup list) → `chevron-right` 12px ink-300 → the matchup (12px; the
workspace's own player at 500, the opponent at 400) → a 1×14 `--border-medium`
rule → fixture facts (11px ink-600 with 13px ink-400 glyphs: `calendar` date,
`map-pin` site). The event's name is never in the line — the host already
carries it. Nothing in it is blue. Its two hosts stay separate components:
the **chrome band** (a fact you supplied — 36px, full pane width,
surface-subtle with a hairline bottom, pinned under the step bar, persisting
across the whole flow; trailing "Change" opens the lineup as a float menu) and
the **inline `Notice`** (a guess the system made — "Looks like" lead or a
check receipt, trailing Attach · Not this match, then Detach; grey, not
blue-tint, since it's reversible). They differ in lifetime, width authority
and what the trailing action does (navigate vs mutate). Personal workspaces
render neither — no schedule, no slot to state.

**`TermMark`** — the mark before a row in a short list of facts a person is
asked to read before they commit: the join flow's sharing terms
(`components/join/join-terms.tsx`) and the guardian consent acknowledgments
(`app/onboarding/onboarding-flow.tsx`). A Lucide `Check` at 14px, stroke 1.5,
`mt-[3px]` against `text-body-sm`, `aria-hidden` — the sentence carries the
meaning, the glyph only separates the rows. It replaced a 2 × 12px bar, which
read as a rendering artefact rather than a mark.

Colour is the rule, not the glyph. `--blue` marks a row where something is
gained or granted and `--ink-500` a row where nothing moves — that pairing is
what makes the sharing terms' two columns readable as "they gain this" versus
"you keep this" without a second sentence of policy. **Never `--blue` in a
list that sits above a checkbox**: `AuthCheckbox` fills Signal Blue with a
white check when set, and blue marks above it stack four blue checkmarks in
one column with only the last one meaning anything. The guardian
acknowledgments are ink for exactly that reason. Never `--ink-300` — a stroked
glyph at that weight disappears.

Not `CircleCheck`, which is `ResultMark`'s and means a match outcome. Not the
claim flow's `ArrowRight` (`components/claim/sharing-rows.tsx`), which marks
consequences that follow from an action rather than facts being read.

---

## Wizard & Task Primitives (v3)

Locked from the upload wizard. Everything reuses the tokens above — no new
colours, radii or type.

**Required mark — mark what IS required, never what's optional.** A 12px
`--error` asterisk 4px after the eyebrow, `aria-label="Required"`; the
"— optional" suffix retires everywhere, since an unmarked label is optional by
definition. `Input`, `Select`, `Textarea` and `EntitySelect` all take
`required`. The mark is the only red on a form until an error appears, and
form red (`--error`) and Loss Red never share a surface.

**Fields.** Field text is 13px across `Input`, `Select`, `EntitySelect` and
`Textarea` — never 14px. The rule is the focus indicator (1px hairline → 2px
`--blue`; see **Focus** (`reference/focus.md`) → the underline opt-out); `emphasis` keeps a standing 2px
blue rule for the one field a page is asking for; disabled drops the label to
ink-300 and the text to ink-500 with the rule at 1px. `Textarea` is the one
boxed input — everything single-line stays underline.

**`FieldRow`** — one fact with a face: a 40px lead (entity square or person
circle), label, sub-label and a trailing control on a 1px hairline. It is
`EntitySelect`'s menu row grown to field scale, so the row you pick _from_ in
a menu and the row you land _on_ in the form read as one object at two sizes.
The active row thickens its rule to 2px `--blue` (one active row at a time);
unresolved shows a muted circle/square lead + ink-400 placeholder value.
`chevron="double"` (`ChevronsUpDown`) when the row switches between peers,
`chevron="single"` (`ChevronDown`) when it opens a list — never mixed for one
kind of row. Provenance is a tag, stated once: `text-micro` at the field's
right edge, or in the section subline when a whole section shares a source —
never both.

**`StepBar`** — 2px tall, one flex child per step, never a fixed count with
greyed segments; done and current render Signal Blue, remaining stay
`--border-hairline`.

**`InlineFacts`** — a read-back sentence whose 2–3-option facts become
tappable words (surface-subtle wash + 13px chevron, darkening to `--ink-100`
on hover). The row never grows; Change/Done swap the words, not the layout;
no Cancel — every pick is already saved, so reopening the word is the undo.

**`ScoreGrid`** — the one way a score is typed, anywhere. The header states
the format as a plain fact, never a control (Format / Scoring / Lets are their
own required Context fields upstream). 40×40 `--radius-cell` cells, 16px
tabular; focus = 1.5px blue + 2px `--blue-tint-12` ring; a digit advances
focus you → opponent → next set; a dashed ghost column (13px plus) adds a set
while the format allows one; a `TB` column appears only for a set that needs
a tiebreak score and never auto-advances. `Score`'s superscripts remain the
read-back form; `ScoreGrid` is the entry form.

**Quota meter, footer host.** A 56×3 segmented track (`--ink-100` track;
fills in order `--viz-you-mid` used, `--viz-you-light` this file) + an 11px
mono tabular readout, present **only** in a footer where hours are actually
at stake — never on the export path, never on Team Home. The fill is the one
`--viz-*` use outside a chart (the hours are the player's own); Continue stays
the only Signal-Blue object on the row. Settings · Usage is the ledger; the
footer is the receipt.

**Four rules, written down so they aren't re-decided.** _Dashed means waiting
for something real_ (drop zone, invited avatar, ghost column — never for
errors, never decorative). _Provenance is a tag, stated once_ (above). _A
draft is a row, not a toast_ — a grey Draft `StatePill` beside the name, em
dashes in Result/Score, "Resume · step 3 of 4" in the lifecycle cell; the
header's status slot alone says "Draft saved" (`matches/draft-row.tsx` ships
this). _Opponents are scoped to what names them_ (Events & Matches above).

**Selected-row check is Signal Blue, site-wide.** The 13px Lucide `check`
that marks "chosen" in a menu or card is `--blue` everywhere — the same glyph
the check-dot `Radio` carries in white. One colour means "chosen", in menus
and cards alike; the earlier ink-900 menu check is superseded. Single choice
= the check-dot `Radio`, multi-select = the square `Checkbox`; a dialog
carries one primary, never two.

---
