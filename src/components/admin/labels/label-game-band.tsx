"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  FloatMenu,
  FloatMenuItem,
  FloatMenuLabel,
} from "@/components/ui/float-menu";
import { cn } from "@/lib/utils";
import {
  gameFirstServer,
  gameTypeOf,
  livePointsOfGame,
} from "@/lib/services/labels/game-operations";
import type { LabelGame } from "@/lib/services/labels/operations";
import type { LabelGameBand as LabelGameBandScore } from "@/lib/services/labels/score";
import type {
  LabelGameType,
  LabelPoint,
  LabelSide,
} from "@/lib/services/labels/session";
import type { SideNames } from "./label-format";
import { SideMark } from "./label-row-parts";

/**
 * What one game band says, as plain data: the band draws it, and a spec can
 * read it without rendering.
 *
 * Everything is read off the game's LIVE points, the same way the scoreboard
 * and the game operations read them: the type is its first live point's, the
 * server its first live point's that names one (in a tiebreak, who serves
 * first).
 */
export interface GameBandModel {
  game: LabelGame;
  /** "Set 2", or null for a match tiebreak — it stands in place of a set. */
  setLabel: string | null;
  /** "Game 3", "Tiebreak" or "Match tiebreak". */
  gameLabel: string;
  type: LabelGameType;
  /** Games won in the set before this one, p1 first: "2–1". */
  score: string;
  server: LabelSide | null;
  /** The game's live points — what a server or type change rewrites. */
  pointCount: number;
}

export function gameBandModel(
  band: LabelGameBandScore,
  points: readonly LabelPoint[],
): GameBandModel {
  const game = { setNumber: band.setNumber, gameNumber: band.gameNumber };
  const live = livePointsOfGame(points, game);
  const type = gameTypeOf(live);
  return {
    game,
    setLabel: type === "match_tiebreak" ? null : `Set ${band.setNumber}`,
    gameLabel:
      type === "game" ? `Game ${band.gameInSet}` : GAME_TYPE[type].label,
    type,
    score: band.gamesBefore,
    server: gameFirstServer(live),
    pointCount: live.length,
  };
}

/** "<player> serves" — "serves first" in a tiebreak, where the serve rotates. */
export function gameBandServes(model: GameBandModel, names: SideNames): string {
  if (!model.server) return "No server";
  return `${names[model.server]} ${model.type === "game" ? "serves" : "serves first"}`;
}

const GAME_TYPE: Record<LabelGameType, { label: string; description: string }> =
  {
    game: { label: "Game", description: "Points to 4, deuce at 40–40" },
    tiebreak: {
      label: "Tiebreak",
      description:
        "First to 7, win by 2. Server rotates 1-2-2 from the first server",
    },
    match_tiebreak: {
      label: "Match tiebreak",
      description: "First to 10, win by 2, in place of a deciding set",
    },
  };

const GAME_TYPE_ORDER: readonly LabelGameType[] = [
  "game",
  "tiebreak",
  "match_tiebreak",
];

export interface GameBandMenuRow {
  key: string;
  label: string;
  description?: string;
  chosen: boolean;
  /** Does nothing on the chosen row: the game already is that. */
  run: () => void;
}

/**
 * The band's two menus as plain data — the game-type menu (Game / Tiebreak /
 * Match tiebreak) and the server menu (both players). Picking a row that is
 * not the current one hands the request to the console; nothing is written
 * here.
 */
export function gameBandMenus(
  model: GameBandModel,
  names: SideNames,
  handlers: {
    onSetGameType: (game: LabelGame, type: LabelGameType) => void;
    onSetGameServer: (game: LabelGame, server: LabelSide) => void;
  },
): { type: GameBandMenuRow[]; server: GameBandMenuRow[] } {
  const n = model.pointCount;
  const consequence =
    model.type === "game"
      ? n === 1
        ? "Changes the server on its 1 point and recalculates the scores after it"
        : `Changes the server on all ${n} points and recalculates the scores after them`
      : `Rotates the serve 1-2-2 from this player across ${
          n === 1 ? "its 1 point" : `all ${n} points`
        } and recalculates the scores`;
  return {
    type: GAME_TYPE_ORDER.map((type) => ({
      key: type,
      label: GAME_TYPE[type].label,
      description: GAME_TYPE[type].description,
      chosen: type === model.type,
      run: () => {
        if (type !== model.type) handlers.onSetGameType(model.game, type);
      },
    })),
    server: (["p1", "p2"] as const).map((side) => ({
      key: side,
      label: names[side],
      description: side === model.server ? undefined : consequence,
      chosen: side === model.server,
      run: () => {
        if (side !== model.server) handlers.onSetGameServer(model.game, side);
      },
    })),
  };
}

const LABEL_TEXT =
  "font-mono text-[11px] leading-none tracking-[1.4px] uppercase";
const META_TEXT = "font-mono text-[11px] leading-none tabular-nums";

