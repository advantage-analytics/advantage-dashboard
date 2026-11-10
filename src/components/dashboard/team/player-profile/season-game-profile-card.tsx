"use client";

import { useState } from "react";
import { ArrowRightLeft } from "lucide-react";

import { statDisplay } from "@/components/dashboard/matches/match-detail/head-to-head-rows";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatMatchDayShort } from "@/lib/data/match-day";
import { surname } from "@/lib/data/match-utils";
import {
  GAME_PROFILE_AXES,
  GAME_PROFILE_RECENT,
  type GameProfileValues,
  type SeasonGameProfile,
} from "@/lib/data/player-season";

/**
 * The team player profile's "Game profile" (design canvas "Match page
 * refinements", boards 9 and 10), in place of the season Performance
 * tracker: a radar of six of the player's rates — first serve in, first and
 * second serve points won, return points won, net points won, break points
 * converted — each 0–100%.
 *
 * Two shapes, both solid, nothing dashed and no team average: the player's
 * Overall season is a slate (`--viz-opp`) outline with no fill, and their
 * recent form the filled blue (`--viz-you`) shape over it. Recent form is
 * the last match by default; with more than five analyzed matches a double
 * arrow swaps it to the last five pooled, and the text beside it names what
 * is shown. With five or fewer, the last five would be nearly the whole
 * record, so the icon is not drawn. Each axis label carries the blue shape's
 * figure; the legend names the last match ("Last match · vs Ruiz, Nov 7").
 *
 * Every figure is the server's (`seasonGameProfile`, `player-season.ts`):
 * pooled from the same per-row made/attempts as the season Head to head, so
 * the Overall shape and the table's rates are one number. Nothing here
 * decides a side (guardrails §4) — the fold read every match with its own
 * seat — and no points reach this client component, only the six values a
 * shape.
 *
 * Empty (no analyzed match): the anatomy — eyebrow, rings, spokes, the axis
 * names each with a dash — and one sentence saying what fills it.
 */

const HEADING_ID = "season-game-profile-heading";

/* The plot's frame: wide enough for "2nd serve won 100%" at either side. */
const VIEW_W = 420;
const VIEW_H = 250;
const CX = VIEW_W / 2;
const CY = 125;
const RADIUS = 92;
const LABEL_RADIUS = 118;
const RINGS = [25, 50, 75, 100] as const;

function point(axis: number, value: number): [number, number] {
  const angle = -Math.PI / 2 + (axis * 2 * Math.PI) / GAME_PROFILE_AXES.length;
  const r = (RADIUS * Math.max(0, Math.min(100, value))) / 100;
  return [CX + Math.cos(angle) * r, CY + Math.sin(angle) * r];
}

function polygon(values: readonly (number | null)[]): string {
  return values
    .map((v, i) => point(i, v ?? 0))
    .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
}

/** "57%", or an em dash for an axis with no attempts. */
export function gameProfileFigure(value: number | null): string {
  return statDisplay(value, true) || "—";
}

/** The text beside the swap: what the blue shape is. */
export function gameProfileShowing(five: boolean): string {
  return five ? `Last ${GAME_PROFILE_RECENT} matches` : "Last match";
}

/** The legend's blue entry: "Last match · vs Ruiz, Nov 7". */
export function gameProfileLegend(
  five: boolean,
  lastMatch: SeasonGameProfile["lastMatch"],
): string {
  if (five || !lastMatch) return gameProfileShowing(five);
  const day = lastMatch.date ? formatMatchDayShort(lastMatch.date) : "";
  return `Last match · vs ${surname(lastMatch.opponent)}${day ? `, ${day}` : ""}`;
}

/** The two-line key for a solid line, laid flat. */
function LineKey({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <svg
        aria-hidden="true"
        width={18}
        height={8}
        viewBox="0 0 18 8"
        className="block shrink-0"
      >
        <line x1={0} y1={4} x2={18} y2={4} stroke={color} strokeWidth={1.5} />
      </svg>
      <span className="text-micro whitespace-nowrap">{label}</span>
    </span>
  );
}

