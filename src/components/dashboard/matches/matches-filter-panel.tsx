"use client";
import { FilterTrigger } from "@/components/dashboard/shared/list-toolbar-trigger";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { CheckboxMark } from "@/components/ui/checkbox";
import { floatMenuToneClasses } from "@/components/ui/float-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

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
 * The trigger is a 14px `SlidersHorizontal` and the word "Filters" — no
 * chevron, no count badge (Platform Audit Pb2). 18a and 18c both put the "how
 * many does this leave" answer in the panel's own footer and the applied-filter
 * strip below the toolbar, never on the button itself. Engaged — open, or with
 * a cut applied — it takes the nav-active grammar: surface-subtle wash, ink-900,
 * no border, no dot, no count (Data Table law 6).
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
  /** A quiet second word after the label (11px, ink-500) — the season's
   *  Matches rows put the match's short date here. */
  detail?: (value: string) => string | null;
  /** A count beside each row (the Visualizations lightbox: how many this
   *  option alone would leave). Omitted, rows carry no count. */
  count?: (value: string) => number;
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
  /**
   * What the trigger says it filters, for its title and the panel's accessible
   * name. "Filter matches" unless the list is of something else — the Schedule
   * filters events through this same panel.
   */
  label?: string;
  /** The footer's noun, singular and plural. Matches by default. */
  noun?: { singular: string; plural: string };
  /** The trigger stays engaged for a cut applied outside this panel too
   *  (the lightbox's legend and Statistics row). Defaults to `hasActive`. */
  engaged?: boolean;
  /**
   * The panel's surface. `"panel"` (default) is the Matches list's own 18a
   * box. `"menu"` is the `FloatMenu` surface — 10px radius, 5px inset, the
   * float menu's light shadow and hairline — for a host whose other
   * dropdowns are float menus (the Visualizations lightbox).
   */
  surface?: FilterPanelSurface;
  /**
   * One more row at the panel's foot, above the footer, that slides the
   * panel's content over to `render`'s with a "Filters" back row on top —
   * still the one popover (the lightbox's "Advanced filters"). Esc steps
   * back before it closes; every open starts on the panel itself.
   */
  subview?: FilterPanelSubview;
}

export type FilterPanelSurface = "panel" | "menu";

export interface FilterPanelSubview {
  label: string;
  /** The quiet 11px line on the row's right: what is set in it. */
  summary: string;
  /** The content the row slides to; `back` returns to the panel. */
  render: (back: () => void) => ReactNode;
}

/**
 * Pure so a spec can pin it without rendering: the `PopoverContent` classes
 * for each surface. `"panel"` is byte-for-byte the Matches list's shipped
 * box; `"menu"` lays `floatMenuToneClasses("light")` over the same layout
 * and drops the panel's own radius, border colour, inset and shadow, so the
 * `PopoverContent` base hairline (`FloatMenu`'s too) shows through.
 */
