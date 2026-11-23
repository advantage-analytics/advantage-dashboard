"use client";

import { Brain, GalleryHorizontalEnd, UserRound } from "lucide-react";
import {
  ChosenCheck,
  FloatMenu,
  FloatMenuLabel,
} from "@/components/ui/float-menu";
import type {
  AskMatchOption,
  AskOpponentOption,
  AskPlayerOption,
  AskTagOptions,
} from "@/lib/data/ask-tags";
import { PERSONAL_ASK_SCOPE, type AskScope } from "@/lib/services/ask/scope";
import { cn } from "@/lib/utils";
import { PERSONAL_ASK_COPY, askCopy } from "./ask-copy";
import type { AskTag } from "./use-ask-stream";

/**
 * What `@` opens in the Ask composer: the player's opponents and matches, in
 * that order, narrowed by whatever follows the `@`. On the team page the
 * program's players lead, in the same menu — one list, one place to type.
 *
 * A listbox, not a menu. Focus never enters it — the player is still typing
 * their question — so the composer's textarea owns the keyboard and names the
 * active row through `aria-activedescendant`; this file draws the rows and
 * reports a click. The surface, its inset and its group labels are
 * `FloatMenu`'s; the rows are `role="option"` and cannot be `FloatMenuItem`
 * (a `<button role="menuitem">` that takes focus), so they copy its geometry
 * the way `settings/teams/conference-select.tsx` does.
 *
 * Opponents and matches, and players where there is a roster to name
 * (`AskTagOptions.players` is empty on the personal page, so that group is
 * never drawn there). The artboard's "Groups" ("Left-handed opponents",
 * "Last 5 matches") is left out by decision: a period or a handedness is said
 * in words and the query handles it.
 *
 * Keep this file's imports clear of `next/navigation`: it is rendered by an
 * offline component harness.
 */

// ── The text after `@` ──────────────────────────────────────────────────────

/** Past this the player is writing a sentence, not a name. */
const TAG_QUERY_MAX = 40;

export interface AskTagToken {
  /** Index of the `@` in the text. */
  start: number;
  /** What follows it, up to the caret. May hold spaces: names do. */
  query: string;
}

/**
 * The `@query` the caret is at the end of, or null when it is not in one.
 *
 * An `@` only opens a tag at the start of the text or after whitespace, so an
 * email address typed into a question is left alone. A line break ends it.
 */
export function askTagToken(text: string, caret: number): AskTagToken | null {
  const before = text.slice(0, caret);
  const start = before.lastIndexOf("@");
  if (start === -1) return null;
  if (start > 0 && !/\s/.test(before[start - 1])) return null;
  const query = before.slice(start + 1);
  if (query.includes("\n") || query.length > TAG_QUERY_MAX) return null;
  return { start, query };
}

// ── Rows ────────────────────────────────────────────────────────────────────

/** One option, as drawn. `tag` is what choosing it adds to the question. */
export interface AskTagRow {
  tag: AskTag;
  name: string;
  /** The quiet second half of the row; empty when there is nothing to add. */
  meta: string;
}

export interface AskTagRows {
  /** The program's players. Always empty on the personal page. */
  players: AskTagRow[];
  opponents: AskTagRow[];
  matches: AskTagRow[];
}

/**
 * How many rows each group shows. A season is dozens of matches and the menu
 * is a place to type a name into, not a list to scroll; the newest matches and
 * the most-played opponents lead, and typing reaches the rest.
 */
export const ASK_TAG_PLAYER_ROWS = 5;
export const ASK_TAG_OPPONENT_ROWS = 5;
export const ASK_TAG_MATCH_ROWS = 8;

