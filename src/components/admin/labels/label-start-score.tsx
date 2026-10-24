"use client";

import { useState } from "react";
import { Minus, Play, Plus, Scale } from "lucide-react";
import { ChromeTooltip } from "@/components/dashboard/shared/chrome-tooltip";
import { TIEBREAK_TARGET } from "@/lib/services/labels/score";
import {
  opponent,
  type LabelGameType,
  type LabelSide,
  type LabelStartScore,
} from "@/lib/services/labels/session";
import { parseLabelStartScore } from "@/lib/services/labels/session-fields";
import type { LabelScoreMismatch } from "@/lib/services/labels/set-scores";
import { advButton } from "@/lib/ui/adv-button";
import { cn } from "@/lib/utils";
import { BlackTextAction, RAIL_PRESS, gameSlot } from "./label-black-parts";
import type { SideNames } from "./label-format";

/**
 * Where the video starts in the match (`label_sessions.start_score`), on the
 * points rail — Design A (2026-10-24):
 *
 * - The prompt: the dashed amber slot above point 1, asked when set 1's
 *   labelled games do not make the score and no start is saved. A second
 *   answer to the same mismatch the "Score doesn't add up" chip names (the
 *   other is "Video ends early"). "Set the starting score" opens the editor;
 *   "It starts at 0–0" saves a 0–0 start — the session's own answer, so the
 *   prompt does not come back, and it counts exactly as no start does.
 * - The editor: a solid frame where the prompt was. Sets and games as −/+
 *   steppers per player, the first game's points as 0 / 15 / 30 / 40 (a
 *   count when that game is a tiebreak) and the server. It refuses a start
 *   whose points already settle the first game.
 * - The saved line: a 30px line under the rail header, "Video starts at
 *   2–0 · 15–0, Rudy serving", with Edit.
 *
 * Every pair is p1 first, as `LabelStartScore` stores it; the points read as
 * the rail's scores do — the server's first in an ordinary game, player 1's
 * in a tiebreak.
 */

const CALLS = ["0", "15", "30", "40"] as const;

const PAIR = (pair: readonly [number, number]) => `${pair[0]}–${pair[1]}`;

/** The first game's points as the rail calls them: "15–0", or "3–2" in a tiebreak. */
function pointsCall(start: LabelStartScore, gameType: LabelGameType): string {
  const [p1, p2] = start.points;
  if (gameType !== "game") return `${p1}–${p2}`;
  const count = { p1, p2 };
  const server = start.server;
  const receiver = opponent(server);
  return `${CALLS[Math.min(count[server], 3)]}–${CALLS[Math.min(count[receiver], 3)]}`;
}

/**
 * "2–0 · 15–0": the games, then the first game's points. Sets lead, as
 * "sets 1–0 · 2–0 · 15–0", only once one has been played.
 */
export function formatStartScore(
  start: LabelStartScore,
  gameType: LabelGameType = "game",
): string {
  const parts = [PAIR(start.games), pointsCall(start, gameType)];
  if (start.sets[0] + start.sets[1] > 0) {
    parts.unshift(`sets ${PAIR(start.sets)}`);
  }
  return parts.join(" · ");
}

/** "Video starts at 2–0 · 15–0, Rudy serving". */
export function startScoreLine(
  start: LabelStartScore,
  names: SideNames,
  gameType: LabelGameType = "game",
): string {
  return `Video starts at ${formatStartScore(start, gameType)}, ${names[start.server]} serving`;
}

/**
 * Why the editor will not save `start`, or null. A start whose points already
 * settle the first game — an ordinary game past 40, a tiebreak at its target
 * and two clear — would open the video on a game that is over.
 */
export function startScoreError(
  start: LabelStartScore,
  gameType: LabelGameType,
): string | null {
  const [p1, p2] = start.points;
  if (gameType === "game") {
    return Math.max(p1, p2) > 3
      ? "An ordinary game's points stop at 40."
      : null;
  }
  const target = TIEBREAK_TARGET[gameType];
  if (Math.max(p1, p2) >= target && Math.abs(p1 - p2) >= 2) {
    return `At ${p1}–${p2} the ${gameType === "tiebreak" ? "tiebreak" : "match tiebreak"} is already won.`;
  }
  return null;
}

/** A 0–0 start with `server`: "It starts at 0–0", saved. */
export function zeroStartScore(server: LabelSide): LabelStartScore {
  return { sets: [0, 0], games: [0, 0], points: [0, 0], server };
}

/**
 * The prompt above point 1: the dashed amber slot, its reason the mismatch
 * in a sentence, its two answers. A plain function, as `gameSlot` is, so a
 * spec can walk it.
 */
