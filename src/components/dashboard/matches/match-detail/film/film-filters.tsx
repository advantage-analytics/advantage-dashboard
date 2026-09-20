"use client";

import { useMemo } from "react";
import { Check } from "lucide-react";

import type { MatchPoint } from "@/lib/data/match-points-server";
import type { MatchSides } from "@/components/dashboard/matches/match-detail/use-match-sides";
import { advButton } from "@/lib/ui/adv-button";
import { cn } from "@/lib/utils";

/**
 * The Film room's point filter (artboard 46c, lines 853–999).
 *
 * ── Which fields back which control ─────────────────────────────────────────
 * Every option below reads a `MatchPoint` field that already exists; nothing
 * here needs a new query, a new column, or a derivation the page cannot check.
 * The mapping, once, so it is arguable rather than magic:
 *
 *   Pressure       `isBreakPoint` · `isSetPoint || isMatchPoint`
 *   Deuce / game   `pointScore`, which the parser writes SERVER-FIRST
 *                  ("40-40", "AD-40") — see `process-match/index.ts`, which is
 *                  also why nothing in this file flips it by side
 *   Ball           `firstShotType`, the serve picked by ROLE via `pickServeShot`
 *   Aces / DFs     `resultType`
 *   T/body/wide    `firstShotZone` ("T" | "Body" | "Wide" in the live data)
 *   Wing           `secondShotType`, the return picked by `pickReturnShot`
 *   Return in play `secondShotResult` ("In" | "Out" | "Net")
 *   Result         `resultType` + `rallyLength`
 *   Point went to  `wonByPlayer1` vs `sides.you.isPlayer1` — the ONLY you/opp
 *                  test in this subtree (guardrails §4)
 *
 * ── How the groups combine ──────────────────────────────────────────────────
 * The four segmented rows are single-choice AND constraints. Each checkbox
 * list is one OR group — the artboard draws them as one list apiece, so
 * "Aces" plus "To the T" means aces OR T serves, not the empty set that ANDing
 * them would produce. Groups AND together.
 *
 * ── Apply, not live ─────────────────────────────────────────────────────────
 * The artboard carries both an Apply button and per-option counts. Counts
 * preview against the DRAFT (so a count answers "what would this give me"),
 * and the list only narrows when Apply is pressed. Clear all is the exception:
 * it resets the draft AND commits, because there is nothing to preview about
 * an empty filter.
 */

import {
  applyFilmFilters,
  countFilmOption,
  lastNameOf,
  type FilmFilters,
} from "./filters/types";

export type {
  PressureCut,
  BallCut,
  WingCut,
  OutcomeCut,
  ScoreKey,
  ServeKey,
  ReturnKey,
  ResultKey,
  ServerCut,
  CourtCut,
  EndedKey,
  ShotKey,
  FilmFilters,
} from "./filters/types";
export {
  DEFAULT_FILM_FILTERS,
  hasActiveFilmFilters,
  courtSideOf,
  applyFilmFilters,
  lastNameOf,
  describeFilmCut,
  cutName,
  countFilmOption,
  parseCut,
  serializeCut,
} from "./filters/types";

/* ── Controls ───────────────────────────────────────────────────────────── */

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-col gap-[5px]">
      <span className="text-[11px] text-[var(--ink-400)]">{label}</span>
      <div className="inline-flex gap-0.5 self-start rounded-[var(--radius-pill)] bg-[var(--surface-subtle)] p-0.5">
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(option.value)}
              className={cn(
                "inline-flex h-[22px] cursor-pointer items-center rounded-[var(--radius-pill)] px-2.5 text-[11px] whitespace-nowrap",
                active
                  ? "bg-[var(--surface-card)] font-medium text-[var(--ink-900)] shadow-[var(--shadow-card)]"
                  : "text-[var(--ink-600)] hover:text-[var(--ink-900)]",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CheckRow({
  label,
  checked,
  count,
  onToggle,
}: {
  label: string;
  checked: boolean;
  count: number;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onToggle}
      className="flex h-[26px] cursor-pointer items-center gap-[9px] text-left"
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex h-[13px] w-[13px] shrink-0 items-center justify-center rounded-[var(--radius-cell)] border",
          checked
            ? "border-[var(--blue)] bg-[var(--blue)]"
            : "border-[var(--ink-300)] bg-[var(--surface-card)]",
        )}
      >
        {checked && (
          <Check className="h-[9px] w-[9px] text-white" strokeWidth={3} />
        )}
      </span>
      <span className="text-[12px] text-[var(--ink-700)]">{label}</span>
      <div className="flex-1" />
      <span className="text-micro tabular">{count}</span>
    </button>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 border-b border-[var(--border-hairline)] p-3">
      <span className="eyebrow-sm" style={{ color: "var(--ink-500)" }}>
        {title}
      </span>
      {children}
    </div>
  );
}

