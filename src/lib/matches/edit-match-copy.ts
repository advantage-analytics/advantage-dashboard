/**
 * The Edit Match dialog's sentences, pure — the header's event line (E1), the
 * closing format line, and the result under the score. Kept apart from the
 * component so the wording is tested once and can't drift between states.
 */

import { setWinner } from "@/components/dashboard/matches/new-match-wizard/score-state";
import { formatClock } from "@/components/dashboard/matches/new-match-wizard/utils";
import { formatShortDate } from "@/lib/ui/date-format";
import { lineName } from "@/lib/schedule/attach-line-state";
import { capitalize } from "@/lib/utils";

export interface EventLineFacts {
  eventName: string;
  eventKind: "dual" | "tournament";
  slot: string | null;
  round: string | null;
  /** YYYY-MM-DD. */
  date: string;
  surface: string | null;
}

/** The last word of a name — "Stepanov" from "Ilya Stepanov". */
export const surname = (name: string) =>
  name.trim().split(/\s+/).pop() || name.trim();

/** A calendar day read as that day, whatever the viewer's timezone. */
export function dayLabel(day: string): string {
  const d = /^(\d{4}-\d{2}-\d{2})/.exec(day)?.[1];
  if (!d) return formatShortDate(day);
  const [y, m, dd] = d.split("-").map(Number);
  return new Date(y, m - 1, dd).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** "Singles 2 · UCLA vs Berkeley · Jan 31, 2025 · Indoor hard". */
export function eventContextLine(facts: EventLineFacts): string {
  return [
    lineName(facts),
    facts.eventName,
    dayLabel(facts.date),
    facts.surface ? capitalize(facts.surface) : null,
  ]
    .filter((part): part is string => !!part)
    .join(" · ");
}

/**
 * "Your changes to the date and round won't be saved — the tournament sets
 * them." Said once a line is picked, when details edited before picking are
 * about to be dropped; null when nothing edited would be lost.
 */
export function droppedDetailsLine(
  changed: readonly string[],
  eventKind: "dual" | "tournament",
): string | null {
  if (changed.length === 0) return null;
  const list =
    changed.length === 1
      ? changed[0]
      : `${changed.slice(0, -1).join(", ")} and ${changed[changed.length - 1]}`;
  const them = changed.length === 1 ? "it" : "them";
  return `Your changes to the ${list} won't be saved — the ${eventKind} sets ${them}.`;
}

export interface FormatFacts {
  bestOf: number | null;
  adScoring: boolean | null;
  playOnLets: boolean | null;
}

/** "best of 3, no-ad, play on lets" — the parts that are known. */
export function formatPhrase(f: FormatFacts): string {
  return [
    f.bestOf ? `best of ${f.bestOf}` : null,
    f.adScoring === null ? null : f.adScoring ? "ad" : "no-ad",
    f.playOnLets === null
      ? null
      : f.playOnLets
        ? "play on lets"
        : "replay lets",
  ]
    .filter((part): part is string => !!part)
    .join(", ");
}

/**
 * The closing line under the form.
 *
 * - analyzed video: "Analyzed as best of 3, no-ad, play on lets · 1:18 of video"
 * - imported file:  "Imported as best of 3, no-ad"
 * - on a line, no video: "Played as best of 3, no-ad" (the match keeps its own
 *   format when it joins a line, so this never claims the event set it)
 * - otherwise null — a hand-scored one-off edits its format in Details.
 */
export function formatLine(input: {
  format: FormatFacts;
  analyzed: "video" | "import" | null;
  linked: boolean;
  /** Milliseconds. */
  durationMs: number | null;
}): string | null {
  const phrase = formatPhrase(input.format);
  if (input.analyzed === "video") {
    const clip =
      input.durationMs && input.durationMs > 0
        ? ` · ${formatClock(input.durationMs / 1000)} of video`
        : "";
    return `Analyzed as ${phrase || "entered"}${clip}`;
  }
  if (input.analyzed === "import") {
    return phrase ? `Imported as ${phrase}` : null;
  }
  if (input.linked) {
    return phrase ? `Played as ${phrase}` : null;
  }
  return null;
}

/**
 * "Stepanov wins 6-4, 6-7, 6-3" — from the winner's side, surname only, or
 * null while no set is finished. A match nobody has won yet names the sets
 * each side has taken instead.
 */
export function resultLine(input: {
  playerName: string;
  opponentName: string;
  player: readonly (number | null)[];
  opponent: readonly (number | null)[];
  bestOf: number;
}): string | null {
  let p = 0;
  let o = 0;
  const sets: [number, number][] = [];
  for (let i = 0; i < input.player.length; i++) {
    const a = input.player[i];
    const b = input.opponent[i];
    if (a == null || b == null) break;
    const w = setWinner(a, b);
    if (!w) break;
    if (w === "player") p++;
    else o++;
    sets.push([a, b]);
  }
  if (sets.length === 0) return null;
  const toWin = Math.ceil(input.bestOf / 2);
  if (p >= toWin || o >= toWin) {
    const playerWon = p > o;
    const who = surname(playerWon ? input.playerName : input.opponentName);
    const score = sets
      .map(([a, b]) => (playerWon ? `${a}-${b}` : `${b}-${a}`))
      .join(", ");
    return `${who} wins ${score}`;
  }
  if (p === o) return `One set each`;
  const leader = surname(p > o ? input.playerName : input.opponentName);
  return `${leader} leads ${Math.max(p, o)}–${Math.min(p, o)} in sets`;
}
