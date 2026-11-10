import { Filter } from "lucide-react";
import {
  MatchesFilterPanel,
  type FilterPanelSection,
} from "@/components/dashboard/matches/matches-filter-panel";
import { LightboxAdvancedPanel } from "./lightbox-advanced-panel";
import {
  activeFilterCount,
  EMPTY_MATCH_FILTERS,
  type MatchFilterAvailability,
  type MatchFilters,
} from "../match-filters/model";
import { draftCountLine, type CountNoun } from "../match-filters/panel-draft";
import { cn } from "@/lib/utils";
import { LegendMark } from "./legend-mark";
import { LEGEND_PICKS, type LegendPick } from "./lightbox-points";
import type { LegendItem } from "./viz-labels";
import {
  EMPTY_VIZ_FILTERS,
  filterKeysFor,
  foldedMatchFilters,
  withFoldedFilters,
  type Cut,
  type VizFilters,
  type VizResult,
} from "./viz-model";
import {
  carryFilters,
  cutAvailability,
  errorOptionsFor,
  normalizeSeasonFilters,
  OPTIONS,
  type OpponentHandFilter,
  type SeasonFilters,
} from "./viz-url";

/* ── Filters panel ─────────────────────────────────────────────────────── */

type PanelKey =
  | "ball"
  | "court"
  | "set"
  | "zone"
  | "pressure"
  | "error"
  // The season's own groups ("Opponent plays", "Matches").
  | "vopp"
  | "vm";

/**
 * A player's season only (`season-viz-lightbox.tsx`): "Opponent plays" and
 * "Matches", which narrow the court to some of the season's matches. Never
 * passed by the match report — one match has one opponent.
 */
export interface LightboxSeasonFilters {
  /** The live selection (`VizState.season`), or none. */
  value: SeasonFilters | undefined;
  onChange: (next: SeasonFilters | undefined) => void;
  /** The checklist's rows, newest first: "vs Lee", its short date and the
   *  marks it adds to the court — counted on the server. */
  matches: readonly {
    id: string;
    label: string;
    detail: string | null;
    count: number;
  }[];
}

const OPPONENT_HAND_OPTIONS: { value: OpponentHandFilter; label: string }[] = [
  { value: "right", label: "Right" },
  { value: "left", label: "Left" },
  { value: "unknown", label: "Unknown" },
];

const NOUN: Record<VizResult["noun"], { singular: string; plural: string }> = {
  serves: { singular: "serve", plural: "serves" },
  returns: { singular: "return", plural: "returns" },
  shots: { singular: "shot", plural: "shots" },
  errors: { singular: "error", plural: "errors" },
};

const COUNT_NOUN: Record<VizResult["noun"], CountNoun> = {
  serves: { one: "serve", many: "serves" },
  returns: { one: "return", many: "returns" },
  shots: { one: "shot", many: "shots" },
  errors: { one: "error", many: "errors" },
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
}

