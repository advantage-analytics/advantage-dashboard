"use client";

import type { LucideIcon } from "lucide-react";
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
export const CLASS_YEARS = [
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
export const LINEUP_SPOTS = Array.from({ length: 9 }, (_, i) => i + 1);

/**
 * The underline `<select>`, matching `SettingsUnderlineInput`'s rule.
 *
 * Native, deliberately, for the reason `settings-inline-select.tsx` records: on
 * a phone the platform picker is better than anything we would build, and this
 * is a form somebody fills in once per athlete.
 */
export function UnderlineSelect({
  value,
  onChange,
  children,
  ariaLabel,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
  ariaLabel: string;
  disabled?: boolean;
}) {
  return (
    <select
      aria-label={ariaLabel}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      className="h-[34px] cursor-pointer appearance-none border-b border-[var(--border-field)] bg-transparent text-[13px] text-[var(--ink-900)] outline-none transition-colors focus:border-[var(--blue)] disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </select>
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
 * Visual only, deliberately, and `aria-hidden` to say so. A live region that
 * arrives already populated is one assistive tech never announces — it reports
 * *changes* to a region it was already watching — so the announcing is done by
 * an always-mounted `sr-only` region beside it, and hiding the visible copy
 * keeps each sentence from being read twice.
 */
export function RosterNote({
  icon: Icon,
  children,
}: {
  icon: LucideIcon;
  /** A prepared sentence, not nodes: the live region has to say the same one. */
  children: string;
}) {
  return (
    <p
      aria-hidden
      className="-mt-1 flex items-start gap-2 text-[11px] leading-[1.6] text-[var(--ink-600)]"
    >
      <Icon className="mt-[3px] size-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
      <span>{children}</span>
    </p>
  );
}

/** "Maya Chen" · "Maya Chen and Alex Ruiz" · "Maya Chen and 2 others". */
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
  exclude: string | null
): string[] {
  if (spot === "") return [];
  return roster
    .filter(
      (person) =>
        person.lineupSpot === Number(spot) &&
        (exclude === null || person.profileId !== exclude)
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
