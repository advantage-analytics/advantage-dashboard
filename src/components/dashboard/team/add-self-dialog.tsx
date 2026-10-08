"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Loader2, Lock, Users } from "lucide-react";
import { advButton } from "@/lib/ui/adv-button";
import { YouPill } from "@/components/ui/you-pill";
import type { SeatUsage } from "@/lib/data/team-roster-server";
import {
  DialogInfoRow,
  DialogProblem,
  RosterDialog,
  SeatNote,
} from "./dialog-shell";
import {
  PlayerMenuField,
  classYearOptions,
  lineupSpotOptions,
} from "./player-fields";
import { addSelfAsPlayer } from "./roster-actions";

const APPEARS_NOTE = "You appear in the roster table and can be set on a line.";
const REMOVE_NOTE =
  "Remove yourself from the roster at any time. Your matches stay with you.";

// The rules themselves live in a plain module so a spec can import them
// without this file's UI; re-exported here because every caller already
// imports them from the dialog they belong to.
export {
  isOwnAddress,
  mayAddSelf,
  mayRemoveStaffProfile,
  type OwnAddressOffer,
} from "./staff-profile-rules";

/**
 * The question both dialogs ask instead of letting the server answer "that
 * person is already on this roster" — true, and no help to the one person it
 * is said to. Amber, one row, a text answer: it is a question to act on, not a
 * failure, and the form's own primary stays off while it is showing because
 * the write it would make is the one being refused.
 */
export function OwnAddressNotice({ onAddSelf }: { onAddSelf: () => void }) {
  return (
    <div
      role="status"
      className="flex items-center gap-2 rounded-[var(--radius-element)] border border-[var(--warning-border)] bg-[var(--warning-bg)] px-[11px] py-[9px] text-[11px] leading-[1.6] text-[var(--warning-text)]"
    >
      <span className="min-w-0 flex-1">
        That&rsquo;s your own address. Add yourself as a player instead?
      </span>
      <button
        type="button"
        onClick={onAddSelf}
        className="shrink-0 cursor-pointer rounded-[var(--radius-cell)] font-medium whitespace-nowrap underline-offset-2 hover:underline focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
      >
        Add myself
      </button>
    </div>
  );
}

/**
 * Add yourself as a player — for the owner, a coach or a staff member who also
 * plays.
 *
 * A team match is recorded against a roster player, and somebody on the staff
 * side of the program is not one until they say so. This is where they say so:
 * one act, once, that binds a player profile to the login that is asking. It
 * is opened from the two places that person hits the wall — the upload
 * wizard's For menu, and Add player or Invite when they type their own
 * address — and never offered as a standing setting, because putting a person
 * on the roster is roster work and takes a seat.
 *
 * Nothing here names a person: the action takes none, so the dialog cannot be
 * pointed at anybody but the viewer. The name is shown, locked, because a
 * roster row is made from the account's own name and this is not where that
 * is changed. Hand and backhand are not asked — they live on the account
 * (Settings › Profile) and the wizard reads them from there.
 *
 * `seats` is optional because the wizard has no roster loaded; without it the
 * cost is stated in a sentence and the server's seat check is the authority.
 */
export function AddSelfDialog({
  open,
  onOpenChange,
  viewerName,
  programId,
  teamName,
  seats,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The program this dialog is about — the action refuses any other. */
  programId: string;
  viewerName: string;
  /** "Meridian State" — the roster being joined. */
  teamName: string;
  seats?: SeatUsage;
  onAdded?: (added: { profileId: string; name: string }) => void;
}) {
  const [classYear, setClassYear] = useState("");
  const [lineupSpot, setLineupSpot] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Each opening starts clean: the component stays mounted between openings,
  // and yesterday's refusal over today's form reads as today's.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setClassYear("");
      setLineupSpot("");
      setError(null);
    }
  }

  // Known only where the roster is loaded. `add_self_as_program_player`
  // re-checks under a lock either way; this keeps the button from offering a
  // write the database is going to refuse.
  const full = seats ? seats.used + seats.pending >= seats.seats : false;

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await addSelfAsPlayer({
        programId,
        classYear: classYear || null,
        lineupSpot: lineupSpot ? Number(lineupSpot) : null,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onAdded?.({ profileId: result.profileId, name: result.name });
      onOpenChange(false);
    });
  };

  const users = <Users className="size-3.5" strokeWidth={1.5} aria-hidden />;

  return (
    <RosterDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add yourself as a player"
      description={`Your role stays as it is. This puts a player profile for you on ${teamName}'s roster, so a match can be filed as yours.`}
      width={440}
      footer={
        <>
          <span className="flex-1" />
          <button
            type="button"
            className={advButton("outline")}
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className={advButton("primary")}
            disabled={pending || full}
            onClick={submit}
          >
            {pending && (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            )}
            Add me to the roster
          </button>
        </>
      }
    >
      {/* Not an input: a field the viewer may not change here is the value on
          a faint rule with a lock and the place it IS changed. */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] text-[var(--ink-500)]">Name</span>
        <span className="flex h-[34px] items-center gap-2 shadow-[inset_0_-1px_0_var(--ink-100)]">
          <Lock
            className="size-[11px] shrink-0 text-[var(--ink-500)]"
            strokeWidth={1.5}
            aria-hidden
          />
          <span className="truncate text-[13px] text-[var(--ink-600)]">
            {viewerName}
          </span>
          <YouPill className="shrink-0" />
        </span>
        <span className="text-[11px] leading-[1.5] text-[var(--ink-500)]">
          From your account. Change it in Settings › Profile.
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <PlayerMenuField
          label="Class year"
          value={classYear}
          options={classYearOptions(classYear)}
          onChange={setClassYear}
          disabled={pending}
        />
        <PlayerMenuField
          label="Lineup spot"
          value={lineupSpot}
          options={lineupSpotOptions(lineupSpot)}
          onChange={setLineupSpot}
          disabled={pending}
        />
      </div>

      <DialogProblem message={error} />

      {seats && full ? (
        <DialogInfoRow
          icon={
            <AlertTriangle
              className="size-3.5 text-[var(--danger)]"
              strokeWidth={1.5}
              aria-hidden
            />
          }
        >
          <strong className="font-medium text-[var(--danger)]">
            All <span className="tabular">{seats.seats}</span> seats are taken.
          </strong>{" "}
          Remove a player or revoke an invitation to free one — their matches
          stay.
        </DialogInfoRow>
      ) : seats ? (
        <SeatNote
          icon={users}
          lead="Uses a seat."
          seats={seats}
          adding={1}
          footnote={REMOVE_NOTE}
        >
          {APPEARS_NOTE}
        </SeatNote>
      ) : (
        <DialogInfoRow icon={users}>
          <strong className="font-medium text-[var(--ink-900)]">
            Uses a seat.
          </strong>{" "}
          {APPEARS_NOTE} {REMOVE_NOTE}
        </DialogInfoRow>
      )}
    </RosterDialog>
  );
}
