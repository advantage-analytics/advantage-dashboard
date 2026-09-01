"use client";

import { useState } from "react";
import { Maximize2, SlidersHorizontal } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type {
  ShotFiltersModel,
  ShotFilterState,
} from "@/components/dashboard/matches/match-detail/shots/use-shot-filters";

/**
 * The Shots & placement header, built to artboard 47a (the canvas marks it
 * "what ships"; 46b's dropdown-chip header is the superseded draft):
 *
 * 1. eyebrow + subtitle · "{you} serving" legend · Filters popover · maximize
 * 2. the segmented toolbar row — Serve|Return · Zones|Placements ·
 *    1st|2nd|Both · All|Won|Lost
 * 3. the applied-cut sentence strip, rendered only while a filter narrows
 *
 * The toolbar's 1st|2nd|Both and the popover's Ball group are ONE state
 * (`filters.ball`) read from two places — same for All|Won|Lost and the
 * popover's Result group — so the two controls can never disagree. The
 * "{you}" name arrives as a prop from `useMatchSides()` upstream; nothing
 * here touches player1/player2 (guardrails §4).
 */

interface CourtHeaderProps {
  model: ShotFiltersModel;
  /** The viewer's display name, from `useMatchSides().you` — never player1. */
  youName: string;
  /** The court, re-rendered larger inside the maximize dialog. */
  maximizeContent: React.ReactNode;
}

/* ── Segmented pill group (artboard's radius-element pill-group pattern) ── */

interface SegOption {
  value: string;
  label: string;
}

