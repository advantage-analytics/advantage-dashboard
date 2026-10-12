import {
  EMPTY_MATCH_FILTERS,
  MATCH_FILTER_OPTIONS,
  MATCH_FILTER_SECTIONS,
  filtersEqual,
  toggleMatchFilter,
  type MatchFilterAvailability,
  type MatchFilterGroup,
  type MatchFilterKey,
  type MatchFilterSectionId,
  type MatchFilterValue,
  type MatchFilters,
  type PlayerSide,
} from "./model";
import { appliedValues, optionLabel } from "./applied-words";

/**
 * The FiltersPanel's pure half — what it shows and how its draft changes —
 * kept out of `filters-panel.tsx` so a spec can hold it without React.
 *
 * The panel edits a DRAFT copy of the applied filters. Nothing here calls
 * `onApply` except `panelActions().apply`, which is the Apply button's
 * handler and nothing else's.
 */

/** A pill as the panel draws it: the value it toggles and its label. */
export interface PanelOption {
  /** The value stored in the draft (for an inverted player group, the OTHER player). */
  value: unknown;
  label: string;
}

export interface PanelGroup {
  group: MatchFilterGroup;
  options: PanelOption[];
}

export interface PanelSection {
  id: MatchFilterSectionId;
  label: string;
  groups: PanelGroup[];
}

const PLAYER_KEYS: ReadonlySet<MatchFilterKey> = new Set([
  "server",
  "resultPlayer",
  "customPlayer",
]);

function otherPlayer(side: PlayerSide): PlayerSide {
  return side === "you" ? "opponent" : "you";
}

/**
 * The value a pill writes to the draft. Return › Player is backed by
 * `server` (the returner is the other player), so its "you" pill stores
 * `"opponent"`.
 */
function storedValue(group: MatchFilterGroup, shown: unknown): unknown {
  return group.invertPlayer ? otherPlayer(shown as PlayerSide) : shown;
}

/** Whether the pill for `shown` in `group` reads as selected in `draft`. */
export function isOptionSelected(
  draft: MatchFilters,
  group: MatchFilterGroup,
  shown: unknown,
): boolean {
  const current = draft[group.key] as unknown;
  const value = storedValue(group, shown);
  return Array.isArray(current) ? current.includes(value) : current === value;
}

/** `draft` with one pill toggled — inverted player groups write the other player. */
export function draftToggle(
  draft: MatchFilters,
  group: MatchFilterGroup,
  shown: unknown,
): MatchFilters {
  return toggleMatchFilter(
    draft,
    group.key,
    storedValue(group, shown) as MatchFilterValue<typeof group.key>,
  );
}

/** Clear all: the empty draft. Applying it is still the Apply button's job. */
export function draftClear(): MatchFilters {
  return EMPTY_MATCH_FILTERS;
}

/**
 * Apply is enabled only when committing would change the applied filters
 * (SKILL.md › Disabled: measured against the saved record, not draft vs
 * draft — a group picked and un-picked again is no change).
 */
export function canApply(draft: MatchFilters, applied: MatchFilters): boolean {
  return !filtersEqual(draft, applied);
}

/**
 * The panel's three handlers. `setDraft` is React's state setter (updater
 * form), `draft` the current draft, `onApply` the caller's commit. Toggle and
 * Clear all only ever write the draft; `apply` is the one path to `onApply`.
 */
export function panelActions(
  draft: MatchFilters,
  setDraft: (update: (prev: MatchFilters) => MatchFilters) => void,
  onApply: (next: MatchFilters) => void,
) {
  return {
    toggle(group: MatchFilterGroup, shown: unknown) {
      setDraft((prev) => draftToggle(prev, group, shown));
    },
    clear() {
      setDraft(() => draftClear());
    },
    apply() {
      onApply(draft);
    },
  };
}

/**
 * The sections, groups and pills to draw, in catalog order. An option this
 * match cannot produce (`availability` lacks it) is dropped, and a group left
 * with none is dropped; Sets also drops when only one set is available — a
 * one-set match has nothing to choose. A section with no group left is
 * dropped whole. Player pills carry the players' names.
 */
