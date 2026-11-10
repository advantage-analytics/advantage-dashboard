"use client";

import { useState } from "react";
import { ArrowRightLeft } from "lucide-react";

import { ChartTooltip } from "@/components/dashboard/matches/match-detail/chart-tooltip";
import { statDisplay } from "@/components/dashboard/matches/match-detail/head-to-head-rows";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useFingerTap, useTouchReadout } from "@/hooks/use-touch-readout";
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
 * figure.
 *
 * ── Reading it (board 10, "Game profile with hover readouts") ─────────────
 * Hovering or focusing a blue vertex (a ~16px hit area) opens the DS dark
 * readout above it (`ChartTooltip`, as the report's charts): the rate, the
 * blue figure, Overall's, and how many points apart they are. While it is
 * open the axis label and spoke darken and the Overall vertex on that axis
 * gets a ring, so both points being compared are marked. On a finger a tap
 * selects a vertex and the readout stays until a tap lands outside the card
 * (`useTouchReadout` / `useFingerTap`). The legend keys both shapes as a
 * short solid line — the blue one naming the match ("Last match vs Ruiz, Nov
 * 7"), Overall with its match count; hovering or focusing a key fades the
 * other shape to a quarter and the other key to 0.4.
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
/** A vertex's hover and tap target, in plot units (the plot draws near 1:1). */
const HIT_RADIUS = 16;
/** How near an edge (plot units) a vertex's readout hangs from its own side. */
const READOUT_EDGE = 80;

/** A legend key's or shape's dimmed opacity while the other is singled out. */
const SHAPE_FADED = 0.25;
const KEY_FADED = 0.4;

const FADE = "transition-opacity duration-200 motion-reduce:transition-none";

function angleOf(axis: number): number {
  return -Math.PI / 2 + (axis * 2 * Math.PI) / GAME_PROFILE_AXES.length;
}

function point(axis: number, value: number): [number, number] {
  const r = (RADIUS * Math.max(0, Math.min(100, value))) / 100;
  return [CX + Math.cos(angleOf(axis)) * r, CY + Math.sin(angleOf(axis)) * r];
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

/**
 * The legend's blue entry: "Last match vs Ruiz, Nov 7". No middot: a segment
 * after one is sentence case (`check-design-drift.mjs`), and "Vs" reads worse
 * than the one phrase.
 */
export function gameProfileLegend(
  five: boolean,
  lastMatch: SeasonGameProfile["lastMatch"],
): string {
  if (five || !lastMatch) return gameProfileShowing(five);
  const day = lastMatch.date ? formatMatchDayShort(lastMatch.date) : "";
  return `Last match vs ${surname(lastMatch.opponent)}${day ? `, ${day}` : ""}`;
}

/** The legend's Overall entry: "Overall · 12 matches". */
export function gameProfileOverallLegend(analyzed: number): string {
  return `Overall · ${analyzed} ${analyzed === 1 ? "match" : "matches"}`;
}

/**
 * The readout's last line: how far the blue figure sits from Overall, in
 * percentage points, taken between the two figures as printed so the line
 * never disagrees with the numbers above it. `null` when either is missing.
 */
export function gameProfileDelta(
  recent: number | null,
  overall: number | null,
): string | null {
  if (recent === null || overall === null) return null;
  const delta = Math.round(recent) - Math.round(overall);
  if (delta === 0) return "Level with overall";
  const n = Math.abs(delta);
  return `${delta > 0 ? "+" : "−"}${n} ${n === 1 ? "point" : "points"} ${delta > 0 ? "above" : "below"} overall`;
}

/** Which way a vertex's readout hangs, so it stays inside the card. */
export function gameProfileReadoutAlign(x: number): "start" | "center" | "end" {
  if (x < READOUT_EDGE) return "start";
  if (x > VIEW_W - READOUT_EDGE) return "end";
  return "center";
}

type Shape = "recent" | "overall";

/**
 * A shape's key: a short solid line in its stroke colour. Both shapes key
 * the same way — each is drawn by its stroke — in the legend and in the
 * readout alike.
 */
function LineKey({ color, width = 10 }: { color: string; width?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={width}
      height={8}
      viewBox={`0 0 ${width} 8`}
      className="block shrink-0"
    >
      <line x1={0} y1={4} x2={width} y2={4} stroke={color} strokeWidth={2} />
    </svg>
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
  /** The vertex whose readout is open. */
  const [axis, setAxis] = useState<number | null>(null);
  /** The legend key singled out. */
  const [key, setKey] = useState<Shape | null>(null);
  const cardRef = useTouchReadout<HTMLElement>(axis !== null, () =>
    setAxis(null),
  );
  const fingerTap = useFingerTap();

  const canSwap = profile.lastFive !== null;
  const showFive = canSwap && five;
  const recent: GameProfileValues | null = showFive
    ? profile.lastFive
    : (profile.lastMatch?.values ?? null);
  const empty = analyzed === 0 || recent === null;
  const name = surname(playerName);
  const recentName = gameProfileShowing(showFive);
  const action = showFive
    ? "Show last match"
    : `Show last ${GAME_PROFILE_RECENT} matches`;

  const description = empty
    ? `${name}'s game profile: no analyzed match yet.`
    : `${name}'s ${recentName.toLowerCase()} against their overall: ` +
      GAME_PROFILE_AXES.map(
        (a, i) =>
          `${a.label} ${gameProfileFigure(recent[i])} (overall ${gameProfileFigure(profile.overall[i])})`,
      ).join(", ") +
      ".";

  const open = !empty && axis !== null ? axis : null;
  const openPoint =
    open !== null && recent ? point(open, recent[open] ?? 0) : null;

  return (
    <section
      ref={cardRef}
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
            {recentName}
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

      {/* The plot and its readout share one box, so the readout's anchor (a
          zero-size point at the vertex, in % of the box) tracks the SVG's
          scale. */}
      <div className="relative mx-auto w-full max-w-[420px]">
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className="block h-auto w-full overflow-visible"
          role={empty ? "img" : "group"}
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
          {GAME_PROFILE_AXES.map((a, i) => {
            const [x, y] = point(i, 100);
            return (
              <line
                key={a.label}
                x1={CX}
                y1={CY}
                x2={x}
                y2={y}
                stroke={open === i ? "var(--ink-300)" : "var(--ink-200)"}
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
                opacity={key === "recent" ? SHAPE_FADED : 1}
                className={FADE}
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
                opacity={key === "overall" ? SHAPE_FADED : 1}
                className={FADE}
              />
            </>
          )}
          {GAME_PROFILE_AXES.map((a, i) => {
            const x = CX + Math.cos(angleOf(i)) * LABEL_RADIUS;
            const y = CY + Math.sin(angleOf(i)) * LABEL_RADIUS + 4;
            const dx = x - CX;
            return (
              <text
                key={a.label}
                x={x.toFixed(1)}
                y={y.toFixed(1)}
                textAnchor={
                  Math.abs(dx) < 4 ? "middle" : dx > 0 ? "start" : "end"
                }
                fontSize={11}
                fill={open === i ? "var(--ink-900)" : "var(--ink-500)"}
                className="tabular"
                aria-hidden={empty ? undefined : true}
              >
                {a.label} {empty ? "—" : gameProfileFigure(recent[i])}
              </text>
            );
          })}
          {!empty &&
            GAME_PROFILE_AXES.map((a, i) => {
              const [rx, ry] = point(i, recent[i] ?? 0);
              const lit = open === i;
              const overall = profile.overall[i];
              const delta = gameProfileDelta(recent[i], overall);
              return (
                <g key={a.label} data-axis={i}>
                  {lit && overall !== null && (
                    <circle
                      data-testid="game-profile-overall-ring"
                      cx={point(i, overall)[0]}
                      cy={point(i, overall)[1]}
                      r={3.5}
                      fill="var(--surface-card)"
                      stroke="var(--viz-opp)"
                      strokeWidth={1.5}
                      vectorEffect="non-scaling-stroke"
                    />
                  )}
                  {recent[i] !== null && (
                    <circle
                      cx={rx}
                      cy={ry}
                      r={lit ? 4 : 2.5}
                      fill="var(--viz-you)"
                      stroke="var(--surface-card)"
                      strokeWidth={1.5}
                      vectorEffect="non-scaling-stroke"
                      // The blue shape's own vertices fade with it.
                      opacity={key === "overall" ? SHAPE_FADED : 1}
                      className={`pointer-events-none ${FADE}`}
                    />
                  )}
                  {/* The hit area: hover, focus and a finger's tap. The
                      readout is drawn `aria-hidden`, so its words are this
                      target's name too. */}
                  <circle
                    data-testid="game-profile-vertex"
                    cx={rx}
                    cy={ry}
                    r={HIT_RADIUS}
                    fill="transparent"
                    tabIndex={0}
                    role="img"
                    aria-label={`${a.label}: ${recentName} ${gameProfileFigure(recent[i])}, overall ${gameProfileFigure(overall)}${delta ? `, ${delta}` : ""}.`}
                    className="cursor-default outline-none"
                    onMouseEnter={() => setAxis(i)}
                    onMouseLeave={() => setAxis(null)}
                    onFocus={() => setAxis(i)}
                    onBlur={() => setAxis(null)}
                    onPointerDown={(e) => {
                      if (fingerTap.press(e, axis === i)) setAxis(i);
                    }}
                    onClick={() =>
                      fingerTap.click(undefined, () => setAxis(null))
                    }
                  />
                </g>
              );
            })}
        </svg>

        {/* The readout's anchor: a point at the open vertex. */}
        {openPoint && open !== null && recent && (
          <span
            className="pointer-events-none absolute size-0"
            style={{
              left: `${(openPoint[0] / VIEW_W) * 100}%`,
              top: `${(openPoint[1] / VIEW_H) * 100}%`,
            }}
          >
            <ChartTooltip
              open
              align={gameProfileReadoutAlign(openPoint[0])}
              offset={8}
              className="gap-[3px] px-[11px] py-[9px]"
            >
              <span className="text-[12px] font-medium text-white">
                {GAME_PROFILE_AXES[open].label}
              </span>
              <span className="tabular inline-flex items-center gap-1.5 text-[11px] text-white/[0.64]">
                <LineKey color="var(--viz-you-mid)" width={8} />
                {recentName} {gameProfileFigure(recent[open])}
              </span>
              <span className="tabular inline-flex items-center gap-1.5 text-[11px] text-white/[0.64]">
                <LineKey color="var(--viz-opp-mid)" width={8} />
                Overall {gameProfileFigure(profile.overall[open])}
              </span>
              {gameProfileDelta(recent[open], profile.overall[open]) && (
                <span className="tabular text-[10px] text-white/[0.64]">
                  {gameProfileDelta(recent[open], profile.overall[open])}
                </span>
              )}
            </ChartTooltip>
          </span>
        )}
      </div>

      {empty ? (
        <p className="text-micro" style={{ color: "var(--ink-500)" }}>
          {analyzed === 0
            ? `Serve, return and net rates add up here once one of ${name}'s matches is analyzed.`
            : "No point in these matches records a serve, return or net rate."}
        </p>
      ) : (
        // Each key is focusable, so a keyboard gets the same single-out as a
        // pointer; its words are the key's own, so nothing extra is announced.
        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5">
          <span
            data-testid="game-profile-key-recent"
            tabIndex={0}
            onMouseEnter={() => setKey("recent")}
            onMouseLeave={() => setKey(null)}
            onFocus={() => setKey("recent")}
            onBlur={() => setKey(null)}
            className={`-mx-1 -my-0.5 inline-flex cursor-default items-center gap-1.5 rounded px-1 py-0.5 ${FADE}`}
            style={{ opacity: key === "overall" ? KEY_FADED : 1 }}
          >
            <LineKey color="var(--viz-you)" />
            <span className="text-micro whitespace-nowrap">
              {gameProfileLegend(showFive, profile.lastMatch)}
            </span>
          </span>
          <span
            data-testid="game-profile-key-overall"
            tabIndex={0}
            onMouseEnter={() => setKey("overall")}
            onMouseLeave={() => setKey(null)}
            onFocus={() => setKey("overall")}
            onBlur={() => setKey(null)}
            className={`-mx-1 -my-0.5 inline-flex cursor-default items-center gap-1.5 rounded px-1 py-0.5 ${FADE}`}
            style={{ opacity: key === "recent" ? KEY_FADED : 1 }}
          >
            <LineKey color="var(--viz-opp)" />
            <span className="text-micro whitespace-nowrap">
              {gameProfileOverallLegend(analyzed)}
            </span>
          </span>
        </div>
      )}
    </section>
  );
}
