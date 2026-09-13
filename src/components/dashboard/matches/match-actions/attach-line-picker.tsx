"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Loader2, Plus, Search } from "lucide-react";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  floatMenuCls,
  floatMenuDividerCls,
  floatMenuLabelCls,
} from "@/components/dashboard/matches/new-match-wizard/styles";
import { findAttachableLines } from "@/lib/schedule/attach-line";
import type { AttachLine } from "@/lib/schedule/attach-line-state";
import { dayLabel } from "@/lib/matches/edit-match-copy";

type Groups = {
  matchDate: string;
  suggested: AttachLine[];
  sameDay: AttachLine[];
  search: AttachLine[];
};

/**
 * "Add to an event" — the Event field turned into a search, with the lines this
 * match could go on hanging off it (Add to an event, states 2–4).
 *
 * The EntitySelect grammar the wizard's pickers use: a hairline float menu,
 * 11px group labels, rows that wash on hover. A line that can't take the match
 * is still listed, dimmed, saying why — the coach looking for S1 learns it
 * already has a result instead of wondering where it went.
 */
export function AttachLinePicker({
  matchId,
  onPick,
  onClose,
}: {
  matchId: string;
  onPick: (line: AttachLine) => void;
  /** Closed without choosing. */
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [groups, setGroups] = useState<Groups | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    const timer = window.setTimeout(
      () => {
        setLoading(true);
        findAttachableLines({ matchId, query })
          .then((result) => {
            if (!live) return;
            if (result.ok) {
              setGroups(result);
              setError(null);
            } else {
              setError(result.error);
            }
          })
          .catch(() => {
            if (live) setError("Couldn't reach the schedule. Try again.");
          })
          .finally(() => {
            if (live) setLoading(false);
          });
      },
      query === "" ? 0 : 200,
    );
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [matchId, query]);

  const nothingThatDay =
    groups !== null &&
    groups.suggested.length === 0 &&
    groups.sameDay.length === 0;

  return (
    <Popover
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <PopoverAnchor asChild>
        <div className="flex h-[34px] items-center gap-2 border-b-2 border-[var(--blue)]">
          <Search
            className="size-[13px] shrink-0 text-[var(--ink-400)]"
            strokeWidth={1.5}
            aria-hidden
          />
          <input
            ref={inputRef}
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search events and lines"
            aria-label="Search events and lines"
            autoComplete="off"
            data-focus-ring="none"
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                onClose();
              }
            }}
            className="min-w-0 flex-1 bg-transparent text-[13px] text-[var(--ink-900)] outline-none placeholder:text-[var(--ink-400)]"
          />
          {loading && (
            <Loader2
              className="size-3.5 animate-spin text-[var(--ink-400)]"
              aria-hidden
            />
          )}
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        sideOffset={6}
        onOpenAutoFocus={(e) => e.preventDefault()}
        // Clicks back in the search field shouldn't close the menu it drives.
        onInteractOutside={(e) => {
          if (inputRef.current?.contains(e.target as Node)) e.preventDefault();
        }}
        className={cn(
          floatMenuCls,
          "max-h-[min(420px,var(--radix-popover-content-available-height))] w-[var(--radix-popover-trigger-width)] min-w-[360px] overflow-y-auto",
        )}
      >
        {error ? (
          <p className="px-2.5 py-3 text-[12px] text-[var(--danger)]">
            {error}
          </p>
        ) : groups === null ? (
          <p className="px-2.5 py-3 text-[12px] text-[var(--ink-500)]">
            Looking for lines…
          </p>
        ) : (
          <>
            {groups.suggested.length > 0 && (
              <>
                <span className={floatMenuLabelCls}>
                  Suggested · same day, same player
                </span>
                {groups.suggested.map((line) => (
                  <LineRow key={line.entryId} line={line} onPick={onPick} />
                ))}
              </>
            )}

            {groups.sameDay.length > 0 && (
              <>
                {groups.suggested.length > 0 && (
                  <div className={floatMenuDividerCls} />
                )}
                <span className={floatMenuLabelCls}>
                  {groups.suggested.length > 0
                    ? `Other lines on ${dayLabel(groups.matchDate)}`
                    : `Lines on ${dayLabel(groups.matchDate)}`}
                </span>
                {groups.sameDay.map((line) => (
                  <LineRow key={line.entryId} line={line} onPick={onPick} />
                ))}
              </>
            )}

            {nothingThatDay && query === "" && (
              <div className="flex flex-col gap-1.5 px-2.5 pt-3 pb-2.5">
                <span className="text-[12px] text-[var(--ink-900)]">
                  Nothing on the schedule for {dayLabel(groups.matchDate)}
                </span>
                <span className="text-[11px] leading-[1.5] text-[var(--ink-500)]">
                  Search for an event on another day, or add the dual to the
                  schedule first.
                </span>
              </div>
            )}

            {groups.search.length > 0 && (
              <>
                {!nothingThatDay && <div className={floatMenuDividerCls} />}
                <span className={floatMenuLabelCls}>
                  Matching “{query.trim()}” · other days
                </span>
                {groups.search.map((line) => (
                  <LineRow
                    key={line.entryId}
                    line={line}
                    onPick={onPick}
                    showDate
                  />
                ))}
                <p className="px-2.5 pt-1 pb-2 text-[11px] leading-[1.5] text-[var(--ink-500)]">
                  A line on another day moves this match to that day.
                </p>
              </>
            )}

            {query.trim() !== "" &&
              nothingThatDay &&
              groups.search.length === 0 && (
                <p className="px-2.5 py-3 text-[12px] text-[var(--ink-500)]">
                  No events match “{query.trim()}”.
                </p>
              )}

            <div className={floatMenuDividerCls} />
            <div className="flex items-center justify-between gap-3 px-2.5 pt-1.5 pb-1">
              {nothingThatDay && query === "" ? (
                <Link
                  href="/dashboard/team/schedule/new/dual"
                  className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--blue)] transition-colors hover:text-[var(--blue-hover)]"
                >
                  <Plus className="size-3" strokeWidth={2} aria-hidden />
                  New dual
                </Link>
              ) : (
                <span className="text-[11px] text-[var(--ink-500)]">
                  Can&apos;t find it?
                </span>
              )}
              <Link
                href="/dashboard/team/schedule"
                className="inline-flex items-center gap-0.5 text-[12px] font-medium text-[var(--blue)] transition-colors hover:text-[var(--blue-hover)]"
              >
                Open Schedule
                <ArrowUpRight className="size-3" strokeWidth={2} aria-hidden />
              </Link>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

