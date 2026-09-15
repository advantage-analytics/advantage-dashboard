"use client";

import { useMemo, useState } from "react";
import { ChevronDown, X } from "lucide-react";

import type { MatchPoint } from "@/lib/data/match-points-server";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

import { FilmDarkMenu, FilmDarkMenuItem } from "./film-dark-menu";
import {
  applyFilmFilters,
  type CourtCut,
  type EndedKey,
  type FilmFilters,
  type ShotKey,
} from "./film-filters";

/**
 * Multi-axis filtering, off the film (handoff F5). Modal because it is a
 * considered edit with a Cancel: nothing applies until Apply, Esc is Cancel,
 * Reset clears the draft's advanced axes only, and the live count sits
 * bottom-left so the cost of a filter is visible before it is committed.
 * The quick menu's fields (show / serve) ride along untouched.
 */

type Advanced = Pick<
  FilmFilters,
  "set" | "rallyMin" | "ended" | "shot" | "court"
>;

const RALLY_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: "Any length" },
  { value: 5, label: "5 or more shots" },
  { value: 9, label: "9 or more shots" },
];
const ENDED_OPTIONS: { value: EndedKey; label: string }[] = [
  { value: "winner", label: "Winner" },
  { value: "forced", label: "Forced error" },
  { value: "unforced", label: "Unforced error" },
  { value: "ace", label: "Ace" },
  { value: "double-fault", label: "Double fault" },
];
const SHOT_OPTIONS: { value: ShotKey; label: string }[] = [
  { value: "forehand", label: "Forehand" },
  { value: "backhand", label: "Backhand" },
  { value: "volley", label: "Volley" },
  { value: "serve-plus-one", label: "Serve +1" },
];
const COURT_OPTIONS: { value: CourtCut; label: string }[] = [
  { value: "deuce", label: "Deuce" },
  { value: "ad", label: "Ad" },
  { value: "any", label: "Either" },
];

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="eyebrow" style={{ color: "rgba(255,255,255,0.45)" }}>
      {children}
    </span>
  );
}

/** The 34px underline field: a value, a chevron, a dark float menu beneath. */
function UnderlineSelect<T extends string | number | null>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (next: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value) ?? options[0];
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Eyebrow>{label}</Eyebrow>
      <FilmDarkMenu
        open={open}
        onOpenChange={setOpen}
        label={label}
        width={252}
        align="start"
        trigger={
          <button
            type="button"
            aria-expanded={open}
            className={cn(
              "flex h-[34px] w-full cursor-pointer items-center border-b text-left text-[13px] text-white transition-colors duration-200 focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
              open ? "border-[var(--blue)]" : "border-white/[0.18]",
            )}
          >
            <span className="flex-1 truncate">{current.label}</span>
            <ChevronDown
              className="h-3 w-3 text-white/50"
              strokeWidth={1.6}
              aria-hidden="true"
            />
          </button>
        }
      >
        {options.map((o) => (
          <FilmDarkMenuItem
            key={String(o.value)}
            label={o.label}
            chosen={o.value === value}
            onSelect={() => {
              onChange(o.value);
              setOpen(false);
            }}
          />
        ))}
      </FilmDarkMenu>
    </div>
  );
}

function Pill({
  label,
  selected,
  onToggle,
}: {
  label: string;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onToggle}
      className={cn(
        "inline-flex h-[26px] cursor-pointer items-center rounded-[var(--radius-pill)] border px-[11px] text-[11px] transition-colors duration-200 focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
        selected
          ? "border-white/[0.32] bg-white/10 text-white"
          : "border-white/[0.14] bg-transparent text-white/65 hover:text-white",
      )}
    >
      {label}
    </button>
  );
}

function PillSet<T extends string>({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  selected: T[];
  onChange: (next: T[]) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-col gap-[9px]">
      <Eyebrow>{label}</Eyebrow>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const on = selected.includes(o.value);
          return (
            <Pill
              key={o.value}
              label={o.label}
              selected={on}
              onToggle={() =>
                onChange(
                  on
                    ? selected.filter((v) => v !== o.value)
                    : [...selected, o.value],
                )
              }
            />
          );
        })}
      </div>
    </div>
  );
}

export function FilmAdvancedFiltersDialog({
  open,
  onOpenChange,
  points,
  filters,
  youIsPlayer1,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Every point on the match — the count universe. */
  points: MatchPoint[];
  filters: FilmFilters;
  youIsPlayer1: boolean;
  onApply: (next: FilmFilters) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Keyed on open so the draft re-seeds from what is applied each time
          the dialog opens, and an abandoned edit leaves nothing behind. */}
      {open && (
        <Body
          points={points}
          filters={filters}
          youIsPlayer1={youIsPlayer1}
          onCancel={() => onOpenChange(false)}
          onApply={(next) => {
            onApply(next);
            onOpenChange(false);
          }}
        />
      )}
    </Dialog>
  );
}