/* ── Popover body ───────────────────────────────────────────────────────── */

interface FilmFiltersProps {
  /** Every point on the match — the denominator and the count universe. */
  points: MatchPoint[];
  sides: MatchSides;
  /** Uncommitted state. Counts and the footer preview against this. */
  draft: FilmFilters;
  onDraftChange: (draft: FilmFilters) => void;
  /** Commit the draft to the list. */
  onApply: () => void;
  /** Reset AND commit — there is nothing to preview about no filter. */
  onClearAll: () => void;
}

export function FilmFiltersPanel({
  points,
  sides,
  draft,
  onDraftChange,
  onApply,
  onClearAll,
}: FilmFiltersProps) {
  const youIsPlayer1 = sides.you.isPlayer1;

  // A count answers "how many points would this option give me, inside the
  // rest of the draft" — so the option's own group is replaced rather than
  // added to, and the number moves as the neighbouring groups change.
  const counts = useMemo(() => {
    const sizeWith = (patch: Partial<FilmFilters>) =>
      countFilmOption(points, draft, youIsPlayer1, patch);

    return {
      score: {
        deuce: sizeWith({ score: ["deuce"] }),
        game: sizeWith({ score: ["game"] }),
      },
      serve: {
        ace: sizeWith({ serve: ["ace"] }),
        "double-fault": sizeWith({ serve: ["double-fault"] }),
        t: sizeWith({ serve: ["t"] }),
        body: sizeWith({ serve: ["body"] }),
        wide: sizeWith({ serve: ["wide"] }),
      },
      returns: {
        "in-play": sizeWith({ returns: ["in-play"] }),
        winner: sizeWith({ returns: ["winner"] }),
        error: sizeWith({ returns: ["error"] }),
      },
      result: {
        winner: sizeWith({ result: ["winner"] }),
        forced: sizeWith({ result: ["forced"] }),
        unforced: sizeWith({ result: ["unforced"] }),
        long: sizeWith({ result: ["long"] }),
      },
    };
  }, [points, draft, youIsPlayer1]);

  const previewCount = useMemo(
    () => applyFilmFilters(points, draft, youIsPlayer1).length,
    [points, draft, youIsPlayer1],
  );

  function toggle<K extends "score" | "serve" | "returns" | "result">(
    group: K,
    key: FilmFilters[K][number],
  ) {
    const current = draft[group] as string[];
    const next = current.includes(key as string)
      ? current.filter((k) => k !== key)
      : [...current, key as string];
    onDraftChange({ ...draft, [group]: next } as FilmFilters);
  }

  return (
    <div className="flex max-h-[520px] flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Section title="Score">
          <Segmented
            label="Pressure"
            value={draft.pressure}
            onChange={(pressure) => onDraftChange({ ...draft, pressure })}
            options={[
              { value: "any", label: "Any" },
              { value: "break", label: "Break point" },
              { value: "set-match", label: "Set · match" },
            ]}
          />
          <div className="flex flex-col">
            <CheckRow
              label="Deuce points"
              checked={draft.score.includes("deuce")}
              count={counts.score.deuce}
              onToggle={() => toggle("score", "deuce")}
            />
            <CheckRow
              label="Game points"
              checked={draft.score.includes("game")}
              count={counts.score.game}
              onToggle={() => toggle("score", "game")}
            />
          </div>
        </Section>

        <Section title="Serve">
          <Segmented
            label="Ball"
            value={draft.ball}
            onChange={(ball) => onDraftChange({ ...draft, ball })}
            options={[
              { value: "any", label: "Any" },
              { value: "first", label: "First" },
              { value: "second", label: "Second" },
            ]}
          />
          <div className="flex flex-col">
            <CheckRow
              label="Aces"
              checked={draft.serve.includes("ace")}
              count={counts.serve.ace}
              onToggle={() => toggle("serve", "ace")}
            />
            <CheckRow
              label="Double faults"
              checked={draft.serve.includes("double-fault")}
              count={counts.serve["double-fault"]}
              onToggle={() => toggle("serve", "double-fault")}
            />
            <CheckRow
              label="To the T"
              checked={draft.serve.includes("t")}
              count={counts.serve.t}
              onToggle={() => toggle("serve", "t")}
            />
            <CheckRow
              label="To the body"
              checked={draft.serve.includes("body")}
              count={counts.serve.body}
              onToggle={() => toggle("serve", "body")}
            />
            <CheckRow
              label="Wide"
              checked={draft.serve.includes("wide")}
              count={counts.serve.wide}
              onToggle={() => toggle("serve", "wide")}
            />
          </div>
        </Section>

        <Section title="Return">
          <Segmented
            label="Wing"
            value={draft.wing}
            onChange={(wing) => onDraftChange({ ...draft, wing })}
            options={[
              { value: "any", label: "Any" },
              { value: "forehand", label: "Forehand" },
              { value: "backhand", label: "Backhand" },
            ]}
          />
          <div className="flex flex-col">
            <CheckRow
              label="Return in play"
              checked={draft.returns.includes("in-play")}
              count={counts.returns["in-play"]}
              onToggle={() => toggle("returns", "in-play")}
            />
            <CheckRow
              label="Return winners"
              checked={draft.returns.includes("winner")}
              count={counts.returns.winner}
              onToggle={() => toggle("returns", "winner")}
            />
            <CheckRow
              label="Return errors"
              checked={draft.returns.includes("error")}
              count={counts.returns.error}
              onToggle={() => toggle("returns", "error")}
            />
          </div>
        </Section>

        <Section title="Result">
          <div className="flex flex-col">
            <CheckRow
              label="Winners"
              checked={draft.result.includes("winner")}
              count={counts.result.winner}
              onToggle={() => toggle("result", "winner")}
            />
            <CheckRow
              label="Forced errors"
              checked={draft.result.includes("forced")}
              count={counts.result.forced}
              onToggle={() => toggle("result", "forced")}
            />
            <CheckRow
              label="Unforced errors"
              checked={draft.result.includes("unforced")}
              count={counts.result.unforced}
              onToggle={() => toggle("result", "unforced")}
            />
            <CheckRow
              label="Rallies 9+ shots"
              checked={draft.result.includes("long")}
              count={counts.result.long}
              onToggle={() => toggle("result", "long")}
            />
          </div>
        </Section>

        <Section title="Outcome">
          {/* "You" and the opponent's name come from `sides`, never from
              player order — a hardcoded name here is exactly the bug
              guardrails §4 is about. */}
          <Segmented
            label="Point went to"
            value={draft.outcome}
            onChange={(outcome) => onDraftChange({ ...draft, outcome })}
            options={[
              { value: "any", label: "Any" },
              { value: "you", label: "You" },
              { value: "opp", label: lastNameOf(sides.opp.name) },
            ]}
          />
        </Section>
      </div>

      <div className="flex items-center gap-2.5 border-t border-[var(--border-hairline)] bg-[var(--surface-card)] p-3">
        <span className="text-[12px] text-[var(--ink-700)]">
          <span className="tabular">{previewCount}</span> of{" "}
          <span className="tabular">{points.length}</span> points
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onClearAll}
          className="cursor-pointer text-[11px] font-medium text-[var(--ink-600)] hover:text-[var(--ink-900)]"
        >
          Clear all
        </button>
        <button
          type="button"
          onClick={onApply}
          className={advButton("primary", "sm")}
        >
          Apply
        </button>
      </div>
    </div>
  );
}
