"use client";

/**
 * The roster picker's menu body — who played, in the EntitySelect grammar.
 *
 * One list for every place a match picks its team player: the upload wizard's
 * For field and the Edit Match dialog's Your player. A quiet section label,
 * then 38px rows: a 22px initials avatar (a dashed ring while an invite is
 * still out), the name, one line of meta, the You / Coach-managed pill, and a
 * 13px Signal Blue check in its own slot on the chosen row — no standing fill
 * (`ui/float-menu.tsx` is where that rule lives).
 *
 * Only the body is shared. Each caller owns its trigger and popover, because
 * the wizard's 40px field row and the dialog's underline input are different
 * fields; the list inside them is the same list.
 */

import { ChosenCheck } from "@/components/ui/float-menu";
import { StatePill } from "@/components/ui/state-pill";
import { YouPill } from "@/components/ui/you-pill";
import { cn } from "@/lib/utils";
import { getInitials } from "@/lib/data/match-utils";
import type { RosterPlayerOption } from "@/lib/data/roster-shared";
import type { Workspace } from "@/lib/workspace/types";

export type RosterMenuPlayer = RosterPlayerOption & {
  /** An open invitation's address; the row reads as invited until claimed. */
  invitedEmail?: string | null;
};

/** "Cardinal · M" — the squad initial the frames put beside a team's name. */
export function workspaceLabel(workspace: Workspace): string {
  if (workspace.kind !== "team") return "You";
  const squad =
    workspace.team === "mens" ? "M" : workspace.team === "womens" ? "W" : null;
  return squad ? `${workspace.name} · ${squad}` : workspace.name;
}

/** The float menu — EntitySelect grammar: radius 12, 6px padding, hairline. */
export const ROSTER_MENU_CLS =
  "rounded-[var(--radius-dropdown)] border-[var(--border-hairline)] bg-white p-1.5 shadow-[var(--shadow-dropdown)] flex flex-col";

/** "#2 Singles · Junior" — a roster row's middot-joined meta. */
export function rosterMeta(player: RosterPlayerOption): string {
  return [
    player.ladderPosition !== null ? `#${player.ladderPosition} Singles` : null,
    player.classYear,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** A 22px avatar for a menu row — initials, or the dashed ring of a profile nobody has claimed. */
export function RowAvatar({
  initials,
  dashed = false,
}: {
  initials: string;
  dashed?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex size-[22px] shrink-0 items-center justify-center rounded-full text-[10px] font-medium",
        dashed
          ? "border border-dashed border-[var(--ink-300)] text-[var(--ink-400)]"
          : "bg-[var(--surface-muted)] text-[var(--ink-700)]",
      )}
    >
      {initials}
    </span>
  );
}

export function RosterMenuList({
  label,
  roster,
  loadFailed = false,
  chosenPlayerId,
  viewerId,
  myPlayerId,
  onChoose,
}: {
  /** The section label — "Roster · Cardinal · M". */
  label: string;
  /** Null while it loads. */
  roster: readonly RosterMenuPlayer[] | null;
  loadFailed?: boolean;
  chosenPlayerId: string | null;
  viewerId: string;
  /** The id the viewer's own matches carry in this program, when known. */
  myPlayerId: string | null;
  onChoose: (player: RosterMenuPlayer) => void;
}) {
  return (
    <>
      <span className="px-2.5 pt-1.5 pb-1 text-[11px] text-[var(--ink-400)]">
        {label}
      </span>
      {roster === null ? (
        <span className="px-2.5 py-2 text-[11px] text-[var(--ink-500)]">
          {loadFailed
            ? "The roster couldn't be loaded."
            : "Loading the roster…"}
        </span>
      ) : roster.length === 0 ? (
        <span className="px-2.5 py-2 text-[11px] text-[var(--ink-500)]">
          Nobody is on this program&rsquo;s roster yet.
        </span>
      ) : (
        roster.map((player) => {
          const chosen = player.playerId === chosenPlayerId;
          const invited = !!player.invitedEmail && player.userId === null;
          // The viewer's own profile — by the login bound to it, or by the id
          // the workspace already resolved as theirs.
          const isYou =
            player.userId === viewerId ||
            (myPlayerId !== null && player.playerId === myPlayerId);
          return (
            <RosterRow
              key={player.playerId}
              chosen={chosen}
              onChoose={() => onChoose(player)}
              avatar={
                <RowAvatar
                  initials={getInitials(player.name)}
                  dashed={invited}
                />
              }
              name={player.name}
              meta={
                isYou
                  ? "Your own match"
                  : invited
                    ? `Invited · ${player.invitedEmail}`
                    : rosterMeta(player)
              }
              trailing={
                // Roster state travels with the person: a profile a coach
                // still runs carries the grey pill.
                isYou ? (
                  <YouPill />
                ) : !invited &&
                  player.managedBy === "coach" &&
                  player.userId === null ? (
                  <StatePill>Coach-managed</StatePill>
                ) : null
              }
            />
          );
        })
      )}
    </>
  );
}

/** One 38px row of the roster picker. */
function RosterRow({
  chosen,
  onChoose,
  avatar,
  name,
  meta,
  trailing,
}: {
  chosen: boolean;
  onChoose: () => void;
  avatar: React.ReactNode;
  name: string;
  meta: string;
  trailing?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={chosen}
      onClick={onChoose}
      className={cn(
        "flex h-[38px] w-full cursor-pointer items-center gap-2.5 rounded-[var(--radius-element)] px-2.5 text-left transition-colors duration-150 focus-visible:outline-none",
        "focus-visible:bg-[var(--surface-subtle)]",
        !chosen && "hover:bg-[var(--surface-subtle)]",
      )}
    >
      {avatar}
      <span className="text-[12px] font-medium whitespace-nowrap text-[var(--ink-900)]">
        {name}
      </span>
      {meta && (
        <span className="min-w-0 truncate text-[11px] text-[var(--ink-500)]">
          {meta}
        </span>
      )}
      <span className="flex-1" />
      {trailing}
      {/* The chosen row is marked the way every menu in the app marks one —
          `ChosenCheck` at the right edge, no persistent fill. It sits after
          the You / Coach-managed pill so the two read as different facts: who
          this is, then what is picked. */}
      <ChosenCheck chosen={chosen} />
    </button>
  );
}