/** `2026-09-28` → `Sep 28`, with the year when it is not `currentYear`. */
function playedOnLabel(playedOn: string | null, currentYear: string | null) {
  if (!playedOn) return "Undated";
  const date = new Date(`${playedOn}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return "Undated";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: playedOn.slice(0, 4) === currentYear ? undefined : "numeric",
    timeZone: "UTC",
  });
}

function matchCountLabel(matchCount: number) {
  return `${matchCount} ${matchCount === 1 ? "match" : "matches"}`;
}

function playerRow(option: AskPlayerOption): AskTagRow {
  return {
    tag: { kind: "player", id: option.id, label: option.name },
    name: option.name,
    meta: matchCountLabel(option.matchCount),
  };
}

function opponentRow(option: AskOpponentOption): AskTagRow {
  const count = matchCountLabel(option.matchCount);
  const hand =
    option.hand === "left"
      ? "Left-handed"
      : option.hand === "right"
        ? "Right-handed"
        : null;
  return {
    tag: { kind: "opponent", id: option.id, label: option.name },
    name: option.name,
    meta: hand ? `${count} · ${hand}` : count,
  };
}

/**
 * Who played a match, as its tag and its source row both say it. A team's
 * match leads with the program's own player — "Sokolov vs Dvorsky" — because
 * a coach reading a list of opponents cannot tell whose match each one was.
 * A personal match has no `playerName` and is named by the opponent alone.
 */
export function askMatchPlayers(
  match: Pick<AskMatchOption, "playerName" | "opponentName">,
): string {
  const opponent = match.opponentName ?? "Opponent";
  return match.playerName ? `${match.playerName} vs ${opponent}` : opponent;
}

function matchRow(option: AskMatchOption, currentYear: string | null) {
  const name = `${playedOnLabel(option.playedOn, currentYear)} · ${askMatchPlayers(option)}`;
  return {
    row: {
      tag: { kind: "match", id: option.matchId, label: name },
      name,
      meta: [option.tournamentName, option.scoreText]
        .filter(Boolean)
        .join(" · "),
    } satisfies AskTagRow,
    // The tournament is searchable too: "@fall open" finds the match. So is
    // the team's player, who is part of the name.
    haystack: `${name} ${option.tournamentName ?? ""}`.toLowerCase(),
  };
}

/**
 * The rows for one query: every option whose name holds the typed text, case
 * aside, capped per group. An empty query is the head of each list.
 */
export function askTagRows(options: AskTagOptions, query: string): AskTagRows {
  const needle = query.trim().toLowerCase();
  // Matches arrive newest first, so the first dated one names "this year":
  // a row from an earlier season carries its year and the rest stay short.
  const currentYear =
    options.matches.find((match) => match.playedOn)?.playedOn?.slice(0, 4) ??
    null;

  return {
    players: options.players
      .filter((option) => option.name.toLowerCase().includes(needle))
      .slice(0, ASK_TAG_PLAYER_ROWS)
      .map(playerRow),
    opponents: options.opponents
      .filter((option) => option.name.toLowerCase().includes(needle))
      .slice(0, ASK_TAG_OPPONENT_ROWS)
      .map(opponentRow),
    matches: options.matches
      .map((option) => matchRow(option, currentYear))
      .filter(({ haystack }) => haystack.includes(needle))
      .slice(0, ASK_TAG_MATCH_ROWS)
      .map(({ row }) => row),
  };
}

/** Players, opponents, then matches — the order the arrow keys walk. */
export function flatAskTagRows(rows: AskTagRows): AskTagRow[] {
  return [...rows.players, ...rows.opponents, ...rows.matches];
}

export function askTagKey(tag: Pick<AskTag, "kind" | "id">): string {
  return `${tag.kind}:${tag.id}`;
}

/** The glyph each kind of tag carries: in the menu, on a chip, in the rail. */
export const ASK_TAG_ICON = {
  player: UserRound,
  opponent: Brain,
  match: GalleryHorizontalEnd,
} as const;

const ASK_TAG_KIND_LABEL = {
  player: "Player",
  opponent: "Opponent",
  match: "Match",
} as const;

/**
 * The line under a tag's name in the rail: what kind of thing it is, then
 * what the menu says about it — "Opponent · 4 matches · Left-handed".
 *
 * Read from the same row builders as the menu, so the two cannot disagree,
 * and from every option rather than the menu's capped head. A tag the
 * options no longer hold — a saved question about a match since deleted —
 * still says what kind it was.
 */
export function askTagMeta(options: AskTagOptions, tag: AskTag): string {
  const kind = ASK_TAG_KIND_LABEL[tag.kind];
  let detail = "";
  if (tag.kind === "player") {
    const option = options.players.find((other) => other.id === tag.id);
    if (option) detail = playerRow(option).meta;
  } else if (tag.kind === "opponent") {
    const option = options.opponents.find((other) => other.id === tag.id);
    if (option) detail = opponentRow(option).meta;
  } else {
    const option = options.matches.find((other) => other.matchId === tag.id);
    if (option) detail = matchRow(option, null).row.meta;
  }
  return detail ? `${kind} · ${detail}` : kind;
}

// ── The menu ────────────────────────────────────────────────────────────────

/** The personal page's label; the team's is `askCopy(scope).tagMenuLabel`. */
export const ASK_TAG_MENU_LABEL = PERSONAL_ASK_COPY.tagMenuLabel;

export interface AskTagMenuProps {
  open: boolean;
  /** Radix asking to close: Escape, or a press outside the menu. */
  onOpenChange: (open: boolean) => void;
  /** Whose matches are being tagged: the label and the empty line follow it. */
  scope?: AskScope;
  /** The "Tag a match or opponent" button the menu opens above. */
  trigger: React.ReactElement;
  /** Id of the listbox, for the textarea's `aria-controls`. */
  listId: string;
  rows: AskTagRows;
  /** The text after `@`, for the line shown when it matches nothing. */
  query: string;
  /** Index into `flatAskTagRows(rows)` of the row the keyboard is on. */
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  optionId: (index: number) => string;
  onChoose: (row: AskTagRow) => void;
  /** `askTagKey`s already on the question; their rows carry the check. */
  chosen: ReadonlySet<string>;
}

export function AskTagMenu({
  open,
  onOpenChange,
  scope = PERSONAL_ASK_SCOPE,
  trigger,
  listId,
  rows,
  query,
  activeIndex,
  onActiveIndexChange,
  optionId,
  onChoose,
  chosen,
}: AskTagMenuProps) {
  const copy = askCopy(scope);
  // In `flatAskTagRows` order: each group's offset is the rows before it.
  const groups = [
    {
      title: "Players",
      rows: rows.players,
      offset: 0,
      icon: ASK_TAG_ICON.player,
    },
    {
      title: "Opponents",
      rows: rows.opponents,
      offset: rows.players.length,
      icon: ASK_TAG_ICON.opponent,
    },
    {
      title: "Matches",
      rows: rows.matches,
      offset: rows.players.length + rows.opponents.length,
      icon: ASK_TAG_ICON.match,
    },
  ].filter((group) => group.rows.length > 0);

  return (
    <FloatMenu
      open={open}
      onOpenChange={onOpenChange}
      trigger={trigger}
      role="listbox"
      listId={listId}
      label={copy.tagMenuLabel}
      // Above the composer: it sits at the foot of the thread, and a menu
      // opening downward there would open off the page.
      side="top"
      align="start"
      sideOffset={8}
      width={340}
      // On a phone the menu is the screen's width less the gutters; the
      // `!` beats the primitive's inline width.
      className="max-h-[min(340px,var(--radix-popover-content-available-height))] overflow-y-auto overscroll-contain max-md:w-[calc(100vw-32px)]!"
      // The caret stays in the question, opening and closing.
      onOpenAutoFocus={(event) => event.preventDefault()}
      onCloseAutoFocus={(event) => event.preventDefault()}
    >
      {groups.length === 0 ? (
        // A filter that matches nothing says so, in the menu's own row
        // geometry. Not an option: there is nothing here to choose.
        <p
          role="presentation"
          className="px-2.5 py-[7px] text-[12px] text-[var(--ink-500)]"
        >
          {query.trim() ? copy.tagNoMatch(query.trim()) : copy.tagEmpty}
        </p>
      ) : (
        groups.map((group) => {
          const labelId = `${listId}-${group.title.toLowerCase()}`;
          const Icon = group.icon;
          return (
            <div
              key={group.title}
              role="group"
              aria-labelledby={labelId}
              className="flex flex-col"
            >
              <div id={labelId}>
                <FloatMenuLabel className="pt-1.5">
                  {group.title}
                </FloatMenuLabel>
              </div>
              {group.rows.map((row, position) => {
                const index = group.offset + position;
                const active = index === activeIndex;
                return (
                  <div
                    key={askTagKey(row.tag)}
                    id={optionId(index)}
                    role="option"
                    aria-selected={active}
                    data-chosen={chosen.has(askTagKey(row.tag)) || undefined}
                    onMouseMove={() => {
                      if (!active) onActiveIndexChange(index);
                    }}
                    // Down, not click: a click would first take focus out of
                    // the textarea, and the caret is where the tag text is.
                    onMouseDown={(event) => {
                      event.preventDefault();
                      onChoose(row);
                    }}
                    className={cn(
                      // 36px rows; 40px on a phone, a finger's height.
                      "flex cursor-pointer items-center gap-2.5 rounded-[7px] px-2 py-[7px] max-md:py-[9px]",
                      active && "bg-[var(--surface-subtle)]",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "flex size-[22px] shrink-0 items-center justify-center rounded-[var(--radius-button)] text-[var(--ink-600)]",
                        // The tile is the wash's own colour, so on the active
                        // row it takes the card's instead of vanishing.
                        active
                          ? "bg-[var(--surface-card)]"
                          : "bg-[var(--surface-subtle)]",
                      )}
                    >
                      <Icon className="size-[13px]" strokeWidth={1.5} />
                    </span>
                    <span className="shrink-0 text-[12px] font-medium whitespace-nowrap text-[var(--ink-900)]">
                      {row.name}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--ink-500)] tabular-nums">
                      {row.meta}
                    </span>
                    <ChosenCheck chosen={chosen.has(askTagKey(row.tag))} />
                  </div>
                );
              })}
            </div>
          );
        })
      )}
    </FloatMenu>
  );
}
