"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  SettingsCard,
  SettingsCardTitle,
} from "@/components/dashboard/settings/settings-card";
import {
  HOURS_FILL,
  HoursMeter,
} from "@/components/dashboard/settings/teams/program-hours-summary";
import {
  ConfirmAside,
  ConfirmDialog,
  ConfirmProse,
  Em,
} from "@/components/ui/confirm-dialog";
import { DateField } from "@/components/ui/date-field";
import { DialogProblem } from "@/components/ui/dialog-problem";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  formatHoursShort,
  formatResetDate,
  hoursSeverity,
  monthName,
  secondsLeft,
  usageFraction,
} from "@/lib/data/usage-format";
import { shortDate } from "@/lib/data/match-utils";
import {
  adminEndPilot,
  adminSetPilotEligible,
  adminSetPilotEnd,
} from "@/lib/services/programs/admin-team-actions";
import { getMonthlyCapSeconds } from "@/lib/services/splitstep/config";
import { advButton } from "@/lib/ui/adv-button";
import type { AdminTeamPilot } from "@/lib/data/admin-team-server";
import type { ProgramUsage } from "@/lib/data/usage-server";
import type { ProgramOrgType } from "@/lib/workspace/types";

/**
 * This program's pilot, and the month of analysis hours it pays for.
 *
 * One card answering the two questions an admin opens this rail for: how much
 * of the pool is gone, and how long the free window has left. The bar is
 * `ProgramHoursSummary`'s own `HoursMeter`, not a second one, so a program's
 * staff and the console cannot draw the same month a pixel apart. What it does
 * not carry is the breakdown-by-person disclosure — the Usage card below it
 * owns that, and a card that opened a per-athlete ledger in passing would be
 * the console reading further into a team than the job needs.
 *
 * **The pilot is a per-program fact now, not a constant.** Every date here
 * comes from `data.pilot` — T1's four `programs.pilot_*` columns — and this
 * file deliberately imports neither `PILOT_ENDS_AT` nor `formatPilotEnd()`.
 * Those are the old site-wide display string; printing them beside a program
 * whose row says something else would state a date the database does not hold.
 *
 * Severity rides the fill exactly as it does on the staff-facing card — blue,
 * amber from 80%, red at the cap — with a word beside the figure, never colour
 * alone.
 */
