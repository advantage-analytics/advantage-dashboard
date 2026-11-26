import type { Ref } from "react";
import {
  MatchesFilterPanel,
  type FilterPanelSection,
} from "@/components/dashboard/matches/matches-filter-panel";
import {
  activeFilterCount,
  EMPTY_MATCH_FILTERS,
  type FilterBandLabels,
  type MatchFilterAvailability,
  type MatchFilters,
} from "../match-filters/model";
import type { CountNoun } from "../match-filters/panel-draft";
import { cn } from "@/lib/utils";
import { isReturnCut, marksAreShots } from "./cut-kinds";
import { LegendMark } from "./legend-mark";
import { LifecycleChip } from "./lifecycle-chip";
import { LEGEND_PICKS, type LegendPick } from "./lightbox-points";
import type { LegendItem } from "./viz-labels";
import {
  filterKeysFor,
  type Cut,
  type PressureValue,
  type VizFilters,
  type VizResult,
} from "./viz-model";
import {
  errorOptionsFor,
  OPTIONS,
  seasonMatchKept,
  type OpponentHandFilter,
  type SeasonFilters,
  type SeasonSurface,
} from "./viz-url";
import { matchesMenuValueLabel } from "./lightbox-matches-sheet";

/* ── Filters panel ─────────────────────────────────────────────────────── */

type PanelKey =
  | "ball"
  | "court"
  | "set"
  | "zone"
  | "pressure"
  | "rally"
  | "error"
  | "entry"
  | "approachTo"
  | "approachDir";

/** Rally length's segments and what each one counts (board Final-03). */
const RALLY_SEGMENTS = [
  { value: "short", label: "Short", tooltip: "1–4 shots" },
  { value: "medium", label: "Medium", tooltip: "5–8 shots" },
  { value: "long", label: "Long", tooltip: "9 or more shots" },
] as const;

const PRESSURE_VALUES: PressureValue[] = ["pressure", "break", "setMatch"];

/** The scores "Pressure points" means (`isPressurePoint`). */
const PRESSURE_POINTS_SCORES = "30–30, 30–40, 40–30, deuce and ad points";

/** A segmented row's value when the key holds several: matches no option. */
const MIXED_SEGMENT = "__mixed__";

type EntryValue = keyof typeof OPTIONS.entry;
type ApproachToValue = keyof typeof OPTIONS.approachTo;
type ApproachDirValue = keyof typeof OPTIONS.approachDir;

/** One of a season's matches, as the Matches sheet lists it. */
export interface SeasonSheetMatch {
  id: string;
  opponentName: string;
  /** `YYYY-MM-DD`, or null. */
  date: string | null;
  /** The marks it adds to the court under the live shot filters —
   *  counted on the server. */
  count: number;
  /** Won from the player's seat; null where the score cannot say. */
  won: boolean | null;
  /** The score from the player's seat, or null. */
  score: string | null;
  hand: OpponentHandFilter;
  surface: SeasonSurface;
}

/**
 * A player's season only (`season-viz-lightbox.tsx`): which of its matches
 * the court is drawn over — result, opponent's hand, surface and ticked
 * matches, all chosen in the Matches sheet (`lightbox-matches-sheet.tsx`),
 * which the panel's "Matches" row opens. Never passed by the match report:
 * one match is one match.
 */
export interface LightboxSeasonFilters {
  /** The live selection (`VizState.season`), or none. */
  value: SeasonFilters | undefined;
  onChange: (next: SeasonFilters | undefined) => void;
  /** Every analyzed match, newest first. */
  matches: readonly SeasonSheetMatch[];
}

/** The Matches row's quiet line: "All 24", or what narrows it and how many
 *  it leaves ("Won · Left-handed · 4 of 24"). */
