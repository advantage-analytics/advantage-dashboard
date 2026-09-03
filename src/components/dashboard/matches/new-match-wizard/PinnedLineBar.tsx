"use client";

/**
 * PinnedLineBar — the 36px bar under the step bar when the wizard was started
 * from a lineup slot (design 7b · 7c · 10a).
 *
 * Step 1 isn't skipped so much as already answered: its three answers live
 * here, written as the breadcrumb's continuation minus the event — #2 Singles
 * › Marcus Reid vs Jordan Alvarez, then past a hairline the date and site as
 * 13px glyph facts, and a quiet Change. It stays through every step.
 *
 * Change doesn't throw you back to step 1 — the thing you most likely got
 * wrong is WHICH LINE, and that lives in the event you came from. So it opens
 * the lineup as a float menu under the bar: mono line label, the player, and
 * the slot's own state. Picking one rewrites the bar and nothing else — the
 * file you've dropped stays. Below a hairline, "A match outside this event" is
 * the escape hatch that does reopen step 1.
 */

import { useState } from "react";
import Link from "next/link";
import { Calendar, Check, ChevronRight, MapPin, Swords } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { siteLabel } from "@/lib/schedule/format";
import type { EventPreset, LineChoice } from "./types";
import { floatMenuCls, floatMenuDividerCls, floatMenuLabelCls, floatMenuRowCls, focusRingCls } from "./styles";

const STATE_LABEL: Record<LineChoice["state"], string> = {
  result: "Result in · no video",
  video: "Video in",
  open: "Awaiting result",
  unset: "Line not set",
};

function formatDayShort(date: string): string {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return date;
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function PinnedLineBar({
  preset,
  onSwitch,
  outsideHref,
}: {
  preset: EventPreset;
  /** Pick another line of the same event. */
  onSwitch: (next: EventPreset) => void;
  /** Where "A match outside this event" goes — the wizard with step 1 open. */
  outsideHref: string;
}) {
  const [open, setOpen] = useState(false);
  const lineup = preset.lineup ?? [];

  return (
    <div className="flex h-9 shrink-0 items-center gap-2 border-b border-[var(--border-hairline)] bg-[var(--surface-subtle)] px-[18px]">
      {preset.round && (
        <Link
          href={preset.eventHref}
          className="text-[11px] text-[var(--ink-500)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--ink-900)]"
        >
          {preset.round}
        </Link>
      )}
      <ChevronRight className="size-3 shrink-0 text-[var(--ink-300)]" strokeWidth={1.5} aria-hidden="true" />
      <span className="min-w-0 truncate text-[12px] text-[var(--ink-900)]">
        <span className="font-medium">{preset.playerName}</span> vs {preset.opponentName || "—"}
      </span>
      <span className="mx-2 h-3.5 w-px shrink-0 bg-[var(--border-medium)]" aria-hidden="true" />
      {!preset.opponentName && preset.eventKind === "dual" && preset.eventName && (
        <span className="inline-flex shrink-0 items-center gap-1.5 text-[11px] text-[var(--ink-600)]">
          <Swords className="size-[13px] text-[var(--ink-400)]" strokeWidth={1.5} aria-hidden="true" />
          vs {preset.eventName}
        </span>
      )}
      <span className="inline-flex shrink-0 items-center gap-1.5 text-[11px] text-[var(--ink-600)]">
        <Calendar className="size-[13px] text-[var(--ink-400)]" strokeWidth={1.5} aria-hidden="true" />
        {formatDayShort(preset.date)}
      </span>
      {preset.site && (
        <span className="ml-3 inline-flex shrink-0 items-center gap-1.5 text-[11px] text-[var(--ink-600)]">
          <MapPin className="size-[13px] text-[var(--ink-400)]" strokeWidth={1.5} aria-hidden="true" />
          {siteLabel(preset.site)}
        </span>
      )}
      <span className="flex-1" />

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "inline-flex h-[22px] cursor-pointer items-center rounded-[var(--radius-button)] px-2 text-[11px] font-medium text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)]",
              // Engagement is the wash, not a colour change: white reads on the
              // bar's own surface-subtle.
              open && "bg-white",
              focusRingCls
            )}
          >
            Change
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" sideOffset={8} className={cn(floatMenuCls, "w-[360px]")}>
          <span className={floatMenuLabelCls}>
            {preset.eventName}
            {preset.eventKind === "dual" ? " dual" : ""} · lineup
          </span>
          {lineup.map((line) => {
            const isCurrent = line.slot === preset.round;
            const disabled = !line.preset;
            return (
              <button
                key={line.slot}
                type="button"
                disabled={disabled}
                onClick={() => {
                  if (line.preset) onSwitch(line.preset);
                  setOpen(false);
                }}
                className={cn(
                  floatMenuRowCls,
                  "gap-3",
                  isCurrent && "bg-[var(--surface-subtle)]",
                  disabled && "cursor-default hover:bg-transparent"
                )}
              >
                <span className="mono w-[22px] shrink-0 text-[11px] text-[var(--ink-500)]">{line.slot}</span>
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-[12px] text-[var(--ink-900)]",
                    isCurrent ? "font-medium" : "font-normal"
                  )}
                >
                  {line.playerName ?? "—"}
                </span>
                <span
                  className={cn(
                    "shrink-0 whitespace-nowrap text-[11px]",
                    line.state === "unset" ? "text-[var(--ink-400)]" : "text-[var(--ink-500)]"
                  )}
                >
                  {isCurrent ? "" : STATE_LABEL[line.state]}
                </span>
                {isCurrent ? (
                  <Check className="size-[13px] shrink-0 text-[var(--blue)]" strokeWidth={1.5} aria-hidden="true" />
                ) : (
                  <span className="w-[13px] shrink-0" />
                )}
              </button>
            );
          })}
          <span className={floatMenuDividerCls} />
          <Link href={outsideHref} className={cn(floatMenuRowCls, "gap-3")}>
            <span className="flex-1 text-[12px] text-[var(--ink-700)]">A match outside this event</span>
            <ChevronRight className="size-[13px] shrink-0 text-[var(--ink-300)]" strokeWidth={1.5} aria-hidden="true" />
          </Link>
        </PopoverContent>
      </Popover>
    </div>
  );
}
