"use client";

import type { LucideIcon } from "lucide-react";
import { SettingsField } from "@/components/dashboard/settings/settings-card";
import { MenuSelect, type MenuOption } from "@/components/ui/menu-select";
import type { RosterMember } from "@/lib/data/team-roster-server";

/**
 * The five fields a roster profile is made of, and the notes they raise.
 *
 * Add player and Edit player are the same form twice — one against a row that
 * does not exist yet and one against a row that does — so the vocabulary they
 * share lives here rather than in whichever of them was written first. The
 * lineup-spot note in particular: a second implementation of "somebody already
 * holds #3" is a second sentence able to disagree with the first about whether
 * that is a problem, and the whole point of the note is that it is not one.
 *
 * Extracted from `add-player-dialog.tsx`, unchanged. Its longer commentary on
 * why these notes are quiet rather than red still lives there, next to the
 * duplicate-name note that only the add path raises.
 */

/** Four years and the fifth that redshirts and grad transfers actually use. */
const CLASS_YEARS = [
  "Freshman",
  "Sophomore",
  "Junior",
  "Senior",
  "Graduate",
] as const;

/**
 * Nine, because a dual line-up is six singles and three doubles.
 *
 * Not unique per program on purpose: a coach mid-reshuffle would be blocked by
 * a constraint, and there is no swap control. `program_players` carries no
 * unique index on the column, so the note below is the whole of the check.
 */
const LINEUP_SPOTS = Array.from({ length: 9 }, (_, i) => i + 1);

/**
 * "Not set" as a `MenuSelect` row. The form state keeps `""` for it — that is
 * what the save path turns into `null` — but a menu row needs a value of its
 * own, so `PlayerMenuField` maps it back before the caller sees it.
 */
const NOT_SET = "__not-set";

/**
 * The options with a stored value that is in none of them kept as its own
 * first row, and "Not set" last — the same order Edit match uses.
 *
 * A class year typed straight into the database, or carried over from the
 * player's own profile before this row had one, need not be one of the five;
 * a spot outside 1–9 is legal in the column. Either must survive the dialog
 * being opened, rather than silently becoming "Not set".
 */
function withStored(
  value: string,
  options: MenuOption<string>[],
  label: (stored: string) => string,
): MenuOption<string>[] {
  const stored =
    value !== "" && !options.some((option) => option.value === value)
      ? [{ value, label: label(value) }]
      : [];
  return [...stored, ...options, { value: NOT_SET, label: "Not set" }];
}

export function classYearOptions(value: string): MenuOption<string>[] {
  return withStored(
    value,
    CLASS_YEARS.map((year) => ({ value: year, label: year })),
    (stored) => stored,
  );
}

export function lineupSpotOptions(value: string): MenuOption<string>[] {
  return withStored(
    value,
    LINEUP_SPOTS.map((spot) => ({ value: String(spot), label: `#${spot}` })),
    (stored) => `#${stored}`,
  );
}

/**
 * Class year or Lineup spot: a caption over an underline `MenuSelect`, in the
 * form's `""`-means-unset vocabulary.
 *
 * `labelless`, because `SettingsField`'s `<label>` forwards every click inside
 * it to the trigger button, so picking a row would reopen the menu it just
 * closed. The select carries its own accessible name.
 */
export function PlayerMenuField({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  /** From `classYearOptions` / `lineupSpotOptions`, called with `value`. */
  options: MenuOption<string>[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <SettingsField label={label} labelless>
      <MenuSelect
        label={label}
        variant="underline"
        placeholder="Not set"
        value={value || undefined}
        options={options}
        disabled={disabled}
        onChange={(next) => onChange(next === NOT_SET ? "" : next)}
      />
    </SettingsField>
  );
}

/**
 * The quiet line under a field: an icon and a sentence, no fill, neutral ink.
 *
 * Deliberately not `DialogProblem`. That row is red and `role="alert"`, and it
 * is reserved for what the database refused; these are observations a coach is
 * free to ignore — the register the roster table's "Possible duplicate" chip
 * already uses for the same kind of question.
 *
 * Renders both halves of the note, because the visible half alone is not the
 * whole component. A live region that arrives already populated is one
 * assistive tech never announces — it reports *changes* to a region it was
 * already watching — so the sentence is announced by an `sr-only` region that
 * stays mounted whether or not there is a sentence yet, and the visible copy is
 * `aria-hidden` so each one is not read twice.
 *
 * Both halves live here rather than at the call sites so that invariant cannot
 * drift: mount the region conditionally, or write `&&` where `?? ""` belongs,
 * and the note silently announces nothing — no type error, no failing test.
 * Pass `note={null}` for "no note"; do not wrap this in a conditional.
 *
 * The fragment keeps the two elements siblings in the caller's layout, and each
 * note owns its own region on purpose: `aria-atomic` re-reads a region whole,
 * so a shared one would repeat the name sentence every time the spot changed.
 */
export function RosterNote({
  icon: Icon,
  note,
}: {
  icon: LucideIcon;
  /** A prepared sentence, not nodes: the live region has to say the same one. */
  note: string | null;
}) {
  return (
    <>
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {note ?? ""}
      </div>
      {note === null ? null : (
        <p
          aria-hidden
          className="-mt-1 flex items-start gap-2 text-[11px] leading-[1.6] text-[var(--ink-600)]"
        >
          <Icon
            className="mt-[3px] size-3.5 shrink-0"
            strokeWidth={1.5}
            aria-hidden
          />
          <span>{note}</span>
        </p>
      )}
    </>
  );
}

/**
 * "Maya Chen" · "Maya Chen and Alex Ruiz" · "Maya Chen and 2 others".
 *
 * Exported because Add player's occupied-spot confirm says the same names
 * directly under the note `spotHeldNote` builds from them. The two sentences
 * are deliberately separate — Edit player raises the note and no confirm — but
 * the JOINER is a product decision they must agree on: stop at two names, spell
 * the remainder "and N others". Two copies could drift, and the note and its
 * own confirm disagreeing about how many names to list is the visible cost.
 */
export function nameList(names: string[]): string {
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names[0]} and ${names.length - 1} others`;
}

/**
 * Who else is on this line, for the note that says a shared spot is allowed.
 *
 * `exclude` is the profile the form is about — the row being edited, or the row
 * an add just wrote. Without it the note names the very player on screen and
 * warns a coach off their own unchanged lineup spot.
 *
 * "Not set" is `""`, which `Number("")` would turn into 0 and match nothing —
 * but the empty check says so outright rather than relying on that. A member
 * with no line has `null`, which is never equal to a number, so the same filter
 * covers the whole roster.
 */
export function spotHolders(
  roster: RosterMember[],
  spot: string,
  exclude: string | null,
): string[] {
  if (spot === "") return [];
  return roster
    .filter(
      (person) =>
        person.lineupSpot === Number(spot) &&
        (exclude === null || person.profileId !== exclude),
    )
    .map((person) => person.name);
}

/**
 * A spot is deliberately not unique per program, so picking one somebody
 * already holds is legal and often correct — a coach mid-reshuffle enters the
 * new line before clearing the old one. The note says whose line it is and
 * nothing else.
 */
export function spotHeldNote(names: string[], spot: string): string {
  const holds = names.length === 1 ? "already holds" : "already hold";
  return `${nameList(names)} ${holds} #${spot}. Spots can be shared while you reshuffle — you can still use this one.`;
}