export function matchesRowSummary(season: LightboxSeasonFilters): string {
  const { value, matches } = season;
  const words = [
    value?.result ? matchesMenuValueLabel("result", value.result) : null,
    value?.opponentHand
      ? matchesMenuValueLabel("hand", value.opponentHand)
      : null,
    value?.surface ? matchesMenuValueLabel("surface", value.surface) : null,
  ].filter((w): w is string => w !== null);
  const kept = matches.filter((m) =>
    seasonMatchKept(m, {
      result: value?.result ?? null,
      opponentHand: value?.opponentHand ?? null,
      surface: value?.surface ?? null,
    }),
  );
  const ticked = kept.filter((m) => value?.matches.includes(m.id));
  const n = ticked.length > 0 ? ticked.length : kept.length;
  if (words.length === 0 && n === matches.length) return `All ${n}`;
  return [...words, `${n} of ${matches.length}`].join(" · ");
}

const NOUN: Record<VizResult["noun"], { singular: string; plural: string }> = {
  serves: { singular: "serve", plural: "serves" },
  returns: { singular: "return", plural: "returns" },
  shots: { singular: "shot", plural: "shots" },
  errors: { singular: "error", plural: "errors" },
  approaches: { singular: "approach", plural: "approaches" },
};

/** "Show 9 serves": the advanced drawer's count noun for the court's noun. */
export const COUNT_NOUN: Record<VizResult["noun"], CountNoun> = {
  serves: { one: "serve", many: "serves" },
  returns: { one: "return", many: "returns" },
  shots: { one: "shot", many: "shots" },
  errors: { one: "error", many: "errors" },
  approaches: { one: "approach", many: "approaches" },
};

/**
 * What the panel's "Advanced filters" row needs from its host: the Video
 * tab's `FiltersPanel` options this court can produce, the two names its
 * options use, and — where the host has the points — how many marks the
 * court would hold under a whole set of filters, for its "Show N serves".
 */
export interface LightboxAdvancedFilters {
  /** `optionAvailability` over the match (the season: every match's, united). */
  availability: MatchFilterAvailability;
  youName: string;
  oppName: string;
  /** The court's count under `filters`. Omitted (the season, whose points
   *  stay on the server), the advanced panel shows no count. */
  count?: (filters: VizFilters) => number;
  /** What Contact and Landed in print their options from — the bands the
   *  court is drawn with. Omitted, the default bands in feet. */
  bandLabels?: FilterBandLabels;
}

/**
 * The lightbox's Filters (canvas S15; sections per chart, boards Final-03…09):
 * the Matches list's own panel (`MatchesFilterPanel`, Data Table rule 6) over
 * the cut's existing `VizFilters` keys only. The chart's own lead sections
 * come first — Serves' Zone (Any · Wide · Body · T), Errors' type,
 * Approaches' three groups (checklists: the model's groups are multi-select,
 * plan decision Q7) — then Rally length (Any · Short · Medium · Long; not on
 * Rally shots, whose toolbar carries it), Pressure, Court and Set, then the
 * Serve row (not on Returns, whose toolbar carries it as `ServeReturnedChips`),
 * with Advanced filters last. Segmented rows carry no counts; a
 * checklist option carries the count it alone would leave. Applied live,
 * with Clear and the live count in the footer. Only the keys
 * `filterKeysFor(cut)` allows appear, so a pick can never be one the court
 * then ignores.
 */
