import { createRoot } from "react-dom/client";
import { AskPage } from "@/components/dashboard/ask/ask-page";
import type { AskConversation } from "@/lib/data/ask-server";
import type { AskTagOptions } from "@/lib/data/ask-tags";
import type { AskScope } from "@/lib/services/ask/scope";

/**
 * The whole Ask page in a real browser — the frame, the rail, the thread
 * and the composer — with the route stood in for by the query string.
 * `tests/ask-page.spec.ts` bundles this (server actions and `next/navigation`
 * aliased to mocks) and drives it, at a desktop width and at 390px.
 *
 * Query string:
 * - `?tags=match` / `?tags=opponent` the page arrived with that tag
 *   (`?match=` / `?opponent=` on the route), already resolved
 * - `?c=1`          a saved conversation is open: one exchange whose
 *                   answer carries a watchable figure, a serve block and
 *                   one source, so every card the catalogue offers is drawn
 * - `&pinned=1`     that saved answer already has a pin
 * - `?scope=team`   the team page
 * - `?pin=fail`     the pin action refuses (`ask-page-actions-browser-mock`)
 */
const params = new URLSearchParams(window.location.search);
window.routerPushes = [];
window.routerRefreshes = 0;

const TEAM: AskScope | null =
  params.get("scope") === "team"
    ? { kind: "team", programId: "program-1", programName: "Westbrook" }
    : null;
const scope: AskScope = TEAM ?? { kind: "personal" };

const OPTIONS: AskTagOptions = {
  matches: [
    {
      matchId: "match-sep-28",
      opponentName: "Marcus Hale",
      playerName: TEAM ? "Ana Sokolov" : null,
      playedOn: "2026-09-28",
      iWon: true,
      scoreText: "6-4, 6-3",
      tournamentName: "Fall Open",
    },
    {
      matchId: "match-sep-14",
      opponentName: "Theo Lindqvist",
      playerName: TEAM ? "Ana Sokolov" : null,
      playedOn: "2026-09-14",
      iWon: false,
      scoreText: "4-6, 3-6",
      tournamentName: null,
    },
  ],
  opponents: [
    { id: "marcus hale", name: "Marcus Hale", matchCount: 1, hand: "left" },
    { id: "theo lindqvist", name: "Theo Lindqvist", matchCount: 1, hand: null },
  ],
  players: TEAM ? [{ id: "p1", name: "Ana Sokolov", matchCount: 2 }] : [],
};

const ANSWER_ID = "aaaaaaaa-0000-4000-8000-000000000002";

const CONVERSATION: AskConversation = {
  id: "cccccccc-0000-4000-8000-000000000001",
  title: "How did my match against Marcus go",
  updatedAt: "2026-10-09T18:30:00.000Z",
  pinnedAt: null,
  messages: [
    {
      id: "aaaaaaaa-0000-4000-8000-000000000001",
      role: "user",
      content: {
        text: "How did my match against Marcus Hale go?",
        tags: [{ kind: "match", id: "match-sep-28", label: "vs Marcus Hale" }],
      },
      createdAt: "2026-10-09T18:30:00.000Z",
      feedback: null,
      pinId: null,
    },
    {
      id: ANSWER_ID,
      role: "assistant",
      content: {
        headline: "You held serve throughout and broke twice.",
        figures: [
          {
            label: "Second serves won",
            value: "55%",
            column: "second_serve_won_pct",
          },
        ],
        visual: {
          kind: "serve",
          caption: "Where your first serves went.",
          courts: [
            {
              label: "Deuce",
              t: { value: 9, text: "9" },
              body: { value: 3, text: "3" },
              wide: { value: 6, text: "6" },
            },
          ],
        },
        body: "You won 55% of second-serve points.",
        noAdvice: false,
        sources: [
          {
            matchId: "match-sep-28",
            opponentName: "Marcus Hale",
            playedOn: "2026-09-28",
            iWon: true,
            scoreText: "6-4, 6-3",
            playerName: TEAM ? "Ana Sokolov" : null,
          },
        ],
      },
      createdAt: "2026-10-09T18:30:00.000Z",
      feedback: null,
      pinId: params.get("pinned") === "1" ? "pin-existing" : null,
    },
  ],
};

const tags =
  params.get("tags") === "match"
    ? [{ kind: "match" as const, id: "match-sep-28", label: "vs Marcus Hale" }]
    : params.get("tags") === "opponent"
      ? [{ kind: "opponent" as const, id: "marcus hale", label: "Marcus Hale" }]
      : [];

const conversation = params.get("c") === "1" ? CONVERSATION : null;

createRoot(document.getElementById("root")!).render(
  <AskPage
    key={conversation?.id ?? "new"}
    scope={scope}
    timeZone="America/Los_Angeles"
    tagOptions={OPTIONS}
    starters={[
      { text: "How did my match against Marcus Hale go?", tags: [] },
      { text: "What is my record against left-handers?", tags: [] },
      { text: "How is my serve holding up this season?", tags: [] },
    ]}
    quota={{ used: 8, cap: 20, resetsOn: "2026-11-01" }}
    conversations={[
      {
        id: CONVERSATION.id,
        title: CONVERSATION.title,
        updatedAt: CONVERSATION.updatedAt,
        pinnedAt: null,
      },
      {
        id: "cccccccc-0000-4000-8000-000000000002",
        title: "First serve trend since June",
        updatedAt: "2026-10-02T07:15:00.000Z",
        pinnedAt: "2026-10-10T00:00:00.000Z",
      },
    ]}
    conversation={conversation}
    initialTags={tags}
  />,
);
document.documentElement.dataset.hydrated = "true";