export function PilotUsageCard({
  programId,
  programName,
  usage,
  pilot,
  orgType,
  pilotEligible,
  teamPool,
}: {
  programId: string;
  /** Named in the End pilot confirm, so the question has an object. */
  programName: string;
  usage: ProgramUsage;
  pilot: AdminTeamPilot;
  /**
   * `programs.org_type`. A college draws the program pool on its own and
   * shows no pool control; every other kind shows Grant / Revoke.
   */
  orgType: ProgramOrgType | null;
  /** `programs.pilot_eligible` — whether an admin already granted the pool. */
  pilotEligible: boolean;
  /**
   * True when the team draws the program pool (`quotaTierFor` → `"program"`),
   * false when it shares the individual figure. Decided on the server: the
   * quota module is not a client import.
   */
  teamPool: boolean;
}) {
  const router = useRouter();
  // Computed once per render — `endsValue` and `ChangeEndDate`'s date floor
  // both want "today", and calling `utcToday()` a second time risks reading
  // across a midnight UTC rollover between the two.
  const today = utcToday();

  const fraction = usageFraction(usage.usedSeconds, usage.capSeconds);
  const severity = hoursSeverity(fraction);
  const fill = HOURS_FILL[severity];
  const left = secondsLeft(usage.usedSeconds, usage.capSeconds);

  const ended = pilot.endedAt !== null;
  // A program that never had a pilot — no end date, never approved, never
  // ended by hand (an unclaimed program, a custom org). There is nothing to
  // end, so `End pilot` would be a no-op that still looks consequential, and
  // the date control starts one rather than changing one.
  const noPilot = !pilot.endsOn && !pilot.approvedAt && !ended;

  return (
    <SettingsCard className="gap-0 bg-[var(--surface-card)] py-6">
      <SettingsCardTitle
        trailing={
          <span className="text-[11px] text-[var(--ink-500)]">
            {pilot.endsOn
              ? `Through ${formatDay(pilot.endsOn)}`
              : noPilot
                ? "No pilot"
                : "No end date set"}
          </span>
        }
      >
        Pilot
      </SettingsCardTitle>

      {/* The month, as one sentence: what has gone, out of what, when. */}
      <div className="mt-1 flex flex-wrap items-baseline gap-2">
        <span className="text-title-lg tabular-nums">
          {formatHoursShort(usage.usedSeconds)} h
        </span>
        <span className="text-[11px] text-[var(--ink-500)]">
          of {formatHoursShort(usage.capSeconds)} h used in{" "}
          {monthName(usage.billingMonth)}
        </span>
      </div>

      <div className="mt-3.5">
        <HoursMeter
          usedSeconds={usage.usedSeconds}
          capSeconds={usage.capSeconds}
          fraction={fraction}
          fill={fill}
          label="Analysis time used this month"
        />
      </div>

      <div className="mt-2.5 flex items-baseline justify-between gap-3">
        <span className="flex items-baseline gap-1.5 text-[11px] tabular-nums">
          <span className="text-[var(--ink-500)]">
            {formatHoursShort(left)} h left
          </span>
          {/* The severity word. The fill already says it in colour; this is
              the half a reader without colour gets. */}
          {severity !== "ok" && (
            <span style={{ color: fill }}>
              {severity === "spent" ? "Spent" : "Running low"}
            </span>
          )}
        </span>
        <span className="text-[11px] text-[var(--ink-500)]">
          Resets {formatResetDate(usage.billingMonth)}
        </span>
      </div>

      <dl className="mt-4 flex flex-col">
        <Kv
          label="Team pool"
          value={`${formatHoursShort(usage.capSeconds)} h every month`}
        />
        {/* Only where the team draws its own pool. On the individual figure
            the whole team shares one allowance (`quotaTierFor`), so a
            per-member row would contradict the Usage card beside it. Even on
            the program pool there is NO per-member cap on team uploads: the
            figure here is each member's own PERSONAL workspace allowance,
            which never touches this team — the label says "outside this
            team" because "2 h per member" read as a cap on the roster. The
            figure is the tier's own, never a literal 2 beside a cap that
            moves. */}
        {teamPool && (
          <Kv
            label="Members' own workspaces"
            value={`${formatHoursShort(getMonthlyCapSeconds("individual"))} h each, outside this team`}
          />
        )}
        <Kv label="Ends" value={endsValue(pilot, today)} />
        <Kv label="Approved" value={approvedValue(pilot)} />
      </dl>

      <div className="mt-5 flex items-center gap-2">
        <ChangeEndDate
          programId={programId}
          endsOn={pilot.endsOn}
          ended={ended}
          noPilot={noPilot}
          today={today}
          onSaved={() => router.refresh()}
        />
        {/* An ended pilot — or one that never existed — has nothing left to
            end; the RPC is idempotent, so the button would be a no-op that
            still looks consequential. */}
        {!ended && !noPilot && (
          <EndPilot
            programId={programId}
            programName={programName}
            poolHours={formatHoursShort(usage.capSeconds)}
            onEnded={() => router.refresh()}
          />
        )}
      </div>

      {/* The pool itself is a decision only for a non-college team: a college
          draws it from `org_type` alone (`quotaTierFor`), so offering to grant
          or revoke there would be a button the RPC refuses. Its own row rather
          than a third button in the one above — at the rail's width three
          labels would wrap, and this one changes what the team can spend,
          which the date controls do not. */}
      {orgType !== "college" && (
        <div className="mt-2 flex">
          <PoolAccess
            programId={programId}
            programName={programName}
            eligible={pilotEligible}
            onChanged={() => router.refresh()}
          />
        </div>
      )}
    </SettingsCard>
  );
}