function SegGroup({
  label,
  options,
  value,
  onChange,
  disabled,
}: {
  label: string;
  options: SegOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-disabled={disabled || undefined}
      className={cn(
        "inline-flex flex-wrap items-center gap-[2px] rounded-[var(--radius-element)] bg-[var(--surface-subtle)] p-[2px]",
        disabled && "pointer-events-none opacity-50",
      )}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={disabled ? -1 : 0}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex h-6 cursor-pointer items-center whitespace-nowrap rounded-[var(--radius-button)] px-[9px] text-[11px]",
              active
                ? "bg-[var(--surface-card)] font-medium text-[var(--ink-900)] shadow-[var(--shadow-card)]"
                : "font-normal text-[var(--ink-600)] hover:text-[var(--ink-900)]",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function FilterGroup({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: SegOption[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[12px] font-medium text-[var(--ink-700)]">
        {label}
      </span>
      <SegGroup label={label} options={options} value={value} onChange={onChange} />
    </div>
  );
}

function FilterSection({
  label,
  first,
  children,
}: {
  label: string;
  first?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 border-b border-[var(--border-hairline)] pb-3.5",
        first ? "pt-0" : "pt-3.5",
      )}
    >
      <span className="text-[11px] text-[var(--ink-400)]">{label}</span>
      {children}
    </div>
  );
}

/* ── The header ──────────────────────────────────────────────────────────── */

export function CourtHeader({ model, youName, maximizeContent }: CourtHeaderProps) {
  const [maximized, setMaximized] = useState(false);
  const {
    mode,
    view,
    filters,
    availableSets,
    count,
    total,
    noun,
    cutSentence,
    isFiltered,
    setMode,
    setView,
    updateFilter,
    clearFilters,
  } = model;

  const isServe = mode === "serve";
  const eyebrow = isServe ? "Serve placement by zone" : "Return placement";
  const subtitle = isServe
    ? "Shade shows how often the serve goes there; the figure is points won behind it"
    : "Where your returns landed, and where you took them";

  const update =
    <K extends keyof ShotFilterState>(key: K) =>
    (value: string) =>
      updateFilter(
        key,
        (key === "set" && value !== "any"
          ? Number(value)
          : value) as ShotFilterState[K],
      );

  return (
    <div className="flex flex-col gap-4">
      {/* Row 1 — eyebrow/subtitle · legend · Filters · maximize */}
      <div className="flex items-start gap-4">
        <div className="flex min-w-0 flex-col gap-[3px]">
          <span className="eyebrow">{eyebrow}</span>
          <span className="text-micro" style={{ color: "var(--ink-400)" }}>
            {subtitle}
          </span>
        </div>
        <div className="flex-1" />
        <span className="inline-flex items-baseline gap-[7px] whitespace-nowrap">
          <span className="size-2 self-center rounded-[2px] bg-[var(--viz-you)]" />
          <span className="text-[12px] font-medium text-[var(--ink-900)]">
            {youName}
          </span>
          <span className="text-micro" style={{ color: "var(--ink-400)" }}>
            {isServe ? "serving" : "returning"}
          </span>
        </span>

        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="inline-flex h-7 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-[var(--radius-element)] bg-[var(--surface-subtle)] px-2.5 text-[12px] font-medium text-[var(--ink-900)]"
              >
                <SlidersHorizontal
                  className="size-[13px] text-[var(--ink-600)]"
                  strokeWidth={1.5}
                  aria-hidden
                />
                Filters
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              sideOffset={6}
              className="w-[280px] rounded-[var(--radius-dropdown)] border-[var(--border-card)] bg-[var(--surface-card)] px-4 pb-3 pt-1.5 shadow-[var(--shadow-dropdown)]"
            >
              <FilterSection label="This match" first>
                <FilterGroup
                  label="Set"
                  value={String(filters.set)}
                  onChange={update("set")}
                  options={[
                    { value: "any", label: "Any" },
                    ...availableSets.map((s) => ({
                      value: String(s),
                      label: String(s),
                    })),
                  ]}
                />
                <FilterGroup
                  label="Game"
                  value={filters.game}
                  onChange={update("game")}
                  options={[
                    { value: "any", label: "Any" },
                    { value: "serving", label: "Serving" },
                    { value: "returning", label: "Returning" },
                  ]}
                />
              </FilterSection>

              <FilterSection label="The serve">
                <FilterGroup
                  label="Ball"
                  value={filters.ball}
                  onChange={update("ball")}
                  options={[
                    { value: "any", label: "Any" },
                    { value: "first", label: "First" },
                    { value: "second", label: "Second" },
                  ]}
                />
                <FilterGroup
                  label="Court"
                  value={filters.court}
                  onChange={update("court")}
                  options={[
                    { value: "any", label: "Any" },
                    { value: "deuce", label: "Deuce" },
                    { value: "ad", label: "Ad" },
                  ]}
                />
                {isServe && (
                  <FilterGroup
                    label="Zone"
                    value={filters.zone}
                    onChange={update("zone")}
                    options={[
                      { value: "any", label: "Any" },
                      { value: "t", label: "T" },
                      { value: "body", label: "Body" },
                      { value: "wide", label: "Wide" },
                    ]}
                  />
                )}
              </FilterSection>

              <FilterSection label="The point">
                <FilterGroup
                  label="Pressure"
                  value={filters.pressure}
                  onChange={update("pressure")}
                  options={[
                    { value: "any", label: "Any" },
                    { value: "break", label: "Break point" },
                    { value: "setMatch", label: "Set · match" },
                  ]}
                />
                <FilterGroup
                  label="Result"
                  value={filters.result}
                  onChange={update("result")}
                  options={[
                    { value: "any", label: "Any" },
                    { value: "won", label: "Won" },
                    { value: "lost", label: "Lost" },
                    ...(isServe ? [{ value: "ace", label: "Ace" }] : []),
                  ]}
                />
                <FilterGroup
                  label="Rally"
                  value={filters.rally}
                  onChange={update("rally")}
                  options={[
                    { value: "any", label: "Any" },
                    { value: "short", label: "1–4" },
                    { value: "medium", label: "5–8" },
                    { value: "long", label: "9+" },
                  ]}
                />
              </FilterSection>

              <div className="flex items-center gap-2.5 pt-3">
                <span className="text-[11px] text-[var(--ink-700)]">
                  <span className="tabular">{count}</span> of{" "}
                  <span className="tabular">{total}</span> {noun}
                </span>
                <div className="flex-1" />
                <button
                  type="button"
                  onClick={clearFilters}
                  className="cursor-pointer text-[11px] font-medium text-[var(--blue)] hover:text-[var(--blue-hover)]"
                >
                  Clear all
                </button>
              </div>
            </PopoverContent>
          </Popover>

          <Dialog open={maximized} onOpenChange={setMaximized}>
            <DialogTrigger asChild>
              <button
                type="button"
                aria-label="Expand the court"
                className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-element)] hover:bg-[var(--surface-subtle)]"
              >
                <Maximize2
                  className="size-[13px] text-[var(--ink-600)]"
                  strokeWidth={1.75}
                  aria-hidden
                />
              </button>
            </DialogTrigger>
            <DialogContent
              aria-describedby={undefined}
              className="max-w-[880px] gap-4 rounded-[var(--radius-card)] border-[var(--border-card)] bg-[var(--surface-card)] p-6"
            >
              <DialogTitle asChild>
                <span className="eyebrow text-left">{eyebrow}</span>
              </DialogTitle>
              {maximizeContent}
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Row 2 — the segmented toolbar (47a lines 111–116) */}
      <div className="flex flex-wrap items-center gap-2">
        <SegGroup
          label="Shot"
          value={mode}
          onChange={(v) => setMode(v as "serve" | "return")}
          options={[
            { value: "serve", label: "Serve" },
            { value: "return", label: "Return" },
          ]}
        />
        <SegGroup
          label="View"
          value={view}
          onChange={(v) => setView(v as "zones" | "placements")}
          // Zones are a serve-box reading; returns draw as placements only.
          disabled={!isServe}
          options={[
            { value: "zones", label: "Zones" },
            { value: "placements", label: "Placements" },
          ]}
        />
        <SegGroup
          label="Ball"
          value={filters.ball}
          onChange={update("ball")}
          options={[
            { value: "first", label: "1st" },
            { value: "second", label: "2nd" },
            { value: "any", label: "Both" },
          ]}
        />
        <SegGroup
          label="Result"
          value={filters.result}
          onChange={update("result")}
          options={[
            { value: "any", label: "All" },
            { value: "won", label: "Won" },
            { value: "lost", label: "Lost" },
          ]}
        />
      </div>

      {/* Row 3 — the applied-cut sentence strip (47a lines 117–121) */}
      {isFiltered && (
        <div className="flex items-center gap-2.5 rounded-[var(--radius-element)] bg-[var(--surface-subtle)] px-3 py-[9px]">
          <span className="text-[11px] text-[var(--ink-700)]">
            {cutSentence} · <span className="tabular">{count}</span> of{" "}
            <span className="tabular">{total}</span>
          </span>
          <div className="flex-1" />
          <button
            type="button"
            onClick={clearFilters}
            className="cursor-pointer whitespace-nowrap text-[11px] font-medium text-[var(--blue)] hover:text-[var(--blue-hover)]"
          >
            Clear filter
          </button>
        </div>
      )}
    </div>
  );
}
