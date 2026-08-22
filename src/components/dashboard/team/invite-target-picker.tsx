"use client";

import { Check, ChevronDown, ChevronUp, Plus } from "lucide-react";
import { getInitials } from "@/lib/data/match-utils";
import { useListboxNav } from "@/hooks/use-listbox-nav";

/**
 * Design 7a — "who is this invitation for".
 *
 * The whole duplicate problem is solved here rather than repaired later. A
 * coach who added Priya in August and invites her in September picks her row,
 * and there is never a second Priya to merge. The research brief found this is
 * what the strongest products do: GameChanger makes joiners pick which roster
 * player they are, TeamSnap auto-links by email — both put the choice where the
 * duplicate would otherwise be created.
 *
 * ── Local, not a shared primitive ───────────────────────────────────────────
 * The rows are roster-specific in a way a generic API cannot express without
 * becoming a render-prop shell: an avatar, a name, "added Aug 20 · 3 matches",
 * a check, and a dashed escape row above a divider and a section label. There
 * are three list-like components in this app already and all three solve
 * different problems; a fourth generic one designed against a single consumer
 * would be a guess. What IS shared is the keyboard model, which lives in
 * `use-listbox-nav`.
 *
 * Revisit if a third popover-with-a-list appears. Rule of three.
 *
 * ── No search field ─────────────────────────────────────────────────────────
 * A college roster is nine to fifteen rows. A filter box would be one more
 * thing to tab past on a list that fits on screen. If a program ever has fifty,
 * add it then.
 */

export interface ManagedPlayer {
  profileId: string;
  name: string;
  email: string | null;
  matchesPlayed: number;
  addedOn: string;
}

export function InviteTargetPicker({
  players,
  selected,
  open,
  onOpenChange,
  onSelect,
}: {
  /** Coach-managed rows only — somebody with a login has nothing to claim. */
  players: ManagedPlayer[];
  selected: ManagedPlayer | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Null means "someone new" — acceptance mints a profile instead. */
  onSelect: (player: ManagedPlayer | null) => void;
}) {
  // Index 0 is always "Someone new", so the roster rows start at 1.
  const count = players.length + 1;

  const choose = (index: number) => {
    onSelect(index === 0 ? null : players[index - 1]);
    onOpenChange(false);
  };

  const { activeIndex, setActiveIndex, optionId, onKeyDown } = useListboxNav({
    count,
    open,
    onSelect: choose,
    onDismiss: () => onOpenChange(false),
    idPrefix: "invite-target",
  });

  return (
    <div className="relative flex flex-col gap-1.5">
      <span className="text-[11px] text-[var(--ink-600)]">For</span>

      <button
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls="invite-target-list"
        aria-activedescendant={open ? optionId(activeIndex) : undefined}
        onClick={() => onOpenChange(!open)}
        onKeyDown={onKeyDown}
        className={`flex h-9 cursor-pointer items-center gap-2 text-left transition-colors focus-visible:outline-none ${
          open
            ? "border-b-2 border-[var(--blue)]"
            : "border-b border-[var(--border-field)]"
        }`}
      >
        {selected ? (
          <>
            <span
              aria-hidden
              className="flex size-6 shrink-0 items-center justify-center rounded-full border border-[var(--border-medium)] bg-[var(--surface-subtle)] text-[9px] font-medium text-[var(--ink-700)]"
            >
              {getInitials(selected.name)}
            </span>
            <span className="text-[13px] font-medium text-[var(--ink-900)]">
              {selected.name}
            </span>
            <span className="inline-flex h-[18px] items-center rounded-[var(--radius-pill)] bg-[var(--surface-subtle)] px-[7px] text-[10px] font-medium text-[var(--ink-700)]">
              Coach-managed
            </span>
          </>
        ) : (
          <span className="text-[13px] text-[var(--ink-400)]">
            {players.length > 0
              ? "Choose who this invite is for"
              : "Someone new"}
          </span>
        )}
        <span className="flex-1" />
        {open ? (
          <ChevronUp className="size-3 text-[var(--ink-400)]" strokeWidth={1.5} aria-hidden />
        ) : (
          <ChevronDown className="size-3 text-[var(--ink-400)]" strokeWidth={1.5} aria-hidden />
        )}
      </button>

      {open && (
        <ul
          id="invite-target-list"
          role="listbox"
          aria-label="Who this invitation is for"
          className="absolute top-[62px] right-0 left-0 z-20 flex max-h-[248px] flex-col overflow-y-auto rounded-[var(--radius-dropdown)] bg-[var(--surface-card)] p-1.5"
          style={{ boxShadow: "var(--shadow-dropdown)" }}
        >
          <li
            id={optionId(0)}
            role="option"
            aria-selected={activeIndex === 0}
            onMouseEnter={() => setActiveIndex(0)}
            onClick={() => choose(0)}
            className={`flex h-[38px] cursor-pointer items-center gap-2.5 rounded-[var(--radius-element)] px-2.5 ${
              activeIndex === 0 ? "bg-[var(--surface-subtle)]" : ""
            }`}
          >
            <span
              aria-hidden
              className="flex size-6 shrink-0 items-center justify-center rounded-full border border-dashed border-[var(--ink-300)]"
            >
              <Plus className="size-3 text-[var(--ink-500)]" strokeWidth={1.5} />
            </span>
            <span className="text-[12px] text-[var(--ink-900)]">Someone new</span>
            <span className="text-[11px] text-[var(--ink-500)]">
              creates a profile when they accept
            </span>
          </li>

          {players.length > 0 && (
            <>
              <li
                aria-hidden
                className="mx-1 my-1.5 h-px bg-[var(--border-hairline)]"
              />
              <li
                aria-hidden
                className="px-2.5 pt-0.5 pb-1.5 text-[11px] text-[var(--ink-400)]"
              >
                On your roster · no login yet
              </li>
            </>
          )}

          {players.map((player, index) => {
            const optionIndex = index + 1;
            return (
              <li
                key={player.profileId}
                id={optionId(optionIndex)}
                role="option"
                aria-selected={activeIndex === optionIndex}
                onMouseEnter={() => setActiveIndex(optionIndex)}
                onClick={() => choose(optionIndex)}
                className={`flex h-[38px] cursor-pointer items-center gap-2.5 rounded-[var(--radius-element)] px-2.5 ${
                  activeIndex === optionIndex ? "bg-[var(--surface-subtle)]" : ""
                }`}
              >
                <span
                  aria-hidden
                  className="flex size-6 shrink-0 items-center justify-center rounded-full border border-[var(--border-medium)] bg-[var(--surface-subtle)] text-[9px] font-medium text-[var(--ink-700)]"
                >
                  {getInitials(player.name)}
                </span>
                <span className="truncate text-[12px] font-medium text-[var(--ink-900)]">
                  {player.name}
                </span>
                <span className="shrink-0 text-[11px] text-[var(--ink-500)]">
                  added {player.addedOn} ·{" "}
                  {player.matchesPlayed === 0
                    ? "no matches yet"
                    : `${player.matchesPlayed} ${player.matchesPlayed === 1 ? "match" : "matches"}`}
                </span>
                <span className="flex-1" />
                {selected?.profileId === player.profileId && (
                  <Check
                    className="size-3 shrink-0 text-[var(--ink-900)]"
                    strokeWidth={2}
                    aria-hidden
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