/** One fact line — label left at ink-500, value right at ink-900. */
function Kv({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-h-9 items-center justify-between gap-4 py-1.5">
      <dt className="text-[12px] text-[var(--ink-500)]">{label}</dt>
      <dd className="text-[12px] text-[var(--ink-900)] tabular-nums">
        {value}
      </dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------

/** `2026-12-31` → `Dec 31, 2026`, in UTC — the column is a zone-free date. */
function formatDay(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Today in UTC, `YYYY-MM-DD` — the bound `adminSetPilotEnd` validates against. */
function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Whole days of pilot left, counting the end date itself.
 *
 * `pilot_ends_on` is the LAST FREE DAY, inclusive, so an end date of today is
 * one day left, not none. Lexicographic on the ISO strings for the same reason
 * `adminSetPilotEnd` is — see its header.
 */
function daysLeft(endsOn: string, today: string = utcToday()): number {
  const end = Date.parse(`${endsOn}T00:00:00Z`);
  const now = Date.parse(`${today}T00:00:00Z`);
  return Math.round((end - now) / 86_400_000) + 1;
}

/**
 * The `Ends` row.
 *
 * Three states, because three things can be true of a free window: it is
 * running (how long), an admin stopped it by hand (`pilot_ended_at`), or it
 * simply ran out on its own — which is the migration's own word for the null
 * `pilot_ended_at` case, not a coinage.
 */
function endsValue(pilot: AdminTeamPilot, today: string): string {
  if (!pilot.endsOn) {
    return pilot.endedAt ? `Ended ${shortDate(pilot.endedAt)}` : "—";
  }
  const date = formatDay(pilot.endsOn);
  if (pilot.endedAt) return `${date} · Ended ${shortDate(pilot.endedAt)}`;
  const days = daysLeft(pilot.endsOn, today);
  if (days <= 0) return `${date} · Ran out`;
  return `${date} · ${days} ${days === 1 ? "day" : "days"} left`;
}

/**
 * The `Approved` row — `Sep 2 by Avery Lin`, or `by you` for the admin reading.
 *
 * `—` when either half is missing. A date with nobody's name against it is not
 * an approval anybody can follow up on, and the backfill leaves both null
 * together for a program activated without a reviewed claim (T1).
 */
function approvedValue(pilot: AdminTeamPilot): string {
  const who = pilot.approvedByIsViewer ? "you" : pilot.approvedByName;
  if (!pilot.approvedAt || !who) return "—";
  return `${shortDate(pilot.approvedAt)} by ${who}`;
}

// ---------------------------------------------------------------------------
// Change end date
// ---------------------------------------------------------------------------

/**
 * The end date, edited in place.
 *
 * A popover rather than a dialog: one field and one button, entirely about the
 * card it hangs off, and a modal would dim the month the admin is deciding
 * against.
 *
 * **The picker's floor is the same UTC today `adminSetPilotEnd` validates
 * against**, so "that date has already passed" is a backstop for a typed date
 * rather than the first thing an admin meets. Today itself is pickable — the
 * column is the last *inclusive* free day, so today means "free through the
 * end of today", which is a choice and not an expiry.
 *
 * **Reopening is explicit.** `admin_set_pilot_end` clears `pilot_ended_at`, so
 * saving a date on a pilot an admin stopped by hand deliberately starts it
 * again. That is not something to discover afterwards, so the popover says it
 * before the button is pressed rather than the button changing its name.
 */
function ChangeEndDate({
  programId,
  endsOn,
  ended,
  noPilot,
  today,
  onSaved,
}: {
  programId: string;
  endsOn: string | null;
  ended: boolean;
  /** No pilot yet: the trigger reads `Set end date`, since saving starts one. */
  noPilot: boolean;
  /** The card's own `utcToday()`, computed once per render and passed down. */
  today: string;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(endsOn ?? "");
  const [incomplete, setIncomplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startSave] = useTransition();

  const save = () => {
    if (pending) return;
    setError(null);
    startSave(async () => {
      const result = await adminSetPilotEnd({ programId, endsOn: value });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      onSaved();
    });
  };

  // Nothing to save when the field is mid-edit (a blank segment leaves `value`
  // holding the date being replaced — see `DateField`'s own note) or when the
  // date is the one already stored, which the RPC would ignore anyway.
  const unchanged = value === (endsOn ?? "");

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        // The draft is the stored date again each time the popover opens, so
        // an abandoned edit is not waiting there on the next open. Done here
        // rather than in an effect: opening is the event, and an effect
        // keyed on `open` is a cascading render for a state change React
        // already knows about.
        if (next) {
          setValue(endsOn ?? "");
          setError(null);
        }
        setOpen(next);
      }}
    >
      <PopoverTrigger className={`${advButton("outline", "sm")} grow`}>
        {noPilot ? "Set end date" : "Change end date"}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        collisionPadding={12}
        aria-label="Change the pilot end date"
        className="flex w-[268px] flex-col gap-3"
        // `DateField`'s calendar portals to the body, so a click inside it is
        // an outside click as far as Radix is concerned and would shut this
        // popover the moment a day was pressed. React-aria draws that calendar
        // inside a `role="dialog"`, which nothing else in this popover's
        // outside is, so that is the test.
        onInteractOutside={(event) => {
          const target = event.target;
          if (
            target instanceof Element &&
            target.closest('[role="dialog"]') !== null
          ) {
            event.preventDefault();
          }
        }}
      >
        <p className="text-[13px] font-medium text-[var(--ink-900)]">
          Last free day
        </p>

        <DateField
          label="Pilot end date"
          value={value}
          onChange={setValue}
          onIncompleteChange={setIncomplete}
          min={today}
        />

        {ended && (
          <p className="text-[11px] leading-[1.5] text-[var(--ink-500)]">
            This pilot was ended by hand. Saving a date starts it again.
          </p>
        )}

        <DialogProblem message={error} />

        <button
          type="button"
          className={advButton("primary", "sm")}
          onClick={save}
          disabled={pending || incomplete || unchanged || value === ""}
        >
          {pending ? "Saving…" : "Save date"}
        </button>
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// End pilot
// ---------------------------------------------------------------------------

/**
 * Stop the free window now.
 *
 * **The copy says what the write does and not one clause more.**
 * `admin_end_pilot` sets `pilot_ended_at` and clamps `pilot_ends_on` — two
 * columns and an audit row. It does not touch `programs.status`, and nothing
 * server-side reads the pilot columns yet: `reserveQuota()` and
 * `explainVideoRefusal()` still gate video on the monthly cap alone, and T1's
 * header names that as an open follow-up. So this dialog must not say uploads
 * stop, because they do not. An honest confirm that reads as undersized is the
 * feature's real state; a confident one would be a promise the product cannot
 * keep, and the admin who acted on it would find out from a coach.
 *
 * The card's own trigger is `danger` — the proposing weight — and the dialog's
 * confirm is `tone="danger"`, which is `danger-solid`: propose in the card,
 * commit in the dialog.
 */
function EndPilot({
  programId,
  programName,
  poolHours,
  onEnded,
}: {
  programId: string;
  programName: string;
  /** The program's monthly pool, so the copy names the figure it keeps. */
  poolHours: string;
  onEnded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startEnd] = useTransition();

  const end = () => {
    if (pending) return;
    setError(null);
    startEnd(async () => {
      const result = await adminEndPilot(programId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      onEnded();
    });
  };

  return (
    <>
      <button
        type="button"
        className={`${advButton("danger", "sm")} grow`}
        onClick={() => setOpen(true)}
      >
        End pilot
      </button>

      <ConfirmDialog
        open={open}
        onOpenChange={(next) => {
          if (pending) return;
          setOpen(next);
          if (!next) setError(null);
        }}
        tone="danger"
        title={`End the pilot for ${programName}?`}
        description="Today becomes the pilot's last free day, and the change is recorded in the program's history."
        confirmLabel="End pilot"
        pendingLabel="Ending…"
        pending={pending}
        error={error}
        onConfirm={end}
      >
        <ConfirmProse>
          <p>
            <Em>{programName}</Em> keeps its matches, its members and its{" "}
            {poolHours} h monthly pool. Nothing the team can do today changes.
          </p>
          <p>
            Ending a pilot is a <Em>record, not a gate</Em> — video is still
            limited only by that monthly pool, here as everywhere else.
          </p>
        </ConfirmProse>
        <ConfirmAside>
          Setting a new end date afterwards starts the pilot again.
        </ConfirmAside>
      </ConfirmDialog>
    </>
  );
}

/**
 * Grant a non-college team the pilot's program pool, or take it back —
 * `adminSetPilotEligible`. One button whose label is the other state, and a
 * confirm that says what changes in prose: the figure the team draws from
 * next, and (on a grant) the approver and end date the record gains. The
 * figures come from `config.ts`, never literals, so they move with the tier.
 *
 * Grant is the primary tone: it is consequential (paid vendor hours) but
 * creates, not destroys. Revoke is the danger tone — it takes spend away from
 * a team mid-month, and the dialog says the dates stay so nobody reads it as
 * ending the pilot.
 */
function PoolAccess({
  programId,
  programName,
  eligible,
  onChanged,
}: {
  programId: string;
  programName: string;
  eligible: boolean;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startChange] = useTransition();

  const programHours = formatHoursShort(getMonthlyCapSeconds("program"));
  const individualHours = formatHoursShort(getMonthlyCapSeconds("individual"));

  const change = () => {
    if (pending) return;
    setError(null);
    startChange(async () => {
      const result = await adminSetPilotEligible({
        programId,
        eligible: !eligible,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      onChanged();
    });
  };

  const onOpenChange = (next: boolean) => {
    if (pending) return;
    setOpen(next);
    if (!next) setError(null);
  };

  return (
    <>
      <button
        type="button"
        className={`${advButton(eligible ? "outline" : "primary", "sm")} grow`}
        onClick={() => setOpen(true)}
      >
        {eligible ? "Revoke team pool" : "Grant team pool"}
      </button>

      {eligible ? (
        <ConfirmDialog
          open={open}
          onOpenChange={onOpenChange}
          tone="danger"
          title={`Take ${programName} off the team pool?`}
          description="The team goes back to the individual figure, and the change is recorded in the program's history."
          confirmLabel="Revoke pool"
          pendingLabel="Revoking…"
          pending={pending}
          error={error}
          onConfirm={change}
        >
          <ConfirmProse>
            <p>
              <Em>{programName}</Em> will draw the individual {individualHours}{" "}
              h a month, shared by every member, from its next upload. Analysis
              already running is not affected.
            </p>
            <p>
              The pilot&rsquo;s approver and end date stay as they are — this
              changes what the team can spend, not whether it is on the pilot.
            </p>
          </ConfirmProse>
          <ConfirmAside>
            Granting the pool again restores the figure.
          </ConfirmAside>
        </ConfirmDialog>
      ) : (
        <ConfirmDialog
          open={open}
          onOpenChange={onOpenChange}
          title={`Put ${programName} on the team pool?`}
          description="The team draws the program figure from now on, and the change is recorded in the program's history."
          confirmLabel="Grant pool"
          pendingLabel="Granting…"
          pending={pending}
          error={error}
          onConfirm={change}
        >
          <ConfirmProse>
            <p>
              <Em>{programName}</Em> will draw {programHours} h of analysis a
              month as a team, instead of the individual {individualHours} h
              figure it shares today.
            </p>
            <p>
              You are recorded as the approver if nobody is yet, and the pilot
              end date is set to Dec 31, 2026 if none is set or it has passed.
            </p>
          </ConfirmProse>
          <ConfirmAside>
            Change the end date afterwards from this card; revoking the pool
            does not end the pilot.
          </ConfirmAside>
        </ConfirmDialog>
      )}
    </>
  );
}
