import { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AskComposer,
  type AskQuotaView,
} from "@/components/dashboard/ask/ask-composer";
import {
  EMPTY_ASK_QUESTION,
  type AskQuestion,
} from "@/components/dashboard/ask/use-ask-stream";
import type { AskTagOptions } from "@/lib/data/ask-tags";
import type { AskScope } from "@/lib/services/ask/scope";

/**
 * The Ask composer in a real browser, with the thread stood in for by two
 * pieces of state: the draft, and the questions sent. `tests/ask-composer.spec.ts`
 * bundles this and drives it with real key events.
 *
 * Query string:
 * - `?used=<n>`   questions spent of 20 (default 12)
 * - `?quota=none` the count could not be read
 * - `?pending=1`  an answer is in flight
 * - `?text=<s>`   the draft the composer opens with
 * - `?scope=team` the team page: a program's players can be tagged, and each
 *                 match names the program's own player
 */
const params = new URLSearchParams(window.location.search);

const TEAM: AskScope | undefined =
  params.get("scope") === "team"
    ? { kind: "team", programId: "program-1", programName: "Westbrook" }
    : undefined;

const PERSONAL_TAG_OPTIONS: AskTagOptions = {
  players: [],
  opponents: [
    {
      id: "theo lindqvist",
      name: "Theo Lindqvist",
      matchCount: 4,
      hand: "left",
    },
    {
      id: "daniel okafor",
      name: "Daniel Okafor",
      matchCount: 2,
      hand: "right",
    },
    { id: "marcus hale", name: "Marcus Hale", matchCount: 1, hand: null },
  ],
  matches: [
    {
      matchId: "match-sep-28",
      opponentName: "Theo Lindqvist",
      playedOn: "2026-09-28",
      iWon: true,
      scoreText: "6-4 6-3",
      tournamentName: "Club ladder",
      playerName: null,
    },
    {
      matchId: "match-sep-14",
      opponentName: "Marcus Hale",
      playedOn: "2026-09-14",
      iWon: false,
      scoreText: "4-6 3-6",
      tournamentName: "Fall Open",
      playerName: null,
    },
    {
      matchId: "match-last-year",
      opponentName: "Daniel Okafor",
      playedOn: "2025-08-30",
      iWon: null,
      scoreText: null,
      tournamentName: null,
      playerName: null,
    },
  ],
};

// A program's season: two players, and whose match each one was. The last
// match's seat names nobody on the roster, so it reads as a personal one.
const TEAM_TAG_OPTIONS: AskTagOptions = {
  players: [
    { id: "player-sokolov", name: "Ana Sokolov", matchCount: 2 },
    { id: "player-dvorsky", name: "Mia Dvorsky", matchCount: 1 },
  ],
  opponents: PERSONAL_TAG_OPTIONS.opponents,
  matches: PERSONAL_TAG_OPTIONS.matches.map((match, index) => ({
    ...match,
    playerName: ["Ana Sokolov", "Mia Dvorsky", null][index] ?? null,
  })),
};

const TAG_OPTIONS = TEAM ? TEAM_TAG_OPTIONS : PERSONAL_TAG_OPTIONS;

const QUOTA: AskQuotaView | null =
  params.get("quota") === "none"
    ? null
    : {
        used: Number(params.get("used") ?? 12),
        cap: 20,
        resetsOn: "2026-11-01",
      };

function Harness() {
  const [draft, setDraft] = useState<AskQuestion>({
    ...EMPTY_ASK_QUESTION,
    text: params.get("text") ?? "",
  });
  const [sent, setSent] = useState<AskQuestion[]>([]);

  return (
    <>
      <AskComposer
        value={draft}
        onChange={setDraft}
        onSubmit={() => {
          // What the thread does: the question leaves the composer.
          setSent((current) => [...current, draft]);
          setDraft(EMPTY_ASK_QUESTION);
        }}
        tagOptions={TAG_OPTIONS}
        scope={TEAM}
        quota={QUOTA}
        pending={params.get("pending") !== null}
      />
      <output aria-label="Draft">{JSON.stringify(draft)}</output>
      <output aria-label="Sent">{JSON.stringify(sent)}</output>
    </>
  );
}

createRoot(document.getElementById("root")!).render(<Harness />);
document.documentElement.dataset.hydrated = "true";
