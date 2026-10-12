"use client";

import { PeekDrawerFrame } from "@/components/dashboard/matches/match-drawer";
import type { TeamOpponent } from "@/lib/data/team-opponents";

/**
 * The team opponent drawer's SLOT — the frame only.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ T14 builds the body here: identity (name, program, how they play), the   │
 * │ Faced-by chips, the stats they narrow, the recent rows with faces, and   │
 * │ the footer action. Nothing below the frame is drawn yet on purpose.      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * What is real already is everything the page needs in order to reflow: the
 * shared `PeekDrawerFrame` — 340px beside the column at `lg` (`hidden
 * lg:block`, as the personal drawer), the "Opponent n / N" counter, ‹ ›
 * stepping, the X, and the slide-out whose end hands the selection back to
 * `useRowSelection` (`onClosed`). With it mounted the table collapses Program
 * and Plays on a row click and reopens them on close, which is the behaviour
 * the page is verified against before the body exists.
 */
export function TeamOpponentDrawer({
  opponent,
  index,
  total,
  closing,
  autoFocus,
  onPrev,
  onNext,
  onClose,
  onClosed,
}: {
  opponent: TeamOpponent;
  /** Position among the rows the table is showing, 0-based. */
  index: number;
  total: number;
  closing: boolean;
  autoFocus: boolean;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  onClosed: () => void;
}) {
  return (
    <PeekDrawerFrame
      kind="Opponent"
      label={opponent.name}
      index={index}
      total={total}
      canPrev={index > 0}
      canNext={index < total - 1}
      closing={closing}
      autoFocus={autoFocus}
      focusKey={opponent.key}
      onPrev={onPrev}
      onNext={onNext}
      onClose={onClose}
      onClosed={onClosed}
      footer={null}
    >
      {/* ── T14: the drawer body goes here ─────────────────────────────── */}
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-[22px] pt-6 pb-[22px]">
        {/* The record's name wraps; it never truncates (tables.md). */}
        <h2 className="text-title-lg min-w-0 [text-wrap:balance]">
          {opponent.name}
        </h2>
      </div>
    </PeekDrawerFrame>
  );
}
