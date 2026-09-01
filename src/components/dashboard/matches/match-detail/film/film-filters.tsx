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

/* ── State ──────────────────────────────────────────────────────────────── */

export type PressureCut = "any" | "break" | "set-match";
export type BallCut = "any" | "first" | "second";
export type WingCut = "any" | "forehand" | "backhand";
export type OutcomeCut = "any" | "you" | "opp";

export type ScoreKey = "deuce" | "game";
export type ServeKey = "ace" | "double-fault" | "t" | "body" | "wide";
export type ReturnKey = "in-play" | "winner" | "error";
export type ResultKey = "winner" | "forced" | "unforced" | "long";

export interface FilmFilters {
  pressure: PressureCut;
  ball: BallCut;
  wing: WingCut;
  outcome: OutcomeCut;
  score: ScoreKey[];
  serve: ServeKey[];
  returns: ReturnKey[];
  result: ResultKey[];
}

export const DEFAULT_FILM_FILTERS: FilmFilters = {
  pressure: "any",
  ball: "any",
  wing: "any",
  outcome: "any",
  score: [],
  serve: [],
  returns: [],
  result: [],
};

export function hasActiveFilmFilters(f: FilmFilters): boolean {
  return (
    f.pressure !== "any" ||
    f.ball !== "any" ||
    f.wing !== "any" ||
    f.outcome !== "any" ||
    f.score.length > 0 ||
    f.serve.length > 0 ||
    f.returns.length > 0 ||
    f.result.length > 0
  );
}

/* ── Predicates ─────────────────────────────────────────────────────────── */

function scoreParts(point: MatchPoint): [string, string] | null {
  const parts = (point.pointScore ?? "").split("-");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return [parts[0], parts[1]];
}

/** 40-40 (and the parser's rarer AD-AD) — nobody is a point from the game. */
function isDeucePoint(point: MatchPoint): boolean {
  const parts = scoreParts(point);
  if (!parts) return false;
  const [a, b] = parts;
  return (a === "40" && b === "40") || (a === "AD" && b === "AD");
}

/** Somebody wins the game with this point: an advantage, or exactly one 40. */
function isGamePoint(point: MatchPoint): boolean {
  const parts = scoreParts(point);
  if (!parts) return false;
  const [a, b] = parts;
  if (a === "AD" && b === "AD") return false;
  if (a === "AD" || b === "AD") return true;
  return (a === "40") !== (b === "40");
}

function isWinnerResult(point: MatchPoint): boolean {
  return /winner$/i.test(point.resultType.trim());
}

function matchesScore(point: MatchPoint, key: ScoreKey): boolean {
  return key === "deuce" ? isDeucePoint(point) : isGamePoint(point);
}

function matchesServe(point: MatchPoint, key: ServeKey): boolean {
  switch (key) {
    case "ace":
      return point.resultType === "Ace";
    case "double-fault":
      return point.resultType === "Double Fault";
    case "t":
      return point.firstShotZone === "T";
    case "body":
      return point.firstShotZone === "Body";
    case "wide":
      return point.firstShotZone === "Wide";
  }
}

function matchesReturn(point: MatchPoint, key: ReturnKey): boolean {
  const result = point.secondShotResult;
  switch (key) {
    case "in-play":
      return result === "In";
    // The return itself missed. Not "the returner lost the point" — this is
    // the shot's own recorded result, which is what "return error" means.
    case "error":
      return result === "Out" || result === "Net";
    // The point ended on the return and it ended as a winner. `rallyLength <= 2`
    // is serve + return; "Service Winner" is excluded because that one belongs
    // to the server.
    case "winner":
      return (
        result === "In" &&
        point.rallyLength > 0 &&
        point.rallyLength <= 2 &&
        isWinnerResult(point) &&
        point.resultType !== "Service Winner"
      );
  }
}

function matchesResult(point: MatchPoint, key: ResultKey): boolean {
  switch (key) {
    case "winner":
      return isWinnerResult(point);
    case "forced":
      return /(^|[^n])forced error$/i.test(point.resultType.trim());
    case "unforced":
      return /unforced error$/i.test(point.resultType.trim());
    case "long":
      return point.rallyLength >= 9;
  }
}

