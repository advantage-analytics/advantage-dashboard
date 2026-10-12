"use client";

import { useMemo, useState } from "react";
import { MatchesFilterPanel } from "@/components/dashboard/matches/matches-filter-panel";
import type { FilterPanelSection } from "@/components/dashboard/matches/matches-filter-panel";
import { Chip } from "@/components/dashboard/schedule/static/chip";
import {
  FilterTrigger,
  SortTrigger,
} from "@/components/dashboard/shared/list-toolbar-trigger";
import { FloatMenu, FloatMenuItem } from "@/components/ui/float-menu";
import {
  DEFAULT_OPPONENT_SORT,
  DEFAULT_OPPONENT_VIEW,
  hasOpponentFilters,
  NO_OPPONENT_FILTERS,
  OPPONENT_BACKHAND_OPTIONS,
  OPPONENT_HAND_OPTIONS,
  OPPONENT_SORTS,
  OPPONENT_VIEWS,
  opponentSortTriggerLabel,
  toggleFacetValue,
  type OpponentChecklistFacetKey,
  type OpponentFacetChoice,
  type OpponentFacetKey,
  type OpponentFilters,
  type OpponentSegmentedFacetKey,
  type OpponentSort,
  type OpponentView,
} from "./opponents-views";

const noop = () => {};

/**
 * The toolbar's frame — chips left, Filters and the sort right — written once
 * so the live row and the inert one cannot drift apart by a pixel.
 */
const TOOLBAR_ROW =
  "flex flex-wrap items-center justify-between gap-x-3 gap-y-2";
const TOOLBAR_GROUP = "flex items-center gap-2";

/**
 * The Opponents toolbar at rest, drawn and `inert`: the four view chips on the
 * left, Filters and the sort on the right.
 *
 * The loading skeleton and the day-zero shape hold this row at the height the
 * live one (`OpponentsToolbar`, below) takes, so nothing moves when the page
 * lands. It is `inert` and `aria-hidden` because in those two states none of
 * it can do anything: a chip that takes focus and changes nothing is worse
 * than one that cannot be reached.
 */
export function OpponentsToolbarStatic() {
  return (
    <div inert aria-hidden="true" className={TOOLBAR_ROW}>
      <div className={TOOLBAR_GROUP}>
        {OPPONENT_VIEWS.map((view) => (
          <Chip
            key={view.value}
            label={view.label}
            active={view.value === DEFAULT_OPPONENT_VIEW}
            onClick={noop}
          />
        ))}
      </div>
      <div className={TOOLBAR_GROUP}>
        <FilterTrigger />
        <SortTrigger>
          {opponentSortTriggerLabel(DEFAULT_OPPONENT_SORT)}
        </SortTrigger>
      </div>
    </div>
  );
}

/**
 * The section every Opponents panel ends on: two segmented facets about the
 * counterparty, under an "Opponent" heading (`reference/tables.md` law 6). On
 * the personal page it is the whole panel — there is no record-side section
 * above it, because every row on that page IS an opponent.
 */
const STYLE_SECTION: FilterPanelSection<OpponentFacetKey> = {
  label: "Opponent",
  segmented: [
    { key: "hand", rowLabel: "Hand", options: [...OPPONENT_HAND_OPTIONS] },
    {
      key: "backhand",
      rowLabel: "Backhand",
      options: [...OPPONENT_BACKHAND_OPTIONS],
    },
  ],
};

/**
 * One checklist section over a facet's choices, or nothing when the page
 * passed none. The panel draws `values` and words each through
 * `displayValue`, so the stored value stays the key and the label the text.
 */
function checklistSection(
  label: string,
  key: OpponentChecklistFacetKey,
  choices: readonly OpponentFacetChoice[] | undefined,
): FilterPanelSection<OpponentFacetKey>[] {
  if (!choices || choices.length === 0) return [];
  const labels = new Map(choices.map((c) => [c.value, c.label]));
  return [
    {
      label,
      checklist: {
        key,
        values: choices.map((c) => c.value),
        displayValue: (value) => labels.get(value) ?? value,
      },
    },
  ];
}

