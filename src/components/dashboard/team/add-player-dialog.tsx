"use client";

import { useState, useTransition } from "react";
import { GitMerge, Loader2, Upload, Users } from "lucide-react";
import {
  SettingsField,
  SettingsUnderlineInput,
} from "@/components/dashboard/settings/settings-card";
import { advButton } from "@/lib/ui/adv-button";
import { normalizedPersonName } from "@/lib/data/person-name";
import { addProgramPlayer } from "@/components/dashboard/team/roster-actions";
import { inviteMember } from "@/components/dashboard/settings/team-actions";
import {
  DialogInfoRow,
  DialogProblem,
  RosterDialog,
} from "@/components/dashboard/team/dialog-shell";

/**
 * Design 6c — put a player on the roster now.
 *
 * The counterpart to inviting, and the reason it is the page's blue action:
 * this always works. An invite sends email and waits on somebody else; this
 * creates the row on submit, so a coach can record matches for a freshman who
 * will never open the app. No login, no seat.
 *
 * ── Why the email is optional, and why it still matters ─────────────────────
 * A coach usually knows a player's address and often does not. Made required,
 * it would block the whole point of the feature on a detail. Left out, the
 * duplicate tripwire has nothing to match on later, and the coach ends up with
 * two rows for one athlete. So: optional, with a hint saying what it buys.
 *
 * ── "Also send an invite to claim this profile" ─────────────────────────────
 * The optional half that makes a lone Add button viable. Ticking it creates the
 * row AND sends an invitation targeting it, so the athlete's login binds to the
 * row the coach just made rather than minting a second one. It needs the email,
 * so it is disabled until there is one — a checkbox that silently does nothing
 * is worse than one that says why it cannot.
 *
 * ── Validation ─────────────────────────────────────────────────────────────
 * Presence only, and loosely. `add_program_player` carries the real rules —
 * both names, the email shape, and the two duplicate checks — and its messages
 * are written for people, so they render as-is. A second set of rules here
 * would be a second answer able to drift from the enforced one.
 *
 * ── The two notes, and why neither is `DialogProblem` ───────────────────────
 * Both answer the same shape of question — "wait, do we already have this?" —
 * about something the coach cannot see from inside a dialog. Neither refuses
 * anything: no disabled options, no gated submit, no extra confirm. That row
 * is red, `role="alert"`, and reserved for what `add_program_player` actually
 * refused; these are `role="status"` lines in neutral ink, the same "question,
 * not an alarm" register as the roster table's Possible duplicate chip.
 *
 * *The taken lineup spot.* A spot is deliberately not unique per program (see
 * the `length: 9` comment below), so picking one somebody already holds is
 * legal and often correct — a coach mid-reshuffle enters the new line before
 * clearing the old one. The note says whose line it is and nothing else.
 *
 * *The name already on the roster.* Two athletes can genuinely share a name,
 * and a coach adding the same freshman twice looks identical from here — so
 * the note names the match and shows the address on their row, which is the
 * one field that tells the two apart. `normalizedPersonName` is the roster's
 * own duplicate rule (and `merge_program_players`'), not a second, looser one:
 * a warning the merge path would then refuse to act on is worse than none.
 *
 * It shows the *matched player's* email; it does not check the one being
 * typed. The address collision has real teeth — a partial unique index plus
 * two checks inside `add_program_player` — and re-stating those here is the
 * drift the Validation note above is about. They still arrive as sentences in
 * `DialogProblem`.
 */

/**
 * One live roster row, as much of it as this dialog needs.
 *
 * One list rather than a list per note: both notes ask about the same roster,
 * and two props would be two chances for the page to pass one and forget the
 * other.
 */
export interface RosterPerson {
  name: string;
  /** A coach-managed profile may genuinely have no address on file. */
  email: string | null;
  /** Their line, or null where the program has never set one. */
  lineupSpot: number | null;
  /**
   * Staff hold lines too, so everyone stays in this list — but only players
   * can be the duplicate the name note is about, which is the same rule the
   * roster's own duplicate pass applies in `team-roster-server.ts`.
   */
  isPlayer: boolean;
}

/** The field that tells two same-named rows apart, or the absence of it. */
function emailNote(person: RosterPerson): string {
  return person.email?.trim() ? person.email.trim() : "no email on file";
}

