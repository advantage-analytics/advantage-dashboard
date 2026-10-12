"use client";

import { useId, useMemo, useState } from "react";
import { ChevronDown, SlidersHorizontal, X } from "lucide-react";

import { ChromeTooltip } from "@/components/dashboard/shared/chrome-tooltip";
import { advButton } from "@/lib/ui/adv-button";
import { cn } from "@/lib/utils";

import type {
  MatchFilterAvailability,
  MatchFilterSectionId,
  MatchFilters,
} from "./model";
import {
  canApply,
  draftCountLine,
  initialOpenSection,
  isOptionSelected,
  panelActions,
  panelSections,
  pointGridCell,
  sectionSummary,
  showPointsLabel,
  type CountNoun,
  type PanelGroup,
  type PanelSection,
} from "./panel-draft";

/**
 * The shared match filters panel — Score / Serve / Return / Result / Custom —
 * driven entirely by `model.ts`'s catalog (`MATCH_FILTER_SECTIONS`,
 * `MATCH_FILTER_OPTIONS`); no option label is declared here. The Video tab
 * hosts it twice: the report's 340px filters drawer (`filter-rail.tsx`) and
 * the fullscreen film room's points drawer (`film/film-advanced-panel.tsx`).
 *
 * Anatomy (the approved "FilterRail" frame): a 48px header — the dropdown
 * trigger's own SlidersHorizontal + "Filters" look, and a close X; the
 * sections as an ACCORDION (one open at a time), each collapsed header
 * stating what is picked in it ("G. Revelli · second serve", "Any"); a 60px
 * footer — "Clear all", the live "N of M points" and the primary "Show N
 * points".
 *
 * It edits a DRAFT. Pills and Clear all only change the draft; `onApply` is
 * called by the primary and nothing else (`panelActions`, in
 * `panel-draft.ts`, is where that is held). The primary stays disabled until
 * the draft differs from the applied `filters` (SKILL.md › Disabled). The
 * count is the host's (`countFor`): the Video list's own rule, so "Show 9
 * points" is exactly what the list will show.
 *
 * No "Any" pill: nothing picked in a group is any. Options the match cannot
 * produce are not drawn (`optionAvailability`), a group with none left is not
 * drawn, and a one-set match draws no Sets. When nothing at all is left, the
 * body says so in one line instead of going blank.
 *
 * `tone="dark"` is the same panel inside the fullscreen film room's points
 * drawer: it opens the design system's `.dark` token scope, so every
 * `--ink-*`/`--border-*`/`--surface-*` below resolves to its dark twin with
 * no second set of classes, and "Clear all" takes the film room's dark-tone
 * clear (white/70 → white) — blue over the film is the progress rule's.
 *
 * A Statistics cut's Film-only remainder (`filmCut`) is named, not editable:
 * one read-only line between the header and the sections.
 *
 * No `next/navigation` here — the offline spec loads this file through
 * `createLoader()`.
 */