export function LightboxFilterPanel({
  cut,
  filters,
  setFilters,
  onClear,
  hasActive,
  engaged,
  result,
  sets,
  errorSplitJudged,
  countWith,
  advanced,
  onOpenAdvanced,
  onOpenMatches,
  triggerRef,
  season,
}: {
  cut: Cut;
  filters: VizFilters;
  setFilters: (next: VizFilters) => void;
  onClear: () => void;
  /** The panel's own keys differ from the card's baseline. */
  hasActive: boolean;
  /** Any cut is on — the panel's, the legend's or a Statistics row's. */
  engaged: boolean;
  /** The court's live count, its whole pool, and the noun they count. */
  result: Pick<VizResult, "count" | "total" | "noun">;
  /** The sets there are to pick (the Set row shows only with two or more). */
  sets: readonly number[];
  /** The match's errors are judged: Error type offers Unforced and Forced
   *  apart, not one "Errors" option (`errorOptionsFor`). */
  errorSplitJudged: boolean;
  /** How many marks the court would hold with `patch` applied over the live
   *  filters — each checklist option's count. The match report runs
   *  `computeViz`; a host with no points in the browser answers its own way. */
  countWith: (patch: Partial<VizFilters>) => number;
  /** The "Advanced filters" row, which closes this popover and opens the
   *  lightbox's drawer (`onOpenAdvanced`) over `filters.match`. Either
   *  omitted, or a cut with no `match` key, there is no such row. */
  advanced?: LightboxAdvancedFilters;
  onOpenAdvanced?: () => void;
  /** The Filters trigger — the drawer hands focus back to it on close. */
  triggerRef?: Ref<HTMLButtonElement>;
  /** The season's matches: a "Matches" row above Advanced filters, which
   *  closes this popover and opens the Matches sheet (`onOpenMatches`).
   *  Omitted (the match report), no such row. */
  season?: LightboxSeasonFilters;
  onOpenMatches?: () => void;
}) {
  const keys = new Set(filterKeysFor(cut));
  const errorOptions = errorOptionsFor(errorSplitJudged);

  const sections: FilterPanelSection<PanelKey>[] = [];
  // The chart's own lead sections first — they say what the court is:
  // Serves' Zone, Errors' type, Approaches' three groups.
  if (keys.has("zone"))
    // One lane at a time (board Final-03). The key stays a list, as the
    // Statistics rows and saved views write it; a pick here replaces it with
    // the one lane, and a list of two leaves no segment lit.
    sections.push({
      label: "Zone",
      segmented: [
        {
          key: "zone",
          options: [
            { value: null, label: "Any" },
            { value: "wide", label: OPTIONS.zone.wide },
            { value: "body", label: OPTIONS.zone.body },
            { value: "t", label: OPTIONS.zone.t },
          ],
        },
      ],
    });
  if (keys.has("error"))
    sections.push({
      label: "Error type",
      checklist: {
        key: "error",
        values: errorOptions.map((_, i) => String(i)),
        displayValue: (v) => errorOptions[Number(v)].label,
        count: (v) => countWith({ error: [...errorOptions[Number(v)].values] }),
      },
    });
  if (keys.has("entry"))
    sections.push({
      label: "Way to the net",
      checklist: {
        key: "entry",
        values: Object.keys(OPTIONS.entry),
        displayValue: (v) => OPTIONS.entry[v as EntryValue],
        count: (v) => countWith({ entry: [v as EntryValue] }),
      },
    });
  if (keys.has("approachTo"))
    sections.push({
      label: "Approach to",
      checklist: {
        key: "approachTo",
        values: Object.keys(OPTIONS.approachTo),
        displayValue: (v) => OPTIONS.approachTo[v as ApproachToValue],
        count: (v) => countWith({ approachTo: [v as ApproachToValue] }),
      },
    });
  if (keys.has("approachDir"))
    sections.push({
      label: "Direction",
      checklist: {
        key: "approachDir",
        values: Object.keys(OPTIONS.approachDir),
        displayValue: (v) => OPTIONS.approachDir[v as ApproachDirValue],
        count: (v) => countWith({ approachDir: [v as ApproachDirValue] }),
      },
    });
  // Then the shared run: Rally length, Pressure, Court, Set. Rally shots
  // carry Rally length as toolbar chips instead (board Final-07).
  if (keys.has("rally") && !marksAreShots(cut))
    sections.push({
      label: "Rally length",
      segmented: [
        {
          key: "rally",
          options: [{ value: null, label: "Any" }, ...RALLY_SEGMENTS],
        },
      ],
    });
  if (keys.has("pressure"))
    sections.push({
      label: "Pressure",
      checklist: {
        key: "pressure",
        values: PRESSURE_VALUES,
        displayValue: (v) => OPTIONS.pressure[v as PressureValue],
        count: (v) => countWith({ pressure: [v as PressureValue] }),
        tooltip: (v) => (v === "pressure" ? PRESSURE_POINTS_SCORES : undefined),
      },
    });
  if (keys.has("court"))
    sections.push({
      label: "Court",
      segmented: [
        {
          key: "court",
          options: [
            { value: null, label: "Any" },
            { value: "deuce", label: OPTIONS.court.deuce },
            { value: "ad", label: OPTIONS.court.ad },
          ],
        },
      ],
    });
  if (keys.has("set") && sets.length > 1)
    sections.push({
      label: "Set",
      segmented: [
        {
          key: "set",
          options: [
            { value: null, label: "Any" },
            ...sets.map((n) => ({ value: String(n), label: `Set ${n}` })),
          ],
        },
      ],
    });
  // 1st or 2nd serve sits after the shared run — except on Returns, whose
  // toolbar carries it as "Serve returned" chips (board Final-04).
  if (keys.has("ball") && !isReturnCut(cut))
    sections.push({
      label: "Serve",
      segmented: [
        {
          key: "ball",
          options: [
            { value: null, label: "Any" },
            { value: "first", label: OPTIONS.ball.first },
            { value: "second", label: OPTIONS.ball.second },
          ],
        },
      ],
    });

  function isChecklistActive(key: PanelKey, value: string): boolean {
    if (key === "error") {
      const option = errorOptions[Number(value)];
      return option.values.every((v) => filters.error.includes(v));
    }
    return (filters[key as keyof VizFilters] as readonly string[]).includes(
      value,
    );
  }

  function toggleChecklist(key: PanelKey, value: string) {
    if (key === "error") {
      const option = errorOptions[Number(value)];
      const on = isChecklistActive(key, value);
      const next = on
        ? filters.error.filter((v) => !option.values.includes(v))
        : [...filters.error, ...option.values];
      setFilters({ ...filters, error: [...new Set(next)] });
      return;
    }
    const current = filters[key as keyof VizFilters] as readonly string[];
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    setFilters({ ...filters, [key]: next } as VizFilters);
  }

  function segmentedValue(key: PanelKey): string | null {
    const current = filters[key as keyof VizFilters] as readonly (
      string | number
    )[];
    // A list of two or more (a Statistics row, a saved view) is no single
    // segment: none is lit, not "Any", which would say nothing is applied.
    if (current.length > 1) return MIXED_SEGMENT;
    return current.length === 1 ? String(current[0]) : null;
  }

  function selectSegment(key: PanelKey, value: string | null) {
    const next =
      value === null ? [] : key === "set" ? [Number(value)] : [value];
    setFilters({ ...filters, [key]: next } as VizFilters);
  }

  return (
    <MatchesFilterPanel<PanelKey>
      sections={sections}
      hasActive={hasActive}
      engaged={engaged}
      isChecklistActive={isChecklistActive}
      onToggleChecklist={toggleChecklist}
      segmentedValue={segmentedValue}
      onSelectSegment={selectSegment}
      onClear={onClear}
      resultCount={result.count}
      totalCount={result.total}
      label="Filter the court"
      noun={NOUN[result.noun]}
      surface="menu"
      triggerRef={triggerRef}
      footRows={[
        ...(season && onOpenMatches && season.matches.length > 0
          ? [
              {
                label: "Matches",
                summary: matchesRowSummary(season),
                onSelect: onOpenMatches,
              },
            ]
          : []),
        ...(advanced && onOpenAdvanced && keys.has("match")
          ? [
              {
                label: "Advanced filters",
                summary: advancedSummary(filters.match ?? EMPTY_MATCH_FILTERS),
                onSelect: onOpenAdvanced,
              },
            ]
          : []),
      ]}
    />
  );
}

