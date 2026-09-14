"use client";

import { useEffect, useState, useTransition } from "react";
import { Info, Loader2, Trash2, Users } from "lucide-react";
import {
  SettingsField,
  SettingsUnderlineInput,
} from "@/components/dashboard/settings/settings-card";
import { advButton } from "@/lib/ui/adv-button";
import type { ActionResult } from "@/components/dashboard/settings/actions";
import {
  archiveProgramPlayer,
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
  PlayerMenuField,
  RosterNote,
  classYearOptions,
  lineupSpotOptions,
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
 *
 * ── Remove, where the page asks for it ──────────────────────────────────────
 * With `onRemoved`, the footer's left slot carries **Remove from roster** — the
 * roster drawer's Options row, moved to the one surface the player profile
 * has for this player. It rests grey and turns `--danger` on hover and focus
 * (DS › Dropdown / Menu, destructive rows), and it does not remove: it swaps
 * the dialog to a confirm step, and red stands only on that step's button.
 * The drawer removes in one click; here the page the coach is standing on
 * goes with the player, so the step says so before it happens.
 *
 * Offered only once the fields have loaded, because the confirm step's copy
 * depends on `claimed` — `archive_program_player` also releases a claimed
 * profile's seat, which is the one consequence the drawer's line leaves out.
 */
export function EditPlayerDialog({
  member,
  roster,
  onOpenChange,
  onRemoved,
}: {
  /** The row being edited, or null when closed. */
  member: RosterMember | null;
  /** Everyone on the roster, so the lineup-spot note can name who else holds one. */
  roster: RosterMember[];
  onOpenChange: (open: boolean) => void;
  /**
   * Offers Remove from roster, and runs once the player is archived — the
   * profile page navigates away, since the page it is on now names nobody.
   * Absent where another surface already carries Remove (the roster drawer).
   */
  onRemoved?: () => void;
}) {
  const [fields, setFields] = useState<PlayerFields | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Terminal: the row is not on this roster, so there is nothing to save to. */
  const [gone, setGone] = useState(false);
  const [pending, start] = useTransition();
  const [step, setStep] = useState<"edit" | "confirm">("edit");
  /**
   * Terminal like `gone`, but a success: the archive landed and `onRemoved` is
   * navigating. Held so the buttons stay disabled between the transition
   * ending and the page going, rather than re-enabling for a frame.
   */
  const [removed, setRemoved] = useState(false);

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
    setStep("edit");
    setRemoved(false);
  }

  useEffect(() => {
    if (profileId === "") return;
    // `live` guards the slow-early-response race: close one row and open
    // another quickly, and the first reply must not fill in the second's form.
    let live = true;
    getProgramPlayerFields(profileId)
      .then((result) => {
        if (!live) return;
        if (result.ok) {
          setFields(result.fields);
          return;
        }
        setError(result.error);
        setGone(result.gone);
      })
      // A server action *rejects* rather than resolving when the request never
      // completes — a dropped connection, a deploy mid-flight. Without this the
      // dialog keeps the "Reading …" placeholder forever, because that state is
      // exactly "no fields, no error, not gone", and Save never enables. Not
      // `gone`: the row may be perfectly fine and the network is not.
      .catch(() => {
        if (!live) return;
        setError("Couldn't reach the server. Close this and try again.");
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
      current === null ? current : { ...current, [key]: value },
    );
  }

  const busy = pending || removed;

  function close() {
    if (busy) return;
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
      // Wrapped because a rejected save is the one failure the coach must not
      // read as "nothing happened": the request may have committed before the
      // connection went. Say so rather than leaving a silent form.
      let result: Awaited<ReturnType<typeof updateProgramPlayer>>;
      try {
        result = await updateProgramPlayer({
          // `profileId` rather than `member.profileId`: the same value, but a
          // const the guard above has already narrowed to a real id.
          profileId,
          firstName: fields.firstName.trim(),
          lastName: fields.lastName.trim(),
          classYear: fields.classYear || null,
          lineupSpot: fields.lineupSpot ? Number(fields.lineupSpot) : null,
          email: fields.email.trim() || null,
        });
      } catch {
        setError(
          "Couldn't reach the server, so this may or may not have saved. Reload the page to check.",
        );
        return;
      }

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

  function remove() {
    setError(null);
    start(async () => {
      let result: ActionResult;
      try {
        result = await archiveProgramPlayer(profileId);
      } catch {
        setError(
          "Couldn't reach the server, so they may or may not have been removed. Reload the page to check.",
        );
        return;
      }
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setRemoved(true);
      onRemoved?.();
    });
  }

  if (step === "confirm") {
    return (
      <RosterDialog
        open
        onOpenChange={(next) => {
          if (!next) close();
        }}
        title={`Remove ${member.name} from the roster?`}
        description="They come off the lineup and out of the team's lists."
        footer={
          <>
            <div className="flex-1" />
            <button
              type="button"
              className={advButton("outline")}
              disabled={busy}
              onClick={() => {
                setError(null);
                setStep("edit");
              }}
            >
              Back
            </button>
            <button
              type="button"
              className={advButton("danger-solid")}
              disabled={busy}
              onClick={remove}
            >
              {busy && (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              )}
              Remove from roster
            </button>
          </>
        }
      >
        <ul className="flex flex-col gap-[7px] rounded-[var(--radius-element)] bg-[var(--surface-subtle)] px-3.5 py-3 text-[11px] leading-[1.5] text-[var(--ink-700)]">
          <ConfirmBullet>
            Their matches stay on the program&apos;s record, still attributed to
            this profile.
          </ConfirmBullet>
          {fields?.claimed && (
            <ConfirmBullet>
              They sign in for themselves, so they also lose access to the team.
            </ConfirmBullet>
          )}
          <ConfirmBullet>
            Adding them again offers to restore this profile.
          </ConfirmBullet>
          <ConfirmBullet>
            You&apos;ll land back on the roster — this profile page closes with
            them.
          </ConfirmBullet>
        </ul>
        <DialogProblem message={error} />
      </RosterDialog>
    );
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
            {onRemoved && fields !== null && (
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setError(null);
                  setStep("confirm");
                }}
                className="group -ml-2 inline-flex h-9 cursor-pointer items-center gap-[7px] rounded-[var(--radius-button)] px-2 text-[12px] text-[var(--ink-700)] transition-colors duration-[var(--duration-hover)] hover:bg-[var(--surface-subtle)] hover:text-[var(--danger)] focus-visible:bg-[var(--surface-subtle)] focus-visible:text-[var(--danger)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
              >
                <Trash2
                  className="size-[13px] shrink-0 text-[var(--ink-400)] transition-colors duration-[var(--duration-hover)] group-hover:text-[var(--danger)] group-focus-visible:text-[var(--danger)]"
                  strokeWidth={1.5}
                  aria-hidden
                />
                Remove from roster
              </button>
            )}
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
            <SettingsField label="First name" required>
              <SettingsUnderlineInput
                aria-required
                value={fields.firstName}
                disabled={pending}
                onChange={(event) => edit("firstName", event.target.value)}
              />
            </SettingsField>
            <SettingsField label="Last name" required>
              <SettingsUnderlineInput
                aria-required
                value={fields.lastName}
                disabled={pending}
                onChange={(event) => edit("lastName", event.target.value)}
              />
            </SettingsField>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* The option builders keep a stored value outside the list as
                its own row, so opening the dialog cannot silently change it
                to "Not set". */}
            <PlayerMenuField
              label="Class year"
              value={fields.classYear}
              options={classYearOptions(fields.classYear)}
              disabled={pending}
              onChange={(value) => edit("classYear", value)}
            />
            <PlayerMenuField
              label="Lineup spot"
              value={fields.lineupSpot}
              options={lineupSpotOptions(fields.lineupSpot)}
              disabled={pending}
              onChange={(value) => edit("lineupSpot", value)}
            />
          </div>

          <RosterNote icon={Users} note={spotNote} />

          <SettingsField
            label="Email"
            hint={
              fields.claimed
                ? "Optional"
                : "Optional — so they can claim this profile later"
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

function ConfirmBullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <span aria-hidden="true" className="text-[var(--ink-400)]">
        ·
      </span>
      <span>{children}</span>
    </li>
  );
}
