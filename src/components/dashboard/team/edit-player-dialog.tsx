"use client";

import { useEffect, useState, useTransition } from "react";
import { Info, Loader2, Users } from "lucide-react";
import {
  SettingsField,
  SettingsUnderlineInput,
} from "@/components/dashboard/settings/settings-card";
import { advButton } from "@/lib/ui/adv-button";
import {
  getProgramPlayerFields,
  updateProgramPlayer,
  type PlayerFields,
} from "@/components/dashboard/team/roster-actions";
import {
  DialogInfoRow,
  DialogProblem,
  RosterDialog,
} from "@/components/dashboard/team/dialog-shell";
import {
  CLASS_YEARS,
  LINEUP_SPOTS,
  RosterNote,
  UnderlineSelect,
  spotHeldNote,
  spotHolders,
} from "@/components/dashboard/team/player-fields";
import type { RosterMember } from "@/lib/data/team-roster-server";

/**
 * Correct a roster row — the other half of Add player.
 *
 * A coach types a squad in at the start of a season and gets a surname wrong,
 * or a freshman moves up to #3 in October. Until now the only repairs the page
 * offered were merge and remove, which are both about rows that should not
 * exist rather than rows that are slightly wrong.
 *
 * ── The fields come from the database, not from the row on screen ────────────
 * The table's `RosterMember` looks like everything this form needs and is the
 * wrong source for two of the five. `program_roster_full` returns
 * `coalesce(pp.email, u.email)` and `coalesce(pp.class_year, u.class)`, which
 * is right for a roster — a claimed player's login address is better than a
 * blank — and wrong for an editor, because saving it would copy a personal
 * login address into `program_players.email`, the column the duplicate
 * tripwire and the invite flow both key on. So the dialog opens empty and
 * fills in from `getProgramPlayerFields`, and Save is unavailable until it
 * does. A form that could be submitted before the read lands is a form that
 * can write the props it was seeded with.
 *
 * ── All five, every time ────────────────────────────────────────────────────
 * `update_program_player` overwrites the whole row and its optional parameters
 * default to NULL, so a field this form did not send is a field it cleared.
 * Every one is held in state and passed on every save; see the action for the
 * longer note.
 *
 * ── Two ways this can refuse ────────────────────────────────────────────────
 * A lineup spot somebody else holds is not one of them: spots are shareable on
 * purpose and the note beside the field says so, in the same words Add player
 * uses. What does refuse is a repeated email — a partial unique index, turned
 * into a sentence by the action — and a row that has left the roster since this
 * opened, which ends the dialog rather than offering a retry there is nothing
 * left to retry against.
 */
