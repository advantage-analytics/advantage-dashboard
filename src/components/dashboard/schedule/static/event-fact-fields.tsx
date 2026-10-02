"use client";

/**
 * The fact cells both event builders draw — the dual's second step and the
 * tournament's — and the two option tables they draw from: the format rows
 * with their words, and the three sites.
 *
 * Moved out of `dual-build-step.tsx` when the tournament builder adopted the
 * dual's Format and Site controls, so that builder can import four small
 * things without bundling a lineup editor, an opponent popup and the dual's
 * data context along with them. `dual-build-step.tsx` re-exports all of it,
 * so its importers did not move.
 */

import type { EventSite } from "@/lib/schedule/types";
import type { MenuOption } from "@/components/ui/menu-select";
import {
  EVENT_DOUBLES_FORMATS,
  EVENT_FORMATS,
  doublesSetLabel,
  scoringWords,
  siteTitle,
  type DoublesFormatValue,
  type DoublesGamesTo,
  type EventFormatValue,
} from "@/lib/schedule/format";

/**
 * One row of the Format control: the option it is, and what it means.
 *
 * ── Why this is a table and not an encoding ────────────────────────────────
 * The deleted `dual-form.tsx` carried the format through a `<select>` as one
 * pipe-joined string of the two fields, and decoded it by splitting on the
 * pipe, numbering the first half and string-comparing the second against the
 * word true. Until an earlier pass the cell here held the same string, with
 * both halves hard-coded — and because `adScoring` is `boolean | null` on
 * `EventFormat`, a null interpolates into such a string as the four characters
 * spelling null, which that comparison then reads as a confident
 * `false`: a wrong answer that looks like a real one. That is the recorded
 * cause of a real outage — format arrived as `{}`, `adScoring` arrived null,
 * and every tournament video failed vendor submission long after the coach had
 * left. See `docs/ui-revamp-guardrails.md` §3.1 and §4, and `TournamentFormat`
 * in `static-tournament-builder.tsx`, which made this same call first.
 *
 * So there is no encoding to get wrong. `value` is an opaque option name that
 * is only ever compared, never parsed; `bestOf` and `adScoring` are stated as
 * literals in `FORMATS` and travel as themselves. `adScoring` is typed
 * `boolean` rather than `boolean | null`, which makes "the control carries a
 * real boolean" a compile error to break rather than a convention to
 * remember: no null can be assigned into this shape, so none can reach
 * `createDual`'s `format` jsonb.
 *
 * `sets` and `scoring` are the two strings `2b` prints — the sets half inside
 * the underline, the scoring half under it. Both are read off the chosen row,
 * so the label and the value cannot drift into disagreeing about which format
 * this dual is.
 */
export interface DualFormat {
  /** The option's name — matched against, never split. */
  value: EventFormatValue;
  /** What the closed cell prints, and the menu row's first line. */
  sets: string;
  /** What prints under the cell, and the menu row's second line. */
  scoring: string;
  bestOf: number;
  adScoring: boolean;
}

/**
 * `2b`'s wording over the shared format table.
 *
 * Only the words live here, in title case — the same words `formatLabel()`
 * prints on the pinned bar and the event page, so a format reads one way
 * wherever it appears. The tournament builder draws these too. `bestOf` and
 * `adScoring` come from
 * `EVENT_FORMATS` in `lib/schedule/format.ts`, so the two builders cannot word
 * the same option differently where it counts — see that table's header, and
 * `docs/ui-revamp-guardrails.md` §3.1 and §4.
 */
const FORMAT_WORDS: Record<
  EventFormatValue,
  { sets: string; scoring: string }
> = {
  "bo3-no-ad": {
    sets: "Best of 3 Sets",
    scoring: "No-Ad Scoring",
  },
  "bo3-ad": {
    sets: "Best of 3 Sets",
    scoring: "Ad Scoring",
  },
  "one-set-no-ad": {
    sets: "One Set",
    scoring: "No-Ad Scoring",
  },
  "one-set-ad": {
    sets: "One Set",
    scoring: "Ad Scoring",
  },
};

/**
 * The four formats the control offers.
 *
 * `2b` draws one — "Best of 3 sets" over "No-ad scoring" — and no dropdown
 * contents, so the other three are built from vocabulary that already exists
 * rather than invented: "One set", "ad" and "no-ad" are the dormant
 * `FORMATS`' words, in that table's order. The first row is what the artboard
 * draws, and what a new dual opens on.
 */
export const FORMATS: readonly DualFormat[] = EVENT_FORMATS.map((format) => ({
  ...format,
  ...FORMAT_WORDS[format.value],
}));

/**
 * The Format control's options: one per `FORMATS` row, carrying `2b`'s two
 * halves as the two lines `MenuSelect` draws — `sets` as the label the closed
 * trigger prints, `scoring` as the description beneath it in the open menu.
 *
 * Pure and exported so the mapping can be asserted without mounting the step
 * (`tests/dual-format-options.spec.ts`). What it deliberately does NOT carry
 * is `bestOf` or `adScoring`: an option is a NAME to look the row back up by,
 * so nothing downstream can read a scoring rule off the dropdown instead of
 * off the row. See `DualFormat`'s header and
 * `docs/ui-revamp-guardrails.md` §3.1.
 */