export function startScorePrompt({
  mismatch,
  anchor,
  recordSays,
  onSet,
  onStartsAtZero,
}: {
  mismatch: LabelScoreMismatch;
  /** The first live point's id: the row it sits above. */
  anchor: string;
  /** True when the score held is the match record's, not one entered here. */
  recordSays: boolean;
  onSet: () => void;
  onStartsAtZero: () => void;
}) {
  const source = recordSays ? "the record says" : "the entered score says";
  return gameSlot({
    icon: Scale,
    row: "start-score-prompt",
    anchor,
    title: "Does the video start mid-match?",
    reason: `Set ${mismatch.setNumber} adds up to ${mismatch.labelled}, but ${source} ${mismatch.entered}.`,
    action: (
      <span className="flex items-center gap-1">
        <BlackTextAction
          ink="quiet"
          data-start-score-zero=""
          onClick={(event) => {
            event.stopPropagation();
            onStartsAtZero();
          }}
        >
          It starts at 0–0
        </BlackTextAction>
        <BlackTextAction
          ink="amber"
          data-start-score-set=""
          onClick={(event) => {
            event.stopPropagation();
            onSet();
          }}
        >
          Set the starting score
        </BlackTextAction>
      </span>
    ),
    actionLabel: "Set the starting score",
    details: [],
  });
}

/** The saved start, as a 30px line under the rail header. */
export function LabelStartScoreLine({
  start,
  names,
  gameType = "game",
  onEdit,
}: {
  start: LabelStartScore;
  names: SideNames;
  gameType?: LabelGameType;
  /** Absent on a read-only rail: the line alone. */
  onEdit?: () => void;
}) {
  return (
    <div
      data-start-score-line=""
      className="flex h-[30px] shrink-0 items-center gap-2 pr-[10px] pl-[14px] shadow-[inset_0_-1px_0_color-mix(in_oklab,var(--color-white)_8%,transparent)]"
    >
      <Play
        className="size-3 shrink-0 text-white/45"
        strokeWidth={1.8}
        aria-hidden="true"
      />
      <span
        data-start-score-text=""
        className="min-w-0 flex-1 truncate text-[11px] text-white/70"
      >
        {startScoreLine(start, names, gameType)}
      </span>
      {onEdit ? (
        <BlackTextAction
          ink="quiet"
          data-start-score-edit=""
          aria-label="Edit where the video starts"
          onClick={onEdit}
        >
          Edit
        </BlackTextAction>
      ) : null}
    </div>
  );
}

const SIDES: readonly LabelSide[] = ["p1", "p2"];

const SEGMENT =
  "h-6 min-w-[30px] cursor-pointer rounded-[6px] px-1.5 text-[11px] font-medium focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none";
const SEGMENT_ON = "bg-white/[0.14] text-white";
const SEGMENT_OFF = "text-white/55 hover:text-white";

/** A row of choices, one pressed. */
function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
  data,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  data: string;
}) {
  return (
    <span
      role="group"
      aria-label={label}
      {...{ [`data-${data}`]: "" }}
      className="inline-flex min-w-0 items-center gap-0.5 rounded-[8px] bg-white/[0.06] p-0.5"
    >
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
          className={cn(
            SEGMENT,
            RAIL_PRESS,
            option.value === value ? SEGMENT_ON : SEGMENT_OFF,
          )}
        >
          {option.label}
        </button>
      ))}
    </span>
  );
}

const STEP =
  "flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-[6px] text-white/55 hover:bg-white/[0.08] hover:text-white focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none disabled:cursor-default disabled:text-white/20 disabled:hover:bg-transparent";

/** − value +, for one player's count. */
function Stepper({
  label,
  value,
  max,
  onChange,
  data,
}: {
  /** "Lee's games": the buttons' names. */
  label: string;
  value: number;
  max: number;
  onChange: (value: number) => void;
  data: string;
}) {
  return (
    <span
      role="group"
      aria-label={label}
      {...{ [`data-${data}`]: String(value) }}
      className="inline-flex items-center gap-1"
    >
      <ChromeTooltip label={`One fewer`} side="top">
        <button
          type="button"
          aria-label={`${label}: one fewer`}
          disabled={value <= 0}
          onClick={() => onChange(value - 1)}
          className={cn(STEP, RAIL_PRESS)}
        >
          <Minus className="size-3" strokeWidth={1.8} aria-hidden="true" />
        </button>
      </ChromeTooltip>
      <span className="mono tabular w-5 text-center text-[12px] text-white">
        {value}
      </span>
      <ChromeTooltip label={`One more`} side="top">
        <button
          type="button"
          aria-label={`${label}: one more`}
          disabled={value >= max}
          onClick={() => onChange(value + 1)}
          className={cn(STEP, RAIL_PRESS)}
        >
          <Plus className="size-3" strokeWidth={1.8} aria-hidden="true" />
        </button>
      </ChromeTooltip>
    </span>
  );
}

const POINT_OPTIONS = CALLS.map((call, value) => ({ value, label: call }));