function matchesFilm(
  point: MatchPoint,
  f: FilmFilters,
  youIsPlayer1: boolean,
): boolean {
  if (f.pressure === "break" && !point.isBreakPoint) return false;
  if (f.pressure === "set-match" && !(point.isSetPoint || point.isMatchPoint)) {
    return false;
  }

  if (f.ball === "first" && point.firstShotType !== "First Serve") return false;
  if (f.ball === "second" && point.firstShotType !== "Second Serve") return false;

  if (f.wing === "forehand" && point.secondShotType !== "Forehand") return false;
  if (f.wing === "backhand" && point.secondShotType !== "Backhand") return false;

  if (f.outcome !== "any") {
    const youWon = point.wonByPlayer1 === youIsPlayer1;
    if (f.outcome === "you" && !youWon) return false;
    if (f.outcome === "opp" && youWon) return false;
  }

  if (f.score.length > 0 && !f.score.some((k) => matchesScore(point, k))) {
    return false;
  }
  if (f.serve.length > 0 && !f.serve.some((k) => matchesServe(point, k))) {
    return false;
  }
  if (f.returns.length > 0 && !f.returns.some((k) => matchesReturn(point, k))) {
    return false;
  }
  if (f.result.length > 0 && !f.result.some((k) => matchesResult(point, k))) {
    return false;
  }

  return true;
}

export function applyFilmFilters(
  points: MatchPoint[],
  f: FilmFilters,
  youIsPlayer1: boolean,
): MatchPoint[] {
  if (!hasActiveFilmFilters(f)) return points;
  return points.filter((point) => matchesFilm(point, f, youIsPlayer1));
}

/* ── The cut, in words ──────────────────────────────────────────────────── */

const SCORE_PHRASE: Record<ScoreKey, string> = {
  deuce: "deuce points",
  game: "game points",
};
const SERVE_PHRASE: Record<ServeKey, string> = {
  ace: "aces",
  "double-fault": "double faults",
  t: "serves to the T",
  body: "serves to the body",
  wide: "wide serves",
};
const RETURN_PHRASE: Record<ReturnKey, string> = {
  "in-play": "returns in play",
  winner: "return winners",
  error: "return errors",
};
const RESULT_PHRASE: Record<ResultKey, string> = {
  winner: "winners",
  forced: "forced errors",
  unforced: "unforced errors",
  long: "rallies of 9+ shots",
};

function orList(phrases: string[]): string {
  if (phrases.length <= 1) return phrases[0] ?? "";
  return `${phrases.slice(0, -1).join(", ")} or ${phrases[phrases.length - 1]}`;
}

/** "Reid" out of "Marcus Reid" — the artboard's group-header/pill shorthand. */
export function lastNameOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : name;
}

/**
 * The applied cut as a sentence — never chips (v3 Data Table law 6, and the
 * same shape `matches-page-content.tsx` already uses above the match table).
 */
export function describeFilmCut(f: FilmFilters, sides: MatchSides): string {
  const clauses: string[] = [];

  if (f.pressure === "break") clauses.push("break points");
  if (f.pressure === "set-match") clauses.push("set and match points");
  if (f.score.length > 0) {
    clauses.push(orList(f.score.map((k) => SCORE_PHRASE[k])));
  }
  if (f.ball === "first") clauses.push("first serves");
  if (f.ball === "second") clauses.push("second serves");
  if (f.serve.length > 0) {
    clauses.push(orList(f.serve.map((k) => SERVE_PHRASE[k])));
  }
  if (f.wing === "forehand") clauses.push("forehand returns");
  if (f.wing === "backhand") clauses.push("backhand returns");
  if (f.returns.length > 0) {
    clauses.push(orList(f.returns.map((k) => RETURN_PHRASE[k])));
  }
  if (f.result.length > 0) {
    clauses.push(orList(f.result.map((k) => RESULT_PHRASE[k])));
  }
  if (f.outcome === "you") clauses.push("points you won");
  if (f.outcome === "opp") {
    clauses.push(`points ${lastNameOf(sides.opp.name)} won`);
  }

  if (clauses.length === 0) return "All points";
  const sentence = clauses.join(", ");
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

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
      <div className="inline-flex self-start gap-0.5 rounded-[var(--radius-pill)] bg-[var(--surface-subtle)] p-0.5">
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
        {checked && <Check className="h-[9px] w-[9px] text-white" strokeWidth={3} />}
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
      applyFilmFilters(points, { ...draft, ...patch }, youIsPlayer1).length;

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
        <button type="button" onClick={onApply} className={advButton("primary", "sm")}>
          Apply
        </button>
      </div>
    </div>
  );
}
