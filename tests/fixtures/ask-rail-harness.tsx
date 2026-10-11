import { useState } from "react";
import { createRoot } from "react-dom/client";
import type { AskQuotaView } from "@/components/dashboard/ask/ask-composer";
import { AskRail } from "@/components/dashboard/ask/ask-rail";
import type { AskTag } from "@/components/dashboard/ask/use-ask-stream";
import type { AskConversationSummary } from "@/lib/data/ask-server";
import type { AskTagOptions } from "@/lib/data/ask-tags";

/**
 * The Ask rail in a real browser, with the page stood in for by two pieces of
 * state: the conversation list, and the ids the delete handler was called
 * with. `tests/ask-rail.spec.ts` bundles this and drives it.
 *
 * The real page hands the rail a function that calls the
 * `deleteAskConversation` server action; a server action cannot be bundled
 * here, so this passes a stand-in that records its argument and drops the
 * row, the way the route's re-render does.
 *
 * Query string:
 * - `?used=<n>`     questions spent of 20 (default 8)
 * - `?quota=none`   the count could not be read
 * - `?tags=none`    nothing is tagged
 * - `?earlier=none` no saved conversation
 * - `?busy=1`       an answer is in flight
 * - `?fail=1`       the delete is refused
 */
const params = new URLSearchParams(window.location.search);

const TAG_OPTIONS: AskTagOptions = {
  opponents: [
    {
      id: "theo lindqvist",
      name: "Theo Lindqvist",
      matchCount: 4,
      hand: "left",
    },
  ],
  matches: [
    {
      matchId: "match-sep-14",
      opponentName: "Marcus Hale",
      playedOn: "2026-09-14",
      iWon: true,
      scoreText: "6-4 3-6 7-5",
      tournamentName: "Fall Open",
    },
  ],
};

const TAGS: AskTag[] =
  params.get("tags") === "none"
    ? []
    : [
        { kind: "opponent", id: "theo lindqvist", label: "Theo Lindqvist" },
        { kind: "match", id: "match-sep-14", label: "Sep 14 · Marcus Hale" },
        // No longer among the options: a match deleted since it was tagged.
        { kind: "match", id: "match-gone", label: "Aug 2 · Daniel Okafor" },
      ];

const QUOTA: AskQuotaView | null =
  params.get("quota") === "none"
    ? null
    : {
        used: Number(params.get("used") ?? 8),
        cap: 20,
        resetsOn: "2026-11-01",
      };

// Newest first, as the loader returns them.
const CONVERSATIONS: AskConversationSummary[] =
  params.get("earlier") === "none"
    ? []
    : [
        {
          id: "11111111-1111-4111-8111-111111111111",
          title: "Why did my second serve hold up against Marcus?",
          updatedAt: "2026-10-09T18:30:00.000Z",
        },
        {
          id: "22222222-2222-4222-8222-222222222222",
          title: "How do I do against left-handers?",
          updatedAt: "2026-09-28T09:00:00.000Z",
        },
        {
          id: "33333333-3333-4333-8333-333333333333",
          title: "Break points saved last season",
          updatedAt: "2025-11-02T12:00:00.000Z",
        },
      ];

function Harness() {
  const [conversations, setConversations] = useState(CONVERSATIONS);
  const [deleted, setDeleted] = useState<string[]>([]);

  return (
    <>
      <aside aria-label="Question context" style={{ width: 340 }}>
        <AskRail
          tags={TAGS}
          tagOptions={TAG_OPTIONS}
          quota={QUOTA}
          conversations={conversations}
          activeConversationId="22222222-2222-4222-8222-222222222222"
          deleteDisabled={params.get("busy") !== null}
          onDeleteConversation={async (id) => {
            setDeleted((current) => [...current, id]);
            if (params.get("fail") !== null) return false;
            setConversations((current) =>
              current.filter((conversation) => conversation.id !== id),
            );
            return true;
          }}
        />
      </aside>
      <output aria-label="Deleted">{JSON.stringify(deleted)}</output>
    </>
  );
}

createRoot(document.getElementById("root")!).render(<Harness />);
document.documentElement.dataset.hydrated = "true";
