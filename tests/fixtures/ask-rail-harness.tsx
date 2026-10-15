import { useState } from "react";
import { createRoot } from "react-dom/client";
import type { AskQuotaView } from "@/components/dashboard/ask/ask-composer";
import { AskRail } from "@/components/dashboard/ask/ask-rail";
import type { AskConversationSummary } from "@/lib/data/ask-server";
import type { AskScope } from "@/lib/services/ask/scope";

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
 * - `?quota=unlimited` a platform admin: no cap
 * - `?earlier=none` no saved conversation
 * - `?busy=1`       an answer is in flight
 * - `?fail=1`       the delete is refused
 * - `?scope=team`   the team page's rail
 * - `?tz=<zone>`    the workspace's time zone, as the page hands it over
 * - `?earlier=edge` two questions asked on a Pacific evening: one the UTC
 *                   calendar has already moved to the next day, one it has
 *                   moved to the next month
 * - `?earlier=many` eight questions, two of them pinned: enough rows for
 *                   the filter field, and a "Pinned" group above the months
 * - `?rename=fail`  the rename is refused
 * - `?pin=fail`     the pin is refused
 * - `?slow=1`       renames and pins take 600ms to answer, so the rail's
 *                   in-between state can be looked at
 *
 * Renames and pins are recorded the way deletes are, and applied to the
 * list the way the route's re-render would apply them.
 */
const params = new URLSearchParams(window.location.search);

/** `?slow=1`: the server taking its time. */
const settle = () =>
  params.get("slow") !== null
    ? new Promise<void>((done) => setTimeout(done, 600))
    : Promise.resolve();

const TEAM: AskScope | undefined =
  params.get("scope") === "team"
    ? { kind: "team", programId: "program-1", programName: "Westbrook" }
    : undefined;

const QUOTA: AskQuotaView | null =
  params.get("quota") === "none"
    ? null
    : {
        used: Number(params.get("used") ?? 8),
        cap: params.get("quota") === "unlimited" ? null : 20,
        resetsOn: "2026-11-01",
      };

// Newest first, as the loader returns them: two in October, one in
// September, and one from the year before.
const EDGE: Omit<AskConversationSummary, "pinnedAt">[] = [
  {
    // 8:30 pm on Oct 12 in California; already Oct 13 in UTC.
    id: "11111111-1111-4111-8111-111111111111",
    title: "Asked on the evening of the 12th",
    updatedAt: "2026-10-13T03:30:00.000Z",
  },
  {
    // 10 pm on Sep 30 in California; already October in UTC.
    id: "22222222-2222-4222-8222-222222222222",
    title: "Asked on September's last evening",
    updatedAt: "2026-10-01T05:00:00.000Z",
  },
];

const FOUR: AskConversationSummary[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    title: "Why did my second serve hold up against Marcus?",
    updatedAt: "2026-10-09T18:30:00.000Z",
    pinnedAt: null,
  },
  {
    id: "44444444-4444-4444-8444-444444444444",
    title: "First serve trend since June",
    updatedAt: "2026-10-02T07:15:00.000Z",
    pinnedAt: null,
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    title: "How do I do against left-handers?",
    updatedAt: "2026-09-28T09:00:00.000Z",
    pinnedAt: null,
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    title: "Break points saved last season",
    updatedAt: "2025-11-02T12:00:00.000Z",
    pinnedAt: null,
  },
];

// Eight rows, the loader's order: pinned first (newest pin first), then the
// rest most recently used first.
const MANY: AskConversationSummary[] = [
  {
    id: "55555555-5555-4555-8555-555555555555",
    title: "Serve placement on break points",
    updatedAt: "2026-09-01T10:00:00.000Z",
    pinnedAt: "2026-10-10T08:00:00.000Z",
  },
  {
    id: "66666666-6666-4666-8666-666666666666",
    title: "Record against left-handers this season",
    updatedAt: "2026-08-14T10:00:00.000Z",
    pinnedAt: "2026-10-03T08:00:00.000Z",
  },
  ...FOUR,
  {
    id: "77777777-7777-4777-8777-777777777777",
    title: "Double faults in the third set",
    updatedAt: "2025-10-20T12:00:00.000Z",
    pinnedAt: null,
  },
  {
    id: "88888888-8888-4888-8888-888888888888",
    title: "Return depth against Theo",
    updatedAt: "2025-10-02T12:00:00.000Z",
    pinnedAt: null,
  },
];

const CONVERSATIONS: AskConversationSummary[] =
  params.get("earlier") === "none"
    ? []
    : params.get("earlier") === "edge"
      ? EDGE.map((row) => ({ ...row, pinnedAt: null }))
      : params.get("earlier") === "many"
        ? MANY
        : FOUR;

function Harness() {
  const [conversations, setConversations] = useState(CONVERSATIONS);
  const [deleted, setDeleted] = useState<string[]>([]);
  const [renamed, setRenamed] = useState<[string, string][]>([]);
  const [pinned, setPinned] = useState<[string, boolean][]>([]);
  const [asked, setAsked] = useState(0);

  return (
    <>
      <div style={{ display: "flex", height: 600 }}>
        <AskRail
          quota={QUOTA}
          conversations={conversations}
          scope={TEAM}
          timeZone={params.get("tz") ?? undefined}
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
          onRenameConversation={async (id, title) => {
            setRenamed((current) => [...current, [id, title]]);
            await settle();
            if (params.get("rename") === "fail") return false;
            setConversations((current) =>
              current.map((conversation) =>
                conversation.id === id
                  ? { ...conversation, title }
                  : conversation,
              ),
            );
            return true;
          }}
          onPinConversation={async (id, next) => {
            setPinned((current) => [...current, [id, next]]);
            await settle();
            if (params.get("pin") === "fail") return false;
            setConversations((current) =>
              current.map((conversation) =>
                conversation.id === id
                  ? {
                      ...conversation,
                      pinnedAt: next ? "2026-10-12T00:00:00.000Z" : null,
                    }
                  : conversation,
              ),
            );
            return true;
          }}
        />
      </div>
      <output aria-label="Deleted">{JSON.stringify(deleted)}</output>
      <output aria-label="Renamed">{JSON.stringify(renamed)}</output>
      <output aria-label="Pinned">{JSON.stringify(pinned)}</output>
      <output aria-label="New questions">{asked}</output>
    </>
  );
}

createRoot(document.getElementById("root")!).render(<Harness />);
document.documentElement.dataset.hydrated = "true";
