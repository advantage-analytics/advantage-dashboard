import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { splitInsight } from "../src/components/dashboard/matches/match-detail/insight-text";
import {
  insightSummaryFor,
  observerSummary,
  OPPONENT_TOKEN,
  PLAYER_TOKEN,
} from "../src/lib/data/insight-voice";
import { transformDbMatchToMatch } from "../src/lib/data/match-detail-server";

/**
 * Who is spoken to. An Advantage Intelligence summary says "you" only to the
 * player it is about; a coach, a teammate, an admin and anyone on a share
 * link read the same summary written about that player, by name.
 */

const INSIGHT = {
  summary:
    "Your second serve held firm under pressure. You won 67% of second-serve points against your opponent, so keep trusting that kick serve.",
  observer_summary:
    "[PLAYER]'s second serve held firm under pressure. [PLAYER] won 67% of second-serve points against [OPPONENT], so they should keep trusting that kick serve.",
};
const NAMES = { you: "Ana Castillo", opp: "Mia Okafor" };

test("the player reads the summary spoken to them", () => {
  expect(insightSummaryFor(INSIGHT, "player", NAMES)).toBe(INSIGHT.summary);
});

test("an observer reads it about the player, with both surnames filled in", () => {
  expect(insightSummaryFor(INSIGHT, "observer", NAMES)).toBe(
    "Castillo's second serve held firm under pressure. Castillo won 67% of second-serve points against Okafor, so they should keep trusting that kick serve.",
  );
});

test("the observer wording never says you or your", () => {
  expect(insightSummaryFor(INSIGHT, "observer", NAMES)).not.toMatch(
    /\byou(r|rs|rself)?\b/i,
  );
});

test("two players sharing a surname are told apart", () => {
  expect(
    observerSummary(INSIGHT, { you: "Marcus Reid", opp: "Dana Reid" }),
  ).toContain("M. Reid won 67% of second-serve points against D. Reid");
});

test("a name typed lowercase is raised where it opens a sentence, so the card still splits", () => {
  const text = observerSummary(INSIGHT, { you: "ana castillo", opp: "okafor" });
  expect(splitInsight(text!)).toEqual({
    claim: "Castillo's second serve held firm under pressure.",
    evidence:
      "Castillo won 67% of second-serve points against okafor, so they should keep trusting that kick serve.",
  });
});

test("a match summarised before the observer voice keeps its wording for a signed-in observer", () => {
  expect(
    insightSummaryFor({ summary: INSIGHT.summary }, "observer", NAMES),
  ).toBe(INSIGHT.summary);
});

test("the share link shows nothing rather than you spoken to a stranger", () => {
  expect(
    insightSummaryFor({ summary: INSIGHT.summary }, "observer", NAMES, "none"),
  ).toBeNull();
});

test("no opponent name to fill in means no observer wording", () => {
  expect(observerSummary(INSIGHT, { you: "Ana Castillo", opp: "" })).toBeNull();
  // …unless the text never mentions the opponent.
  expect(
    observerSummary(
      { observer_summary: "[PLAYER] served well. [PLAYER] won 70% on serve." },
      { you: "Ana Castillo", opp: "" },
    ),
  ).toBe("Castillo served well. Castillo won 70% on serve.");
});

test("no insight is no summary in either voice", () => {
  expect(insightSummaryFor(null, "player", NAMES)).toBeNull();
  expect(insightSummaryFor(undefined, "observer", NAMES)).toBeNull();
  expect(insightSummaryFor({ summary: "  " }, "player", NAMES)).toBeNull();
});

/** Just the columns the seat rule reads; the rest of the row is not at issue. */
function row(seats: { player1_id: string | null; player2_id: string | null }) {
  return {
    id: "m1",
    player1_name: "Ana Castillo",
    player2_name: "Mia Okafor",
    date: "2026-10-20T00:00:00Z",
    score: { player1: [6, 6], player2: [3, 4] },
    ...seats,
  } as unknown as Parameters<typeof transformDbMatchToMatch>[0];
}
const viewerIsYou = (
  seats: { player1_id: string | null; player2_id: string | null },
  myIds: string[],
  rosterIds: string[],
  pinned?: "player1" | "player2",
) => {
  const match = transformDbMatchToMatch(
    row(seats),
    myIds,
    new Map(),
    rosterIds,
    pinned,
  );
  return [match.isUserPlayer1, match.viewerIsYou];
};

test("a player in either seat is the one spoken to", () => {
  const seats = { player1_id: "ana", player2_id: "mia" };
  expect(viewerIsYou(seats, ["ana"], [])).toEqual([true, true]);
  expect(viewerIsYou(seats, ["mia"], [])).toEqual([false, true]);
});

test("a claimed roster profile counts as the viewer's own seat", () => {
  expect(
    viewerIsYou(
      { player1_id: "profile-ana", player2_id: null },
      ["login-ana", "profile-ana"],
      ["profile-ana"],
    ),
  ).toEqual([true, true]);
});

test("a coach reads a roster player's match about them, not as them", () => {
  expect(
    viewerIsYou({ player1_id: "ana", player2_id: null }, ["coach"], ["ana"]),
  ).toEqual([true, false]);
});

test("teammates' practice: each is spoken to in their own seat, the coach about seat one", () => {
  const seats = { player1_id: "ana", player2_id: "mia" };
  const roster = ["ana", "mia"];
  expect(viewerIsYou(seats, ["ana"], roster)).toEqual([true, true]);
  expect(viewerIsYou(seats, ["mia"], roster)).toEqual([false, true]);
  expect(viewerIsYou(seats, ["coach"], roster)).toEqual([true, false]);
  // A third teammate is an observer too.
  expect(viewerIsYou(seats, ["zoe"], roster)).toEqual([true, false]);
});

test("a row that seats nobody the viewer is falls to seat two, and speaks to no one", () => {
  expect(
    viewerIsYou({ player1_id: null, player2_id: null }, ["ana"], []),
  ).toEqual([false, false]);
});

test("a pinned seat has no viewer in it", () => {
  expect(
    viewerIsYou(
      { player1_id: "ana", player2_id: null },
      ["ana"],
      [],
      "player1",
    ),
  ).toEqual([true, false]);
});

test("the edge function writes the same two tokens the app fills in", () => {
  const source = readFileSync(
    "supabase/functions/generate-insights/index.ts",
    "utf8",
  );
  expect(source).toContain(
    `const PLAYER_TOKEN = ${JSON.stringify(PLAYER_TOKEN)};`,
  );
  expect(source).toContain(
    `const OPPONENT_TOKEN = ${JSON.stringify(OPPONENT_TOKEN)};`,
  );
});
