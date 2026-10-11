import { type AskTagOptions, askOpponentKey } from "@/lib/data/ask-tags";
import { formatAskCell } from "@/lib/services/ask/answer-render";
import type { AskPromptTag } from "@/lib/services/ask/prompts";

/**
 * Re-resolve the tags a question arrived with against the viewer's own
 * matches (design "Data flow for one question", step 2; plan step 7).
 *
 * A tag from the browser is `{ kind, id }` and nothing more: a match tag's id
 * is a match id, an opponent tag's id is `askOpponentKey(name)`. It is looked
 * up here in the options the server built for this viewer
 * (`getAskTagOptions()`, the same rows `ask.matches` holds), and everything
 * the model and the saved question get — the opponent's name, the match's
 * date, the ids an opponent tag stands for — is taken from those rows. A
 * label or a name sent with the request is never read, so a tag cannot put
 * text into the prompt or a stranger's match into an answer. An id that is
 * not the viewer's refuses the whole question rather than being dropped: a
 * question answered without one of its tags is a different question.
 *
 * Pure: options in, tags out. `tests/ask-orchestration.spec.ts` pins it.
 */

export type AskTagKind = "match" | "opponent";

/** A tag as `POST /api/ask` receives it. Anything else on it is ignored. */
export interface AskTagRequest {
  kind: AskTagKind;
  id: string;
}

/** A tag as it is saved with the question — what the thread's chips show. */
export interface AskSavedTag {
  kind: AskTagKind;
  id: string;
  label: string;
}

export interface AskResolvedTags {
  /** For `buildPlanPrompt()`. */
  prompt: AskPromptTag[];
  /** For `ask_save_exchange()`'s question. */
  saved: AskSavedTag[];
  /** Every match the tags name, each once. */
  matchIds: string[];
}

export type AskTagResolution =
  { ok: true; tags: AskResolvedTags } | { ok: false; reason: string };

/** Tags beyond this many on one question are refused; the composer offers far fewer. */
export const MAX_ASK_TAGS = 10;

/** The chip text for a match tag: "Sep 14, 2026 · Anna Lee", from the rows. */
function matchLabel(playedOn: string | null, opponentName: string | null) {
  const date = playedOn ? formatAskCell("played_on", playedOn) : null;
  return `${date ?? "Undated"} · ${opponentName ?? "Opponent"}`;
}

export function resolveAskTags(
  requested: readonly AskTagRequest[],
  options: AskTagOptions,
): AskTagResolution {
  if (requested.length > MAX_ASK_TAGS) {
    return {
      ok: false,
      reason: `A question can carry at most ${MAX_ASK_TAGS} tags.`,
    };
  }

  const prompt: AskPromptTag[] = [];
  const saved: AskSavedTag[] = [];
  const matchIds = new Set<string>();
  const seen = new Set<string>();

  for (const tag of requested) {
    if (
      (tag.kind !== "match" && tag.kind !== "opponent") ||
      typeof tag.id !== "string" ||
      tag.id.trim() === ""
    ) {
      return { ok: false, reason: "A tag must name a match or an opponent." };
    }

    if (tag.kind === "match") {
      const option = options.matches.find((match) => match.matchId === tag.id);
      if (!option) {
        return { ok: false, reason: "That match is not one of yours." };
      }
      if (seen.has(`match:${option.matchId}`)) continue;
      seen.add(`match:${option.matchId}`);
      prompt.push({
        kind: "match",
        matchId: option.matchId,
        opponentName: option.opponentName,
        playedOn: option.playedOn,
      });
      saved.push({
        kind: "match",
        id: option.matchId,
        label: matchLabel(option.playedOn, option.opponentName),
      });
      matchIds.add(option.matchId);
      continue;
    }

    // The option's id is already `askOpponentKey(name)`; the request's id is
    // passed through the same rule so a key spelled differently in transit
    // still meets the row it came from, and so the matches an opponent tag
    // stands for are grouped by the rule that built the option.
    const key = askOpponentKey(tag.id);
    const option = key
      ? options.opponents.find((opponent) => opponent.id === key)
      : undefined;
    if (!option || !key) {
      return { ok: false, reason: "That opponent is not one of yours." };
    }
    if (seen.has(`opponent:${key}`)) continue;
    seen.add(`opponent:${key}`);
    const theirMatches = options.matches
      .filter((match) => askOpponentKey(match.opponentName) === key)
      .map((match) => match.matchId);
    prompt.push({
      kind: "opponent",
      opponentName: option.name,
      matchIds: theirMatches,
    });
    saved.push({ kind: "opponent", id: option.id, label: option.name });
    for (const id of theirMatches) matchIds.add(id);
  }

  return { ok: true, tags: { prompt, saved, matchIds: [...matchIds] } };
}