/** "Maya Chen" · "Maya Chen and Alex Ruiz" · "Maya Chen and 2 others". */
function nameList(names: string[]): string {
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names[0]} and ${names.length - 1} others`;
}

/** Four years and the fifth that redshirts and grad transfers actually use. */
const CLASS_YEARS = [
  "Freshman",
  "Sophomore",
  "Junior",
  "Senior",
  "Graduate",
] as const;

/**
 * The underline `<select>`, matching `SettingsUnderlineInput`'s rule.
 *
 * Native, deliberately, for the reason `settings-inline-select.tsx` records: on
 * a phone the platform picker is better than anything we would build, and this
 * is a form somebody fills in once per athlete.
 */
function UnderlineSelect({
  value,
  onChange,
  children,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
  ariaLabel: string;
}) {
  return (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-[34px] cursor-pointer appearance-none border-b border-[var(--border-field)] bg-transparent text-[13px] text-[var(--ink-900)] outline-none transition-colors focus:border-[var(--blue)]"
    >
      {children}
    </select>
  );
}

export function AddPlayerDialog({
  open,
  onOpenChange,
  seatNote,
  roster,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What the program's allowance looks like right now, stated by the caller. */
  seatNote: string;
  /** Who is on the roster already, so a repeat can say who it would repeat. */
  roster: RosterPerson[];
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [classYear, setClassYear] = useState("");
  const [lineupSpot, setLineupSpot] = useState("");
  const [email, setEmail] = useState("");
  const [alsoInvite, setAlsoInvite] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function reset() {
    setFirstName("");
    setLastName("");
    setClassYear("");
    setLineupSpot("");
    setEmail("");
    setAlsoInvite(false);
    setError(null);
  }

  const ready = firstName.trim() !== "" && lastName.trim() !== "";

  // "Not set" is `""`, which `Number("")` would turn into 0 and match nothing —
  // but the empty check says so outright rather than relying on that. A member
  // with no line has `null`, which is never equal to a number, so the same
  // filter covers the whole roster.
  const spotTakenBy =
    lineupSpot === ""
      ? []
      : roster
          .filter((person) => person.lineupSpot === Number(lineupSpot))
          .map((person) => person.name);

  // Half a name matches every Maya on the squad, which is a warning about
  // nothing while somebody is still typing — so this stays empty until both
  // halves are there, and the note is gone again the moment one is cleared.
  const typedName =
    firstName.trim() === "" || lastName.trim() === ""
      ? ""
      : normalizedPersonName(firstName, lastName);

  const sameName =
    typedName === ""
      ? []
      : roster.filter(
          (person) =>
            person.isPlayer && normalizedPersonName(person.name) === typedName
        );

  function submit() {
    setError(null);
    start(async () => {
      const result = await addProgramPlayer({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        classYear: classYear || null,
        lineupSpot: lineupSpot ? Number(lineupSpot) : null,
        email: email.trim() || null,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      // The row exists now whatever happens next. If the invitation fails, say
      // so and leave the dialog open — closing on a half-done action would
      // report the whole thing as done, and the coach would wait for a reply
      // that could not come.
      if (alsoInvite && result.profileId) {
        const invited = await inviteMember({
          email: email.trim(),
          role: "player",
          playerId: result.profileId,
        });
        if (!invited.ok) {
          setError(
            `${lastName.trim()} is on the roster, but the invitation did not send: ${invited.error}`
          );
          setAlsoInvite(false);
          return;
        }
        if (invited.warning) {
          setError(`${firstName.trim()} is on the roster. ${invited.warning}`);
          setAlsoInvite(false);
          return;
        }
      }

      reset();
      onOpenChange(false);
    });
  }

  return (
    <RosterDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
      title="Add a player"
      description="Creates their roster row now. You can upload their matches straight away — they do not need an account."
      footer={
        <>
          <div className="flex-1" />
          <button
            type="button"
            className={advButton("outline")}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className={advButton("primary")}
            disabled={!ready || pending}
            onClick={submit}
          >
            {pending && (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            )}
            Add to roster
          </button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <SettingsField label="First name">
          <SettingsUnderlineInput
            value={firstName}
            autoFocus
            onChange={(event) => setFirstName(event.target.value)}
          />
        </SettingsField>
        <SettingsField label="Last name">
          <SettingsUnderlineInput
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
          />
        </SettingsField>
      </div>

      {/* Directly under the pair of fields it is about, and full width for the
          same reason as the spot note below: an address in a 212px cell wraps
          to three lines and shoves everything under it around as the coach
          types. GitMerge rather than a person glyph — it is the mark the
          roster row already carries for this exact question. */}
      {sameName.length > 0 && (
        <p
          role="status"
          className="-mt-1 flex items-start gap-2 text-[11px] leading-[1.6] text-[var(--ink-600)]"
        >
          <GitMerge
            className="mt-[3px] size-3.5 shrink-0"
            strokeWidth={1.5}
            aria-hidden
          />
          <span>
            {sameName.length === 1
              ? `${sameName[0].name} is already on this roster`
              : `${sameName.length} people on this roster are already called ${sameName[0].name}`}
            {" — "}
            {sameName.map(emailNote).join(", ")}. If this is somebody else, you
            can still add them.
          </span>
        </p>
      )}

      <div className="grid grid-cols-2 gap-4">
        <SettingsField label="Class year">
          <UnderlineSelect
            ariaLabel="Class year"
            value={classYear}
            onChange={setClassYear}
          >
            <option value="">Not set</option>
            {CLASS_YEARS.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </UnderlineSelect>
        </SettingsField>
        <SettingsField label="Lineup spot">
          <UnderlineSelect
            ariaLabel="Lineup spot"
            value={lineupSpot}
            onChange={setLineupSpot}
          >
            <option value="">Not set</option>
            {/* Nine, because a dual line-up is six singles and three doubles.
                Not unique per program on purpose: a coach mid-reshuffle would
                be blocked by a constraint, and there is no swap control. */}
            {Array.from({ length: 9 }, (_, i) => i + 1).map((spot) => (
              <option key={spot} value={String(spot)}>
                #{spot}
              </option>
            ))}
          </UnderlineSelect>
        </SettingsField>
      </div>

      {/* Full width rather than in the field's hint slot: the cell is half of a
          440px dialog, and a name wrapped over three lines would shove the
          email field down every time a coach changed the spot. */}
      {spotTakenBy.length > 0 && (
        <p
          role="status"
          className="-mt-1 flex items-start gap-2 text-[11px] leading-[1.6] text-[var(--ink-600)]"
        >
          <Users
            className="mt-[3px] size-3.5 shrink-0"
            strokeWidth={1.5}
            aria-hidden
          />
          <span>
            {nameList(spotTakenBy)}{" "}
            {spotTakenBy.length === 1 ? "already holds" : "already hold"} #
            {lineupSpot}. Spots can be shared while you reshuffle — you can
            still use this one.
          </span>
        </p>
      )}

      <SettingsField
        label="Email · optional"
        hint="So they can claim this profile later"
      >
        <SettingsUnderlineInput
          type="email"
          value={email}
          placeholder="name@school.edu"
          onChange={(event) => setEmail(event.target.value)}
        />
      </SettingsField>

      <label className="flex cursor-pointer items-start gap-2.5">
        <input
          type="checkbox"
          checked={alsoInvite}
          disabled={email.trim() === ""}
          onChange={(event) => setAlsoInvite(event.target.checked)}
          className="mt-px size-4 shrink-0 cursor-pointer accent-[var(--blue)] disabled:cursor-not-allowed disabled:opacity-40"
        />
        <span>
          <span className="block text-[12px] text-[var(--ink-700)]">
            Also send an invite to claim this profile
          </span>
          <span className="mt-0.5 block text-[11px] leading-[1.5] text-[var(--ink-500)]">
            {email.trim() === ""
              ? "Needs an email address above."
              : "They keep every match you have uploaded when they take over."}
          </span>
        </span>
      </label>

      <DialogProblem message={error} />

      <DialogInfoRow
        icon={<Upload className="size-3.5" strokeWidth={1.5} aria-hidden />}
      >
        No seat used until they claim it — {seatNote}. Matches you upload will
        credit you as the person who added them.
      </DialogInfoRow>
    </RosterDialog>
  );
}
