"use client";

import { useCallback, useId, useMemo, type ReactNode } from "react";
import {
  MatchesFilterPanel,
  type FilterPanelSection,
} from "@/components/dashboard/matches/matches-filter-panel";
import {
  OPPONENT_BACKHAND_OPTIONS,
  OPPONENT_HAND_OPTIONS,
  opponentTypePhrase,
} from "@/components/dashboard/matches/opponent-type-phrase";
import { SortTrigger } from "@/components/dashboard/shared/list-toolbar-trigger";
import { MenuSelect, type MenuOption } from "@/components/ui/menu-select";
import { WINDOW_OPTIONS, type StatisticsMatch } from "@/lib/data/statistics";
import type { Backhand, Hand } from "@/lib/matches/patch-match";
import { capitalize, cn } from "@/lib/utils";
import { useStatistics } from "./statistics-provider";
import {
  CLEARED_STATISTICS_FILTERS,
  MATCH_COUNT_OPTIONS,
  hasStatisticsFilters,
  type StatisticsSearchState,
} from "./statistics-search";

/**
 * The Statistics page's controls row: Opponent · Opponent type · Matches on
 * the left, the rolling window on the right.
 *
 * Nothing here holds a value. Every control reads `useStatistics().state` —
 * the URL, parsed — and every change is one `setState` patch, which writes
 * the URL back. So what the row shows is what a pasted link opens on.
 *
 * Opponent type is the Matches list's own filter panel behind a trigger that
 * states the cut in words, since this row has no applied-filter strip to say
 * it in. The line under the row appears only while a filter is on: how much
 * of the season it leaves, and the way back when that is nothing.
 */

/** The three facets the Opponent-type panel owns. */
type TypeFacet = "hand" | "backhand" | "courtType";

/** `MenuSelect` values are strings; this one stands for "no opponent picked". */
const ALL_OPPONENTS = "";

const NOTHING_APPLIED = "Any hand, any backhand";

const matchCount = (n: number) => `${n} ${n === 1 ? "match" : "matches"}`;

/**
 * What the Opponent-type trigger reads: the Matches page's scouting sentence
 * for hand and backhand, then the court, the way its strip joins a facet on.
 */
export function opponentTypeSummary(
  state: Pick<StatisticsSearchState, "hand" | "backhand" | "courtType">,
): string {
  const phrase = opponentTypePhrase(state.hand, state.backhand);
  if (!state.courtType) return phrase ?? NOTHING_APPLIED;
  return `${phrase ?? NOTHING_APPLIED} · ${capitalize(state.courtType)}`;
}

/**
 * The panel's sections, read off the loaded matches: a row or a list with
 * nothing to offer is left out rather than opened onto an empty choice — the
 * rule `matches-page-content.tsx` applies to the same panel.
 */
export function opponentTypeSections(
  matches: readonly StatisticsMatch[],
): FilterPanelSection<TypeFacet>[] {
  const sections: FilterPanelSection<TypeFacet>[] = [];

  const handHasData = matches.some((m) => m.opponentHand);
  const backhandHasData = matches.some((m) => m.opponentBackhand);
  if (handHasData || backhandHasData) {
    sections.push({
      label: "Opponent",
      segmented: [
        ...(handHasData
          ? [
              {
                key: "hand" as const,
                rowLabel: "Hand",
                options: OPPONENT_HAND_OPTIONS,
              },
            ]
          : []),
        ...(backhandHasData
          ? [
              {
                key: "backhand" as const,
                rowLabel: "Backhand",
                options: OPPONENT_BACKHAND_OPTIONS,
              },
            ]
          : []),
      ],
    });
  }

  // Lower-cased, as the URL holds it: the column's casing is whoever typed it.
  const courts = [
    ...new Set(
      matches
        .map((m) => m.courtType?.trim().toLowerCase())
        .filter((court): court is string => Boolean(court)),
    ),
  ].sort();
  if (courts.length > 0) {
    sections.push({
      label: "Court",
      checklist: { key: "courtType", values: courts, displayValue: capitalize },
    });
  }

  return sections;
}