function LineRow({
  line,
  onPick,
  showDate = false,
}: {
  line: AttachLine;
  onPick: (line: AttachLine) => void;
  showDate?: boolean;
}) {
  const available = line.state === "available";
  const who = [
    showDate ? dayLabel(line.startsOn) : null,
    line.lineupLabel || "Lineup not set",
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <button
      type="button"
      disabled={!available}
      onClick={() => onPick(line)}
      className={cn(
        "grid min-h-[44px] w-full grid-cols-[minmax(0,1fr)_32px_auto] items-center gap-x-2.5 rounded-[var(--radius-element)] px-2.5 py-1 text-left transition-colors duration-[var(--duration-hover)]",
        available
          ? "cursor-pointer hover:bg-[var(--surface-subtle)] focus-visible:bg-[var(--surface-subtle)] focus-visible:outline-none"
          : "cursor-default opacity-45",
      )}
    >
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-[12px] text-[var(--ink-900)]">
          {line.eventName}
        </span>
        <span
          className={cn(
            "truncate text-[11px]",
            line.playerOnLineup
              ? "text-[var(--ink-700)]"
              : "text-[var(--ink-500)]",
          )}
        >
          {who}
        </span>
      </span>
      <span className="mono text-[11px] text-[var(--ink-500)]">
        {line.slot ?? line.round ?? ""}
      </span>
      <span
        className={cn(
          "text-right text-[11px] whitespace-nowrap",
          available ? "text-[var(--ink-700)]" : "text-[var(--ink-500)]",
        )}
      >
        {line.reason ?? "Awaiting result"}
      </span>
    </button>
  );
}