export function EditPlayerDialog({
  member,
  roster,
  onOpenChange,
}: {
  /** The row being edited, or null when closed. */
  member: RosterMember | null;
  /** Everyone on the roster, so the lineup-spot note can name who else holds one. */
  roster: RosterMember[];
  onOpenChange: (open: boolean) => void;
}) {
  const [fields, setFields] = useState<PlayerFields | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Terminal: the row is not on this roster, so there is nothing to save to. */
  const [gone, setGone] = useState(false);
  const [pending, start] = useTransition();

  /**
   * Cleared when the dialog changes rows, and when it closes.
   *
   * Adjusted DURING render for the reason `merge-profiles-dialog` records: an
   * effect would paint one player's details over another's for a frame. The
   * empty-string case is what makes closing a reset — the parent drops the
   * member on close, so reopening the *same* player still runs this and reads
   * the row again rather than showing whatever was typed and abandoned.
   */
  const profileId = member?.profileId ?? "";
  const [lastProfileId, setLastProfileId] = useState(profileId);
  if (profileId !== lastProfileId) {
    setLastProfileId(profileId);
    setFields(null);
    setError(null);
    setGone(false);
  }

  useEffect(() => {
    if (profileId === "") return;
    // `live` guards the slow-early-response race: close one row and open
    // another quickly, and the first reply must not fill in the second's form.
    let live = true;
    getProgramPlayerFields(profileId).then((result) => {
      if (!live) return;
      if (result.ok) {
        setFields(result.fields);
        return;
      }
      setError(result.error);
      setGone(result.gone);
    });
    return () => {
      live = false;
    };
  }, [profileId]);

  // Staff rows have no profile to edit — `program_roster_full` only fills
  // `profile_id` for players — so the menu never offers this for one.
  if (!member || member.profileId === null) return null;

  /** One patch helper, so the five fields cannot drift into five setters. */
  function edit<K extends keyof PlayerFields>(key: K, value: PlayerFields[K]) {
    setFields((current) =>
      current === null ? current : { ...current, [key]: value }
    );
  }

  function close() {
    if (pending) return;
    onOpenChange(false);
  }

  const ready =
    fields !== null &&
    !gone &&
    fields.firstName.trim() !== "" &&
    fields.lastName.trim() !== "";

  // Excluding this row is the whole point of the exclusion: the note is about
  // who *else* is on the line, and the coach can already see whose row this is.
  const spot = fields?.lineupSpot ?? "";
  const spotTakenBy = spotHolders(roster, spot, member.profileId);
  const spotNote =
    spotTakenBy.length === 0 ? null : spotHeldNote(spotTakenBy, spot);

  function submit() {
    if (!fields) return;
    setError(null);
    start(async () => {
      const result = await updateProgramPlayer({
        // `profileId` rather than `member.profileId`: the same value, but a
        // const the guard above has already narrowed to a real id.
        profileId,
        firstName: fields.firstName.trim(),
        lastName: fields.lastName.trim(),
        classYear: fields.classYear || null,
        lineupSpot: fields.lineupSpot ? Number(fields.lineupSpot) : null,
        email: fields.email.trim() || null,
      });

      if (!result.ok) {
        setError(result.error);
        // No retry offered on a row that is gone: the form below goes away and
        // the only thing left is to close and reload.
        if (result.gone) setGone(true);
        return;
      }

      onOpenChange(false);
    });
  }

  return (
    <RosterDialog
      open
      onOpenChange={(next) => {
        // `close()` is a no-op while the save is in flight, so Escape and the
        // overlay leave the dialog open rather than half-closing it.
        if (!next) close();
      }}
      title="Edit player"
      description={
        gone
          ? "Nothing was changed. Reload the page to see the current squad."
          : "Their name, class year, lineup spot and the address on this profile. Matches already recorded stay with this player."
      }
      footer={
        gone ? (
          <>
            <div className="flex-1" />
            <button
              type="button"
              className={advButton("outline")}
              onClick={close}
            >
              Close
            </button>
          </>
        ) : (
          <>
            <div className="flex-1" />
            <button
              type="button"
              className={advButton("outline")}
              disabled={pending}
              onClick={close}
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
              Save changes
            </button>
          </>
        )
      }
    >
      {gone ? (
        <DialogProblem message={error} />
      ) : fields === null ? (
        /* Nothing to fill in yet, and deliberately no placeholder values: the
           row on screen is not this form's source. */
        <p className="flex items-center gap-2 py-2 text-[12px] text-[var(--ink-500)]">
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
          Reading {member.name}&apos;s details…
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4">
            <SettingsField label="First name">
              <SettingsUnderlineInput
                value={fields.firstName}
                disabled={pending}
                onChange={(event) => edit("firstName", event.target.value)}
              />
            </SettingsField>
            <SettingsField label="Last name">
              <SettingsUnderlineInput
                value={fields.lastName}
                disabled={pending}
                onChange={(event) => edit("lastName", event.target.value)}
              />
            </SettingsField>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <SettingsField label="Class year">
              <UnderlineSelect
                ariaLabel="Class year"
                value={fields.classYear}
                disabled={pending}
                onChange={(value) => edit("classYear", value)}
              >
                <option value="">Not set</option>
                {/* A class year typed straight into the database — or carried
                    over from the player's own profile before this row had one —
                    need not be one of the five. Kept as an option so opening
                    the dialog cannot silently change it to "Not set". */}
                {!CLASS_YEARS.some((year) => year === fields.classYear) &&
                  fields.classYear !== "" && (
                    <option value={fields.classYear}>{fields.classYear}</option>
                  )}
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
                value={fields.lineupSpot}
                disabled={pending}
                onChange={(value) => edit("lineupSpot", value)}
              >
                <option value="">Not set</option>
                {/* Same reason as the class year above: a spot outside 1–9 is
                    legal in the column and must survive being looked at. */}
                {fields.lineupSpot !== "" &&
                  !LINEUP_SPOTS.some(
                    (option) => String(option) === fields.lineupSpot
                  ) && (
                    <option value={fields.lineupSpot}>
                      #{fields.lineupSpot}
                    </option>
                  )}
                {LINEUP_SPOTS.map((option) => (
                  <option key={option} value={String(option)}>
                    #{option}
                  </option>
                ))}
              </UnderlineSelect>
            </SettingsField>
          </div>

          {/* Mounted for as long as the form is, so a sentence arriving later
              is a *change* to a region assistive tech is already watching —
              the only kind it announces. See `RosterNote`. */}
          <div aria-live="polite" aria-atomic="true" className="sr-only">
            {spotNote ?? ""}
          </div>
          {spotNote && <RosterNote icon={Users}>{spotNote}</RosterNote>}

          <SettingsField
            label="Email · optional"
            hint={
              fields.claimed ? undefined : "So they can claim this profile later"
            }
          >
            <SettingsUnderlineInput
              type="email"
              value={fields.email}
              placeholder="name@school.edu"
              disabled={pending}
              onChange={(event) => edit("email", event.target.value)}
            />
          </SettingsField>

          <DialogProblem message={error} />

          {fields.claimed && (
            <DialogInfoRow
              icon={<Info className="size-3.5" strokeWidth={1.5} aria-hidden />}
            >
              This player signs in for themselves. The address above is the one
              on their roster row, not the one they log in with — the roster
              falls back to their login address when this is empty, and changing
              it here does not change how they sign in.
            </DialogInfoRow>
          )}
        </>
      )}
    </RosterDialog>
  );
}
