"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { MenuSelect } from "@/components/ui/menu-select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { SettingsUnderlineInput } from "@/components/dashboard/settings/settings-card";
import {
  ROSTER_MENU_CLS,
  RosterMenuList,
} from "@/components/dashboard/matches/new-match-wizard/RosterMenu";
import { cn } from "@/lib/utils";
import { BACKHAND_OPTIONS, HAND_OPTIONS } from "@/lib/matches/hand-options";
import type { Backhand, Hand } from "@/lib/matches/patch-match";
import type { EditRosterPlayer } from "@/lib/matches/edit-match-suggestions";

export interface PlayerFields {
  name: string;
  hand: Hand | null;
  backhand: Backhand | null;
}

const NOT_SET = "not-set" as const;
const handOptions = [...HAND_OPTIONS, { value: NOT_SET, label: "Not set" }];
const backhandOptions = [
  ...BACKHAND_OPTIONS,
  { value: NOT_SET, label: "Not set" },
];

function Caption({
  children,
  required,
}: {
  children: string;
  required?: boolean;
}) {
  return (
    <span className="text-[11px] text-[var(--ink-600)]">
      {children}
      {required && (
        <>
          <span aria-hidden="true" className="ml-0.5 text-[var(--danger)]">
            *
          </span>
          <span className="sr-only"> (required)</span>
        </>
      )}
    </span>
  );
}

/**
 * The team player — the upload wizard's For menu, the same list
 * (`RosterMenuList`), behind this form's underline trigger.
 */
