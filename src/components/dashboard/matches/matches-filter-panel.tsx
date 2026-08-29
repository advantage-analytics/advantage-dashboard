"use client";

import { useState } from "react";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * Design 18a's sectioned panel + 18c's chrome (trigger, applied-filter strip
 * lives in the caller) for the Matches list.
 *
 * Two facet shapes, not one:
 *
 * - **Segmented** — a fixed 2-option question with a neutral default ("All",
 *   "Any"), rendered as an equal-width pill row. Result gets a section of its
 *   own; Hand and Backhand share one "Opponent" section, each on its own row
 *   under a smaller sub-label. Single-select by construction — clicking a
 *   pill replaces whatever was active for that key, it never toggles, so a
 *   facet like Result can never end up filtered to "Won AND Lost" (which the
 *   shared filter reducer ANDs into zero rows).
 * - **Checklist** — an open, data-driven value set (Match type, Court,
 *   Source, Analysis, Player), unbounded in size, so it stays a list of
 *   checkbox rows. Multi-select, unchanged from before this design pass.
 *
 * The trigger carries no count badge — 18a and 18c both put the "how many
 * does this leave" answer in the panel's own footer and the applied-filter
 * strip below the toolbar, never on the button itself. Matches SKILL.md's
 * retired-badge rule elsewhere on this page ("no bare numeral beside an
 * eyebrow, no count inside a link").
 */

export interface FilterOption {
  /** `null` is the neutral option — selecting it clears this facet. */
  value: string | null;
  label: string;
}

export interface SegmentedFacet<K extends string> {
  key: K;
  /** A sub-label above the pill row, for a facet sharing a section with siblings (Hand/Backhand under Opponent). Omitted when the facet IS the section (Result). */
  rowLabel?: string;
  /** First entry must be the neutral option. */
  options: FilterOption[];
}

export interface ChecklistFacet<K extends string> {
  key: K;
  values: string[];
  displayValue?: (value: string) => string;
}

export interface FilterPanelSection<K extends string> {
  label: string;
  checklist?: ChecklistFacet<K>;
  segmented?: SegmentedFacet<K>[];
}

interface MatchesFilterPanelProps<K extends string> {
  sections: FilterPanelSection<K>[];
  hasActive: boolean;
  isChecklistActive: (key: K, value: string) => boolean;
  onToggleChecklist: (key: K, value: string) => void;
  segmentedValue: (key: K) => string | null;
  onSelectSegment: (key: K, value: string | null) => void;
  onClear: () => void;
  /** For the footer's "N of M matches" — the live count this panel's own selection leaves. */
  resultCount: number;
  totalCount: number;
}

const SEGMENT_ROW =
  "flex flex-1 items-center justify-center rounded-[var(--radius-button)] text-[11px] cursor-pointer";

function Segmented<K extends string>({
  facet,
  value,
  onSelect,
}: {
  facet: SegmentedFacet<K>;
  value: string | null;
  onSelect: (v: string | null) => void;
}) {
  return (
    <div role="radiogroup" aria-label={facet.rowLabel} className="flex gap-1 px-2 pb-2">
      {facet.options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.label}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onSelect(opt.value)}
            className={cn(
              SEGMENT_ROW,
              "h-[26px] border",
              active
                ? "border-[var(--border-medium)] font-medium"
                : "border-[var(--border-hairline)] font-normal"
            )}
            style={{
              background: active ? "var(--surface-subtle)" : "transparent",
              color: active ? "var(--ink-900)" : "var(--ink-600)",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export function MatchesFilterPanel<K extends string>({
  sections,
  hasActive,
  isChecklistActive,
  onToggleChecklist,
  segmentedValue,
  onSelectSegment,
  onClear,
  resultCount,
  totalCount,
}: MatchesFilterPanelProps<K>): React.JSX.Element | null {
  const [open, setOpen] = useState(false);
  // A panel with nothing in it is a button that does nothing when pressed.
  if (sections.length === 0) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Filter matches"
          aria-expanded={open}
          className={cn(
            "flex h-7 items-center gap-1.5 rounded-[var(--radius-element)] px-2 text-[12px] transition-colors duration-150",
            open ? "" : "hover:bg-[var(--surface-subtle)]"
          )}
          style={{
            background: open ? "var(--surface-subtle)" : undefined,
            color: "var(--ink-900)",
          }}
        >
          Filters
          {open ? (
            <ChevronUp className="size-3" strokeWidth={1.5} style={{ color: "var(--ink-500)" }} aria-hidden="true" />
          ) : (
            <ChevronDown className="size-3" strokeWidth={1.5} style={{ color: "var(--ink-500)" }} aria-hidden="true" />
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        sideOffset={6}
        align="start"
        aria-label="Filter matches"
        className="flex max-h-[calc(100vh-180px)] w-[272px] flex-col overflow-y-auto rounded-xl border-[var(--border-medium)] p-1.5 shadow-[var(--shadow-dropdown)]"
      >
        {sections.map((section, i) => (
          <div key={section.label}>
            {i > 0 && section.checklist === undefined && section.segmented !== undefined && sections[i - 1]?.checklist !== undefined && (
              // The one divider in 18a — ahead of Opponent, the first
              // segmented section after a run of checklists. Sections never
              // rule themselves off from a same-kind neighbour.
              <div className="mx-2 my-0.5 h-px" style={{ background: "var(--border-hairline)" }} />
            )}
            <p
              className="px-2 pb-1 pt-2 text-[11px]"
              style={{ color: "var(--ink-400)" }}
            >
              {section.label}
            </p>

            {section.checklist && (
              <div className="flex flex-col pb-1.5">
                {section.checklist.values.map((value) => {
                  const active = isChecklistActive(section.checklist!.key, value);
                  return (
                    <button
                      key={value}
                      type="button"
                      role="checkbox"
                      aria-checked={active}
                      onClick={() => onToggleChecklist(section.checklist!.key, value)}
                      className="flex h-8 items-center gap-[9px] rounded-[var(--radius-element)] px-2 text-left transition-colors duration-150 hover:bg-[var(--surface-subtle)]"
                    >
                      <span
                        className={cn(
                          "flex size-3.5 shrink-0 items-center justify-center rounded-[var(--radius-cell)] border",
                          active ? "border-[var(--blue)] bg-[var(--blue)]" : "border-[var(--ink-300)]"
                        )}
                      >
                        {active && <Check className="size-2.5 text-white" strokeWidth={3} aria-hidden="true" />}
                      </span>
                      <span className="min-w-0 truncate text-[12px]" style={{ color: "var(--ink-900)" }}>
                        {section.checklist!.displayValue ? section.checklist!.displayValue(value) : value}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {section.segmented?.map((facet) => (
              <div key={facet.key}>
                {facet.rowLabel && (
                  <p className="px-2 pb-1 text-[10px]" style={{ color: "var(--ink-500)" }}>
                    {facet.rowLabel}
                  </p>
                )}
                <Segmented
                  facet={facet}
                  value={segmentedValue(facet.key)}
                  onSelect={(v) => onSelectSegment(facet.key, v)}
                />
              </div>
            ))}
          </div>
        ))}

        {/* Footer — the only place a count lives; the trigger carries none. */}
        <div
          className="mt-0.5 flex items-center gap-2 px-2 pb-1 pt-2"
          style={{ borderTop: "1px solid var(--border-hairline)" }}
        >
          <button
            type="button"
            onClick={onClear}
            disabled={!hasActive}
            className="text-[11px] font-medium disabled:cursor-default"
            style={{ color: hasActive ? "var(--blue)" : "var(--ink-300)" }}
          >
            Clear all
          </button>
          <div className="flex-1" />
          <span className="text-micro tabular">
            {resultCount} of {totalCount} {totalCount === 1 ? "match" : "matches"}
          </span>
        </div>
      </PopoverContent>
    </Popover>
  );
}