function pairWith(
  pair: readonly [number, number],
  side: LabelSide,
  value: number,
): [number, number] {
  return side === "p1" ? [value, pair[1]] : [pair[0], value];
}

/**
 * The inline editor: the score before the first point on video. Save hands
 * up the start as `parseLabelStartScore` reads it; it is disabled while
 * `startScoreError` has something to say.
 */
export function LabelStartScoreEditor({
  initial,
  defaultServer,
  names,
  gameType,
  onCancel,
  onSave,
}: {
  /** The saved start; null starts the editor at 0–0. */
  initial: LabelStartScore | null;
  /** Who serves when nothing is saved: the first game's server. */
  defaultServer: LabelSide;
  names: SideNames;
  /** The first game's type: a tiebreak counts its points. */
  gameType: LabelGameType;
  onCancel: () => void;
  onSave: (start: LabelStartScore) => void;
}) {
  const [draft, setDraft] = useState<LabelStartScore>(
    () => initial ?? zeroStartScore(defaultServer),
  );
  const error = startScoreError(draft, gameType);
  const tiebreak = gameType !== "game";
  const cell = (side: LabelSide, node: React.ReactNode) => (
    <span key={side} className="flex min-w-0 items-center">
      {node}
    </span>
  );
  const rowLabel = (text: string) => (
    <span className="text-[11px] text-white/50">{text}</span>
  );
  return (
    <div
      data-start-score-editor=""
      data-start-score-game-type={gameType}
      className="mx-2 my-0.5 flex flex-col gap-2.5 rounded-lg border border-white/[0.14] bg-white/[0.03] px-3 py-2.5"
    >
      <span className="text-[12px] font-medium text-white">
        Score before the first point on video
      </span>
      <div className="grid grid-cols-[56px_minmax(0,1fr)_minmax(0,1fr)] items-center gap-x-3 gap-y-2">
        <span />
        {SIDES.map((side) =>
          cell(
            side,
            <span className="truncate text-[11px] font-medium text-white/70">
              {names[side]}
            </span>,
          ),
        )}
        {rowLabel("Sets")}
        {SIDES.map((side) =>
          cell(
            side,
            <Stepper
              label={`${names[side]}'s sets`}
              data={`start-sets-${side}`}
              value={draft.sets[side === "p1" ? 0 : 1]}
              max={4}
              onChange={(value) =>
                setDraft((d) => ({ ...d, sets: pairWith(d.sets, side, value) }))
              }
            />,
          ),
        )}
        {rowLabel("Games")}
        {SIDES.map((side) =>
          cell(
            side,
            <Stepper
              label={`${names[side]}'s games`}
              data={`start-games-${side}`}
              value={draft.games[side === "p1" ? 0 : 1]}
              max={12}
              onChange={(value) =>
                setDraft((d) => ({
                  ...d,
                  games: pairWith(d.games, side, value),
                }))
              }
            />,
          ),
        )}
        {rowLabel("Points")}
        {SIDES.map((side) => {
          const value = draft.points[side === "p1" ? 0 : 1];
          const set = (next: number) =>
            setDraft((d) => ({ ...d, points: pairWith(d.points, side, next) }));
          return cell(
            side,
            tiebreak ? (
              <Stepper
                label={`${names[side]}'s points`}
                data={`start-points-${side}`}
                value={value}
                max={30}
                onChange={set}
              />
            ) : (
              <Segmented
                label={`${names[side]}'s points`}
                data={`start-points-${side}`}
                options={POINT_OPTIONS}
                value={Math.min(value, 3)}
                onChange={set}
              />
            ),
          );
        })}
        {rowLabel("Serving")}
        <span className="col-span-2 flex min-w-0">
          <Segmented
            label="Serving"
            data="start-server"
            options={SIDES.map((side) => ({ value: side, label: names[side] }))}
            value={draft.server}
            onChange={(server) => setDraft((d) => ({ ...d, server }))}
          />
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span className="flex min-w-0 flex-1 flex-col gap-px">
          <span
            data-start-score-summary=""
            className="mono tabular truncate text-[11px] text-white/70"
          >
            Starts at {formatStartScore(draft, gameType)}
          </span>
          {error ? (
            <span
              data-start-score-error=""
              role="alert"
              className="truncate text-[11px] text-[var(--rail-amber)]"
            >
              {error}
            </span>
          ) : null}
        </span>
        <BlackTextAction
          ink="quiet"
          data-start-score-cancel=""
          onClick={onCancel}
        >
          Cancel
        </BlackTextAction>
        <button
          type="button"
          data-start-score-save=""
          disabled={error !== null}
          onClick={() => {
            const start = parseLabelStartScore(draft);
            if (start && startScoreError(start, gameType) === null) {
              onSave(start);
            }
          }}
          className={advButton("primary", "sm")}
        >
          Save
        </button>
      </div>
    </div>
  );
}
