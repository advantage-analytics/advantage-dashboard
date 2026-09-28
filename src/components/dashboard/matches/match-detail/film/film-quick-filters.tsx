"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  SlidersHorizontal,
} from "lucide-react";

import type { MatchSides } from "@/components/dashboard/matches/match-detail/use-match-sides";
import type { PlayerSide } from "@/components/dashboard/matches/match-detail/match-filters/model";
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
  filmListActive,
  filmListName,
  lastNameOf,
  quickShow,
  withQuickShow,
  type FilmListFilters,
} from "./film-list-filters";

/**
 * The three filters you reach for mid-rally (handoff F4), anchored to the
 * panel's Filters trigger. Quick choices apply on click — they are one tap —
 * and the last row opens the advanced panel. Filters drive ↑↓ as well as the
 * list.
 *
 * Since T7 the rows write the layers they belong to (`film-list-filters.ts`):
 * "Break points" is the shared Score › Breakpoint, "{You}/{Opp} serving" the
 * shared Serve › Player — so a pick here is a pick the Statistics tab shows
 * too — and "Saved only" is the Film-only saved toggle, never a match filter.
 */
export function FilmQuickFilters({
  filmFilters,
  sides,
  onOpenAdvanced,
  tone,
}: {
  filmFilters: FilmListFilters;
  sides: MatchSides;
  /** Absent = no "Advanced filters…" row. */
  onOpenAdvanced?: () => void;
  /** "dark" is the fullscreen film's menu; "light" is the in-shell list's. */
  tone: "light" | "dark";
}) {
  const [open, setOpen] = useState(false);

  const { shared, setShared, setSavedOnly } = filmFilters;
  const show = quickShow(filmFilters);
  const active = filmListActive(filmFilters);
  const youName = lastNameOf(sides.you.name);
  const oppName = lastNameOf(sides.opp.name);

  const pickShow = (next: "all" | "break" | "saved") => {
    setShared(withQuickShow(shared, next));
    setSavedOnly(next === "saved");
    setOpen(false);
  };

  const pickServer = (server: PlayerSide | null) => {
    setShared({ ...shared, server });
    setOpen(false);
  };

  const clearAll = () => {
    filmFilters.clearAll();
    setOpen(false);
  };

  // Row content shared between the light (FloatMenuItem) and dark
  // (FilmDarkMenuItem) renderings below — same label/chosen/onSelect, a
  // different item component per tone.
  const showPointsRows = [
    {
      label: "All points",
      chosen: show === "all",
      onSelect: () => pickShow("all"),
    },
    {
      label: "Break points",
      description: "Points that could break serve",
      chosen: show === "break",
      onSelect: () => pickShow("break"),
    },
    {
      label: "Saved only",
      chosen: show === "saved",
      onSelect: () => pickShow("saved"),
    },
  ];
  const serveRows = [
    {
      label: "Either",
      chosen: shared.server === null,
      onSelect: () => pickServer(null),
    },
    {
      label: `${youName} serving`,
      chosen: shared.server === "you",
      onSelect: () => pickServer("you"),
    },
    {
      label: `${oppName} serving`,
      chosen: shared.server === "opponent",
      onSelect: () => pickServer("opponent"),
    },
  ];

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
                color: active ? "var(--blue)" : "var(--ink-500)",
              }}
              strokeWidth={1.5}
              aria-hidden="true"
            />
            {filmListName(filmFilters, { you: youName, opponent: oppName })}
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
        {showPointsRows.map((row, i) => (
          <FloatMenuItem key={i} {...row} />
        ))}
        <FloatMenuDivider />
        <FloatMenuCaption>Serve</FloatMenuCaption>
        {serveRows.map((row, i) => (
          <FloatMenuItem key={i} {...row} />
        ))}
        {active ? (
          <>
            <FloatMenuDivider />
            <FloatMenuItem label="Clear all filters" onSelect={clearAll} />
          </>
        ) : null}
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
      {showPointsRows.map((row, i) => (
        <FilmDarkMenuItem key={i} {...row} />
      ))}
      <FilmDarkMenuDivider />
      <FilmDarkMenuLabel>Serve</FilmDarkMenuLabel>
      {serveRows.map((row, i) => (
        <FilmDarkMenuItem key={i} {...row} />
      ))}
      {active ? (
        <>
          <FilmDarkMenuDivider />
          <FilmDarkMenuItem label="Clear all filters" onSelect={clearAll} />
        </>
      ) : null}
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
        Filters apply to ← → as well as the list.
      </FilmDarkMenuNote>
    </FilmDarkMenu>
  );
}
