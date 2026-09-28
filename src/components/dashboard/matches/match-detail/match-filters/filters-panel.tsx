"use client";

import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";

import { advButton } from "@/lib/ui/adv-button";
import { cn } from "@/lib/utils";

import type {
  MatchFilterAvailability,
  MatchFilterSectionId,
  MatchFilters,
} from "./model";
import {
  canApply,
  initialOpenSections,
  isOptionSelected,
  panelActions,
  panelSections,
  pointGridCell,
  type PanelGroup,
  type PanelSection,
} from "./panel-draft";

/**
 * The shared match filters panel — Score / Serve / Return / Result / Custom —
 * drawn from the author's two mockups and driven entirely by `model.ts`'s
 * catalog (`MATCH_FILTER_SECTIONS`, `MATCH_FILTER_OPTIONS`); no label is
 * declared here. Standalone: the Statistics and Film tabs host it.
 *
 * It edits a DRAFT. Pills and Clear all only change the draft; `onApply` is
 * called by the Apply button and nothing else (`panelActions`, in
 * `panel-draft.ts`, is where that is held). Apply stays disabled until the
 * draft differs from the applied `filters`.
 *
 * Options the match cannot produce are not drawn (`optionAvailability`), a
 * group with none left is not drawn, and a one-set match draws no Sets. When
 * nothing at all is left, the body says so in one line instead of going blank.
 *
 * Deviations from the mockup, by the settled rules: "Clear all" is a blue text
 * action, not an outlined pill; the Result row is labelled "Shot" (the mockup
 * reads "Zone"); Outcome reads "Winner" (the mockup reads "Winnner").
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
  onCancel,
  defaultOpen,
  className,
}: {
  /** The applied filters — the draft starts here. */
  filters: MatchFilters;
  /** `optionAvailability(points, ctx)` for this match. */
  availability: MatchFilterAvailability;
  youName: string;
  oppName: string;
  onApply: (next: MatchFilters) => void;
  /** Draws a text-only Cancel beside Apply when given. */
  onCancel?: () => void;
  /** Sections open on first draw; defaults to those holding a filter, else the first. */
  defaultOpen?: readonly MatchFilterSectionId[];
  className?: string;
}) {
  const titleId = useId();
  const [draft, setDraft] = useState<MatchFilters>(filters);
  const sections = panelSections(availability, {
    you: youName,
    opponent: oppName,
  });
  const [open, setOpen] = useState<ReadonlySet<MatchFilterSectionId>>(
    () => new Set(defaultOpen ?? initialOpenSections(filters, sections)),
  );
  const actions = panelActions(draft, setDraft, onApply);

  function toggleSection(id: MatchFilterSectionId) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <section
      aria-labelledby={titleId}
      className={cn("flex min-h-0 flex-col", className)}
    >
      <div className="flex shrink-0 items-center justify-between gap-3 pb-3">
        <h2 id={titleId} className="text-title">
          Filters
        </h2>
        <button
          type="button"
          onClick={actions.clear}
          className="shrink-0 cursor-pointer text-[12px] font-medium whitespace-nowrap text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)]"
        >
          Clear all
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {sections.length === 0 ? (
          <p className="text-body-sm border-t border-[var(--border-hairline)] px-4 py-4">
            No filterable points in this match.
          </p>
        ) : (
          sections.map((section) => (
            <FilterSection
              key={section.id}
              section={section}
              open={open.has(section.id)}
              onToggleOpen={() => toggleSection(section.id)}
              draft={draft}
              onToggleOption={actions.toggle}
            />
          ))
        )}
      </div>

      <div className="flex shrink-0 items-center justify-end gap-4 border-t border-[var(--border-hairline)] pt-3">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="cursor-pointer text-[12px] font-medium text-[var(--ink-600)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--ink-900)]"
          >
            Cancel
          </button>
        )}
        <button
          type="button"
          onClick={actions.apply}
          disabled={!canApply(draft, filters)}
          className={advButton("primary", "sm")}
        >
          Apply
        </button>
      </div>
    </section>
  );
}

function FilterSection({
  section,
  open,
  onToggleOpen,
  draft,
  onToggleOption,
}: {
  section: PanelSection;
  open: boolean;
  onToggleOpen: () => void;
  draft: MatchFilters;
  onToggleOption: (group: PanelGroup["group"], value: unknown) => void;
}) {
  const bodyId = useId();
  return (
    <div
      className="border-t border-[var(--border-hairline)]"
      data-section={section.id}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={onToggleOpen}
        className="flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-3.5 text-left text-[14px] font-medium text-[var(--ink-900)]"
      >
        {section.label}
        <ChevronDown
          className={cn(
            "size-3 shrink-0 text-[var(--ink-500)] transition-transform duration-[var(--duration-hover)]",
            open && "rotate-180",
          )}
          strokeWidth={1.5}
          aria-hidden="true"
        />
      </button>
      <div
        id={bodyId}
        hidden={!open}
        className="flex flex-wrap items-start gap-x-8 gap-y-4 px-4 pb-4"
      >
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
      <span id={labelId} className="text-micro">
        {group.group.label}
      </span>
      <div
        className={isPoints ? "grid gap-1.5" : "flex flex-wrap gap-1.5"}
        style={isPoints ? { gridAutoColumns: "max-content" } : undefined}
      >
        {group.options.map((option) => {
          const cell = isPoints ? pointGridCell(option.label) : null;
          return (
            <FilterPill
              key={String(option.value)}
              label={option.label}
              active={isOptionSelected(draft, group.group, option.value)}
              onClick={() => onToggle(group.group, option.value)}
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
  style,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  style?: React.CSSProperties;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 shrink-0 cursor-pointer items-center justify-center rounded-full border px-3 text-[12px] whitespace-nowrap tabular-nums",
        "transition-colors duration-[var(--duration-hover)]",
        active
          ? "border-[var(--border-medium)] bg-[var(--surface-subtle)] font-medium text-[var(--ink-900)]"
          : "border-[var(--border-field)] font-normal text-[var(--ink-700)] hover:bg-[var(--surface-subtle)]",
      )}
      style={style}
    >
      {label}
    </button>
  );
}