/**
 * The lightbox's Filters (canvas S15): the Matches list's own panel
 * (`MatchesFilterPanel`, Data Table rule 6) over the cut's existing
 * `VizFilters` keys only — Serve, Court and Set as segmented rows, Zone,
 * Score and Error type as checklists with the count each option alone would
 * leave — applied live, with Clear and the live count in the footer. Only
 * the keys `filterKeysFor(cut)` allows appear, so a pick can never be one the
 * court then ignores.
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
  /** The "Advanced filters" row and the Video tab's panel it slides to,
   *  editing `filters.match`. Omitted, there is no such row. */
  advanced?: LightboxAdvancedFilters;
  /** The season's "Opponent plays" and "Matches", above Advanced filters.
   *  Omitted (the match report), neither is drawn. */
  season?: LightboxSeasonFilters;
}) {
  const keys = new Set(filterKeysFor(cut));
  const errorOptions = errorOptionsFor(errorSplitJudged);

  const sections: FilterPanelSection<PanelKey>[] = [];
  if (keys.has("ball"))
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
  if (keys.has("zone"))
    sections.push({
      label: "Zone",
      checklist: {
        key: "zone",
        values: ["t", "body", "wide"],
        displayValue: (v) => OPTIONS.zone[v as "t" | "body" | "wide"],
        count: (v) => countWith({ zone: [v as "t" | "body" | "wide"] }),
      },
    });
  if (keys.has("pressure"))
    sections.push({
      label: "Score",
      checklist: {
        key: "pressure",
        values: ["break", "setMatch"],
        displayValue: (v) => OPTIONS.pressure[v as "break" | "setMatch"],
        count: (v) => countWith({ pressure: [v as "break" | "setMatch"] }),
      },
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

  if (season) {
    sections.push({
      label: "Opponent plays",
      segmented: [
        {
          key: "vopp",
          options: [{ value: null, label: "Any" }, ...OPPONENT_HAND_OPTIONS],
        },
      ],
    });
    if (season.matches.length > 0) {
      const byId = new Map(season.matches.map((m) => [m.id, m]));
      sections.push({
        label: "Matches",
        checklist: {
          key: "vm",
          values: season.matches.map((m) => m.id),
          displayValue: (id) => byId.get(id)?.label ?? id,
          detail: (id) => byId.get(id)?.detail ?? null,
          count: (id) => byId.get(id)?.count ?? 0,
        },
      });
    }
  }

  const seasonValue = season?.value;
  function setSeason(patch: Partial<SeasonFilters>) {
    season?.onChange(
      normalizeSeasonFilters({
        opponentHand: seasonValue?.opponentHand ?? null,
        matches: seasonValue?.matches ?? [],
        ...patch,
      }),
    );
  }

  function isChecklistActive(key: PanelKey, value: string): boolean {
    if (key === "vm") return seasonValue?.matches.includes(value) === true;
    if (key === "error") {
      const option = errorOptions[Number(value)];
      return option.values.every((v) => filters.error.includes(v));
    }
    return (filters[key as keyof VizFilters] as readonly string[]).includes(
      value,
    );
  }

  function toggleChecklist(key: PanelKey, value: string) {
    if (key === "vm") {
      const current = seasonValue?.matches ?? [];
      setSeason({
        matches: current.includes(value)
          ? current.filter((id) => id !== value)
          : [...current, value],
      });
      return;
    }
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
    if (key === "vopp") return seasonValue?.opponentHand ?? null;
    const current = filters[key as keyof VizFilters] as readonly (
      string | number
    )[];
    return current.length === 1 ? String(current[0]) : null;
  }

  function selectSegment(key: PanelKey, value: string | null) {
    if (key === "vopp") {
      setSeason({ opponentHand: value as OpponentHandFilter | null });
      return;
    }
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
      subview={
        advanced && keys.has("match")
          ? {
              label: "Advanced filters",
              summary: advancedSummary(filters.match ?? EMPTY_MATCH_FILTERS),
              render: (back) => (
                <LightboxAdvancedPanel
                  cut={cut}
                  filters={filters}
                  setFilters={setFilters}
                  total={result.total}
                  noun={COUNT_NOUN[result.noun]}
                  advanced={advanced}
                  back={back}
                />
              ),
            }
          : undefined
      }
    />
  );
}

/** The Advanced filters row's quiet line: what it holds, or what is in it. */
function advancedSummary(match: MatchFilters): string {
  const n = activeFilterCount(match);
  return n === 0 ? "Score, return, result…" : `${n} applied`;
}

/* ── Applied strip ─────────────────────────────────────────────────────── */

/**
 * The applied strip under the court's control row (DS Data Table rule 6, a
 * copy of the Video tab's `FilmFilterStrip`): the filter glyph, the cut as
 * one sentence of capitalised phrases joined by middots ("Aces · To the T"),
 * "N of M points", and one quiet action — "Back to all points" when a
 * Statistics row is the only cut, "Clear filter" otherwise. Never chips.
 */
export function LightboxFilterStrip({
  phrases,
  shown,
  total,
  statOnly,
  onClear,
}: {
  phrases: string[];
  /** "N of M points" — omitted by a host with no points to count. */
  shown?: number;
  total?: number;
  statOnly: boolean;
  onClear: () => void;
}) {
  if (phrases.length === 0) return null;
  const sentence = phrases
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" · ");
  return (
    <div
      role="status"
      data-viz-filter-strip=""
      className="flex shrink-0 flex-wrap items-center gap-2 rounded-[var(--radius-element)] px-3.5 py-2.5"
      style={{ background: "var(--surface-subtle)" }}
    >
      <Filter
        className="size-[13px] shrink-0"
        strokeWidth={1.5}
        style={{ color: "var(--ink-500)" }}
        aria-hidden="true"
      />
      <span className="text-[11px]" style={{ color: "var(--ink-700)" }}>
        {sentence}
      </span>
      {shown !== undefined && total !== undefined && (
        <>
          <span
            className="size-[3px] rounded-full"
            style={{ background: "var(--ink-300)" }}
            aria-hidden="true"
          />
          <span className="text-micro tabular">
            {draftCountLine(shown, total)}
          </span>
        </>
      )}
      <div className="flex-1" />
      <button
        type="button"
        onClick={onClear}
        className="cursor-pointer rounded-[var(--radius-element)] text-[11px] font-medium whitespace-nowrap text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
      >
        {statOnly ? "Back to all points" : "Clear filter"}
      </button>
    </div>
  );
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
      className="flex flex-wrap items-center gap-x-2 gap-y-0.5"
    >
      {items.map((item) => {
        const key = PICK_FOR_ITEM[item.key];
        if (key === undefined)
          return (
            <span key={item.key} className="px-1">
              <LegendMark item={item} />
            </span>
          );
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
              "-mx-0.5 inline-flex h-6 cursor-pointer items-center gap-1.5 rounded-[6px] px-2 text-[11px] transition-[background-color,color,opacity] duration-200 hover:bg-[var(--surface-subtle)] hover:text-[var(--ink-900)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none disabled:cursor-default disabled:hover:bg-transparent",
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
