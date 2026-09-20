"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  SlidersHorizontal,
} from "lucide-react";

import type { MatchSides } from "@/components/dashboard/matches/match-detail/use-match-sides";
import {
  FloatMenu,
  FloatMenuCaption,
  FloatMenuDivider,
  FloatMenuItem,
  FloatMenuNote,
} from "@/components/ui/float-menu";
import { cn } from "@/lib/utils";

import {
  FilmDarkMenu,
  FilmDarkMenuDivider,
  FilmDarkMenuItem,
  FilmDarkMenuLabel,
  FilmDarkMenuNote,
} from "./film-dark-menu";
import {
  cutName,
  hasActiveFilmFilters,
  lastNameOf,
  type FilmFilters,
} from "./film-filters";

/**
 * The three filters you reach for mid-rally (handoff F4), anchored to the
 * panel's Filters trigger. Quick choices apply on click — they are one tap —
 * and the last row opens the advanced dialog. Filters drive ↑↓ as well as the
 * list; the applied scope is reported in the panel footer, never as chips
 * over the film.
 */
export function FilmQuickFilters({
  filters,
  onFiltersChange,
  sides,
  onOpenAdvanced,
  tone,
}: {
  filters: FilmFilters;
  onFiltersChange: (next: FilmFilters) => void;
  sides: MatchSides;
  /** Absent = no "Advanced filters…" row. */
  onOpenAdvanced?: () => void;
  /** "dark" is the fullscreen film's menu; "light" is the in-shell list's. */
  tone: "light" | "dark";
}) {
  const [open, setOpen] = useState(false);

  const show: "all" | "break" | "saved" = filters.savedOnly
    ? "saved"
    : filters.pressure === "break"
      ? "break"
      : "all";

  const pick = (next: Partial<FilmFilters>) => {
    onFiltersChange({ ...filters, ...next });
    setOpen(false);
  };

  if (tone === "light") {
    return (
      <FloatMenu
        open={open}
        onOpenChange={setOpen}
        label="Point filters"
        width={284}
        align="start"
        sideOffset={6}
        className="rounded-[12px] [box-shadow:var(--shadow-dropdown)]!"
        trigger={
          <button
            type="button"
            aria-expanded={open}
            className={cn(
              "inline-flex h-7 cursor-pointer items-center gap-2 rounded-[var(--radius-element)] px-2 text-[12px] font-medium text-[var(--ink-900)] transition-colors duration-200 hover:bg-[var(--surface-subtle)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
              open && "bg-[var(--surface-subtle)]",
            )}
          >
            <SlidersHorizontal
              className="h-[13px] w-[13px]"
              style={{
                color: hasActiveFilmFilters(filters)
                  ? "var(--blue)"
                  : "var(--ink-500)",
              }}
              strokeWidth={1.5}
              aria-hidden="true"
            />
            {cutName(filters, sides)}
            {open ? (
              <ChevronUp
                className="h-3 w-3 text-[var(--ink-400)]"
                strokeWidth={1.5}
                aria-hidden="true"
              />
            ) : (
              <ChevronDown
                className="h-3 w-3 text-[var(--ink-400)]"
                strokeWidth={1.5}
                aria-hidden="true"
              />
            )}
          </button>
        }
      >
        <FloatMenuCaption>Show points</FloatMenuCaption>
        <FloatMenuItem
          label="All points"
          chosen={show === "all"}
          onSelect={() => pick({ pressure: "any", savedOnly: false })}
        />
        <FloatMenuItem
          label="Break points"
          description="Points that could break serve"
          chosen={show === "break"}
          onSelect={() => pick({ pressure: "break", savedOnly: false })}
        />
        <FloatMenuItem
          label="Saved only"
          chosen={show === "saved"}
          onSelect={() => pick({ pressure: "any", savedOnly: true })}
        />
        <FloatMenuDivider />
        <FloatMenuCaption>Serve</FloatMenuCaption>
        <FloatMenuItem
          label="Either"
          chosen={filters.server === "any"}
          onSelect={() => pick({ server: "any" })}
        />
        <FloatMenuItem
          label={`${lastNameOf(sides.you.name)} serving`}
          chosen={filters.server === "you"}
          onSelect={() => pick({ server: "you" })}
        />
        <FloatMenuItem
          label={`${lastNameOf(sides.opp.name)} serving`}
          chosen={filters.server === "opp"}
          onSelect={() => pick({ server: "opp" })}
        />
        {onOpenAdvanced ? (
          <>
            <FloatMenuDivider />
            <FloatMenuItem
              label="Advanced filters…"
              trailing={
                <ChevronRight
                  className="h-3 w-3 text-[var(--ink-400)]"
                  strokeWidth={1.8}
                />
              }
              onSelect={() => {
                setOpen(false);
                onOpenAdvanced();
              }}
            />
          </>
        ) : null}
        <FloatMenuNote>Filters apply to ↑↓ as well as the list.</FloatMenuNote>
      </FloatMenu>
    );
  }

  return (
    <FilmDarkMenu
      open={open}
      onOpenChange={setOpen}
      label="Point filters"
      trigger={
        <button
          type="button"
          aria-expanded={open}
          className={cn(
            "mb-[7px] inline-flex h-[26px] cursor-pointer items-center gap-1.5 rounded-[var(--radius-element)] px-2 text-[12px] transition-colors duration-200 hover:bg-white/[0.08] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
            open ? "bg-white/10 text-white" : "text-white/70",
          )}
        >
          Filters
          <ChevronDown
            className="h-[11px] w-[11px] text-white/55"
            strokeWidth={1.6}
            aria-hidden="true"
          />
        </button>
      }
    >
      <FilmDarkMenuLabel>Show points</FilmDarkMenuLabel>
      <FilmDarkMenuItem
        label="All points"
        chosen={show === "all"}
        onSelect={() => pick({ pressure: "any", savedOnly: false })}
      />
      <FilmDarkMenuItem
        label="Break points"
        description="Points that could break serve"
        chosen={show === "break"}
        onSelect={() => pick({ pressure: "break", savedOnly: false })}
      />
      <FilmDarkMenuItem
        label="Saved only"
        chosen={show === "saved"}
        onSelect={() => pick({ pressure: "any", savedOnly: true })}
      />
      <FilmDarkMenuDivider />
      <FilmDarkMenuLabel>Serve</FilmDarkMenuLabel>
      <FilmDarkMenuItem
        label="Either"
        chosen={filters.server === "any"}
        onSelect={() => pick({ server: "any" })}
      />
      <FilmDarkMenuItem
        label={`${lastNameOf(sides.you.name)} serving`}
        chosen={filters.server === "you"}
        onSelect={() => pick({ server: "you" })}
      />
      <FilmDarkMenuItem
        label={`${lastNameOf(sides.opp.name)} serving`}
        chosen={filters.server === "opp"}
        onSelect={() => pick({ server: "opp" })}
      />
      {onOpenAdvanced ? (
        <>
          <FilmDarkMenuDivider />
          <FilmDarkMenuItem
            label="Advanced filters…"
            trailing={
              <ChevronRight
                className="h-3 w-3 text-white/50"
                strokeWidth={1.8}
                aria-hidden="true"
              />
            }
            onSelect={() => {
              setOpen(false);
              onOpenAdvanced();
            }}
          />
        </>
      ) : null}
      <FilmDarkMenuNote>
        Filters apply to ↑↓ as well as the list.
      </FilmDarkMenuNote>
    </FilmDarkMenu>
  );
}