function RosterPicker({
  roster,
  playerId,
  name,
  onPick,
  disabled,
  error,
  menuLabel,
  viewerId,
  myPlayerId,
}: {
  roster: readonly EditRosterPlayer[];
  playerId: string | null;
  name: string;
  onPick: (player: EditRosterPlayer) => void;
  disabled?: boolean;
  error?: string;
  menuLabel: string;
  viewerId: string;
  myPlayerId: string | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={
            name ? `Your player: ${name}. Choose a player` : "Choose a player"
          }
          aria-haspopup="listbox"
          aria-expanded={open}
          disabled={disabled}
          data-focus-ring="none"
          className={cn(
            "flex h-[34px] w-full min-w-0 cursor-pointer items-center gap-2 border-b text-left text-[13px] transition-[border-color] duration-[var(--duration-hover)] focus-visible:border-b-2 focus-visible:border-[var(--blue)] focus-visible:outline-none",
            open
              ? "border-b-2 border-[var(--blue)]"
              : error
                ? "border-[var(--danger)]"
                : "border-[var(--border-field)]",
          )}
        >
          <span
            className={cn(
              "min-w-0 flex-1 truncate",
              name ? "text-[var(--ink-900)]" : "text-[var(--ink-400)]",
            )}
          >
            {name || "Choose a player"}
          </span>
          <ChevronDown
            className={cn(
              "size-[13px] shrink-0 text-[var(--ink-400)] transition-transform duration-200 ease-[var(--ease-primary)]",
              open && "rotate-180",
            )}
            strokeWidth={1.5}
            aria-hidden
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        role="listbox"
        aria-label="Who played this match"
        className={cn(
          ROSTER_MENU_CLS,
          "max-h-[360px] w-[440px] overflow-y-auto",
        )}
      >
        <RosterMenuList
          label={menuLabel}
          roster={roster}
          chosenPlayerId={playerId}
          viewerId={viewerId}
          myPlayerId={myPlayerId}
          onChoose={(player) => {
            setOpen(false);
            if (player.playerId !== playerId) onPick(player);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

/**
 * Players — one grid, the upload wizard's Players section in the Roster
 * dialogs' dress (P2 refined, shared labels).
 *
 * The name track takes 1.5 shares because a name is the longest value. The
 * first row carries all three labels on one line; the second row lines up
 * under it and is labelled only by its side, because which side a name is on
 * decides who the statistics belong to.
 *
 * On a team match, "Your player" is picked from the roster, and changing it
 * says what that does: the match's stats move with it. On a match that is on a
 * scheduled line the lineup decides the player, and an analyzed match keeps the
 * player it was analyzed for, so both read back instead.
 * Hands the dialog filled in from something already known carry a grey note
 * saying where from, until either select is changed.
 */
export function EditMatchPlayers({
  player,
  opponent,
  onPlayer,
  onOpponent,
  errors,
  opponentRef,
  playerRef,
  disabled,
  roster,
  playerId,
  onPickPlayer,
  playerLock,
  playerChanged,
  playerNote,
  opponentNote,
  rosterLabel,
  viewerId,
  myPlayerId,
}: {
  player: PlayerFields;
  opponent: PlayerFields;
  onPlayer: (next: PlayerFields) => void;
  onOpponent: (next: PlayerFields) => void;
  errors: { player?: string; opponent?: string };
  playerRef?: React.Ref<HTMLInputElement>;
  opponentRef?: React.Ref<HTMLInputElement>;
  disabled?: boolean;
  /** The team's roster; null on a personal match, whose player is typed. */
  roster: readonly EditRosterPlayer[] | null;
  playerId: string | null;
  onPickPlayer: (player: EditRosterPlayer) => void;
  /**
   * Why the player reads back instead of being picked: a scheduled line's
   * lineup owns it, or the match was analyzed for that player and its stats
   * would silently move with a change. Null when it can be picked.
   */
  playerLock: "lineup" | "analysis" | null;
  /** The roster pick differs from the saved player. */
  playerChanged: boolean;
  /** "Right, two-handed · from their last match", while prefilled. */
  playerNote: string | null;
  opponentNote: string | null;
  /** The roster menu's section label — "Roster · Cardinal · M". */
  rosterLabel: string;
  viewerId: string;
  /** The viewer's own player id in this match's program, when known. */
  myPlayerId: string | null;
}) {
  const selects = (
    label: string,
    value: PlayerFields,
    onValue: (next: PlayerFields) => void,
    withCaptions: boolean,
  ) => (
    <>
      <div className="flex min-w-0 flex-col gap-2">
        {withCaptions && <Caption>Hand</Caption>}
        <MenuSelect
          label={`${label} hand`}
          variant="underline"
          value={value.hand ?? undefined}
          placeholder="Not set"
          options={handOptions}
          disabled={disabled}
          onChange={(next) =>
            onValue({ ...value, hand: next === NOT_SET ? null : next })
          }
        />
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        {withCaptions && <Caption>Backhand</Caption>}
        <MenuSelect
          label={`${label} backhand`}
          variant="underline"
          value={value.backhand ?? undefined}
          placeholder="Not set"
          options={backhandOptions}
          disabled={disabled}
          onChange={(next) =>
            onValue({ ...value, backhand: next === NOT_SET ? null : next })
          }
        />
      </div>
    </>
  );

  const note = (text: string | null, className?: string) =>
    text ? (
      <span
        className={cn(
          "-mt-2 text-[11px] leading-[1.4] text-[var(--ink-500)]",
          className,
        )}
      >
        {text}
      </span>
    ) : null;

  let playerField: React.ReactNode;
  if (playerLock) {
    playerField = (
      <div className="flex h-[34px] min-w-0 items-center gap-2 border-b border-dashed border-[var(--border-field)]">
        <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--ink-700)]">
          {player.name}
        </span>
        <span className="shrink-0 text-[11px] text-[var(--ink-400)]">
          {playerLock === "lineup" ? "from the lineup" : "analyzed for them"}
        </span>
      </div>
    );
  } else if (roster) {
    playerField = (
      <RosterPicker
        roster={roster}
        playerId={playerId}
        name={player.name}
        onPick={onPickPlayer}
        disabled={disabled}
        error={errors.player}
        menuLabel={rosterLabel}
        viewerId={viewerId}
        myPlayerId={myPlayerId}
      />
    );
  } else {
    playerField = (
      <SettingsUnderlineInput
        ref={playerRef}
        aria-label="Your player"
        aria-required
        aria-invalid={errors.player ? true : undefined}
        value={player.name}
        disabled={disabled}
        onChange={(e) => onPlayer({ ...player, name: e.target.value })}
        className={cn(
          "w-full",
          errors.player &&
            "border-[var(--danger)] focus:border-[var(--danger)]",
        )}
      />
    );
  }

  return (
    <section
      aria-label="Players"
      className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,0.8fr)_minmax(0,1fr)] items-end gap-x-4 gap-y-3.5"
    >
      <div className="flex min-w-0 flex-col gap-2">
        <Caption required>Your player</Caption>
        {playerField}
      </div>
      {selects("Your player", player, onPlayer, true)}
      {(errors.player || playerChanged || playerNote) && (
        <div className="col-span-3 -mt-1.5 grid grid-cols-subgrid">
          <span className="text-[11px] leading-[1.4] text-[var(--danger)]">
            {errors.player}
          </span>
          <span className="col-span-2 text-[11px] leading-[1.4] text-[var(--ink-500)]">
            {playerNote}
          </span>
          {playerChanged && !errors.player && (
            <span className="col-span-3 row-start-2 pt-0.5 text-[11px] leading-[1.4] text-[var(--ink-500)]">
              Stats on this match will count for {player.name}.
            </span>
          )}
        </div>
      )}

      <div className="flex min-w-0 flex-col gap-2">
        <Caption required>Opponent</Caption>
        <SettingsUnderlineInput
          ref={opponentRef}
          aria-label="Opponent"
          aria-required
          aria-invalid={errors.opponent ? true : undefined}
          value={opponent.name}
          disabled={disabled}
          onChange={(e) => onOpponent({ ...opponent, name: e.target.value })}
          className={cn(
            "w-full",
            errors.opponent &&
              "border-[var(--danger)] focus:border-[var(--danger)]",
          )}
        />
      </div>
      {selects("Opponent", opponent, onOpponent, false)}
      {(errors.opponent || opponentNote) && (
        <div className="col-span-3 -mt-1.5 grid grid-cols-subgrid">
          <span className="text-[11px] leading-[1.4] text-[var(--danger)]">
            {errors.opponent}
          </span>
          {note(opponentNote, "col-span-2 mt-0")}
        </div>
      )}
    </section>
  );
}