/** Each opponent once, by the name's letters rather than its casing. */
function opponentOptions(
  matches: readonly StatisticsMatch[],
): MenuOption<string>[] {
  const byName = new Map<string, string>();
  for (const match of matches) {
    const name = match.opponentName.trim();
    const key = name.toLowerCase();
    if (key && !byName.has(key)) byName.set(key, name);
  }
  return [
    { value: ALL_OPPONENTS, label: "All opponents" },
    ...[...byName.values()]
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({ value: name, label: name })),
  ];
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-[11px] leading-[1.4] text-[var(--ink-600)]">
        {label}
      </span>
      {children}
    </div>
  );
}

/** The pill `MenuSelect`'s box, for the one trigger in the row it does not draw. */
const TYPE_TRIGGER =
  "h-[30px] max-w-full min-w-[200px] shrink-0 justify-between gap-2 rounded-[6px] border bg-[var(--surface-card)] px-3 text-left";

function OpponentTypeControl() {
  const { all, filtered, state, setState } = useStatistics();
  const sections = useMemo(() => opponentTypeSections(all), [all]);
  const summary = opponentTypeSummary(state);
  const label = `Opponent type: ${summary}`;

  const segmentedValue = useCallback((key: TypeFacet) => state[key], [state]);
  const selectSegment = useCallback(
    (key: TypeFacet, value: string | null) => {
      // The panel only offers a row's own options, so the value is the type.
      if (key === "hand") setState({ hand: value as Hand | null });
      else if (key === "backhand")
        setState({ backhand: value as Backhand | null });
    },
    [setState],
  );
  // `courtType` is one value in the URL, so the checklist holds one tick at
  // a time: ticking another court moves it, ticking the ticked one clears it.
  const isCourt = useCallback(
    (_key: TypeFacet, value: string) => state.courtType === value,
    [state.courtType],
  );
  const toggleCourt = useCallback(
    (_key: TypeFacet, value: string) =>
      setState({ courtType: state.courtType === value ? null : value }),
    [setState, state.courtType],
  );
  const clear = useCallback(
    () => setState({ hand: null, backhand: null, courtType: null }),
    [setState],
  );

  // No match says which hand, which backhand or which court: there is nothing
  // to choose between, and the row still has four controls in four places.
  if (sections.length === 0) {
    return (
      <SortTrigger
        disabled
        aria-label={label}
        className={cn(
          TYPE_TRIGGER,
          "cursor-not-allowed border-[var(--border-field)] opacity-60 hover:bg-[var(--surface-card)]",
        )}
        style={{ color: "var(--ink-900)" }}
      >
        <span className="truncate">{summary}</span>
      </SortTrigger>
    );
  }

  return (
    <MatchesFilterPanel
      label="Filter statistics"
      sections={sections}
      hasActive={
        state.hand !== null ||
        state.backhand !== null ||
        state.courtType !== null
      }
      isChecklistActive={isCourt}
      onToggleChecklist={toggleCourt}
      segmentedValue={segmentedValue}
      onSelectSegment={selectSegment}
      onClear={clear}
      resultCount={filtered.length}
      totalCount={all.length}
      trigger={({ open }) => (
        <SortTrigger
          aria-label={label}
          className={cn(
            TYPE_TRIGGER,
            open ? "border-[var(--blue)]" : "border-[var(--border-field)]",
          )}
          // The select's ink, not the toolbar trigger's: beside two selects
          // this is a third, and its words are the value.
          style={{ color: "var(--ink-900)" }}
        >
          <span className="truncate">{summary}</span>
        </SortTrigger>
      )}
    />
  );
}