/* ── Returns' serve chips ──────────────────────────────────────────────── */

const SERVE_RETURNED = [
  { value: null, label: "All" },
  { value: "first", label: "vs 1st serve" },
  { value: "second", label: "vs 2nd serve" },
] as const;

/**
 * The Returns toolbar's lead chips (board Final-04): All · vs 1st serve ·
 * vs 2nd serve over the `ball` key, which on a return cut already reads the
 * serve being returned. One at a time; a list of both (a saved view, a
 * Statistics row) lights none, as the panel's segmented rows do.
 */
export function ServeReturnedChips({
  filters,
  setFilters,
}: {
  filters: VizFilters;
  setFilters: (next: VizFilters) => void;
}) {
  const current =
    filters.ball.length === 0
      ? null
      : filters.ball.length === 1
        ? filters.ball[0]
        : MIXED_SEGMENT;
  return (
    <div className="flex gap-1.5" role="group" aria-label="Serve returned">
      {SERVE_RETURNED.map((option) => (
        <LifecycleChip
          key={option.label}
          pressed={current === option.value}
          onClick={() =>
            setFilters({
              ...filters,
              ball: option.value === null ? [] : [option.value],
            })
          }
        >
          {option.label}
        </LifecycleChip>
      ))}
    </div>
  );
}