function Body({
  points,
  filters,
  youIsPlayer1,
  onCancel,
  onApply,
}: {
  points: MatchPoint[];
  filters: FilmFilters;
  youIsPlayer1: boolean;
  onCancel: () => void;
  onApply: (next: FilmFilters) => void;
}) {
  const [draft, setDraft] = useState<Advanced>({
    set: filters.set,
    rallyMin: filters.rallyMin,
    ended: filters.ended,
    shot: filters.shot,
    court: filters.court,
  });

  const setOptions = useMemo(() => {
    const sets = Array.from(new Set(points.map((p) => p.setNumber))).sort(
      (a, b) => a - b,
    );
    return [
      { value: null as number | null, label: "All sets" },
      ...sets.map((n) => ({ value: n as number | null, label: `Set ${n}` })),
    ];
  }, [points]);

  const previewCount = useMemo(
    () =>
      applyFilmFilters(points, { ...filters, ...draft }, youIsPlayer1).length,
    [points, filters, draft, youIsPlayer1],
  );

  return (
    <DialogContent
      hideCloseButton
      aria-describedby={undefined}
      className="w-[560px] max-w-[calc(100vw-32px)] gap-0 rounded-[var(--radius-card)] border-white/[0.12] bg-[rgba(20,20,22,0.98)] p-0 text-white shadow-[var(--shadow-dropdown)]"
    >
      <div className="flex items-center gap-3 px-5 pt-[18px]">
        <DialogTitle className="text-[16px] font-normal tracking-[-0.4px] text-white">
          Advanced filters
        </DialogTitle>
        <div className="flex-1" />
        <button
          type="button"
          aria-label="Close"
          onClick={onCancel}
          className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-[var(--radius-element)] text-white/75 transition-colors duration-200 hover:bg-white/[0.08] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
        >
          <X className="h-3.5 w-3.5" strokeWidth={1.6} aria-hidden="true" />
        </button>
      </div>

      <div className="flex flex-col gap-5 px-5 pt-[18px] pb-1">
        <div className="grid grid-cols-1 gap-[18px] sm:grid-cols-2">
          <UnderlineSelect
            label="Set"
            value={draft.set}
            options={setOptions}
            onChange={(set) => setDraft({ ...draft, set })}
          />
          <UnderlineSelect
            label="Rally length"
            value={draft.rallyMin}
            options={RALLY_OPTIONS}
            onChange={(rallyMin) => setDraft({ ...draft, rallyMin })}
          />
        </div>
        <PillSet
          label="Point ended with"
          options={ENDED_OPTIONS}
          selected={draft.ended}
          onChange={(ended) => setDraft({ ...draft, ended })}
        />
        <PillSet
          label="Shot"
          options={SHOT_OPTIONS}
          selected={draft.shot}
          onChange={(shot) => setDraft({ ...draft, shot })}
        />
        <div
          role="radiogroup"
          aria-label="Court"
          className="flex flex-col gap-[9px]"
        >
          <Eyebrow>Court</Eyebrow>
          <div className="flex flex-wrap gap-2">
            {COURT_OPTIONS.map((o) => (
              <Pill
                key={o.value}
                label={o.label}
                selected={draft.court === o.value}
                onToggle={() => setDraft({ ...draft, court: o.value })}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-[18px] flex items-center gap-3 px-5 py-[18px] shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]">
        <span className="mono tabular text-[11px] text-white/50">
          {previewCount} of {points.length} points
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() =>
            setDraft({
              set: null,
              rallyMin: null,
              ended: [],
              shot: [],
              court: "any",
            })
          }
          className="inline-flex h-[34px] cursor-pointer items-center rounded-[var(--radius-button)] px-3 text-[12px] font-medium text-white/70 transition-colors duration-200 hover:text-white focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
        >
          Reset
        </button>
        <button
          type="button"
          onClick={() => onApply({ ...filters, ...draft })}
          className="inline-flex h-[34px] cursor-pointer items-center rounded-[var(--radius-button)] bg-[var(--blue)] px-4 text-[12px] font-medium text-white transition-colors duration-200 hover:bg-[var(--blue-hover)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
        >
          Apply filters
        </button>
      </div>
    </DialogContent>
  );
}
