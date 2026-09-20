"use client";

import { useMemo, useState } from "react";
import { ChevronDown, X } from "lucide-react";

import type { MatchPoint } from "@/lib/data/match-points-server";
import type { MatchSides } from "@/components/dashboard/matches/match-detail/use-match-sides";
import { advButton } from "@/lib/ui/adv-button";
import { cn } from "@/lib/utils";

import {
  DEFAULT_FILM_FILTERS,
  FILM_FILTER_SECTIONS,
  applyFilmFilters,
  countFilmOption,
  filmFiltersEqual,
  lastNameOf,
  type FilmAxisKey,
  type FilmFilters,
  type FilmSectionId,
} from "./filters/types";

/**
 * Advanced filters, in the point list's own column (handoff P4).
 *
 * Not a dialog and not a popover: the caller swaps this in where the list was,
 * so the film keeps playing behind every filter operation and there is nothing
 * to trap focus in. `film-advanced-filters-dialog.tsx` is the fullscreen room's
 * modal and is untouched by this file.
 *
 * ── Why a pill for every option ─────────────────────────────────────────────
 * Fourteen axes in a 320px column cannot afford one row per option, and the
 * frame retires the segmented controls, native selects and checkboxes the old
 * `FilmFiltersPanel` drew. A pill carries its own count, which is the whole
 * point of the panel: the number answers "how many points would this give me,
 * inside the rest of the draft" before it is committed. "Any" is the absence of
 * a selection, so there is no Any pill to click — deselecting the last pill in
 * a group IS Any. A zero-count pill stays drawn and disabled rather than
 * disappearing, because a group whose options come and go as neighbouring
 * axes move is unreadable.
 *
 * ── Draft, not live ─────────────────────────────────────────────────────────
 * The draft seeds from what is applied and commits on Apply, which is dead
 * until `filmFiltersEqual` says something differs. Clear all commits
 * `DEFAULT_FILM_FILTERS` — which clears the quick cut as well, since one
 * `FilmFilters` value is the whole cut.
 *
 * Section open/closed state is the CALLER's (`openSections`), so it survives
 * the panel unmounting when Advanced is closed and reopened in a session.
 */

/* ── Option tables ──────────────────────────────────────────────────────── */

interface Option {
  /** Unique within its group. */
  id: string;
  label: string;
  /** The filters the group takes when this pill turns on. */
  patch: Partial<FilmFilters>;
  selected: boolean;
}

/** One axis: a caption and the pills under it. */
interface Group {
  key: FilmAxisKey;
  caption: string;
  options: Option[];
}

type ArrayAxis = "score" | "serve" | "returns" | "result" | "ended" | "shot";

/** A multi-select axis: the pill toggles its key in or out of the OR group. */
function orGroup<K extends ArrayAxis>(
  key: K,
  caption: string,
  draft: FilmFilters,
  options: { value: FilmFilters[K][number]; label: string }[],
): Group {
  const current = draft[key] as string[];
  return {
    key,
    caption,
    options: options.map((option) => {
      const selected = current.includes(option.value as string);
      return {
        id: String(option.value),
        label: option.label,
        selected,
        patch: {
          [key]: selected
            ? current.filter((v) => v !== option.value)
            : [...current, option.value],
        } as Partial<FilmFilters>,
      };
    }),
  };
}

/** A single-choice axis: the pill sets its value, or clears back to the default. */
function oneGroup<K extends FilmAxisKey>(
  key: K,
  caption: string,
  draft: FilmFilters,
  cleared: FilmFilters[K],
  options: { value: FilmFilters[K]; label: string }[],
): Group {
  return {
    key,
    caption,
    options: options.map((option) => {
      const selected = draft[key] === option.value;
      return {
        id: String(option.value),
        label: option.label,
        selected,
        patch: {
          [key]: selected ? cleared : option.value,
        } as Partial<FilmFilters>,
      };
    }),
  };
}

/**
 * The groups of one section, in the frame's order.
 *
 * You/opponent labels come from `sides`, never from player order — a hardcoded
 * name here is exactly the bug guardrails §4 is about.
 */
