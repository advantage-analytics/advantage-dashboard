"use client";

import { CHROME_TOOLTIP_DELAY_MS } from "@/components/dashboard/shared/chrome-tooltip";
import { PersonAvatar } from "@/components/ui/person-avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getInitials } from "@/lib/data/match-utils";
import type { TeamOpponentFacedBy } from "@/lib/data/team-opponents";
import { cn } from "@/lib/utils";

/** How many faces the stack draws before the rest become "+N". */
export const FACED_BY_FACES = 3;

type Player = Pick<
  TeamOpponentFacedBy,
  "playerId" | "name" | "firstName" | "photoUrl"
>;

/**
 * Who on the roster has met this opponent, as the table's Faced-by cell:
 *
 * - one player — their 26px face and first name;
 * - two or three — the faces overlapped by 3px, each ringed in the card's
 *   white so the overlap reads as an edge rather than a smudge;
 * - more — the first three faces and "+N".
 *
 * `players` arrive most-matches-first (`groupTeamOpponents`), so the three
 * faces drawn are the three who have met the opponent most.
 *
 * ── The faces' tooltip ──────────────────────────────────────────────────────
 * A face is a mark whose label is not on screen, which is exactly what the
 * Dark Tooltip names (`reference/chrome.md`); the clipped text beside it in
 * other cells gets none. The label lists the faces shown, in full; the detail
 * line names whoever "+N" stands for. No caret, 6px off the stack, the
 * system's 400ms reveal, on hover and on keyboard focus — the stack is the
 * trigger and is focusable for that reason. The same names are its
 * `aria-label`, and each is a chip in the drawer's Faced-by row, so nothing
 * lives only in the tooltip.
 */
export function FacedByStack({ players }: { players: readonly Player[] }) {
  if (players.length === 0) return null;

  const shown = players.slice(0, FACED_BY_FACES);
  const rest = players.slice(FACED_BY_FACES);
  const single = players.length === 1;
  const shownNames = shown.map((p) => p.name).join(" · ");
  const restNames = rest.map((p) => p.name).join(", ");

  return (
    <Tooltip delayDuration={CHROME_TOOLTIP_DELAY_MS}>
      <TooltipTrigger asChild>
        <span
          role="img"
          tabIndex={0}
          aria-label={`Faced by ${players.map((p) => p.name).join(", ")}`}
          className="flex max-w-full min-w-0 items-center justify-self-start rounded-[var(--radius-cell)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
        >
          {shown.map((player, i) => (
            <PersonAvatar
              key={player.playerId}
              initials={getInitials(player.name)}
              photoUrl={player.photoUrl}
              className={cn(
                "size-[26px] text-[9px]",
                !single && "ring-2 ring-[var(--surface-card)]",
                i > 0 && "-ml-[3px]",
              )}
            />
          ))}
          {single ? (
            <span className="ml-2 min-w-0 truncate text-[12px] text-[var(--ink-600)]">
              {players[0].firstName}
            </span>
          ) : rest.length > 0 ? (
            <span className="tabular ml-2 shrink-0 text-[11px] text-[var(--ink-500)]">
              +{rest.length}
            </span>
          ) : null}
        </span>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        showArrow={false}
        sideOffset={6}
        className="flex flex-col items-start gap-0.5 rounded-[12px] border-0 px-2.5 py-[7px]"
      >
        <span className="text-[12px] font-medium whitespace-nowrap">
          {shownNames}
        </span>
        {rest.length > 0 ? (
          <span className="text-[11px] font-normal whitespace-nowrap text-white/64">
            and {restNames}
          </span>
        ) : null}
      </TooltipContent>
    </Tooltip>
  );
}
