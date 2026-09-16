"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import type { MatchSides } from "@/components/dashboard/matches/match-detail/use-match-sides";
import { cn } from "@/lib/utils";

import {
  FilmDarkMenu,
  FilmDarkMenuDivider,
  FilmDarkMenuItem,
  FilmDarkMenuLabel,
  FilmDarkMenuNote,
} from "./film-dark-menu";
import { lastNameOf, type FilmFilters } from "./film-filters";

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
}: {
  filters: FilmFilters;
  onFiltersChange: (next: FilmFilters) => void;
  sides: MatchSides;
  onOpenAdvanced: () => void;
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
      <FilmDarkMenuNote>
        Filters apply to ↑↓ as well as the list.
      </FilmDarkMenuNote>
    </FilmDarkMenu>
  );
}