export function SeasonGameProfileCard({
  playerName,
  analyzed,
  profile,
}: {
  /** The player's full name, for the chart's description and the empty sentence. */
  playerName: string;
  /** Matches with points — what `profile` was folded from. */
  analyzed: number;
  /** `seasonGameProfile()` — the Overall, last match and last five shapes. */
  profile: SeasonGameProfile;
}) {
  const [five, setFive] = useState(false);
  const canSwap = profile.lastFive !== null;
  const showFive = canSwap && five;
  const recent: GameProfileValues | null = showFive
    ? profile.lastFive
    : (profile.lastMatch?.values ?? null);
  const empty = analyzed === 0 || recent === null;
  const name = surname(playerName);
  const action = showFive
    ? "Show last match"
    : `Show last ${GAME_PROFILE_RECENT} matches`;

  const description = empty
    ? `${name}'s game profile: no analyzed match yet.`
    : `${name}'s ${showFive ? `last ${GAME_PROFILE_RECENT} matches` : "last match"} against their overall: ` +
      GAME_PROFILE_AXES.map(
        (axis, i) =>
          `${axis.label} ${gameProfileFigure(recent[i])} (overall ${gameProfileFigure(profile.overall[i])})`,
      ).join(", ") +
      ".";

  return (
    <section
      aria-labelledby={HEADING_ID}
      className="surface-card flex flex-col gap-2.5"
      style={{ padding: "16px 20px 14px" }}
      data-testid={empty ? "season-game-profile-empty" : "season-game-profile"}
    >
      <div className="flex h-7 items-center gap-2">
        <span id={HEADING_ID} className="eyebrow">
          Game profile
        </span>
        <div className="flex-1" />
        {!empty && (
          <span
            className="text-micro whitespace-nowrap"
            style={{ color: "var(--ink-500)" }}
            aria-live="polite"
          >
            {gameProfileShowing(showFive)}
          </span>
        )}
        {!empty && canSwap && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={action}
                onClick={() => setFive((v) => !v)}
                // The DS Chrome Icon Button, 28px (`reference/components.md`);
                // the focus ring is `focus.css`'s, so none is written here.
                className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-[#888888] transition-colors duration-200 hover:bg-[#F5F5F5] hover:text-[#0D0D0D]"
              >
                <ArrowRightLeft aria-hidden="true" className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent
              side="bottom"
              sideOffset={6}
              className="px-2.5 py-1.5 text-[11px] leading-[14px]"
            >
              {action}
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="mx-auto block h-auto w-full max-w-[420px]"
        role="img"
        aria-label={description}
      >
        {RINGS.map((ring) => (
          <polygon
            key={ring}
            points={polygon(GAME_PROFILE_AXES.map(() => ring))}
            fill="none"
            stroke="var(--ink-200)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {GAME_PROFILE_AXES.map((axis, i) => {
          const [x, y] = point(i, 100);
          return (
            <line
              key={axis.label}
              x1={CX}
              y1={CY}
              x2={x}
              y2={y}
              stroke="var(--ink-200)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
        {!empty && (
          <>
            <polygon
              data-testid="game-profile-overall"
              points={polygon(profile.overall)}
              fill="none"
              stroke="var(--viz-opp)"
              strokeWidth={1.5}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
            <polygon
              data-testid="game-profile-recent"
              points={polygon(recent)}
              fill="var(--viz-you)"
              fillOpacity={0.14}
              stroke="var(--viz-you)"
              strokeWidth={1.5}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </>
        )}
        {GAME_PROFILE_AXES.map((axis, i) => {
          const angle =
            -Math.PI / 2 + (i * 2 * Math.PI) / GAME_PROFILE_AXES.length;
          const x = CX + Math.cos(angle) * LABEL_RADIUS;
          const y = CY + Math.sin(angle) * LABEL_RADIUS + 4;
          const dx = x - CX;
          return (
            <text
              key={axis.label}
              x={x.toFixed(1)}
              y={y.toFixed(1)}
              textAnchor={
                Math.abs(dx) < 4 ? "middle" : dx > 0 ? "start" : "end"
              }
              fontSize={11}
              fill="var(--ink-500)"
              className="tabular"
            >
              {axis.label} {empty ? "—" : gameProfileFigure(recent[i])}
            </text>
          );
        })}
      </svg>

      {empty ? (
        <p className="text-micro" style={{ color: "var(--ink-500)" }}>
          {analyzed === 0
            ? `Serve, return and net rates add up here once one of ${name}'s matches is analyzed.`
            : "No point in these matches records a serve, return or net rate."}
        </p>
      ) : (
        <div
          aria-hidden="true"
          className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5"
        >
          <LineKey
            color="var(--viz-you)"
            label={gameProfileLegend(showFive, profile.lastMatch)}
          />
          <LineKey color="var(--viz-opp)" label="Overall" />
        </div>
      )}
    </section>
  );
}