export function formatOptions(
  formats: readonly DualFormat[],
): MenuOption<EventFormatValue>[] {
  return formats.map((format) => ({
    value: format.value,
    label: format.sets,
    description: format.scoring,
  }));
}

/**
 * One row of the Doubles format control — the dual's second format.
 *
 * Same shape of rule as `DualFormat`: `value` is a name looked up, `gamesTo`
 * and `adScoring` literals off `EVENT_DOUBLES_FORMATS`, never parsed. The
 * menu row and the note under the cell read "Tiebreak at 6-6 · No-Ad Scoring"
 * — the tiebreak rule with the scoring half the singles cell prints alone.
 */
export interface DoublesFormat {
  value: DoublesFormatValue;
  /** "One Set to 6" — the closed cell and the menu row's first line. */
  label: string;
  /** "Tiebreak at 6-6 · No-Ad Scoring" — the menu row's second line. */
  detail: string;
  gamesTo: DoublesGamesTo;
  adScoring: boolean;
}

export const DOUBLES_FORMATS: readonly DoublesFormat[] =
  EVENT_DOUBLES_FORMATS.map((format) => ({
    ...format,
    label: doublesSetLabel(format.gamesTo),
    detail: `Tiebreak at ${format.gamesTo}-${format.gamesTo} · ${scoringWords(format.adScoring)}`,
  }));

/** The Doubles format control's options — see `formatOptions`. */
export function doublesFormatOptions(
  formats: readonly DoublesFormat[],
): MenuOption<DoublesFormatValue>[] {
  return formats.map((format) => ({
    value: format.value,
    label: format.label,
    description: format.detail,
  }));
}

/**
 * The three sites a dual can be at, titled through the shared schedule
 * formatter and in the dormant form's order. `EventSite` on `value`, so the
 * union is checked here rather than cast at the change handler.
 */
export const SITES: readonly { value: EventSite; label: string }[] = (
  ["home", "away", "neutral"] as const
).map((value) => ({ value, label: siteTitle(value) }));

/**
 * One fact under its eyebrow — `2b` draws all four the same way.
 *
 * Two chromes, because the four cells no longer answer the same way. `rule`
 * is the artboard's row drawn here: a hairline and the control inside it.
 * `none` hands the whole treatment to the child, because `MenuSelect`'s
 * underline trigger already draws that hairline, its own chevron and its own
 * 2px blue rule on focus — a second hairline here would stack a rule on a
 * rule and a chevron beside a chevron.
 *
 * Both are a `<div>`, and `rule` is one on purpose. It was a `<label>` while
 * a native date input sat in it and the eyebrow named that input. `DateField`
 * is a group of segments plus a calendar `<button>`, and a button IS
 * labelable: the `<label>` forwarded every click on a segment to the calendar
 * button instead, so the month could never be clicked into. Measured, not
 * assumed. Each cell's `label` string goes to its child as an `aria-label`,
 * which is what names the control now.
 *
 * Not the deleted `field-row.tsx`'s `FieldCellText`/`FieldCellSelect`: those
 * were 25b's row and carried its `FieldRow` spacing (`mt-3.5`, `gap-8`) where
 * this artboard draws a plain four-up at `gap:24px`. The row's own spacing
 * matched those cells exactly, `pt-1.5 pb-[7px]` included;
 * `static-tournament-builder.tsx` still records the same numbers.
 */
export function FieldCell({
  label,
  chrome = "rule",
  note,
  children,
}: {
  label: string;
  /** `rule` draws the hairline row; `none` lets the child draw its own. */
  chrome?: "rule" | "none";
  /** Drawn under the cell — the two format cells' second line. */
  note?: string;
  children: React.ReactNode;
}) {
  const eyebrow = <span className="eyebrow">{label}</span>;
  const footnote = note ? (
    <span
      className="text-micro mt-[5px] block"
      style={{ color: "var(--ink-600)" }}
    >
      {note}
    </span>
  ) : null;

  if (chrome === "none") {
    return (
      <div>
        {eyebrow}
        {children}
        {footnote}
      </div>
    );
  }

  return (
    <div>
      {eyebrow}
      {/* `focus-within`, not `focus-visible`: the rule belongs to the row and
          what it answers is focus landing on the control inside it. The
          control inside opts out of the ring — the rule going blue IS the one
          mark (`styles/design-system/focus.css`).

          34px, not padding around the content: this row sits in a four-up
          beside three `MenuSelect` underline triggers, which are 34px, and a
          rule whose height is whatever its content happens to be does not
          line up with them. It did while the content was bare text; the date
          brought a 28px calendar button with it and the row grew, leaving the
          Date rule sitting ~7px below the other three. Borders are inside the
          box, so thickening to 2px on focus moves nothing.

          `--border-field`, not `--border-hairline`: this rule IS a field's
          underline, and the field family draws it in that token —
          `MenuSelect`'s underline trigger in the three cells beside this one,
          `SettingsUnderlineInput`, `DateField`'s own `underline` variant. The
          two are not interchangeable greys (#E5E5EA against #F3F3F3), so the
          hairline read visibly fainter than its neighbours in the same row.
          `--border-hairline` is for a divider between things, which is what
          the rest of this file uses it for. */}
      <span className="relative flex h-[34px] items-center border-b border-[var(--border-field)] focus-within:border-b-2 focus-within:border-[var(--blue)]">
        {children}
      </span>
      {footnote}
    </div>
  );
}
