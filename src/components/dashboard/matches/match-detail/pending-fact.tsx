"use client";

import { useState } from "react";
import { VerifiedMark } from "@/components/dashboard/matches/verified-mark";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  VERIFICATION_PENDING,
  VERIFICATION_PENDING_SCOPE,
  VERIFICATION_PENDING_UNTIL,
} from "@/lib/data/match-verification";
import { cn } from "@/lib/utils";

/**
 * The last fact of the report's details line while a match waits on a
 * labeller (`showsVerificationPending`; artboard
 * `docs/superpowers/specs/2026-11-12-admin-strip/CustSoft.dc.html`). The same
 * trigger and popover as `VerifiedFact`, with the mark greyed: what will be
 * checked, and that the statistics may change until it is.
 *
 * Nothing else: no "Tell us" (a report is for a check that was made), and no
 * date or time — the owner decided (2026-11-14) the popover promises none.
 */
export function PendingFact() {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {/* `VerifiedFact`'s badge: a 6px wash with its padding pulled back
            out, so it sits on the line's own x. */}
        <button
          type="button"
          className={cn(
            "-mx-1.5 -my-1 inline-flex h-[22px] shrink-0 cursor-pointer items-center gap-1.5 rounded-[6px] px-1.5 text-[11px] leading-[1.4] whitespace-nowrap text-[var(--ink-700)] transition-colors hover:bg-[var(--surface-subtle)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
            open && "bg-[var(--surface-subtle)]",
          )}
        >
          <VerifiedMark pending />
          {VERIFICATION_PENDING}
        </button>
      </PopoverTrigger>
      <PopoverContent
        aria-label={VERIFICATION_PENDING}
        className="flex w-[230px] flex-col gap-1.5 rounded-[12px] border-[var(--border-medium)] bg-[var(--surface-card)] px-4 pt-3.5 pb-3 shadow-[var(--shadow-dropdown)]"
      >
        <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--ink-900)]">
          <VerifiedMark pending />
          {VERIFICATION_PENDING}
        </span>
        <p className="m-0 text-[11px] leading-[1.55] text-[var(--ink-700)]">
          {VERIFICATION_PENDING_SCOPE}
        </p>
        <p className="m-0 text-[11px] leading-[1.55] text-[var(--ink-700)]">
          {VERIFICATION_PENDING_UNTIL}
        </p>
      </PopoverContent>
    </Popover>
  );
}
