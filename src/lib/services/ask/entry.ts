/**
 * How the Ask page is opened with something already tagged: the entry
 * points (docs/ask-improvement-roadmap.md, 4.6).
 *
 *   /dashboard/ask?match=<match id>
 *   /dashboard/ask?opponent=<askOpponentKey(name)>
 *   /dashboard/team/ask?match=… | ?opponent=… | ?player=<roster player id>
 *
 * "Ask about this match" on a match page, "Ask about <name>" in an
 * opponent's drawer and on a player's profile, and the command palette's
 * "Ask about …" rows all build one of these with `askEntryHref()`. The
 * route reads the parameters back with `askTagsFromQuery()`, which answers
 * only tags the page's own menu offers (`AskTagOptions`): a value that
 * names nothing taggable — someone else's match, a misspelt key, a player
 * on the personal page — is simply not a tag, never an error and never a
 * hint that the id exists.
 *
 * Pure: no React, no database.
 */

import type { AskTagOptions } from "@/lib/data/ask-tags";
import { askOpponentKey } from "@/lib/data/ask-tags";
import { askBasePath, type AskScope } from "@/lib/services/ask/scope";
import type { AskSavedTag } from "@/lib/services/ask/tags";

/** The one page parameter each kind of tag arrives as. */
export const ASK_ENTRY_PARAMS = {
  match: "match",
  opponent: "opponent",
  player: "player",
} as const;

export type AskEntry =
  | { kind: "match"; id: string }
  | { kind: "opponent"; name: string }
  | { kind: "player"; id: string };

/**
 * The Ask page of `scope` with `entry` pre-tagged, or null for an opponent
 * whose name keys nothing (`askOpponentKey` null: blank, or nobody).
 */
export function askEntryHref(scope: AskScope, entry: AskEntry): string | null {
  const base = askBasePath(scope);
  if (entry.kind === "match") {
    return `${base}?${ASK_ENTRY_PARAMS.match}=${encodeURIComponent(entry.id)}`;
  }
  if (entry.kind === "player") {
    if (scope.kind !== "team") return null;
    return `${base}?${ASK_ENTRY_PARAMS.player}=${encodeURIComponent(entry.id)}`;
  }
  const key = askOpponentKey(entry.name);
  if (key === null) return null;
  return `${base}?${ASK_ENTRY_PARAMS.opponent}=${encodeURIComponent(key)}`;
}

function one(value: string | string[] | undefined): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

/**
 * The tags a page's search params name, each resolved against `options`
 * and labelled as the menu would label it; at most one of each kind, in
 * the menu's own order (player, opponent, match). Empty for anything that
 * resolves to nothing.
 */
export function askTagsFromQuery(
  params: Record<string, string | string[] | undefined>,
  options: AskTagOptions,
  scope: AskScope,
): AskSavedTag[] {
  const tags: AskSavedTag[] = [];

  const playerId = one(params[ASK_ENTRY_PARAMS.player]);
  if (playerId && scope.kind === "team") {
    const player = options.players.find((option) => option.id === playerId);
    if (player)
      tags.push({ kind: "player", id: player.id, label: player.name });
  }

  const opponentKey = one(params[ASK_ENTRY_PARAMS.opponent]);
  if (opponentKey) {
    const opponent = options.opponents.find(
      (option) => option.id === opponentKey,
    );
    if (opponent) {
      tags.push({ kind: "opponent", id: opponent.id, label: opponent.name });
    }
  }

  const matchId = one(params[ASK_ENTRY_PARAMS.match]);
  if (matchId) {
    const match = options.matches.find((option) => option.matchId === matchId);
    if (match) {
      tags.push({
        kind: "match",
        id: match.matchId,
        label: askMatchTagLabel(match),
      });
    }
  }

  return tags;
}

/**
 * The chip a match tag wears when it arrives from a link: the opponent
 * ("vs Marcus Hale"), led by the program's player on a team match — the
 * starters' own wording (`starters.ts`), so a chip reads the same whoever
 * put it there.
 */
export function askMatchTagLabel(
  match: Pick<AskTagOptions["matches"][number], "opponentName" | "playerName">,
): string {
  const opponent = match.opponentName ? `vs ${match.opponentName}` : "a match";
  return match.playerName ? `${match.playerName} ${opponent}` : opponent;
}