/** Off · 3 · 5 · 10 — how many matches a rolling figure averages over. */
function RollingWindowControl() {
  const { state, setState } = useStatistics();
  const labelId = useId();

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    if (step === 0) return;
    event.preventDefault();
    const count = WINDOW_OPTIONS.length;
    const next = (WINDOW_OPTIONS.indexOf(state.window) + step + count) % count;
    setState({ window: WINDOW_OPTIONS[next] });
    // A radio group is one tab stop; the arrows move the choice and the focus.
    const pill = event.currentTarget.children[next];
    if (pill instanceof HTMLElement) pill.focus();
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span
        id={labelId}
        className="text-[11px] leading-[1.4] text-[var(--ink-600)]"
      >
        Rolling window, in matches
      </span>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        onKeyDown={onKeyDown}
        className="flex h-[30px] w-[200px] items-center gap-1"
      >
        {WINDOW_OPTIONS.map((option) => {
          const checked = option === state.window;
          return (
            <button
              key={option ?? "off"}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={checked ? 0 : -1}
              onClick={() => setState({ window: option })}
              className={cn(
                "tabular flex h-[26px] flex-1 cursor-pointer items-center justify-center rounded-full border text-[11px] transition-colors duration-150",
                checked
                  ? "border-[var(--border-medium)] bg-[var(--surface-subtle)] font-medium text-[var(--ink-900)]"
                  : "border-[var(--border-hairline)] text-[var(--ink-600)] hover:bg-[var(--surface-subtle)]",
              )}
            >
              {option ?? "Off"}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function StatisticsControls() {
  const { all, filtered, state, setState } = useStatistics();

  const opponents = useMemo(() => opponentOptions(all), [all]);
  // The URL's name by its letters, so a link typed in another casing still
  // shows the opponent it filters to. A name nobody played stays as typed.
  const opponent =
    state.opponent === null
      ? ALL_OPPONENTS
      : (opponents.find(
          (option) =>
            option.value.toLowerCase() === state.opponent?.toLowerCase(),
        )?.value ?? state.opponent);

  const counts = useMemo<MenuOption<string>[]>(
    () =>
      MATCH_COUNT_OPTIONS.map((option) => ({
        value: String(option),
        label:
          option === "all"
            ? all.length > 0
              ? `All ${all.length} analyzed`
              : "All analyzed"
            : `Last ${option}`,
      })),
    [all.length],
  );

  const filteredOut = filtered.length === 0 && all.length > 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <Field label="Opponent">
          <MenuSelect
            label="Opponent"
            value={opponent}
            options={opponents}
            onChange={(next) =>
              setState({ opponent: next === ALL_OPPONENTS ? null : next })
            }
            align="start"
            scroll
            className="max-w-full min-w-[168px]"
          />
        </Field>
        <Field label="Opponent type">
          <OpponentTypeControl />
        </Field>
        <Field label="Matches">
          <MenuSelect
            label="Matches"
            value={String(state.matches)}
            options={counts}
            onChange={(next) =>
              setState({
                matches:
                  MATCH_COUNT_OPTIONS.find(
                    (option) => String(option) === next,
                  ) ?? "all",
              })
            }
            align="start"
            className="min-w-[168px]"
          />
        </Field>
        <div className="flex-1" />
        <RollingWindowControl />
      </div>

      {/* Only while a filter is on: at rest the panel's footer has the count,
          and day zero has no season to count against. */}
      {all.length > 0 && hasStatisticsFilters(state) && (
        <p
          role="status"
          className="flex flex-wrap items-baseline gap-x-3 text-[11px] leading-[1.4] text-[var(--ink-500)]"
        >
          <span className="tabular">
            {filteredOut
              ? "No matches fit these filters."
              : `${filtered.length} of ${matchCount(all.length)}`}
          </span>
          <button
            type="button"
            onClick={() => setState(CLEARED_STATISTICS_FILTERS)}
            className="rounded-sm font-medium text-[var(--blue)] transition-colors duration-200 hover:text-[var(--blue-hover)] focus-visible:text-[var(--blue-hover)] focus-visible:outline-none"
          >
            Clear filters
          </button>
        </p>
      )}
    </div>
  );
}
