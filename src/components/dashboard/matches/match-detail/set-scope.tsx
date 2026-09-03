"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { useMatchData } from "@/components/dashboard/matches/match-data-provider";
import { useMatchSides } from "@/components/dashboard/matches/match-detail/use-match-sides";
import type { ScoreLineSet } from "@/lib/ui/score-format";
import { cn } from "@/lib/utils";

/**
 * The Statistics pane's set scope (artboard 47f) — the segmented control in the
 * tab row and the rule every point-derived card narrows itself by.
 *
 * ── Why the URL and not React state ─────────────────────────────────────────
 * The control is rendered in the tab row and the cards that obey it are inside
 * the panel, so shared state would otherwise have to be lifted above both and
 * threaded back down. `?set=` costs no plumbing, survives a tab round-trip and
 * a reload, and is the same mechanism `?tab=` already uses on this page.
 * Writes go through `router.replace` rather than `push` (`match-tabs.tsx`
 * deliberately uses `push` for the opposite reason): a filter is not a place
 * the back button should return to — a reader who narrowed to three sets in
 * turn expects Back to leave the match, not to walk them out one set at a time.
 *
 * ── Why a set can be unselectable ───────────────────────────────────────────
 * The published `match_stats` numbers are whole-match only, so a scoped view is
 * recomputed from `points`; a set with no point rows behind it can therefore
 * only ever produce an empty view. Those chips are disabled, and — the part
 * that is easy to forget — a hand-edited `?set=9` reads as the whole match for
 * the same reason. "Set 9 · 0 points" is a worse answer than ignoring the
 * param, and it is exactly what a filter that matches nothing looks like.
 *
 * Sets come from `useMatchSides().sets`, never from player order
 * (docs/ui-revamp-guardrails.md §4).
 */

/** The query parameter, absent for the default whole-match view. */
export const SET_PARAM = "set";

/** The only field scoping reads off a point row — see `MatchPoint`. */
interface ScopedPoint {
  setNumber: number;
}

export interface SetScopeMeta {
  /** "Whole match" or "Set 2". */
  label: string;
  /** Points in the scoped rows. */
  points: number;
  /** Games in the scoped sets, from the score. */
  games: number;
}

export interface SetScope {
  /** The set the pane is narrowed to, or `null` for the whole match. */
  activeSet: number | null;
  /** Write the scope to the URL. `null` clears it. */
  select: (set: number | null) => void;
  /**
   * The set numbers a reader may actually scope to — the same rule the `?set=`
   * parse used, handed back so a consumer (the chips' disabled state) reads it
   * instead of recomputing it and risking a drift from what the URL accepts.
   */
  selectable: ReadonlySet<number>;
}

/* ── Pure rules ─────────────────────────────────────────────────────────────
   Everything below this line is testable without a router or a DOM, which is
   what `tests/set-scope.spec.ts` exercises. */

/**
 * The set numbers a reader may actually scope to: present in the score AND
 * carrying point rows. One rule serving two consumers — the chips' disabled
 * state and the `?set=` parse — so a URL can never select what the control
 * refuses to.
 */
export function selectableSets(
  sets: readonly ScoreLineSet[],
  points: readonly ScopedPoint[],
): Set<number> {
  const withRows = new Set<number>();
  for (const point of points) withRows.add(point.setNumber);
  const selectable = new Set<number>();
  for (let setNumber = 1; setNumber <= sets.length; setNumber += 1) {
    if (withRows.has(setNumber)) selectable.add(setNumber);
  }
  return selectable;
}

/**
 * `?set=` → `activeSet`. Anything that is not a selectable set number — a
 * word, a fraction, a set the match never played, a set with no rows — reads
 * as the whole match rather than as a filter matching nothing.
 */
export function parseSetParam(
  raw: string | null | undefined,
  selectable: ReadonlySet<number>,
): number | null {
  if (raw === null || raw === undefined || raw.trim() === "") return null;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) return null;
  return selectable.has(parsed) ? parsed : null;
}

/**
 * `activeSet` → query string, carrying every other parameter through so that
 * scoping a set cannot drop the `?tab=` the reader is looking at.
 */
export function setScopeQuery(
  current: URLSearchParams,
  next: number | null,
): string {
  const params = new URLSearchParams(current.toString());
  if (next === null) params.delete(SET_PARAM);
  else params.set(SET_PARAM, String(next));
  return params.toString();
}

