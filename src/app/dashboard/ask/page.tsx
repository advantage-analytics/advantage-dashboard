import { AskPage } from "@/components/dashboard/ask/ask-page";
import { WidgetBoundary } from "@/components/dashboard/loading/widget-boundary";
import { isUuid } from "@/lib/admin/validation";
import {
  askMatchHasStats,
  getAskConversation,
  getAskConversations,
  getAskQuota,
  getAskTagOptions,
} from "@/lib/data/ask-server";
import { PERSONAL_ASK_SCOPE } from "@/lib/services/ask/scope";
import { askStarters } from "@/lib/services/ask/starters";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";

export const metadata = { title: "Ask" };

/**
 * The personal Ask page. A Server Component: everything the client shell
 * needs before it can render — what can be tagged, the question count, the
 * saved conversations and the one `?c=` names — is read here, through
 * `ask-server.ts` and the viewer's own session.
 *
 * `?c=` is whatever the address bar says. `getAskConversation()` answers null
 * for an id that is malformed, unknown or someone else's — all three the
 * same — and null is simply "no conversation open": the page renders with an
 * empty thread, never an error and never a hint that the id exists.
 *
 * The `key` is what makes opening another conversation a fresh thread: the
 * shell holds the thread in client state, and without it a navigation from
 * one `?c=` to another would keep showing the first.
 *
 * The scope is personal by construction: nothing about the active workspace
 * decides what is asked about, so it answers about the viewer's own matches
 * whichever workspace is active. The program's page is `/dashboard/team/ask`,
 * the same shell with a team scope.
 *
 * The workspace IS read for one thing: its time zone, which the rail dates
 * earlier questions in (`ask-earlier.ts`). `getWorkspaceContext()` is
 * `cache()`d — the same read the dashboard layout already made — and a
 * string from the server is what keeps the server's render and the browser's
 * on the same day. No workspace reads as UTC; the layout has already turned
 * away a signed-out viewer.
 *
 * The reads happen in `AskContent`, inside a `WidgetBoundary`: when the
 * viewer's matches cannot be read `getAskTagOptions()` throws, and the page
 * shows the boundary's retry rather than falling through to the app-wide
 * error screen. `loading.tsx` is the Suspense fallback while they resolve.
 */
type AskRouteProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default function AskRoute(props: AskRouteProps) {
  return (
    <WidgetBoundary label="Ask">
      <AskContent {...props} />
    </WidgetBoundary>
  );
}

async function AskContent({ searchParams }: AskRouteProps) {
  const { c, sent } = await searchParams;
  const conversationId = typeof c === "string" ? c : null;
  // `?sent=`: the wizard came back here after sending a match
  // (`askReturnHref()`). Shown as "being analysed" only while the match has
  // no statistics; once it does, the first answer is in the rail already.
  const sentId = typeof sent === "string" && isUuid(sent) ? sent : null;

  const [workspace, tagOptions, quota, conversations, conversation, hasStats] =
    await Promise.all([
      getWorkspaceContext(),
      getAskTagOptions(),
      getAskQuota(),
      getAskConversations(),
      conversationId ? getAskConversation(conversationId) : null,
      sentId ? askMatchHasStats(sentId) : true,
    ]);

  return (
    <AskPage
      key={conversation?.id ?? "new"}
      scope={PERSONAL_ASK_SCOPE}
      timeZone={workspace?.active.timeZone}
      tagOptions={tagOptions}
      starters={askStarters(tagOptions, PERSONAL_ASK_SCOPE)}
      quota={quota}
      conversations={conversations}
      conversation={conversation}
      sentMatchId={hasStats ? null : sentId}
    />
  );
}
