"use client";

import { useState, useTransition } from "react";
import { Loader2, Upload } from "lucide-react";
import {
  SettingsField,
  SettingsUnderlineInput,
} from "@/components/dashboard/settings/settings-card";
import { advButton } from "@/lib/ui/adv-button";
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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What the program's allowance looks like right now, stated by the caller. */
  seatNote: string;
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
