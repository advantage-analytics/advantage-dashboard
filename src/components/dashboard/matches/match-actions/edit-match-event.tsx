"use client";

import { Plus } from "lucide-react";
import { SettingsUnderlineInput } from "@/components/dashboard/settings/settings-card";
import { MenuSelect } from "@/components/ui/menu-select";
import { roundOptionsFor } from "@/lib/matches/round-options";

/**
 * The Edit Match dialog's two event rows, split out so they render offline
 * (`tests/edit-match-event.spec.ts`): the closing line of a match on a line,
 * with "Remove from event" for someone who may take it off, and the Event
 * field of a match that isn't on one.
 *
 * Both text actions — "Add to an event" and "Remove from event" — share one
 * class list: blue text, `--blue-hover` on hover, no pill, no border.
 */
export const EVENT_ACTION_CLS =
  "inline-flex cursor-pointer items-center gap-[3px] text-[11px] font-medium text-[var(--blue)] transition-colors hover:text-[var(--blue-hover)]";

/** What the Event field holds once a match is loaded: its stored name, or empty. */
export function eventFieldValue(match: {
  tournament_name: string | null;
}): string {
  return match.tournament_name ?? "";
}

/**
 * The closing line for a match on a scheduled line. The event owns the date,
 * the line or round and the surface; `canDetach` adds the one way to take this
 * match off it (`detach_match_from_event_line`). On a tournament line with
 * `canEditRound` the round is the match's own, chosen in the dialog
 * (`set_match_round_on_line`), so the sentence leaves it out. `scheduleHint`
 * off drops "Change them in Schedule." — the dialog passes `SCHEDULE_ENABLED`,
 * since the Schedule may be a coming-soon page (`lib/schedule/availability.ts`).
 */
export function LinkedEventLine({
  eventKind,
  canDetach,
  canEditRound = false,
  scheduleHint = true,
  onRemove,
  disabled,
}: {
  eventKind: "dual" | "tournament";
  canDetach: boolean;
  canEditRound?: boolean;
  scheduleHint?: boolean;
  onRemove: () => void;
  disabled?: boolean;
}) {
  return (
    <>
      <span>
        {`${
          eventKind === "tournament" && canEditRound
            ? "The date and surface come from the tournament."
            : `The date, ${eventKind === "dual" ? "line" : "round"} and surface come from the ${eventKind}.`
        }${scheduleHint ? " Change them in Schedule." : ""}`}
      </span>
      {canDetach && (
        <span>
          <button
            type="button"
            onClick={onRemove}
            disabled={disabled}
            className={EVENT_ACTION_CLS}
          >
            Remove from event
          </button>
        </span>
      )}
    </>
  );
}

/**
 * The Event field of a match that isn't on a line: a free-text name, and for a
 * team match the one-off note — with "Add to an event" when `canAttach`. While
 * the line picker is open it takes the input's place and the note goes.
 */
export function EventField({
  value,
  onChange,
  disabled,
  picker,
  teamMatch,
  canAttach,
  onAdd,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  /** The open line picker, drawn in place of the input. */
  picker?: React.ReactNode;
  teamMatch: boolean;
  canAttach: boolean;
  onAdd: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[11px] text-[var(--ink-600)]">Event</span>
      {picker ?? (
        <SettingsUnderlineInput
          aria-label="Event"
          value={value}
          placeholder="Tournament, dual or practice"
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {teamMatch && !picker && (
        <span className="flex flex-wrap items-center gap-x-2 pt-0.5 text-[11px] text-[var(--ink-500)]">
          {canAttach ? (
            <>
              <span>One-off · not on the schedule</span>
              <span className="text-[var(--ink-300)]">·</span>
              <button
                type="button"
                onClick={onAdd}
                disabled={disabled}
                className={EVENT_ACTION_CLS}
              >
                <Plus className="size-[11px]" strokeWidth={2} aria-hidden />
                Add to an event
              </button>
            </>
          ) : (
            <span>
              One-off · not on the schedule. A coach who runs the schedule can
              add it to an event.
            </span>
          )}
        </span>
      )}
    </div>
  );
}

/**
 * The Round of a tournament line — one picked in "Add to an event", or the
 * one the match is already on. The attach takes the match's own round
 * (`attach_match_to_event_line`), and `set_match_round_on_line` changes it
 * later, so it is chosen here, beside the line, rather than back in Details.
 * Rounds the entry already has a result for are left out (never the match's
 * own); the RPCs' "That round already has a result." stays the backstop.
 */
export function EventRoundField({
  value,
  takenRounds,
  onChange,
  disabled,
  error,
}: {
  value: string;
  takenRounds: readonly string[];
  onChange: (next: string) => void;
  disabled?: boolean;
  error?: string;
}) {
  const options = roundOptionsFor("tournament").filter(
    (option) => !takenRounds.includes(option.value),
  );
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <span className="text-[11px] text-[var(--ink-600)]">Round</span>
      <MenuSelect
        label="Round"
        variant="underline"
        placeholder="Not set"
        value={value || undefined}
        width={220}
        options={options}
        disabled={disabled}
        onChange={onChange}
      />
      {error && (
        <span className="text-[11px]" style={{ color: "var(--danger)" }}>
          {error}
        </span>
      )}
    </div>
  );
}