export function filterPanelSurfaceClasses(
  surface: FilterPanelSurface = "panel",
): string {
  const layout =
    "flex max-h-[var(--radix-popover-content-available-height)] w-[min(272px,var(--radix-popover-content-available-width))] flex-col overflow-y-auto";
  if (surface === "menu") return `${layout} ${floatMenuToneClasses("light")}`;
  return `${layout} rounded-xl border-[var(--border-medium)] p-1.5 shadow-[var(--shadow-dropdown)]`;
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
    <div
      role="radiogroup"
      aria-label={facet.rowLabel}
      className="flex gap-1 px-2 pb-2"
    >
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
                : "border-[var(--border-hairline)] font-normal",
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

/** A subview's content: its own component, so `back` reaches it as a prop
 *  (a handler), never called while the panel renders. */
function SubviewBody({
  render,
  back,
}: {
  render: FilterPanelSubview["render"];
  back: () => void;
}) {
  return <>{render(back)}</>;
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
  label = "Filter matches",
  noun = { singular: "match", plural: "matches" },
  engaged: engagedProp,
  surface = "panel",
  subview,
}: MatchesFilterPanelProps<K>): React.JSX.Element | null {
  const [open, setOpenState] = useState(false);
  const [inSubview, setInSubview] = useState(false);
  const subviewRef = useRef<HTMLDivElement>(null);
  const subviewRowRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef(false);

  // Swapping the content unmounts the control that had focus: move it into
  // the subview on the way in, and back to its row on the way out.
  useEffect(() => {
    if (inSubview) {
      subviewRef.current
        ?.querySelector<HTMLElement>("button:not([disabled])")
        ?.focus({ preventScroll: true });
    } else if (returnFocusRef.current) {
      returnFocusRef.current = false;
      subviewRowRef.current?.focus({ preventScroll: true });
    }
  }, [inSubview]);

  // A panel with nothing in it is a button that does nothing when pressed.
  if (sections.length === 0) return null;

  function setOpen(next: boolean) {
    setOpenState(next);
    // Every open starts on the panel itself.
    if (!next) setInSubview(false);
  }

  function back() {
    returnFocusRef.current = true;
    setInSubview(false);
  }

  const engaged = open || (engagedProp ?? hasActive);
  const showSubview = subview !== undefined && inSubview;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <FilterTrigger aria-expanded={open} engaged={engaged} />
      </PopoverTrigger>

      <PopoverContent
        sideOffset={6}
        align="start"
        // Keep the whole panel on screen. Radix shifts it back inside the
        // viewport (12px clear of every edge) and publishes the room left on
        // its side of the trigger; the height and width cap to that room and
        // the list scrolls, instead of a `100vh − 180px` guess that ran off the
        // bottom whenever the toolbar sat lower than the guess assumed.
        collisionPadding={12}
        aria-label={label}
        // The panel keeps its own ↑/↓/Esc: `useRowSelection`'s window key
        // listener stands down for anything under this attribute.
        data-row-keys="ignore"
        // In the subview Esc steps back to the panel, as its back row does —
        // never closing the popover over an unapplied draft.
        onEscapeKeyDown={(event) => {
          if (!showSubview) return;
          event.preventDefault();
          back();
        }}
        className={filterPanelSurfaceClasses(surface)}
      >
        {showSubview ? (
          <div
            ref={subviewRef}
            data-filter-subview=""
            className="flex h-[min(520px,calc(var(--radix-popover-content-available-height)-12px))] flex-col motion-safe:animate-in motion-safe:duration-200 motion-safe:fade-in-0 motion-safe:slide-in-from-right-2"
          >
            <button
              type="button"
              onClick={back}
              className="flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-[var(--radius-element)] px-2 text-left text-[12px] font-medium transition-colors duration-150 hover:bg-[var(--surface-subtle)]"
              style={{ color: "var(--ink-900)" }}
            >
              <ChevronLeft
                className="size-3 shrink-0"
                strokeWidth={1.5}
                style={{ color: "var(--ink-400)" }}
                aria-hidden="true"
              />
              Filters
            </button>
            <div
              className="mx-2 mt-0.5 h-px shrink-0"
              style={{ background: "var(--border-hairline)" }}
            />
            <SubviewBody render={subview.render} back={back} />
          </div>
        ) : (
          <div
            // Layout-transparent without a subview, so the Matches list's
            // panel lays out exactly as it always has.
            className={
              subview === undefined
                ? "contents"
                : "flex flex-col motion-safe:animate-in motion-safe:duration-200 motion-safe:fade-in-0 motion-safe:slide-in-from-left-2"
            }
          >
            {sections.map((section, i) => (
              <div key={section.label}>
                {i > 0 &&
                  section.checklist === undefined &&
                  section.segmented !== undefined &&
                  sections[i - 1]?.checklist !== undefined && (
                    // The one divider in 18a — ahead of Opponent, the first
                    // segmented section after a run of checklists. Sections never
                    // rule themselves off from a same-kind neighbour.
                    <div
                      className="mx-2 my-0.5 h-px"
                      style={{ background: "var(--border-hairline)" }}
                    />
                  )}
                <p
                  className="px-2 pt-2 pb-1 text-[11px]"
                  style={{ color: "var(--ink-400)" }}
                >
                  {section.label}
                </p>

                {section.checklist && (
                  <div className="flex flex-col pb-1.5">
                    {section.checklist.values.map((value) => {
                      const active = isChecklistActive(
                        section.checklist!.key,
                        value,
                      );
                      return (
                        <button
                          key={value}
                          type="button"
                          role="checkbox"
                          aria-checked={active}
                          onClick={() =>
                            onToggleChecklist(section.checklist!.key, value)
                          }
                          className="flex h-8 items-center gap-[9px] rounded-[var(--radius-element)] px-2 text-left transition-colors duration-150 hover:bg-[var(--surface-subtle)]"
                        >
                          <CheckboxMark checked={active} />
                          <span
                            className="min-w-0 flex-1 truncate text-[12px]"
                            style={{ color: "var(--ink-900)" }}
                          >
                            {section.checklist!.displayValue
                              ? section.checklist!.displayValue(value)
                              : value}
                            {/* A real space, so the row's name reads
                                "vs Lee Nov 3", not "vs LeeNov 3". */}
                            {section.checklist!.detail?.(value) && " "}
                            {section.checklist!.detail?.(value) && (
                              <span
                                className="ml-1 text-[11px]"
                                style={{ color: "var(--ink-500)" }}
                              >
                                {section.checklist!.detail(value)}
                              </span>
                            )}
                          </span>
                          {section.checklist!.count && (
                            <span className="text-micro tabular">
                              {section.checklist!.count(value)}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}

                {section.segmented?.map((facet) => (
                  <div key={facet.key}>
                    {facet.rowLabel && (
                      <p
                        className="px-2 pb-1 text-[10px]"
                        style={{ color: "var(--ink-500)" }}
                      >
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

            {subview !== undefined && (
              <>
                <div
                  className="mx-2 my-0.5 h-px"
                  style={{ background: "var(--border-hairline)" }}
                />
                <button
                  ref={subviewRowRef}
                  type="button"
                  onClick={() => setInSubview(true)}
                  className="flex h-8 items-center gap-[9px] rounded-[var(--radius-element)] px-2 text-left transition-colors duration-150 hover:bg-[var(--surface-subtle)]"
                >
                  <span
                    className="shrink-0 text-[12px]"
                    style={{ color: "var(--ink-900)" }}
                  >
                    {subview.label}
                  </span>
                  <span
                    data-subview-summary=""
                    className="min-w-0 flex-1 truncate text-right text-[11px]"
                    style={{ color: "var(--ink-500)" }}
                  >
                    {subview.summary}
                  </span>
                  <ChevronRight
                    className="size-3 shrink-0"
                    strokeWidth={1.5}
                    style={{ color: "var(--ink-400)" }}
                    aria-hidden="true"
                  />
                </button>
              </>
            )}

            {/* Footer — the only place a count lives; the trigger carries none. */}
            <div
              className="mt-0.5 flex items-center gap-2 px-2 pt-2 pb-1"
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
                {resultCount} of {totalCount}{" "}
                {totalCount === 1 ? noun.singular : noun.plural}
              </span>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