export function FiltersPanel({
  filters,
  availability,
  youName,
  oppName,
  onApply,
  onClose,
  countFor,
  total,
  className,
  tone = "light",
  filmCut = null,
  noun,
}: {
  /** The applied filters — the draft starts here. */
  filters: MatchFilters;
  /** `optionAvailability(points, ctx)` for this match. */
  availability: MatchFilterAvailability;
  youName: string;
  oppName: string;
  onApply: (next: MatchFilters) => void;
  /** The header's X: close without touching the applied filters. */
  onClose: () => void;
  /** How many points the list would show under `draft`. */
  countFor: (draft: MatchFilters) => number;
  /** Every point on the match — the count's denominator. */
  total: number;
  className?: string;
  /** Paint only. "dark" is the fullscreen film room's drawer. */
  tone?: "light" | "dark";
  /**
   * The label of a Statistics cut's Film-only remainder (rally-length band,
   * ending) that is in force but has no pill here — the host passes it only
   * while such extras apply, `null` otherwise. Drawn as one read-only line
   * that explains the part of the footer count the pills do not.
   */
  filmCut?: string | null;
  /** What `countFor` counts, when not points (the Visualizations tab). */
  noun?: CountNoun;
}) {
  const titleId = useId();
  const names = { you: youName, opponent: oppName };
  const [draft, setDraft] = useState<MatchFilters>(filters);
  const sections = panelSections(availability, names);
  const [open, setOpen] = useState<MatchFilterSectionId | null>(() =>
    initialOpenSection(filters, sections),
  );
  const actions = panelActions(draft, setDraft, onApply);
  // `countFor` re-filters the whole match, so it only reruns when the draft
  // itself changes — not on every render (e.g. the accordion opening/closing
  // while the film keeps playing behind the panel).
  const count = useMemo(() => countFor(draft), [countFor, draft]);

  return (
    <section
      aria-labelledby={titleId}
      className={cn(
        "flex min-h-0 flex-col",
        tone === "dark" && "dark",
        className,
      )}
    >
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-[var(--border-hairline)] pr-2.5 pl-5">
        <h2
          id={titleId}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-[12px] font-medium"
          style={{ color: "var(--ink-900)" }}
        >
          <SlidersHorizontal
            className="size-[13px] shrink-0"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          Filters
        </h2>
        <ChromeTooltip label="Close" shortcut="Esc">
          <button
            type="button"
            aria-label="Close filters"
            onClick={onClose}
            className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-element)] text-[var(--ink-600)] transition-colors duration-[var(--duration-hover)] hover:bg-[var(--surface-subtle)] hover:text-[var(--ink-900)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
          >
            <X className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
          </button>
        </ChromeTooltip>
      </div>

      {filmCut && (
        // Read-only: no button, no aria-pressed. The strip's Clear is what
        // removes it, so nothing here can be toggled.
        <p
          data-film-cut=""
          className="text-micro shrink-0 border-b border-[var(--border-hairline)] px-5 py-2.5"
        >
          {`${filmCut} · From Statistics — the strip's Clear removes it`}
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {sections.length === 0 ? (
          <p className="text-body-sm px-5 py-4">
            No filterable points in this match.
          </p>
        ) : (
          sections.map((section) => (
            <FilterSection
              key={section.id}
              section={section}
              open={open === section.id}
              onToggleOpen={() =>
                setOpen((prev) => (prev === section.id ? null : section.id))
              }
              summary={sectionSummary(draft, section.id, names)}
              draft={draft}
              onToggleOption={actions.toggle}
            />
          ))
        )}
      </div>

      <div className="flex h-[60px] shrink-0 items-center gap-3 border-t border-[var(--border-hairline)] pr-4 pl-5">
        <button
          type="button"
          onClick={actions.clear}
          className={cn(
            "shrink-0 cursor-pointer text-[12px] font-medium whitespace-nowrap transition-colors duration-[var(--duration-hover)]",
            tone === "dark"
              ? "text-white/70 hover:text-white"
              : "text-[var(--blue)] hover:text-[var(--blue-hover)]",
          )}
        >
          Clear all
        </button>
        <span
          aria-live="polite"
          className="min-w-0 flex-1 text-right text-[11px] whitespace-nowrap tabular-nums"
          style={{ color: "var(--ink-500)" }}
        >
          {draftCountLine(count, total, noun)}
        </span>
        <button
          type="button"
          onClick={actions.apply}
          disabled={!canApply(draft, filters)}
          className={cn(advButton("primary", "sm"), "whitespace-nowrap")}
        >
          {showPointsLabel(count, noun)}
        </button>
      </div>
    </section>
  );
}

function FilterSection({
  section,
  open,
  onToggleOpen,
  summary,
  draft,
  onToggleOption,
}: {
  section: PanelSection;
  open: boolean;
  onToggleOpen: () => void;
  /** What is picked in this section, or null for "Any". */
  summary: string | null;
  draft: MatchFilters;
  onToggleOption: (group: PanelGroup["group"], value: unknown) => void;
}) {
  const bodyId = useId();
  return (
    <div
      className="border-b border-[var(--border-hairline)]"
      data-section={section.id}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={onToggleOpen}
        className="flex h-11 w-full cursor-pointer items-center gap-2 px-5 text-left focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
      >
        <span
          className="shrink-0 text-[12px] font-medium"
          style={{ color: "var(--ink-900)" }}
        >
          {section.label}
        </span>
        <span
          data-summary=""
          className="min-w-0 flex-1 truncate text-right text-[11px]"
          style={{ color: summary ? "var(--ink-500)" : "var(--ink-400)" }}
        >
          {open ? "" : (summary ?? "Any")}
        </span>
        <ChevronDown
          className={cn(
            "size-3 shrink-0 transition-transform duration-[var(--duration-hover)]",
            open && "rotate-180",
          )}
          style={{ color: "var(--ink-400)" }}
          strokeWidth={1.5}
          aria-hidden="true"
        />
      </button>
      <div id={bodyId} hidden={!open} className="flex flex-col gap-4 px-5 pb-4">
        {section.id === "custom" && (
          <p className="text-micro">
            One shot in the rally has to match every choice here.
          </p>
        )}
        {section.groups.map((g) => (
          <FilterGroup
            key={`${section.id}-${g.group.key}`}
            group={g}
            draft={draft}
            onToggle={onToggleOption}
          />
        ))}
      </div>
    </div>
  );
}

function FilterGroup({
  group,
  draft,
  onToggle,
}: {
  group: PanelGroup;
  draft: MatchFilters;
  onToggle: (group: PanelGroup["group"], value: unknown) => void;
}) {
  const labelId = useId();
  const isPoints = group.group.key === "scorePoints";
  return (
    <div role="group" aria-labelledby={labelId} className="flex flex-col gap-2">
      <div className="flex items-baseline gap-1.5">
        <span id={labelId} className="text-micro">
          {group.group.label}
        </span>
        {group.group.note && (
          <span
            className="text-[11px] leading-[1.4]"
            style={{ color: "var(--ink-400)" }}
          >
            {group.group.note}
          </span>
        )}
      </div>
      <div
        className={
          isPoints ? "grid grid-cols-5 gap-1.5" : "flex flex-wrap gap-1.5"
        }
      >
        {group.options.map((option) => {
          const cell = isPoints ? pointGridCell(option.label) : null;
          return (
            <FilterPill
              key={String(option.value)}
              label={option.label}
              active={isOptionSelected(draft, group.group, option.value)}
              onClick={() => onToggle(group.group, option.value)}
              fill={isPoints}
              style={
                cell
                  ? { gridColumn: cell.column, gridRow: cell.row }
                  : undefined
              }
            />
          );
        })}
      </div>
    </div>
  );
}

function FilterPill({
  label,
  active,
  onClick,
  fill,
  style,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  /** A Points-grid cell: the column's width, no side padding. */
  fill: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 shrink-0 cursor-pointer items-center justify-center rounded-full border text-[12px] whitespace-nowrap tabular-nums",
        "transition-colors duration-[var(--duration-hover)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
        fill ? "w-full px-0" : "px-3",
        active
          ? "border-[var(--border-medium)] bg-[var(--surface-subtle)] font-medium"
          : "border-[var(--border-hairline)] font-normal hover:bg-[var(--surface-subtle)]",
      )}
      // Inline, not a utility: DS type colours are unlayered and would beat
      // a Tailwind text colour on the same element.
      style={{
        ...style,
        color: active ? "var(--ink-900)" : "var(--ink-600)",
      }}
    >
      {label}
    </button>
  );
}
