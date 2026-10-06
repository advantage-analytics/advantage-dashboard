"use client";

import { useMemo, useState } from "react";
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

/**
 * The points rail's game header, as `LIST_TONE.light` draws it on the match
 * Video tab (`film/point-list.tsx`: `gameHeader` / `gameLabel` / `gameMeta`).
 * Copied, not imported — the rail keeps its tones private — so a change there
 * is a change here too.
 *
 * `-mx-3` is the one addition: the rail's header and rows share an inset, and
 * here a point row bleeds out of the table's content box so its own content
 * starts on that box's edge. Pulling the band out by its `px-3` puts its label
 * on that same edge, over the rows' first column.
 */
const BAND_LABEL = "mono text-[9px] tracking-[1.4px] uppercase";
const BAND_META = "mono tabular text-[10px]";

/**
 * The paint of each tone. `light` is the table's (above); `dark` is the
 * black view's rail — `LIST_TONE.dark`'s game header on the row's own 14px
 * inset, the frame's `.bk-gl` / `.bk-gm` inks, and the trigger on the dark
 * surface (board 08l's `.bk-gh`). Words, data attributes and menus are the
 * same in both.
 */
const TONE: Record<
  FloatMenuTone,
  {
    band: string;
    labelInk: string;
    metaInk: string;
    trigger: string;
    triggerOpen: string;
    triggerRest: string;
    chevron: (open: boolean) => string;
    chevronStroke: number;
  }
> = {
  light: {
    band: "-mx-3 flex items-center px-3 pt-3 pb-[5px]",
    labelInk: "text-[var(--ink-400)]",
    metaInk: "text-[var(--ink-400)]",
    trigger:
      "-my-1 flex h-[22px] cursor-pointer items-center gap-1 rounded-[6px] px-1.5 transition-[color,background-color,box-shadow] duration-[var(--duration-hover)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
    triggerOpen:
      "bg-[var(--surface-card)] text-[var(--ink-900)] shadow-[0_0_0_1px_var(--border-hairline)]",
    triggerRest: "hover:bg-[var(--surface-subtle)] hover:text-[var(--ink-900)]",
    chevron: (open) =>
      cn(
        "size-2.5 shrink-0",
        open ? "text-[var(--ink-900)]" : "text-[var(--ink-400)]",
      ),
    chevronStroke: 1.5,
  },
  dark: {
    band: "flex items-center px-[14px] pt-[13px] pb-[5px]",
    labelInk: "text-white/45",
    metaInk: "text-white/40",
    trigger:
      "-my-1 flex h-[22px] cursor-pointer items-center gap-[5px] rounded-[6px] px-1.5 transition-[color,background-color] duration-[var(--duration-hover)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
    triggerOpen: "bg-white/[0.12] text-white",
    triggerRest: "hover:bg-white/[0.08] hover:text-white",
    chevron: () => "size-2.5 shrink-0 opacity-70",
    chevronStroke: 1.6,
  },
};

/**
 * A game band — the points rail's game header, drawn above the first live
 * point of each `(set_number, game_number)`. No ground and no rule: the
 * rows' own spacing separates the games, as it does in the rail.
 *
 * Left, "Set N · Game M" (M being the game's rank in the set), or
 * "Set N · Tiebreak" / "Match tiebreak"; right, the set's games before it
 * and who serves. With both callbacks, the game's name and its server are
 * text-button triggers in that same type, each opening a `FloatMenu`: the
 * game-type menu and the server menu. Without them — a read-only console —
 * the band is the same text with no buttons.
 *
 * Stateless: the two menus keep their own open state (`BandMenu`), so a spec
 * can read the band by walking the element tree. Changing a game here is a
 * REQUEST to the console, which owns the write; moving ONE point to another
 * game stays in that point's ⋯ menu.
 *
 * `tone="dark"` is the black view's rail (`TONE.dark`): the same band, word
 * for word, on the dark surface.
 */
export function LabelGameBand({
  band,
  points,
  names,
  onSetGameType,
  onSetGameServer,
  tone = "light",
  menu = tone,
}: {
  band: LabelGameBandScore;
  points: readonly LabelPoint[];
  names: SideNames;
  /** Both absent: no menus, the band only reads. */
  onSetGameType?: (game: LabelGame, type: LabelGameType) => void;
  onSetGameServer?: (game: LabelGame, server: LabelSide) => void;
  tone?: FloatMenuTone;
  /**
   * The two menus' tone when it is not the band's: the rail on a light
   * ground keeps the band's rail paint but opens light menus
   * (`label-rail-tone.ts`).
   */
  menu?: FloatMenuTone;
}) {
  const paint = TONE[tone];
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
      className={paint.band}
    >
      {menus ? (
        <span className="flex items-center">
          {model.setLabel ? (
            <span className={cn(BAND_LABEL, paint.labelInk)}>
              {model.setLabel} ·
            </span>
          ) : null}
          <BandMenu
            kind="type"
            name={`Game type: ${model.gameLabel}`}
            menuLabel="Game type"
            align="start"
            rows={menus.type}
            tone={tone}
            menu={menu}
            ink={paint.labelInk}
            // With no set before it, the trigger's text starts the band.
            className={cn(BAND_LABEL, !model.setLabel && "-ml-1.5")}
          >
            {model.gameLabel}
          </BandMenu>
        </span>
      ) : (
        <span className={cn(BAND_LABEL, paint.labelInk)}>
          {model.setLabel ? `${model.setLabel} · ` : ""}
          {model.gameLabel}
        </span>
      )}
      {/* The rail's spacer. A span, so the band stays one flat <div>. */}
      <span className="flex-1" />
      {menus ? (
        <span className="flex items-center">
          <span className={cn(BAND_META, paint.metaInk)}>{model.score} ·</span>
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
            tone={tone}
            menu={menu}
            ink={paint.metaInk}
            className={cn(BAND_META, "-mr-1.5")}
          >
            {serves}
          </BandMenu>
        </span>
      ) : (
        <span className={cn(BAND_META, paint.metaInk)}>
          {model.score} · {serves}
        </span>
      )}
    </div>
  );
}

/**
 * One of the band's triggers and its menu — board 08g's `.btrig` + `.bmenu`.
 *
 * The trigger is 22px tall for the pointer and takes 14px of the band
 * (`-my-1`), so a band with menus is exactly as tall as one without — and as
 * the rail's header.
 */
function BandMenu({
  kind,
  name,
  menuLabel,
  caption,
  align,
  rows,
  tone,
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
  tone: FloatMenuTone;
  /** The menu's own tone (the band's `menu`). */
  menu: FloatMenuTone;
  /** The trigger's resting ink — the label's or the meta's. */
  ink: string;
  /** The trigger's type — the rail's label or meta — and any edge pull. */
  className: string;
  children: React.ReactNode;
}) {
  const paint = TONE[tone];
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
            paint.trigger,
            className,
            open ? paint.triggerOpen : cn(ink, paint.triggerRest),
          )}
        >
          {children}
          <ChevronDown
            className={paint.chevron(open)}
            strokeWidth={paint.chevronStroke}
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