function groupsFor(
  section: FilmSectionId,
  draft: FilmFilters,
  sides: MatchSides,
  sets: number[],
): Group[] {
  const opp = lastNameOf(sides.opp.name);

  switch (section) {
    case "score":
      return [
        oneGroup(
          "set",
          "Set",
          draft,
          null,
          sets.map((n) => ({ value: n as number | null, label: `Set ${n}` })),
        ),
        oneGroup("pressure", "Pressure", draft, "any", [
          { value: "break", label: "Break point" },
          { value: "set-match", label: "Set · match point" },
        ]),
        orGroup("score", "Game score", draft, [
          { value: "deuce", label: "Deuce points" },
          { value: "game", label: "Game points" },
        ]),
      ];
    case "serve":
      return [
        oneGroup("server", "Who served", draft, "any", [
          { value: "you", label: "You serving" },
          { value: "opp", label: `${opp} serving` },
        ]),
        oneGroup("ball", "Ball", draft, "any", [
          { value: "first", label: "First serve" },
          { value: "second", label: "Second serve" },
        ]),
        orGroup("serve", "Serve", draft, [
          { value: "ace", label: "Aces" },
          { value: "double-fault", label: "Double faults" },
          { value: "t", label: "To the T" },
          { value: "body", label: "To the body" },
          { value: "wide", label: "Wide" },
        ]),
      ];
    case "return":
      return [
        oneGroup("wing", "Wing", draft, "any", [
          { value: "forehand", label: "Forehand" },
          { value: "backhand", label: "Backhand" },
        ]),
        orGroup("returns", "Return", draft, [
          { value: "in-play", label: "Return in play" },
          { value: "winner", label: "Return winners" },
          { value: "error", label: "Return errors" },
        ]),
      ];
    case "rally":
      return [
        oneGroup("rallyMin", "Length", draft, null, [
          { value: 5, label: "5 or more shots" },
          { value: 9, label: "9 or more shots" },
        ]),
        orGroup("shot", "Last shot", draft, [
          { value: "forehand", label: "Forehand" },
          { value: "backhand", label: "Backhand" },
          { value: "volley", label: "Volley" },
          { value: "serve-plus-one", label: "Serve +1" },
        ]),
      ];
    case "result":
      return [
        orGroup("result", "Result", draft, [
          { value: "winner", label: "Winners" },
          { value: "forced", label: "Forced errors" },
          { value: "unforced", label: "Unforced errors" },
          { value: "long", label: "Rallies 9+ shots" },
        ]),
        orGroup("ended", "Point ended with", draft, [
          { value: "winner", label: "Winner" },
          { value: "forced", label: "Forced error" },
          { value: "unforced", label: "Unforced error" },
          { value: "ace", label: "Ace" },
          { value: "double-fault", label: "Double fault" },
        ]),
        oneGroup("outcome", "Point went to", draft, "any", [
          { value: "you", label: "You" },
          { value: "opp", label: opp },
        ]),
      ];
    case "court":
      return [
        oneGroup("court", "Service court", draft, "any", [
          { value: "deuce", label: "Deuce court" },
          { value: "ad", label: "Ad court" },
        ]),
      ];
  }
}

/* ── Pills ──────────────────────────────────────────────────────────────── */

function CountPill({
  label,
  count,
  selected,
  onToggle,
}: {
  label: string;
  count: number;
  selected: boolean;
  onToggle: () => void;
}) {
  // Drawn and dead rather than removed: a group that reflows as the
  // neighbouring axes move cannot be read.
  const dead = count === 0 && !selected;
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={dead}
      onClick={onToggle}
      className={cn(
        "inline-flex h-[26px] items-center gap-1.5 rounded-[var(--radius-pill)] border px-[10px] text-[11px] whitespace-nowrap transition-colors duration-200 focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
        dead
          ? "cursor-not-allowed border-[var(--border-hairline)] bg-[var(--surface-subtle)] text-[var(--ink-300)]"
          : selected
            ? "cursor-pointer border-[var(--blue)] bg-[var(--blue-tint-08)] font-medium text-[var(--blue)]"
            : "cursor-pointer border-[var(--border-field)] text-[var(--ink-700)] hover:border-[var(--ink-300)] hover:text-[var(--ink-900)]",
      )}
    >
      {label}
      <span
        className="tabular text-[10px]"
        style={{
          color: dead
            ? "var(--ink-300)"
            : selected
              ? "var(--blue)"
              : "var(--ink-400)",
        }}
      >
        {count}
      </span>
    </button>
  );
}

/* ── Panel ──────────────────────────────────────────────────────────────── */

interface FilmAdvancedPanelProps {
  /** Every point on the match — the count universe and the denominator. */
  points: MatchPoint[];
  sides: MatchSides;
  /** What is applied right now; the draft seeds from it. */
  filters: FilmFilters;
  onApply: (next: FilmFilters) => void;
  onClose: () => void;
  /** Open sections, owned by the caller so they survive a close and reopen. */
  openSections: FilmSectionId[];
  onOpenSectionsChange: (next: FilmSectionId[]) => void;
}

