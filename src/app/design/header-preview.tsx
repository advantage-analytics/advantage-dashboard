"use client";

import { Bell, ChevronDown, Search } from "lucide-react";
import { PersonAvatar } from "@/components/ui/person-avatar";
import { BetaMeterPill } from "@/components/dashboard/beta-header-meter";

/**
 * A stand-in for the dashboard header, 44px like the real one, around the
 * real Beta pill. The header itself needs a signed-in workspace; this only
 * draws the bar so `/design` can show the pill in place.
 */
export function HeaderPreview({
  usedSeconds,
  capSeconds,
  onOpenBeta,
}: {
  usedSeconds: number | null;
  capSeconds: number;
  onOpenBeta: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-hairline)] bg-white">
      <header className="flex h-11 items-center justify-between px-6">
        <span className="text-[12px] font-medium text-[var(--ink-900)]">
          Matches
        </span>
        <div className="flex shrink-0 items-center gap-1.5">
          <BetaMeterPill
            usedSeconds={usedSeconds}
            capSeconds={capSeconds}
            onClick={onOpenBeta}
          />
          <span className="flex h-7 items-center gap-[7px] rounded-[8px] px-2 text-[var(--ink-500)]">
            <Search className="size-[14px]" strokeWidth={1.5} aria-hidden />
            <span className="text-[12px] text-[var(--ink-600)]">Search</span>
          </span>
          <span className="flex size-7 items-center justify-center rounded-[8px] text-[var(--ink-500)]">
            <Bell className="size-[14px]" strokeWidth={1.5} aria-hidden />
          </span>
          <span
            aria-hidden="true"
            className="mx-0.5 h-3.5 w-px bg-[var(--border-medium)]"
          />
          <span className="flex items-center gap-[5px] rounded-full py-[3px] pr-1.5 pl-[3px]">
            <PersonAvatar initials="AR" className="size-[26px] text-[9px]" />
            <ChevronDown
              className="size-3 text-[var(--ink-400)]"
              strokeWidth={1.5}
              aria-hidden
            />
          </span>
        </div>
      </header>
    </div>
  );
}