/** The Advanced filters row's quiet line: what it holds, or what is in it. */
function advancedSummary(match: MatchFilters): string {
  const n = activeFilterCount(match);
  return n === 0 ? "Score, return, result…" : `${n} applied`;
}

/* ── Legend as a filter ────────────────────────────────────────────────── */

/** The legend keys a pick stands for, by the shipped legend's own key. */
const PICK_FOR_ITEM: Record<string, LegendPick> = {
  won: "won",
  lost: "lost",
  miss: "out",
  ace: "ace",
};

/**
 * The court's legend (canvas S06/S07): the outcome keys — Won · Lost · Out ·
 * Ace, each with its count — are one single-choice filter. The chosen key
 * keeps full ink and the others sit back at 35%; choosing it again clears it.
 * Shape keys (Forehand, Backhand) stay plain legend. A key with no marks is
 * not offered as a filter.
 */
export function LegendFilter({
  items,
  counts,
  pick,
  onPick,
}: {
  items: LegendItem[];
  counts: Record<LegendPick, number>;
  pick: LegendPick | null;
  onPick: (pick: LegendPick | null) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Filter by outcome"
      className="flex min-h-6 flex-wrap items-center gap-x-2 gap-y-0.5"
    >
      {items.map((item, i) => {
        const key = PICK_FOR_ITEM[item.key];
        if (key === undefined) {
          // The first shape key opens its own group behind a hairline, so
          // Forehand/Backhand read as a key to the dots' shape rather than
          // as two more outcome filters that happen not to respond. `h-6`
          // matches the buttons' box, and the buttons take `.text-micro`'s 1.4
          // line height, so every label shares one baseline.
          const opensShapeGroup =
            i > 0 && PICK_FOR_ITEM[items[i - 1].key] !== undefined;
          return (
            <span key={item.key} className="inline-flex h-6 items-center">
              {opensShapeGroup && (
                <span
                  aria-hidden
                  className="mr-2 ml-1 h-3 w-px bg-[var(--border-card)]"
                />
              )}
              <span className="inline-flex px-1">
                <LegendMark item={item} />
              </span>
            </span>
          );
        }
        const label = LEGEND_PICKS.find((p) => p.key === key)!.label;
        const on = pick === key;
        return (
          <button
            key={item.key}
            type="button"
            aria-pressed={on}
            disabled={counts[key] === 0 && !on}
            onClick={() => onPick(on ? null : key)}
            className={cn(
              "-mx-0.5 inline-flex h-6 cursor-pointer items-center gap-1.5 rounded-[6px] px-2 text-[11px] leading-[1.4] transition-[background-color,color,opacity] duration-200 hover:bg-[var(--surface-subtle)] hover:text-[var(--ink-900)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none disabled:cursor-default disabled:hover:bg-transparent",
              on
                ? "font-medium text-[var(--ink-900)]"
                : "text-[var(--ink-600)]",
              pick !== null && !on && "opacity-35",
            )}
          >
            <LegendMark item={item} glyphOnly />
            {label}
            <span className="font-normal text-[var(--ink-400)] tabular-nums">
              {counts[key]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
