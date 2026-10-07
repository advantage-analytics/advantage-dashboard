"use client";

import { memo, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  FloatMenu,
  FloatMenuItem,
  FloatMenuLabel,
  type FloatMenuTone,
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

/**
 * What one game band says, as plain data. Read off the game's live points: the
 * type is its first live point's, the server its first live point's that names
 * one.
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

/**
 * The points rail's game header type (`film/point-list.tsx`). Copied, not
 * imported: that rail keeps its tones private, so a change there is a change
 * here too.
 */
const BAND_LABEL = "mono text-[9px] tracking-[1.4px] uppercase";
const BAND_META = "mono tabular text-[10px]";

/** The band's paint, in the rail's palette: one paint for both grounds. */
const PAINT = {
  band: "flex items-center px-[14px] pt-[13px] pb-[5px]",
  labelInk: "text-white/45",
  metaInk: "text-white/40",
  trigger:
    "-my-1 flex h-[22px] cursor-pointer items-center gap-[5px] rounded-[6px] px-1.5 transition-[color,background-color,scale] duration-[var(--duration-hover)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none active:scale-[0.96] active:duration-100 motion-reduce:active:scale-100",
  triggerOpen: "bg-white/[0.12] text-white",
  triggerRest: "hover:bg-white/[0.08] hover:text-white",
} as const;

/**
 * A game band: the points rail's game header, above the first live point of
 * each `(set_number, game_number)`. Left, "Set N · Game M", "Set N · Tiebreak"
 * or "Match tiebreak"; right, the set's games before it and who serves. With
 * both callbacks the game's name and its server are triggers, each opening a
 * `FloatMenu`; without them the band is the same text.
 *
 * Changing a game here is a request to the console, which owns the write.
 * Memoised with the rail's rows: a band never renders for the film moving on.
 */
export const LabelGameBand = memo(function LabelGameBand({
  band,
  points,
  names,
  onSetGameType,
  onSetGameServer,
  menu = "dark",
}: {
  band: LabelGameBandScore;
  points: readonly LabelPoint[];
  names: SideNames;
  /** Both absent: no menus, the band only reads. */
  onSetGameType?: (game: LabelGame, type: LabelGameType) => void;
  onSetGameServer?: (game: LabelGame, server: LabelSide) => void;
  /** The menus' tone: portalled, so the rail's palette does not reach them. */
  menu?: FloatMenuTone;
}) {
  // The model reads every row of the game: once per band and rows, not on
  // every playback crossing.
  const model = useMemo(() => gameBandModel(band, points), [band, points]);
  const serves = gameBandServes(model, names);
  const menus =
    onSetGameType && onSetGameServer
      ? gameBandMenus(model, names, { onSetGameType, onSetGameServer })
      : null;
  return (
    <div
      data-game-band={`${band.setNumber}-${band.gameNumber}`}
      data-game-type={model.type}
      className={PAINT.band}
    >
      {menus ? (
        <span className="flex items-center">
          {model.setLabel ? (
            <span className={cn(BAND_LABEL, PAINT.labelInk)}>
              {model.setLabel} ·
            </span>
          ) : null}
          <BandMenu
            kind="type"
            name={`Game type: ${model.gameLabel}`}
            menuLabel="Game type"
            align="start"
            rows={menus.type}
            menu={menu}
            ink={PAINT.labelInk}
            // With no set before it, the trigger's text starts the band.
            className={cn(BAND_LABEL, !model.setLabel && "-ml-1.5")}
          >
            {model.gameLabel}
          </BandMenu>
        </span>
      ) : (
        <span className={cn(BAND_LABEL, PAINT.labelInk)}>
          {model.setLabel ? `${model.setLabel} · ` : ""}
          {model.gameLabel}
        </span>
      )}
      <span className="flex-1" />
      {menus ? (
        <span className="flex items-center">
          <span className={cn(BAND_META, PAINT.metaInk)}>{model.score} ·</span>
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
            menu={menu}
            ink={PAINT.metaInk}
            className={cn(BAND_META, "-mr-1.5")}
          >
            {serves}
          </BandMenu>
        </span>
      ) : (
        <span className={cn(BAND_META, PAINT.metaInk)}>
          {model.score} · {serves}
        </span>
      )}
    </div>
  );
});

/**
 * One of the band's triggers and its menu. The trigger is 22px tall for the
 * pointer and takes 14px of the band (`-my-1`), so a band with menus is exactly
 * as tall as one without.
 */
function BandMenu({
  kind,
  name,
  menuLabel,
  caption,
  align,
  rows,
  menu,
  ink,
  className,
  children,
}: {
  kind: "type" | "server";
  /** The trigger's accessible name: what it is, and what it is set to. */
  name: string;
  menuLabel: string;
  caption?: string;
  align: "start" | "end";
  rows: readonly GameBandMenuRow[];
  menu: FloatMenuTone;
  /** The trigger's resting ink — the label's or the meta's. */
  ink: string;
  /** The trigger's type — the rail's label or meta — and any edge pull. */
  className: string;
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
      tone={menu}
      label={menuLabel}
      trigger={
        <button
          type="button"
          aria-label={name}
          aria-haspopup="menu"
          aria-expanded={open}
          data-game-menu={kind}
          className={cn(
            PAINT.trigger,
            className,
            open ? PAINT.triggerOpen : cn(ink, PAINT.triggerRest),
          )}
        >
          {children}
          <ChevronDown
            className="size-2.5 shrink-0 opacity-70"
            strokeWidth={1.6}
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