/** The rows one scope covers. `null` is every row, not zero rows. */
export function scopePoints<T extends ScopedPoint>(
  points: readonly T[],
  activeSet: number | null,
): T[] {
  return activeSet === null
    ? [...points]
    : points.filter((point) => point.setNumber === activeSet);
}

/**
 * What a scope is worth, for the label above the cards.
 *
 * Games come from the score, never from the point rows. A 7-6 set is 13 games
 * (guardrails §4.3 — the game count is what is stored, not the tiebreak
 * points), and counting distinct game numbers off `points` would both
 * undercount that set and report 0 games for a match whose stats are published
 * but whose points were never imported.
 */
export function scopeMeta(
  sets: readonly ScoreLineSet[],
  points: readonly ScopedPoint[],
  activeSet: number | null,
): SetScopeMeta {
  const scoped =
    activeSet === null
      ? sets
      : sets.filter((_, index) => index + 1 === activeSet);
  const games = scoped.reduce((sum, set) => sum + set.player1 + set.player2, 0);

  return {
    label: activeSet === null ? "Whole match" : `Set ${activeSet}`,
    points: scopePoints(points, activeSet).length,
    games,
  };
}

/* ── Hook ───────────────────────────────────────────────────────────────── */

/** The scope, for any client component under `MatchDataProvider`. */
export function useSetScope(): SetScope {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { points } = useMatchData();
  const sides = useMatchSides();

  const selectable = useMemo(
    () => selectableSets(sides.sets, points),
    [sides.sets, points],
  );
  const activeSet = parseSetParam(searchParams.get(SET_PARAM), selectable);

  const select = useCallback(
    (next: number | null) => {
      const query = setScopeQuery(
        new URLSearchParams(searchParams.toString()),
        next,
      );
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    },
    [router, pathname, searchParams],
  );

  return { activeSet, select, selectable };
}

/* ── Control ────────────────────────────────────────────────────────────── */

/**
 * The segmented control itself: one chip per set, showing that set's games as
 * the scoreboard spells them. Rendered in the tab row's trailing slot on the
 * Statistics tab; the scope label and the reset appear only while filtered, so
 * an unfiltered pane carries the control alone.
 */
export function SetScopeChips() {
  const { points } = useMatchData();
  const sides = useMatchSides();
  const { activeSet, select, selectable } = useSetScope();

  // A match with no sets on its score row would otherwise leave an empty 4 px
  // pill sitting in the tab row.
  if (sides.sets.length === 0) return null;

  const filtered = activeSet !== null;
  const meta = scopeMeta(sides.sets, points, activeSet);

  return (
    <div className="flex items-center gap-2.5">
      {filtered && (
        <span
          className="text-micro tabular whitespace-nowrap"
          style={{ color: "var(--ink-500)" }}
        >
          {meta.label} · {meta.points} points · {meta.games} games
        </span>
      )}

      <div
        role="group"
        aria-label="Scope statistics to a set"
        className="flex items-center gap-0.5 rounded-[var(--radius-button)] bg-[var(--surface-muted)] p-0.5"
      >
        {sides.sets.map((set, i) => {
          const setNumber = i + 1;
          const isActive = activeSet === setNumber;
          const hasPoints = selectable.has(setNumber);
          return (
            <button
              key={setNumber}
              type="button"
              disabled={!hasPoints}
              aria-pressed={isActive}
              aria-label={`Set ${setNumber}, ${set.player1}-${set.player2}`}
              onClick={() => select(isActive ? null : setNumber)}
              className={cn(
                "text-scoreboard-sm tabular inline-flex h-[22px] items-center rounded-[4px] px-[9px] transition-[background-color,opacity] duration-200 ease-[cubic-bezier(0.25,0.46,0.45,0.94)]",
                hasPoints
                  ? "cursor-pointer hover:bg-[var(--surface-card)] hover:opacity-100"
                  : "cursor-default opacity-40",
                isActive && "bg-[var(--surface-card)]",
                filtered && !isActive && hasPoints && "opacity-45",
              )}
              // `.text-scoreboard-sm` is unlayered, so it beats a Tailwind
              // font-size utility — the artboard's 12px has to be inline.
              style={{ fontSize: "12px", color: "var(--ink-900)" }}
            >
              {set.player1}-{set.player2}
            </button>
          );
        })}
      </div>

      {filtered && (
        <button
          type="button"
          onClick={() => select(null)}
          className="cursor-pointer whitespace-nowrap text-[11px] font-medium text-[var(--blue)]"
        >
          Whole match
        </button>
      )}
    </div>
  );
}