export function panelSections(
  availability: MatchFilterAvailability,
  names: { you: string; opponent: string },
): PanelSection[] {
  const sections: PanelSection[] = [];
  for (const section of MATCH_FILTER_SECTIONS) {
    const groups: PanelGroup[] = [];
    for (const group of section.groups) {
      const available = availability[group.key] as ReadonlySet<unknown>;
      let options: PanelOption[];
      if (group.key === "sets") {
        options = [...(available as ReadonlySet<number>)]
          .sort((a, b) => a - b)
          .map((n) => ({ value: n, label: `Set ${n}` }));
        if (options.length <= 1) continue;
      } else {
        options = (
          MATCH_FILTER_OPTIONS[group.key] as readonly {
            value: unknown;
            label: string;
          }[]
        )
          .filter((o) => available.has(storedValue(group, o.value)))
          .map((o) => ({
            value: o.value,
            label: PLAYER_KEYS.has(group.key)
              ? o.value === "you"
                ? names.you
                : names.opponent
              : o.label,
          }));
        if (options.length === 0) continue;
      }
      groups.push({ group, options });
    }
    if (groups.length > 0) {
      sections.push({ id: section.id, label: section.label, groups });
    }
  }
  return sections;
}

/** Whether any group of `section` has a selection in `filters`. */
export function sectionHasSelection(
  filters: MatchFilters,
  sectionId: MatchFilterSectionId,
): boolean {
  const section = MATCH_FILTER_SECTIONS.find((s) => s.id === sectionId);
  if (!section) return false;
  return section.groups.some((g) => {
    const v = filters[g.key] as unknown;
    return Array.isArray(v) ? v.length > 0 : v !== null && v !== undefined;
  });
}

/**
 * The one section open on first draw — the panel is an accordion: the first
 * section holding an applied filter, else the first section shown. Never a
 * stack of closed headers.
 */
export function initialOpenSection(
  filters: MatchFilters,
  shown: readonly PanelSection[],
): MatchFilterSectionId | null {
  const withSelection = shown.find((s) => sectionHasSelection(filters, s.id));
  return withSelection?.id ?? shown[0]?.id ?? null;
}

/**
 * What a collapsed section's header says is set in it, from the DRAFT: the
 * picked options' labels, first one as-is and the rest lower-cased ("G.
 * Revelli · second serve"), names and scores untouched. Return › Player
 * reads "T. Stepanov returning" (the returner is the other side of `server`).
 * `null` when nothing in the section is picked — the header reads "Any".
 */
export function sectionSummary(
  draft: MatchFilters,
  sectionId: MatchFilterSectionId,
  names: { you: string; opponent: string },
): string | null {
  const section = MATCH_FILTER_SECTIONS.find((s) => s.id === sectionId);
  if (!section) return null;
  const parts: string[] = [];
  for (const group of section.groups) {
    for (const value of appliedValues(draft, group.key)) {
      if (PLAYER_KEYS.has(group.key)) {
        const shown = group.invertPlayer
          ? otherPlayer(value as PlayerSide)
          : (value as PlayerSide);
        const name = shown === "you" ? names.you : names.opponent;
        parts.push(group.invertPlayer ? `${name} returning` : name);
      } else if (group.key === "sets") {
        parts.push(`${parts.length === 0 ? "Set" : "set"} ${String(value)}`);
      } else {
        const label = optionLabel(group.key, value);
        const keepCase = group.key === "scorePoints" || label.length === 1;
        parts.push(
          parts.length === 0 || keepCase ? label : label.toLowerCase(),
        );
      }
    }
  }
  return parts.length === 0 ? null : parts.join(" · ");
}

/** What the panel's count counts — points, unless the host counts
 * something else (the Visualizations tab's serves, shots or errors). */
export interface CountNoun {
  one: string;
  many: string;
}

const POINT_NOUN: CountNoun = { one: "point", many: "points" };

/** The drawer footer's live count: "9 of 114 points". */
export function draftCountLine(
  count: number,
  total: number,
  noun: CountNoun = POINT_NOUN,
): string {
  return `${count} of ${total} ${total === 1 ? noun.one : noun.many}`;
}

/** The drawer's primary: "Show 9 points", "Show 1 point". */
export function showPointsLabel(
  count: number,
  noun: CountNoun = POINT_NOUN,
): string {
  return `Show ${count} ${count === 1 ? noun.one : noun.many}`;
}

/**
 * Where a Points-grid score sits: server-first "a-b" puts the server's rung
 * in the column and the returner's in the row, so Ad-40 lands right of 40-40
 * and 40-Ad beneath it, as in the mockup.
 */
const RUNG: Record<string, number> = {
  "0": 1,
  "15": 2,
  "30": 3,
  "40": 4,
  Ad: 5,
};

export function pointGridCell(
  score: string,
): { column: number; row: number } | null {
  const [a, b] = score.split("-");
  const column = RUNG[a ?? ""];
  const row = RUNG[b ?? ""];
  return column && row ? { column, row } : null;
}