/**
 * The populated page's toolbar: the view switcher, the filter panel and the
 * sort menu, in the frame's own positions.
 *
 * Controlled throughout — the page owns the cut, because the table, the
 * applied strip and the footer all read it.
 */
export function OpponentsToolbar({
  view,
  onViewChange,
  filters,
  onFiltersChange,
  sort,
  onSortChange,
  resultCount,
  totalCount,
  programChoices,
  facedByChoices,
}: {
  view: OpponentView;
  onViewChange: (next: OpponentView) => void;
  filters: OpponentFilters;
  onFiltersChange: (next: OpponentFilters) => void;
  sort: OpponentSort;
  onSortChange: (next: OpponentSort) => void;
  /** Rows the current chip and filter leave — the panel footer's "N". */
  resultCount: number;
  /** Rows the current chip holds before the filter — its "M". */
  totalCount: number;
  /**
   * Team page only: the Program checklist (`opponentProgramChoices`) and the
   * Faced-by checklist (`opponentFacedByChoices`). The personal page passes
   * neither and its panel stays the one "Opponent" section.
   */
  programChoices?: readonly OpponentFacetChoice[];
  facedByChoices?: readonly OpponentFacetChoice[];
}) {
  // Facets about our own side first, then the counterparty's: who on the
  // roster faced them, where they play, and how they play (law 6).
  const sections = useMemo(
    () => [
      ...checklistSection("Faced by", "facedBy", facedByChoices),
      ...checklistSection("Program", "programs", programChoices),
      STYLE_SECTION,
    ],
    [facedByChoices, programChoices],
  );

  return (
    // `data-row-keys`: ↑/↓/Esc on a chip, the Filters trigger or the sort
    // belong to that control, not to the open drawer (`useRowSelection`).
    <div className={TOOLBAR_ROW} data-row-keys="ignore">
      {/* A fixed view switcher, not filter chips: no counts, no dots (law 7). */}
      <div className={TOOLBAR_GROUP} role="group" aria-label="View">
        {OPPONENT_VIEWS.map((option) => (
          <Chip
            key={option.value}
            label={option.label}
            active={option.value === view}
            onClick={() => onViewChange(option.value)}
          />
        ))}
      </div>
      <div className={TOOLBAR_GROUP}>
        <MatchesFilterPanel<OpponentFacetKey>
          sections={sections}
          hasActive={hasOpponentFilters(filters)}
          isChecklistActive={(key, value) =>
            filters[key as OpponentChecklistFacetKey].includes(value)
          }
          onToggleChecklist={(key, value) => {
            const facet = key as OpponentChecklistFacetKey;
            onFiltersChange({
              ...filters,
              [facet]: toggleFacetValue(filters[facet], value),
            });
          }}
          segmentedValue={(key) => filters[key as OpponentSegmentedFacetKey]}
          onSelectSegment={(key, value) =>
            onFiltersChange({ ...filters, [key]: value })
          }
          onClear={() => onFiltersChange(NO_OPPONENT_FILTERS)}
          resultCount={resultCount}
          totalCount={totalCount}
          label="Filter opponents"
          noun={{ singular: "opponent", plural: "opponents" }}
        />
        <OpponentsSortMenu value={sort} onChange={onSortChange} />
      </div>
    </div>
  );
}

/** "Last played" ▾ — the trigger reads the order that is on. */
function OpponentsSortMenu({
  value,
  onChange,
}: {
  value: OpponentSort;
  onChange: (next: OpponentSort) => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerLabel = opponentSortTriggerLabel(value);

  return (
    <FloatMenu
      open={open}
      onOpenChange={setOpen}
      width={216}
      sideOffset={6}
      label="Sort order"
      trigger={
        <SortTrigger
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label={`Sort: ${triggerLabel}`}
          engaged={open}
          className="cursor-pointer"
        >
          {triggerLabel}
        </SortTrigger>
      }
    >
      {OPPONENT_SORTS.map((option) => (
        <FloatMenuItem
          key={option.value}
          label={option.label}
          chosen={option.value === value}
          onSelect={() => {
            onChange(option.value);
            setOpen(false);
          }}
        />
      ))}
    </FloatMenu>
  );
}
