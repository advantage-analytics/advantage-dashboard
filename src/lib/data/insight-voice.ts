import { surnameLabels } from "@/lib/data/match-utils";

/**
 * Which wording of an Advantage Intelligence summary a page shows.
 *
 * `generate-insights` writes every player's summary twice. `summary` speaks
 * TO the player ("You won 67% of second-serve points…"). `observer_summary`
 * says the same thing ABOUT them, for anyone else, with `[PLAYER]` and
 * `[OPPONENT]` where the names go — the model never writes a name, so the
 * prompt stays name-free and a renamed player is never stale in prose.
 *
 * Who reads which:
 *
 * | Reader                                             | Voice    |
 * | -------------------------------------------------- | -------- |
 * | The player the report is turned to (either seat)   | player   |
 * | A coach, staff or third teammate on a team match   | observer |
 * | An admin on `/admin/matches/[matchId]`             | observer |
 * | Anyone on a share link, the sharer included        | observer |
 * | The sample match                                   | player   |
 *
 * A practice set between two teammates is two summaries, one per seat. Each
 * teammate opens the report turned to their own seat and is spoken to; their
 * coach gets seat one's summary in the observer voice, where `[OPPONENT]` is
 * the teammate's name, not "your opponent".
 *
 * The share link is observer even for the player who made it: the page is
 * one URL read signed out, and it has to read the same for everyone.
 */
export type InsightVoice = "player" | "observer";

/** One seat's `matches.insights` entry, as far as the summary goes. */
export interface InsightSummaryFields {
  summary?: string | null;
  observer_summary?: string | null;
}

const PLAYER_TOKEN = "[PLAYER]";
const OPPONENT_TOKEN = "[OPPONENT]";

/**
 * A name in place of every `token`, with its first letter raised where it
 * opens a sentence. Names are typed by users and some arrive lowercase; the
 * report card splits a summary where a capital follows a full stop
 * (`splitInsight`), so a lowercase name there would glue the claim to its
 * evidence.
 */
function fill(text: string, token: string, name: string): string {
  let out = "";
  let from = 0;
  for (;;) {
    const at = text.indexOf(token, from);
    if (at === -1) return out + text.slice(from);
    out += text.slice(from, at);
    const opensSentence = /(?:^|[.!?]\s+)$/.test(out);
    out += opensSentence ? name.charAt(0).toUpperCase() + name.slice(1) : name;
    from = at + token.length;
  }
}

/**
 * The observer summary with the match's names in it, or null when the match
 * has none (it was summarised before the observer voice existed) or a name
 * is blank. Names are the labels the report's cards already print
 * (`surnameLabels`): surnames, told apart when two players share one.
 */
export function observerSummary(
  insight: InsightSummaryFields | null | undefined,
  names: { you: string; opp: string },
): string | null {
  const text = insight?.observer_summary?.trim();
  if (!text) return null;
  const [you, opp] = surnameLabels(names.you, names.opp);
  if (!you.trim()) return null;
  if (text.includes(OPPONENT_TOKEN) && !opp.trim()) return null;
  return fill(fill(text, PLAYER_TOKEN, you.trim()), OPPONENT_TOKEN, opp.trim());
}

/**
 * The summary a page shows for `voice`, or null for no card text.
 *
 * `observerFallback` is what an observer gets from a match that has no
 * observer text yet. `"player"` keeps the old wording rather than taking the
 * summary away from a coach who has always had it; `"none"` is for the share
 * link, where "you" spoken to a stranger is the thing being fixed.
 */
export function insightSummaryFor(
  insight: InsightSummaryFields | null | undefined,
  voice: InsightVoice,
  names: { you: string; opp: string },
  observerFallback: "player" | "none" = "player",
): string | null {
  const own = insight?.summary?.trim() || null;
  if (voice === "player") return own;
  return (
    observerSummary(insight, names) ??
    (observerFallback === "player" ? own : null)
  );
}
