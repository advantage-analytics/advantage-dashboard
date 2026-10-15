/**
 * Starter questions and follow-ups: what the page offers to ask before a
 * thread exists, and under an answer once one does.
 *
 * Until now the page offered nothing to click: a title, a line and an empty
 * box, which a first visit met with "what can I even ask?". A starter is a
 * question the viewer's own data can answer — the last match by name, the
 * opponent they have played most, left-handers when there are some — built
 * from the same tag options the composer's `@` menu uses, so every tag in it
 * resolves and every question has rows behind it. Nothing here is personal
 * beyond names the viewer already sees in the menu.
 *
 * The same questions asked over and over are also what makes an answer cache
 * worth having, so the wording is fixed per situation rather than varied.
 *
 * Pure: no database, no React.
 */

import type { AskTagOptions } from "@/lib/data/ask-tags";
import type { AskScope } from "@/lib/services/ask/scope";

export interface AskStarterTag {
  kind: "match" | "opponent" | "player";
  id: string;
  label: string;
}

export interface AskStarter {
  text: string;
  tags: AskStarterTag[];
}

/** At most this many starters under the composer. */
export const MAX_ASK_STARTERS = 4;

/** At most this many follow-ups under an answer. */
export const MAX_ASK_FOLLOW_UPS = 2;

/** The composer's own label for a match tag, so the chip reads as the menu's row would. */
function matchTagLabel(match: AskTagOptions["matches"][number]): string {
  return match.opponentName ? `vs ${match.opponentName}` : "a match";
}

/**
 * The question about one match: the first personal starter, and the one Ask
 * asks on a player's behalf when their match finishes processing
 * (`arrival.ts`). One wording, so the arrival answer sits in the answer
 * cache under the key the starter's click computes.
 */
export function askMatchStarter(
  match: AskTagOptions["matches"][number],
): AskStarter {
  return {
    text: match.opponentName
      ? `How did my match against ${match.opponentName} go?`
      : "How did my last match go?",
    tags: [{ kind: "match", id: match.matchId, label: matchTagLabel(match) }],
  };
}

/**
 * Up to `MAX_ASK_STARTERS` questions for a scope with at least one match.
 * Ordered so the one every viewer can use comes first.
 */
export function askStarters(
  options: AskTagOptions,
  scope: AskScope,
): AskStarter[] {
  const starters: AskStarter[] = [];
  const matches = options.matches;
  if (matches.length === 0) return starters;
  // `getPersonalMatches()` and the team read order by date, newest first.
  const last = matches[0];

  if (scope.kind === "team") {
    starters.push({ text: "What is each player's record?", tags: [] });
    if (last.opponentName) {
      starters.push({
        text: `How did we do against ${last.opponentName}?`,
        tags: [{ kind: "match", id: last.matchId, label: matchTagLabel(last) }],
      });
    }
    const busiest = [...options.players].sort(
      (a, b) => b.matchCount - a.matchCount,
    )[0];
    if (busiest && busiest.matchCount >= 2) {
      starters.push({
        text: `How is ${busiest.name} playing this season?`,
        tags: [{ kind: "player", id: busiest.id, label: busiest.name }],
      });
    }
    starters.push({ text: "Who has the best first serve?", tags: [] });
    return starters.slice(0, MAX_ASK_STARTERS);
  }

  starters.push(askMatchStarter(last));

  // The opponent played most, with the record against them deciding the
  // question's angle. A single match is a match, not a pattern.
  const played = new Map<string, { wins: number; losses: number }>();
  for (const match of matches) {
    if (!match.opponentName) continue;
    const record = played.get(match.opponentName) ?? { wins: 0, losses: 0 };
    if (match.iWon === true) record.wins += 1;
    if (match.iWon === false) record.losses += 1;
    played.set(match.opponentName, record);
  }
  const rival = [...options.opponents].sort(
    (a, b) => b.matchCount - a.matchCount,
  )[0];
  if (rival && rival.matchCount >= 2) {
    const record = played.get(rival.name);
    const losing = record !== undefined && record.losses > record.wins;
    starters.push({
      text: losing
        ? `Why do I lose to ${rival.name}?`
        : `How do my matches against ${rival.name} go?`,
      tags: [{ kind: "opponent", id: rival.id, label: rival.name }],
    });
  }

  const lefties = options.opponents.filter(
    (opponent) => opponent.hand === "left",
  );
  if (lefties.reduce((sum, opponent) => sum + opponent.matchCount, 0) >= 2) {
    starters.push({
      text: "What is my record against left-handers?",
      tags: [],
    });
  }

  if (matches.length >= 3) {
    starters.push({
      text: "How is my serve holding up this season?",
      tags: [],
    });
    starters.push({
      text: "How can I improve for my next match?",
      tags: [],
    });
  }

  return starters.slice(0, MAX_ASK_STARTERS);
}

/**
 * Up to `MAX_ASK_FOLLOW_UPS` questions to ask next, from what the last
 * question was about. Fixed wordings the planner is known to handle: a
 * follow-up that changes only the filter keeps the earlier scope
 * (`ASK_FOLLOW_UP_KEEPS_COLUMNS` in prompts.ts), so these can be short.
 */
export function askFollowUps(question: string, scope: AskScope): AskStarter[] {
  const text = question.toLowerCase();
  const team = scope.kind === "team";
  const we = team ? "the team" : "I";
  const my = team ? "the team's" : "my";
  const picks: string[] = [];

  if (/\bserv(e|es|ing)\b/.test(text) && !/second serve/.test(text)) {
    picks.push("And on second serves?");
  }
  if (/\breturn/.test(text)) {
    picks.push("And against first serves?");
  }
  if (/\b(lose|lost|losing|beat|against|versus|vs)\b/.test(text)) {
    picks.push(
      team
        ? "What are the losing plays in those matches?"
        : "What are my losing plays against them?",
    );
  }
  if (
    /\b(record|win|won|wins)\b/.test(text) &&
    !/clay|hard|surface/.test(text)
  ) {
    picks.push(`Am ${we === "I" ? "I" : "we"} better on hard courts or clay?`);
  }
  if (/\b(improve|work on|practise|practice|fix)\b/.test(text)) {
    picks.push(`How has ${my} first serve percentage changed this season?`);
  }
  if (picks.length < MAX_ASK_FOLLOW_UPS) {
    picks.push(
      team
        ? "How does that compare across all the program's matches?"
        : "How does that compare to all my matches?",
    );
  }
  if (picks.length < MAX_ASK_FOLLOW_UPS && !/improve|work on/.test(text)) {
    picks.push(
      team
        ? "How can we improve for our next match?"
        : "How can I improve for my next match?",
    );
  }

  const unique = picks.filter((pick, index) => picks.indexOf(pick) === index);
  return unique
    .slice(0, MAX_ASK_FOLLOW_UPS)
    .map((pick) => ({ text: pick, tags: [] }));
}
