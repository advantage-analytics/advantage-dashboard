import { useState } from "react";
import { createRoot } from "react-dom/client";
import type { AskQuotaView } from "@/components/dashboard/ask/ask-composer";
import { AskRail } from "@/components/dashboard/ask/ask-rail";
import type { AskConversationSummary } from "@/lib/data/ask-server";

/**
 * The Ask rail in a real browser, with the page stood in for by three pieces
 * of state: the conversation list, the ids the delete handler was called
 * with, and how many times "New question" ran. `tests/ask-rail.spec.ts`
 * bundles this and drives it.
 *
 * The real page hands the rail a function that calls the
 * `deleteAskConversation` server action; a server action cannot be bundled
 * here, so this passes a stand-in that records its argument and drops the
 * row, the way the route's re-render does.
 *
 * Query string:
 * - `?used=<n>`     questions spent of 20 (default 8)
 * - `?quota=none`   the count could not be read
 * - `?earlier=none` no saved conversation
 * - `?busy=1`       an answer is in flight
 * - `?fail=1`       the delete is refused
 */
const params = new URLSearchParams(window.location.search);

const QUOTA: AskQuotaView | null =
  params.get("quota") === "none"
    ? null
    : {
        used: Number(params.get("used") ?? 8),
        cap: 20,
        resetsOn: "2026-11-01",
      };

// Newest first, as the loader returns them: two in October, one in
// September, and one from the year before.
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
          id: "44444444-4444-4444-8444-444444444444",
          title: "First serve trend since June",
          updatedAt: "2026-10-02T07:15:00.000Z",
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
  const [asked, setAsked] = useState(0);

  return (
    <>
      <div style={{ display: "flex", height: 600 }}>
        <AskRail
          quota={QUOTA}
          conversations={conversations}
          activeConversationId="22222222-2222-4222-8222-222222222222"
          deleteDisabled={params.get("busy") !== null}
          onNewQuestion={() => setAsked((count) => count + 1)}
          onDeleteConversation={async (id) => {
            setDeleted((current) => [...current, id]);
            if (params.get("fail") !== null) return false;
            setConversations((current) =>
              current.filter((conversation) => conversation.id !== id),
            );
            return true;
          }}
        />
      </div>
      <output aria-label="Deleted">{JSON.stringify(deleted)}</output>
      <output aria-label="New questions">{asked}</output>
    </>
  );
}

createRoot(document.getElementById("root")!).render(<Harness />);
document.documentElement.dataset.hydrated = "true";
