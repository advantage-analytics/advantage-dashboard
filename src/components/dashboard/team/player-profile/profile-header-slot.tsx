"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, ChevronsUpDown } from "lucide-react";
import { usePublishHeaderSlot } from "@/components/dashboard/header-slot";
import { FloatMenu, FloatMenuItem } from "@/components/ui/float-menu";
import { profileHref } from "@/components/dashboard/team/roster-table";

export interface SwitcherPlayer {
  id: string;
  name: string;
  lineupSpot: number | null;
}

/**
 * What the header says while this profile is on screen: `Roster › Name ⌄
 * 3 / 9` — the trail back to the roster, then the name as a switcher so the
 * reader can walk the squad without going back, and where in the walk they
 * are. A staff seat's own page (not a player, so not in the walk) gets the
 * trail and the name with no switcher.
 *
 * One treatment for every viewer. Platform Audit `Te` drew the player's own
 * page with the name alone, on the argument that a rail destination is a
 * place, not a step; in use that left a player with no way back to the
 * squad from their own page, and the coach's trail (`Te2`) is the same trail
 * from the other side. The **You** pill on the identity row still marks
 * whose page it is.
 *
 * Renders nothing itself; the header draws what this publishes.
 */
export function ProfileHeaderSlot({
  name,
  playerId,
  players,
}: {
  name: string;
  playerId: string;
  players: SwitcherPlayer[];
}) {
  const node = useMemo(
    () => <Trail name={name} playerId={playerId} players={players} />,
    [name, playerId, players],
  );
  usePublishHeaderSlot(node);
  return null;
}

function Trail({
  name,
  playerId,
  players,
}: {
  name: string;
  playerId: string;
  players: SwitcherPlayer[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const position = players.findIndex((p) => p.id === playerId);
  const inWalk = position >= 0;

  return (
    <nav
      aria-label="Breadcrumb"
      className="flex min-w-0 items-center gap-0.5 text-[11px]"
    >
      <Link
        href="/dashboard/team/roster"
        className="shrink-0 text-[#888888] transition-colors duration-200 hover:text-[#525252]"
      >
        Roster
      </Link>
      <ChevronRight
        className="h-3 w-3 shrink-0 text-[#CCCCCC]"
        strokeWidth={1.5}
        aria-hidden="true"
      />

      {inWalk ? (
        <>
          <FloatMenu
            open={open}
            onOpenChange={setOpen}
            align="start"
            label="Switch player"
            trigger={
              <button
                type="button"
                aria-expanded={open}
                aria-label={`${name}. Switch player`}
                className="-mx-1 flex h-[26px] cursor-pointer items-center gap-[5px] rounded-[var(--radius-element)] pr-1 pl-2 transition-colors duration-150 hover:bg-[var(--surface-muted)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
              >
                <span className="truncate text-[12px] font-medium text-[var(--ink-900)]">
                  {name}
                </span>
                <ChevronsUpDown
                  className="h-3 w-3 shrink-0 text-[var(--ink-400)]"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
              </button>
            }
          >
            {players.map((player) => (
              <FloatMenuItem
                key={player.id}
                label={player.name}
                description={
                  player.lineupSpot !== null
                    ? `Singles ${player.lineupSpot}`
                    : undefined
                }
                chosen={player.id === playerId}
                onSelect={() => {
                  setOpen(false);
                  if (player.id !== playerId)
                    router.push(profileHref(player.id));
                }}
              />
            ))}
          </FloatMenu>
          <span className="ml-1.5 shrink-0 text-[11px] text-[var(--ink-400)]">
            <span className="tabular">{position + 1}</span> /{" "}
            <span className="tabular">{players.length}</span>
          </span>
        </>
      ) : (
        <span className="truncate text-[12px] font-medium text-[var(--ink-900)]">
          {name}
        </span>
      )}
    </nav>
  );
}