/**
 * A game band — board 08g's `.gG`: the grey rule drawn above the first live
 * point of each `(set_number, game_number)`.
 *
 * Left, "Set N ·" and what the game is ("Game M", M being its rank in the
 * set, or "Tiebreak" / "Match tiebreak"); right, the set's games before it
 * and who serves. With both callbacks, the game's name and its server are
 * text-button triggers, each opening a `FloatMenu`: the game-type menu and
 * the server menu. Without them — a read-only console — the band is text.
 *
 * Stateless: the two menus keep their own open state (`BandMenu`), so a spec
 * can read the band by walking the element tree. Changing a game here is a
 * REQUEST to the console, which owns the write; moving ONE point to another
 * game stays in that point's ⋯ menu.
 */
export function LabelGameBand({
  band,
  points,
  names,
  first = false,
  onSetGameType,
  onSetGameServer,
}: {
  band: LabelGameBandScore;
  points: readonly LabelPoint[];
  names: SideNames;
  /** The first thing under the header: no gap above it. */
  first?: boolean;
  /** Both absent: no menus, the band only reads. */
  onSetGameType?: (game: LabelGame, type: LabelGameType) => void;
  onSetGameServer?: (game: LabelGame, server: LabelSide) => void;
}) {
  const model = gameBandModel(band, points);
  const serves = gameBandServes(model, names);
  const menus =
    onSetGameType && onSetGameServer
      ? gameBandMenus(model, names, { onSetGameType, onSetGameServer })
      : null;
  const mark = (
    <SideMark
      side={model.server}
      names={names}
      size={18}
      attr="data-player-mark"
    />
  );
  return (
    <div
      data-game-band={`${band.setNumber}-${band.gameNumber}`}
      data-game-type={model.type}
      // Full-bleed across the table's 24px inset; 52px puts the label over the
      // Won column and leaves a trigger's own 8px inside it.
      className={cn(
        "-mx-6 flex h-9 items-center justify-between bg-[var(--surface-subtle)] px-[52px]",
        !first && "mt-4",
      )}
    >
      <span className="flex items-center gap-0.5">
        {model.setLabel ? (
          <span className={cn(LABEL_TEXT, "text-[var(--ink-500)]")}>
            {model.setLabel} ·
          </span>
        ) : null}
        {menus ? (
          <BandMenu
            kind="type"
            name={`Game type: ${model.gameLabel}`}
            menuLabel="Game type"
            align="start"
            rows={menus.type}
            textClassName={LABEL_TEXT}
          >
            {model.gameLabel}
          </BandMenu>
        ) : (
          <span className={cn(LABEL_TEXT, "px-2 text-[var(--ink-700)]")}>
            {model.gameLabel}
          </span>
        )}
      </span>
      <span className="flex items-center gap-0.5">
        <span className={cn(META_TEXT, "text-[var(--ink-500)]")}>
          {model.score} ·
        </span>
        {menus ? (
          <BandMenu
            kind="server"
            name={
              model.server ? `Server: ${names[model.server]}` : "Server: none"
            }
            menuLabel={`Who serves ${model.gameLabel}`}
            caption={
              model.type === "game" ? "Serving this game" : "Serving first"
            }
            align="end"
            rows={menus.server}
            textClassName={cn(META_TEXT, "pl-1")}
          >
            {mark}
            {serves}
          </BandMenu>
        ) : (
          <span
            className={cn(
              META_TEXT,
              "flex items-center gap-1.5 pr-2 pl-1 text-[var(--ink-700)]",
            )}
          >
            {mark}
            {serves}
          </span>
        )}
      </span>
    </div>
  );
}

/** One of the band's triggers and its menu — board 08g's `.btrig` + `.bmenu`. */
function BandMenu({
  kind,
  name,
  menuLabel,
  caption,
  align,
  rows,
  textClassName,
  children,
}: {
  kind: "type" | "server";
  /** The trigger's accessible name: what it is, and what it is set to. */
  name: string;
  menuLabel: string;
  caption?: string;
  align: "start" | "end";
  rows: readonly GameBandMenuRow[];
  textClassName: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <FloatMenu
      open={open}
      onOpenChange={setOpen}
      align={align}
      sideOffset={6}
      width={290}
      label={menuLabel}
      trigger={
        <button
          type="button"
          aria-label={name}
          aria-haspopup="menu"
          aria-expanded={open}
          data-game-menu={kind}
          className={cn(
            "flex h-[26px] cursor-pointer items-center gap-1.5 rounded-[6px] px-2 transition-[color,background-color,box-shadow] duration-[var(--duration-hover)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
            textClassName,
            open
              ? "bg-[var(--surface-card)] text-[var(--ink-900)] shadow-[0_0_0_1px_var(--border-hairline)]"
              : "text-[var(--ink-700)] hover:bg-[var(--surface-card)] hover:text-[var(--ink-900)]",
          )}
        >
          {children}
          <ChevronDown
            className={cn(
              "size-2.5 shrink-0",
              open ? "text-[var(--ink-900)]" : "text-[var(--ink-400)]",
            )}
            strokeWidth={1.5}
            aria-hidden="true"
          />
        </button>
      }
    >
      {caption ? <FloatMenuLabel>{caption}</FloatMenuLabel> : null}
      {rows.map((row) => (
        <FloatMenuItem
          key={row.key}
          label={row.label}
          description={row.description}
          chosen={row.chosen}
          onSelect={() => {
            setOpen(false);
            row.run();
          }}
        />
      ))}
    </FloatMenu>
  );
}