export function FilmAdvancedPanel({
  points,
  sides,
  filters,
  onApply,
  onClose,
  openSections,
  onOpenSectionsChange,
}: FilmAdvancedPanelProps) {
  const youIsPlayer1 = sides.you.isPlayer1;
  const [draft, setDraft] = useState<FilmFilters>(filters);

  const sets = useMemo(
    () =>
      Array.from(new Set(points.map((p) => p.setNumber))).sort((a, b) => a - b),
    [points],
  );

  const previewCount = useMemo(
    () => applyFilmFilters(points, draft, youIsPlayer1).length,
    [points, draft, youIsPlayer1],
  );

  const sections = useMemo(
    () =>
      FILM_FILTER_SECTIONS.map((section) => {
        const groups = groupsFor(section.id, draft, sides, sets);
        // The summary names what is on, so a collapsed section still reports
        // itself; ink-400 "Any" when the section holds nothing.
        const chosen = groups.flatMap((group) =>
          group.options.filter((o) => o.selected).map((o) => o.label),
        );
        return { ...section, groups, summary: chosen.join(", ") };
      }),
    [draft, sides, sets],
  );

  const count = (patch: Partial<FilmFilters>) =>
    countFilmOption(points, draft, youIsPlayer1, patch);

  const toggleSection = (id: FilmSectionId) =>
    onOpenSectionsChange(
      openSections.includes(id)
        ? openSections.filter((s) => s !== id)
        : [...openSections, id],
    );

  const savedCount = count({ savedOnly: true });

  return (
    <section
      aria-label="Advanced filters"
      className="surface-card flex max-h-full min-h-0 flex-col"
      style={{ padding: "10px 8px" }}
    >
      {/* 40px title row: label, the draft's own count, and the close. */}
      <div className="mx-1.5 flex h-10 flex-none items-center gap-[7px] pb-2.5">
        <span className="text-[12px] font-medium tracking-[-0.08px] text-[var(--ink-900)]">
          Filters
        </span>
        <span className="tabular text-[11px] text-[var(--ink-400)]">
          {previewCount}
        </span>
        <div className="flex-1" />
        <button
          type="button"
          aria-label="Close filters"
          onClick={onClose}
          className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-[var(--radius-element)] transition-colors duration-200 hover:bg-[var(--surface-subtle)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
        >
          <X
            className="h-[13px] w-[13px] text-[var(--ink-500)]"
            strokeWidth={1.6}
            aria-hidden="true"
          />
        </button>
      </div>

      <div
        className="flex min-h-0 flex-1 flex-col overflow-y-auto px-1.5"
        style={{ scrollbarGutter: "stable" }}
      >
        {/* Saved only is not one of the six axes groups — it is the one cut
            that is about you rather than about the tennis, so it sits above
            them as its own pill. */}
        <div className="flex flex-wrap gap-1.5 border-b border-[var(--border-hairline)] px-1 pt-0.5 pb-3.5">
          <CountPill
            label="Saved only"
            count={savedCount}
            selected={draft.savedOnly}
            onToggle={() => setDraft({ ...draft, savedOnly: !draft.savedOnly })}
          />
        </div>

        {sections.map((section) => {
          const open = openSections.includes(section.id);
          return (
            <div key={section.id}>
              <button
                type="button"
                aria-expanded={open}
                onClick={() => toggleSection(section.id)}
                className="-mx-1 flex h-[42px] w-full flex-none cursor-pointer items-center gap-2.5 rounded-[var(--radius-element)] px-2 text-left transition-colors duration-200 hover:bg-[var(--surface-subtle)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
              >
                <span className="text-[12px] font-medium text-[var(--ink-900)]">
                  {section.name}
                </span>
                <div className="flex-1" />
                <span
                  className="truncate text-[11px] whitespace-nowrap"
                  style={{
                    color: section.summary ? "var(--blue)" : "var(--ink-400)",
                  }}
                >
                  {section.summary || "Any"}
                </span>
                <ChevronDown
                  className={cn(
                    "h-3 w-3 flex-none text-[var(--ink-300)] transition-transform duration-200",
                    open && "rotate-180",
                  )}
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
              </button>

              {open && (
                <div className="flex flex-col gap-3 px-1 pb-4">
                  {section.groups.map((group) => (
                    <div key={group.key} className="flex flex-col gap-1.5">
                      <span className="text-[10px] text-[var(--ink-400)]">
                        {group.caption}
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {group.options.map((option) => (
                          <CountPill
                            key={option.id}
                            label={option.label}
                            count={count(option.patch)}
                            selected={option.selected}
                            onToggle={() =>
                              setDraft({ ...draft, ...option.patch })
                            }
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 52px footer: what the draft would give, and the two commits. */}
      <div className="mx-1.5 flex h-[52px] flex-none items-center gap-2.5 border-t border-[var(--border-hairline)]">
        <span className="text-[12px] text-[var(--ink-700)]">
          <span className="tabular">{previewCount}</span> of{" "}
          <span className="tabular">{points.length}</span>
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => onApply(DEFAULT_FILM_FILTERS)}
          className="cursor-pointer text-[11px] font-medium text-[var(--ink-600)] transition-colors duration-200 hover:text-[var(--ink-900)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
        >
          Clear all
        </button>
        <button
          type="button"
          disabled={filmFiltersEqual(draft, filters)}
          onClick={() => onApply(draft)}
          className={advButton("primary", "sm")}
        >
          Apply
        </button>
      </div>
    </section>
  );
}
